package nats

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"nats-ui/config"
	"nats-ui/models"

	"github.com/gofiber/websocket/v2"
	gonats "github.com/nats-io/nats.go"
)

// incompleteRetryDelay is how long an incomplete list is served before a
// background retry.
const incompleteRetryDelay = 3 * time.Second

// natsCallWait bounds each individual JetStream list API request.
const natsCallWait = 10 * time.Second

// cacheEntry is a stale-while-revalidate cache slot. Once populated, reads are
// always served instantly from memory; when older than the TTL a single
// background refresh is started (coalesced across callers). Only a cold or
// explicitly invalidated entry makes a caller wait for NATS. Results flagged
// incomplete by the fetcher are returned but never cached.
type cacheEntry[T any] struct {
	data      T
	last      T
	valid     bool
	hasData   bool
	fetchedAt time.Time
	gen       uint64
	flight    chan struct{}
}

// listCache holds per-connection caches of the full stream and consumer lists.
// Listing thousands of streams/consumers takes seconds on the NATS meta-leader.
type listCache struct {
	mu        sync.Mutex
	streams   cacheEntry[[]models.StreamInfo]
	consumers cacheEntry[[]models.ConsumerInfo]
	account   cacheEntry[*gonats.AccountInfo]
	kvEntries map[string]*cacheEntry[[]models.KVEntry]
}

// invalidate drops cached data so the next read fetches fresh. Called after
// any mutation (create/delete/update of streams or consumers).
func (c *listCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.streams.valid = false
	c.streams.hasData = false
	c.streams.gen++
	c.consumers.valid = false
	c.consumers.hasData = false
	c.consumers.gen++
	c.account.valid = false
	c.account.hasData = false
	c.account.gen++
	for _, e := range c.kvEntries {
		e.valid = false
		e.hasData = false
		e.gen++
	}
}

// invalidateKV drops the cached entries of one bucket (and the stream list,
// whose per-bucket entry counts and sizes just changed).
func (c *listCache) invalidateKV(bucket string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e, ok := c.kvEntries[bucket]; ok {
		e.valid = false
		e.hasData = false
		e.gen++
	}
	c.streams.valid = false
	c.streams.hasData = false
	c.streams.gen++
}

func (c *listCache) kvEntry(bucket string) *cacheEntry[[]models.KVEntry] {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.kvEntries == nil {
		c.kvEntries = make(map[string]*cacheEntry[[]models.KVEntry])
	}
	e, ok := c.kvEntries[bucket]
	if !ok {
		e = &cacheEntry[[]models.KVEntry]{}
		c.kvEntries[bucket] = e
	}
	return e
}

// getCached returns cached data, refreshing via fetch as needed. fetch returns
// the data and whether it is complete enough to cache.
func getCached[T any](mu *sync.Mutex, e *cacheEntry[T], ttl, timeout time.Duration, fetch func() (T, bool)) (T, error) {
	deadline := time.After(timeout)
	for {
		mu.Lock()
		if e.valid {
			data := e.data
			if time.Since(e.fetchedAt) >= ttl {
				startRefresh(mu, e, ttl, fetch)
			}
			mu.Unlock()
			return data, nil
		}
		gen := e.gen
		flight := startRefresh(mu, e, ttl, fetch)
		mu.Unlock()

		select {
		case <-flight:
		case <-deadline:
			var zero T
			return zero, fmt.Errorf("listing timed out")
		}

		mu.Lock()
		valid, last, changed := e.valid, e.last, e.gen != gen
		mu.Unlock()
		if valid || !changed {
			return last, nil
		}
	}
}

// ensureWarm reports whether the entry holds valid data, starting a
// background load when it does not.
func ensureWarm[T any](mu *sync.Mutex, e *cacheEntry[T], ttl time.Duration, fetch func() (T, bool)) bool {
	mu.Lock()
	defer mu.Unlock()
	if e.valid {
		return true
	}
	startRefresh(mu, e, ttl, fetch)
	return false
}

// startRefresh starts a background fetch unless one is already running.
// Caller must hold mu.
func startRefresh[T any](mu *sync.Mutex, e *cacheEntry[T], ttl time.Duration, fetch func() (T, bool)) chan struct{} {
	if e.flight != nil {
		return e.flight
	}
	flight := make(chan struct{})
	e.flight = flight
	gen := e.gen
	go func() {
		data, ok := fetch()
		mu.Lock()
		if gen == e.gen {
			e.last = data
			if ok || !e.hasData {
				e.data = data
			}
			e.hasData = true
			e.valid = true
			e.fetchedAt = time.Now()
			if !ok {
				// Incomplete: serve it, but let the next read trigger a quick retry.
				e.fetchedAt = e.fetchedAt.Add(-ttl + incompleteRetryDelay)
			}
		}
		e.flight = nil
		mu.Unlock()
		close(flight)
	}()
	return flight
}

type ActiveConnection struct {
	ID    string
	NC    *gonats.Conn
	JS    gonats.JetStreamContext
	mu    sync.Mutex
	subs  map[string]*gonats.Subscription
	cache *listCache
}

// consumerFetchWorkers bounds how many streams are queried for their
// consumers concurrently. Fetching sequentially (one CONSUMER.LIST per
// stream) is the main reason consumer listing times out on deployments with
// thousands of streams; a bounded worker pool parallelizes this while
// avoiding hammering the meta-leader with unbounded concurrency.
const consumerFetchWorkers = 30

type Bridge struct {
	mu            sync.RWMutex
	connections   map[string]*ActiveConnection
	timeoutConfig *config.TimeoutConfig
}

func NewBridge(cfg *config.TimeoutConfig) *Bridge {
	return &Bridge{
		connections:   make(map[string]*ActiveConnection),
		timeoutConfig: cfg,
	}
}

func (b *Bridge) Connect(conn models.Connection) (*models.ServerInfo, error) {
	opts := []gonats.Option{
		gonats.Name("nats-ui"),
		gonats.Timeout(b.timeoutConfig.ConnectionTimeout),
	}

	if conn.Username != "" {
		opts = append(opts, gonats.UserInfo(conn.Username, conn.Password))
	}

	nc, err := gonats.Connect(conn.URL, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	js, err := nc.JetStream()
	if err != nil {
		// JetStream not available — continue without it
		js = nil
	}

	ac := &ActiveConnection{
		ID:    conn.ID,
		NC:    nc,
		JS:    js,
		subs:  make(map[string]*gonats.Subscription),
		cache: &listCache{},
	}

	b.mu.Lock()
	b.connections[conn.ID] = ac
	b.mu.Unlock()

	b.warmCache(ac)

	connectedURL := nc.ConnectedUrl()
	trimmed := strings.TrimPrefix(strings.TrimPrefix(connectedURL, "nats://"), "tls://")
	host, portStr, _ := net.SplitHostPort(trimmed)
	port, _ := strconv.Atoi(portStr)

	info := &models.ServerInfo{
		Name:       nc.ConnectedServerName(),
		Host:       host,
		Port:       port,
		Version:    nc.ConnectedServerVersion(),
		MaxPayload: nc.MaxPayload(),
		JetStream:  js != nil,
	}

	return info, nil
}

func (b *Bridge) Disconnect(connectionID string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	ac, ok := b.connections[connectionID]
	if !ok {
		return nil
	}

	ac.NC.Drain()
	delete(b.connections, connectionID)
	return nil
}

func (b *Bridge) IsConnected(connectionID string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	ac, ok := b.connections[connectionID]
	return ok && ac.NC.IsConnected()
}

func (b *Bridge) GetStreams(connectionID string) ([]models.StreamInfo, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return make([]models.StreamInfo, 0), nil // JetStream not enabled — not an error
	}

	streams, err := b.getAllStreamsCached(ac)
	if err != nil {
		return make([]models.StreamInfo, 0), err
	}
	return streams, nil
}

// listRequest sends one paged JetStream list API request, retrying transient
// failures. The nats.go list iterators silently stop on the first failed page,
// which produced truncated lists, so paging is done explicitly here.
func listRequest(ac *ActiveConnection, subject string, offset int, wait time.Duration, out any) error {
	payload, _ := json.Marshal(map[string]int{"offset": offset})
	return apiRequest(ac, subject, payload, wait, out)
}

// apiRequest sends a JetStream API request with retries on transient failure.
func apiRequest(ac *ActiveConnection, subject string, payload []byte, wait time.Duration, out any) error {
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt) * 200 * time.Millisecond)
		}
		msg, err := ac.NC.Request(subject, payload, wait)
		if err != nil {
			lastErr = err
			continue
		}
		var apiErr struct {
			Error *struct {
				Code        int    `json:"code"`
				Description string `json:"description"`
			} `json:"error"`
		}
		if err := json.Unmarshal(msg.Data, &apiErr); err == nil && apiErr.Error != nil {
			lastErr = fmt.Errorf("%s (%d)", apiErr.Error.Description, apiErr.Error.Code)
			continue
		}
		if err := json.Unmarshal(msg.Data, out); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	return lastErr
}

func toStreamInfo(info *gonats.StreamInfo) models.StreamInfo {
	return models.StreamInfo{
		Name:         info.Config.Name,
		Subjects:     info.Config.Subjects,
		Messages:     info.State.Msgs,
		Bytes:        info.State.Bytes,
		Consumers:    info.State.Consumers,
		NumSubjects:  info.State.NumSubjects,
		Replicas:     info.Config.Replicas,
		Storage:      fmt.Sprintf("%v", info.Config.Storage),
		Retention:    fmt.Sprintf("%v", info.Config.Retention),
		MaxMsgs:      info.Config.MaxMsgs,
		MaxBytes:     info.Config.MaxBytes,
		MaxAge:       int64(info.Config.MaxAge.Seconds()),
		MaxConsumers: info.Config.MaxConsumers,
	}
}

// fetchStreamNames lists all stream names via STREAM.NAMES, which is far
// cheaper than STREAM.LIST because no stream state is gathered.
func fetchStreamNames(ac *ActiveConnection, wait time.Duration) ([]string, error) {
	names := make([]string, 0)
	for {
		var page struct {
			Total   int      `json:"total"`
			Streams []string `json:"streams"`
		}
		if err := listRequest(ac, "$JS.API.STREAM.NAMES", len(names), wait, &page); err != nil {
			return nil, err
		}
		names = append(names, page.Streams...)
		if len(page.Streams) == 0 || len(names) >= page.Total {
			sort.Strings(names)
			return names, nil
		}
	}
}

// fastStreamsPage serves one page of streams straight from NATS without the
// full list: STREAM.LIST from the offset when unfiltered, otherwise
// STREAM.NAMES + parallel STREAM.INFO for just the page.
func fastStreamsPage(ac *ActiveConnection, offset, limit int, search string) ([]models.StreamInfo, int, error) {
	if search == "" {
		out := make([]models.StreamInfo, 0, limit)
		total := 0
		for pos := offset; len(out) < limit; {
			var page struct {
				Total   int                  `json:"total"`
				Streams []*gonats.StreamInfo `json:"streams"`
			}
			if err := listRequest(ac, "$JS.API.STREAM.LIST", pos, natsCallWait, &page); err != nil {
				return nil, 0, err
			}
			total = page.Total
			if len(page.Streams) == 0 {
				break
			}
			for _, info := range page.Streams {
				if len(out) < limit {
					out = append(out, toStreamInfo(info))
				}
			}
			pos += len(page.Streams)
			if pos >= total {
				break
			}
		}
		return out, total, nil
	}

	names, err := fetchStreamNames(ac, natsCallWait)
	if err != nil {
		return nil, 0, err
	}
	matched := names[:0]
	for _, n := range names {
		if strings.Contains(strings.ToLower(n), search) {
			matched = append(matched, n)
		}
	}
	total := len(matched)
	start, end := offset, offset+limit
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}
	pageNames := matched[start:end]

	infos := make([]*gonats.StreamInfo, len(pageNames))
	var wg sync.WaitGroup
	var failed atomic.Bool
	for i, n := range pageNames {
		wg.Add(1)
		go func(i int, n string) {
			defer wg.Done()
			var info gonats.StreamInfo
			if err := apiRequest(ac, "$JS.API.STREAM.INFO."+n, nil, natsCallWait, &info); err != nil {
				failed.Store(true)
				return
			}
			infos[i] = &info
		}(i, n)
	}
	wg.Wait()
	if failed.Load() {
		return nil, 0, fmt.Errorf("failed to load stream info")
	}
	out := make([]models.StreamInfo, 0, len(infos))
	for _, info := range infos {
		out = append(out, toStreamInfo(info))
	}
	return out, total, nil
}

// fastConsumersFirstPage returns the first page of consumers (unfiltered)
// by walking streams in name order in small parallel batches until the page
// is full, instead of listing every stream's consumers.
func fastConsumersFirstPage(ac *ActiveConnection, limit int) ([]models.ConsumerInfo, int, error) {
	names, err := fetchStreamNames(ac, natsCallWait)
	if err != nil {
		return nil, 0, err
	}
	total := 0
	if ai, err := ac.JS.AccountInfo(); err == nil && ai != nil {
		total = ai.Consumers
	}

	out := make([]models.ConsumerInfo, 0, limit)
	for i := 0; i < len(names) && len(out) < limit; i += consumerFetchWorkers {
		end := i + consumerFetchWorkers
		if end > len(names) {
			end = len(names)
		}
		batch := make([][]models.ConsumerInfo, end-i)
		var wg sync.WaitGroup
		var failed atomic.Bool
		for j := i; j < end; j++ {
			wg.Add(1)
			go func(j int) {
				defer wg.Done()
				got, ok := fetchConsumersForStream(ac, names[j], natsCallWait)
				if !ok {
					failed.Store(true)
				}
				batch[j-i] = got
			}(j)
		}
		wg.Wait()
		if failed.Load() {
			return nil, 0, fmt.Errorf("failed to load consumers")
		}
		for _, got := range batch {
			sort.Slice(got, func(a, b int) bool { return got[a].Name < got[b].Name })
			out = append(out, got...)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	if total < len(out) {
		total = len(out)
	}
	return out, total, nil
}

// fetchAllStreams walks STREAM.LIST page by page. The bool reports whether
// every stream the server reported was retrieved.
func fetchAllStreams(ac *ActiveConnection, wait time.Duration) ([]models.StreamInfo, bool) {
	result := make([]models.StreamInfo, 0)
	for {
		var page struct {
			Total   int                  `json:"total"`
			Streams []*gonats.StreamInfo `json:"streams"`
		}
		if err := listRequest(ac, "$JS.API.STREAM.LIST", len(result), wait, &page); err != nil {
			return result, false
		}
		for _, info := range page.Streams {
			result = append(result, toStreamInfo(info))
		}
		if len(page.Streams) == 0 || len(result) >= page.Total {
			sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
			return result, len(result) >= page.Total
		}
	}
}

// fetchConsumersForStream walks CONSUMER.LIST page by page for one stream.
func fetchConsumersForStream(ac *ActiveConnection, streamName string, wait time.Duration) ([]models.ConsumerInfo, bool) {
	result := make([]models.ConsumerInfo, 0)
	for {
		var page struct {
			Total     int                    `json:"total"`
			Consumers []*gonats.ConsumerInfo `json:"consumers"`
		}
		if err := listRequest(ac, "$JS.API.CONSUMER.LIST."+streamName, len(result), wait, &page); err != nil {
			return result, false
		}
		for _, ci := range page.Consumers {
			result = append(result, models.ConsumerInfo{
				Name:            ci.Name,
				StreamName:      streamName,
				DeliverPolicy:   fmt.Sprintf("%v", ci.Config.DeliverPolicy),
				AckPolicy:       fmt.Sprintf("%v", ci.Config.AckPolicy),
				FilterSubject:   ci.Config.FilterSubject,
				PendingMessages: ci.NumPending,
				AckPending:      ci.NumAckPending,
				WaitingPulls:    ci.NumWaiting,
				TotalDelivered:  ci.Delivered.Consumer,
				IsPull:          ci.Config.DeliverSubject == "",
				DeliverSubject:  ci.Config.DeliverSubject,
			})
		}
		if len(page.Consumers) == 0 || len(result) >= page.Total {
			return result, len(result) >= page.Total
		}
	}
}

// fetchConsumersParallel fetches consumers for many streams concurrently
// using a bounded worker pool, instead of issuing one CONSUMER.LIST call per
// stream sequentially. This is the main fix for consumer listing timing out
// on deployments with thousands of streams: sequentially it's N round trips
// to the meta-leader, one per stream.
func fetchConsumersParallel(ac *ActiveConnection, streamNames []string, wait time.Duration) ([]models.ConsumerInfo, bool) {
	if len(streamNames) == 0 {
		return []models.ConsumerInfo{}, true
	}

	jobs := make(chan string, len(streamNames))
	for _, name := range streamNames {
		jobs <- name
	}
	close(jobs)

	workerCount := consumerFetchWorkers
	if workerCount > len(streamNames) {
		workerCount = len(streamNames)
	}

	resultsCh := make(chan []models.ConsumerInfo, workerCount)
	var wg sync.WaitGroup
	var incomplete atomic.Bool

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			local := make([]models.ConsumerInfo, 0)
			for streamName := range jobs {
				got, ok := fetchConsumersForStream(ac, streamName, wait)
				if !ok {
					incomplete.Store(true)
				}
				local = append(local, got...)
			}
			resultsCh <- local
		}()
	}

	wg.Wait()
	close(resultsCh)

	all := make([]models.ConsumerInfo, 0, len(streamNames))
	for r := range resultsCh {
		all = append(all, r...)
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].StreamName != all[j].StreamName {
			return all[i].StreamName < all[j].StreamName
		}
		return all[i].Name < all[j].Name
	})
	return all, !incomplete.Load()
}

// getAllStreamsCached returns the full stream list from the stale-while-
// revalidate cache.
func (b *Bridge) streamsFetcher(ac *ActiveConnection) func() ([]models.StreamInfo, bool) {
	return func() ([]models.StreamInfo, bool) { return fetchAllStreams(ac, natsCallWait) }
}

func (b *Bridge) consumersFetcher(ac *ActiveConnection) func() ([]models.ConsumerInfo, bool) {
	return func() ([]models.ConsumerInfo, bool) {
		streams, err := b.getAllStreamsCached(ac)
		if err != nil {
			return []models.ConsumerInfo{}, false
		}
		names := make([]string, 0, len(streams))
		expected := 0
		for _, s := range streams {
			if s.Consumers == 0 {
				continue
			}
			names = append(names, s.Name)
			expected += s.Consumers
		}
		result, ok := fetchConsumersParallel(ac, names, natsCallWait)
		return result, ok && len(result) >= expected
	}
}

func (b *Bridge) getAllStreamsCached(ac *ActiveConnection) ([]models.StreamInfo, error) {
	return getCached(&ac.cache.mu, &ac.cache.streams, b.timeoutConfig.ListCacheTTL, b.timeoutConfig.StreamListTimeout, b.streamsFetcher(ac))
}

// getAllConsumersCached returns the full consumer list across all streams from
// the stale-while-revalidate cache.
func (b *Bridge) getAllConsumersCached(ac *ActiveConnection) ([]models.ConsumerInfo, error) {
	return getCached(&ac.cache.mu, &ac.cache.consumers, b.timeoutConfig.ListCacheTTL, b.timeoutConfig.ConsumerListTimeout, b.consumersFetcher(ac))
}

// warmCache prefetches both lists in the background so the first UI request
// is served from memory.
func (b *Bridge) warmCache(ac *ActiveConnection) {
	if ac.JS == nil {
		return
	}
	go func() {
		_, _ = b.getAllConsumersCached(ac)
	}()
}

// GetStreamsPaginated fetches streams with pagination and filtering support
func (b *Bridge) GetStreamsPaginated(connectionID string, offset, limit int, searchFilter string) (*models.PaginatedStreams, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return &models.PaginatedStreams{Streams: []models.StreamInfo{}, Total: 0, Offset: offset, Limit: limit}, nil
	}

	// Validate pagination params
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	searchLower := strings.ToLower(searchFilter)

	// Cold cache: warm it in the background and answer this request with just
	// the requested page straight from NATS.
	if !ensureWarm(&ac.cache.mu, &ac.cache.streams, b.timeoutConfig.ListCacheTTL, b.streamsFetcher(ac)) {
		if page, total, err := fastStreamsPage(ac, offset, limit, searchLower); err == nil {
			return &models.PaginatedStreams{Streams: page, Total: total, Offset: offset, Limit: limit}, nil
		}
	}

	allStreams, err := b.getAllStreamsCached(ac)
	if err != nil {
		return nil, err
	}
	filtered := allStreams
	if searchLower != "" {
		filtered = make([]models.StreamInfo, 0, len(allStreams))
		for _, si := range allStreams {
			if strings.Contains(strings.ToLower(si.Name), searchLower) {
				filtered = append(filtered, si)
			}
		}
	}

	// Calculate pagination
	total := len(filtered)
	start := offset
	end := offset + limit

	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	paginatedStreams := append([]models.StreamInfo{}, filtered[start:end]...)

	return &models.PaginatedStreams{
		Streams: paginatedStreams,
		Total:   total,
		Offset:  offset,
		Limit:   limit,
	}, nil
}

// GetConsumersPaginated fetches all consumers across all streams with pagination and filtering
func (b *Bridge) GetConsumersPaginated(connectionID string, offset, limit int, searchFilter string) (*models.PaginatedConsumers, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return &models.PaginatedConsumers{Consumers: []models.ConsumerInfo{}, Total: 0, Offset: offset, Limit: limit}, nil
	}

	// Validate pagination params
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	searchLower := strings.ToLower(searchFilter)

	warm := ensureWarm(&ac.cache.mu, &ac.cache.consumers, b.timeoutConfig.ListCacheTTL, b.consumersFetcher(ac))
	log.Printf("consumers page: cache_warm=%v offset=%d search=%q", warm, offset, searchLower)
	if !warm && offset == 0 && searchLower == "" {
		if page, total, err := fastConsumersFirstPage(ac, limit); err == nil {
			return &models.PaginatedConsumers{Consumers: page, Total: total, Offset: offset, Limit: limit}, nil
		}
	}

	allConsumers, err := b.getAllConsumersCached(ac)
	if err != nil {
		return nil, err
	}
	filtered := allConsumers
	if searchLower != "" {
		filtered = make([]models.ConsumerInfo, 0, len(allConsumers))
		for _, ci := range allConsumers {
			if strings.Contains(strings.ToLower(ci.Name), searchLower) ||
				strings.Contains(strings.ToLower(ci.StreamName), searchLower) ||
				strings.Contains(strings.ToLower(ci.FilterSubject), searchLower) {
				filtered = append(filtered, ci)
			}
		}
	}

	// Calculate pagination
	total := len(filtered)
	start := offset
	end := offset + limit

	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	paginatedConsumers := append([]models.ConsumerInfo{}, filtered[start:end]...)

	return &models.PaginatedConsumers{
		Consumers: paginatedConsumers,
		Total:     total,
		Offset:    offset,
		Limit:     limit,
	}, nil
}

// GetStreamMessages fetches stored messages from a JetStream stream (not live subscribe)
func (b *Bridge) GetStreamMessages(connectionID, streamName string, limit int, filter *models.ContentFilter, startSeq, endSeq uint64, startTime, endTime int64) ([]models.MessageEnvelope, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return nil, fmt.Errorf("JetStream not available")
	}

	if limit <= 0 || limit > 500 {
		limit = 100
	}

	filterEngine, err := NewContentFilterEngine(filter)
	if err != nil {
		return nil, fmt.Errorf("invalid content filter: %w", err)
	}

	// Get stream info to find total messages
	si, err := ac.JS.StreamInfo(streamName)
	if err != nil {
		return nil, fmt.Errorf("stream not found: %w", err)
	}

	results := make([]models.MessageEnvelope, 0)

	if si.State.Msgs == 0 {
		return results, nil
	}

	// Determine start sequence based on filters
	var calcStartSeq uint64
	if startSeq > 0 {
		// User specified a start sequence
		calcStartSeq = startSeq
	} else if startTime > 0 {
		// User specified a start time — we'll filter by timestamp instead
		calcStartSeq = si.State.FirstSeq
	} else {
		// No sequence/time filter — read last N messages
		fetchCount := uint64(limit * 5)
		if si.State.Msgs <= fetchCount {
			calcStartSeq = si.State.FirstSeq
		} else {
			calcStartSeq = si.State.LastSeq - fetchCount + 1
		}
	}

	// Pick subject — ordered consumer needs a subject
	subject := ">"
	if len(si.Config.Subjects) > 0 {
		subject = si.Config.Subjects[0]
	}

	sub, err := ac.JS.SubscribeSync(
		subject,
		gonats.BindStream(streamName),
		gonats.StartSequence(calcStartSeq),
		gonats.OrderedConsumer(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer: %w", err)
	}
	defer sub.Unsubscribe()

	deadline := time.Now().Add(b.timeoutConfig.MessageFetchTimeout)
	for len(results) < limit && time.Now().Before(deadline) {
		msg, err := sub.NextMsg(500 * time.Millisecond)
		if err != nil {
			break
		}

		meta, _ := msg.Metadata()
		seq := uint64(0)
		ts := time.Now().UnixMilli()
		if meta != nil {
			seq = meta.Sequence.Stream
			ts = meta.Timestamp.UnixMilli()
		}

		// Apply sequence filters
		if startSeq > 0 && seq < startSeq {
			continue
		}
		if endSeq > 0 && seq > endSeq {
			continue
		}

		// Apply time filters (convert ms to timestamps)
		if startTime > 0 && ts < startTime {
			continue
		}
		if endTime > 0 && ts > endTime {
			continue
		}

		// Apply content filter
		matched, matchPath := filterEngine.Match(msg.Data)
		if !matched {
			continue
		}

		headers := make(map[string]string)
		for k := range msg.Header {
			headers[k] = msg.Header.Get(k)
		}

		results = append(results, models.MessageEnvelope{
			Subject:   msg.Subject,
			Payload:   string(msg.Data),
			Headers:   headers,
			Timestamp: ts,
			Sequence:  seq,
			Matched:   true,
			MatchPath: matchPath,
		})
	}

	return results, nil
}

func (b *Bridge) ReplayStreamMessages(connectionID, streamName string, req models.ReplayRequest) (*models.ReplayResult, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("not connected")
	}
	if ac.JS == nil {
		return nil, fmt.Errorf("JetStream not available")
	}

	limit := req.Limit
	if limit <= 0 || limit > 500 {
		limit = 500
	}

	si, err := ac.JS.StreamInfo(streamName)
	if err != nil {
		return nil, fmt.Errorf("stream not found: %w", err)
	}
	if si.State.Msgs == 0 {
		return &models.ReplayResult{}, nil
	}

	startSeq := req.StartSeq
	if startSeq == 0 {
		if req.StartTime > 0 {
			startSeq = si.State.FirstSeq
		} else {
			startSeq = si.State.FirstSeq
		}
	}

	subject := ">"
	if len(si.Config.Subjects) > 0 {
		subject = si.Config.Subjects[0]
	}

	sub, err := ac.JS.SubscribeSync(
		subject,
		gonats.BindStream(streamName),
		gonats.StartSequence(startSeq),
		gonats.OrderedConsumer(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer: %w", err)
	}
	defer sub.Unsubscribe()

	result := &models.ReplayResult{}
	deadline := time.Now().Add(b.timeoutConfig.MessageFetchTimeout)

	for result.Replayed+result.Skipped < limit && time.Now().Before(deadline) {
		msg, err := sub.NextMsg(500 * time.Millisecond)
		if err != nil {
			break
		}

		meta, _ := msg.Metadata()
		var seq uint64
		var ts int64
		if meta != nil {
			seq = meta.Sequence.Stream
			ts = meta.Timestamp.UnixMilli()
		}

		// Sequence bounds
		if req.EndSeq > 0 && seq > req.EndSeq {
			break
		}
		if req.StartSeq > 0 && seq < req.StartSeq {
			result.Skipped++
			continue
		}
		// Time bounds
		if req.StartTime > 0 && ts < req.StartTime {
			result.Skipped++
			continue
		}
		if req.EndTime > 0 && ts > req.EndTime {
			result.Skipped++
			continue
		}

		dest := msg.Subject
		if req.TargetSubject != "" {
			dest = req.TargetSubject
		}

		pub := &gonats.Msg{Subject: dest, Data: msg.Data}
		if len(msg.Header) > 0 {
			pub.Header = make(gonats.Header)
			for k, v := range msg.Header {
				pub.Header[k] = append([]string(nil), v...)
			}
		}
		if err := ac.NC.PublishMsg(pub); err != nil {
			result.Error = err.Error()
			break
		}

		result.Replayed++
		if req.DelayMs > 0 {
			time.Sleep(time.Duration(req.DelayMs) * time.Millisecond)
		}
	}

	return result, nil
}

func (b *Bridge) Publish(connectionID string, req models.PublishRequest) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	msg := &gonats.Msg{
		Subject: req.Subject,
		Data:    []byte(req.Payload),
	}

	if len(req.Headers) > 0 {
		msg.Header = make(gonats.Header)
		for k, v := range req.Headers {
			msg.Header.Set(k, v)
		}
	}

	return ac.NC.PublishMsg(msg)
}

func (b *Bridge) Request(connectionID string, req models.RequestReplyRequest) (*models.RequestReplyResponse, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	timeout := time.Duration(req.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	msg := &gonats.Msg{
		Subject: req.Subject,
		Data:    []byte(req.Payload),
	}
	if len(req.Headers) > 0 {
		msg.Header = make(gonats.Header)
		for k, v := range req.Headers {
			msg.Header.Set(k, v)
		}
	}

	start := time.Now()
	reply, err := ac.NC.RequestMsg(msg, timeout)
	if err != nil {
		return nil, err
	}
	elapsed := time.Since(start).Milliseconds()

	resp := &models.RequestReplyResponse{
		Subject: reply.Subject,
		Payload: string(reply.Data),
		Elapsed: elapsed,
	}
	if len(reply.Header) > 0 {
		resp.Headers = make(map[string]string)
		for k := range reply.Header {
			resp.Headers[k] = reply.Header.Get(k)
		}
	}
	return resp, nil
}

// HandleSubscribeWS streams live messages to a WebSocket connection with content filtering
func (b *Bridge) HandleSubscribeWS(connectionID string, req models.SubscribeRequest, c *websocket.Conn) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	filterEngine, err := NewContentFilterEngine(req.ContentFilter)
	if err != nil {
		return fmt.Errorf("invalid content filter: %w", err)
	}

	msgCh := make(chan *gonats.Msg, 256)

	sub, err := ac.NC.ChanSubscribe(req.Subject, msgCh)
	if err != nil {
		return fmt.Errorf("subscribe failed: %w", err)
	}
	defer sub.Unsubscribe()

	sendWS(c, models.WSMessage{Type: "subscribed", Payload: map[string]string{
		"subject": req.Subject,
	}})

	for {
		select {
		case msg, ok := <-msgCh:
			if !ok {
				return nil
			}

			matched, matchPath := filterEngine.Match(msg.Data)
			if !matched {
				continue
			}

			headers := make(map[string]string)
			for k := range msg.Header {
				headers[k] = msg.Header.Get(k)
			}

			envelope := models.MessageEnvelope{
				Subject:   msg.Subject,
				Payload:   string(msg.Data),
				Headers:   headers,
				Timestamp: time.Now().UnixMilli(),
				Matched:   true,
				MatchPath: matchPath,
			}

			if err := sendWS(c, models.WSMessage{Type: "message", Payload: envelope}); err != nil {
				return err
			}
		}
	}
}

func sendWS(c *websocket.Conn, msg models.WSMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return c.WriteMessage(websocket.TextMessage, data)
}

// Stream Management Methods

func streamConfigFromRequest(req models.StreamConfigRequest) *gonats.StreamConfig {
	cfg := &gonats.StreamConfig{
		Name:                 req.Name,
		Subjects:             req.Subjects,
		Description:          req.Description,
		Replicas:             req.Replicas,
		MaxBytes:             req.MaxBytes,
		MaxMsgs:              req.MaxMsgs,
		MaxMsgSize:           req.MaxMsgSize,
		MaxMsgsPerSubject:    req.MaxMsgsPerSubject,
		MaxConsumers:         req.MaxConsumers,
		DiscardNewPerSubject: req.DiscardNewPerSubject,
		NoAck:                req.NoAck,
		AllowRollup:          req.AllowRollup,
		AllowDirect:          req.AllowDirect,
		MirrorDirect:         req.MirrorDirect,
		DenyDelete:           req.DenyDelete,
		DenyPurge:            req.DenyPurge,
		FirstSeq:             req.FirstSeq,
		Metadata:             req.Metadata,
	}

	if req.MaxAge > 0 {
		cfg.MaxAge = time.Duration(req.MaxAge) * time.Second
	}
	if req.DuplicateWindow > 0 {
		cfg.Duplicates = time.Duration(req.DuplicateWindow) * time.Second
	}

	switch req.Storage {
	case "memory":
		cfg.Storage = gonats.MemoryStorage
	default:
		cfg.Storage = gonats.FileStorage
	}

	switch req.Retention {
	case "workqueue":
		cfg.Retention = gonats.WorkQueuePolicy
	case "interest":
		cfg.Retention = gonats.InterestPolicy
	default:
		cfg.Retention = gonats.LimitsPolicy
	}

	switch req.Discard {
	case "new":
		cfg.Discard = gonats.DiscardNew
	default:
		cfg.Discard = gonats.DiscardOld
	}

	switch req.Compression {
	case "s2":
		cfg.Compression = gonats.S2Compression
	default:
		cfg.Compression = gonats.NoCompression
	}

	if cfg.Replicas <= 0 {
		cfg.Replicas = 1
	}

	return cfg
}

func (b *Bridge) CreateStream(connectionID string, req models.StreamConfigRequest) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	cfg := streamConfigFromRequest(req)
	_, err := ac.JS.AddStream(cfg)
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

func (b *Bridge) GetStreamInfo(connectionID, streamName string) (*models.StreamFullConfig, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return nil, fmt.Errorf("JetStream not available")
	}

	si, err := ac.JS.StreamInfo(streamName)
	if err != nil {
		return nil, fmt.Errorf("stream not found: %w", err)
	}

	cfg := si.Config
	result := &models.StreamFullConfig{
		Name:                 cfg.Name,
		Subjects:             cfg.Subjects,
		Description:          cfg.Description,
		Replicas:             cfg.Replicas,
		MaxBytes:             cfg.MaxBytes,
		MaxMsgs:              cfg.MaxMsgs,
		MaxMsgSize:           cfg.MaxMsgSize,
		MaxMsgsPerSubject:    cfg.MaxMsgsPerSubject,
		MaxConsumers:         cfg.MaxConsumers,
		DiscardNewPerSubject: cfg.DiscardNewPerSubject,
		NoAck:                cfg.NoAck,
		AllowRollup:          cfg.AllowRollup,
		AllowDirect:          cfg.AllowDirect,
		MirrorDirect:         cfg.MirrorDirect,
		DenyDelete:           cfg.DenyDelete,
		DenyPurge:            cfg.DenyPurge,
		FirstSeq:             cfg.FirstSeq,
		Metadata:             cfg.Metadata,
		Messages:             si.State.Msgs,
		Bytes:                si.State.Bytes,
		Consumers:            si.State.Consumers,
	}

	if cfg.MaxAge > 0 {
		result.MaxAge = int64(cfg.MaxAge / time.Second)
	}
	if cfg.Duplicates > 0 {
		result.DuplicateWindow = int64(cfg.Duplicates / time.Second)
	}

	switch cfg.Storage {
	case gonats.MemoryStorage:
		result.Storage = "memory"
	default:
		result.Storage = "file"
	}

	switch cfg.Retention {
	case gonats.WorkQueuePolicy:
		result.Retention = "workqueue"
	case gonats.InterestPolicy:
		result.Retention = "interest"
	default:
		result.Retention = "limits"
	}

	switch cfg.Discard {
	case gonats.DiscardNew:
		result.Discard = "new"
	default:
		result.Discard = "old"
	}

	switch cfg.Compression {
	case gonats.S2Compression:
		result.Compression = "s2"
	default:
		result.Compression = ""
	}

	return result, nil
}

func (b *Bridge) DeleteStream(connectionID, streamName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	err := ac.JS.DeleteStream(streamName)
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

func (b *Bridge) PurgeStream(connectionID, streamName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	return ac.JS.PurgeStream(streamName)
}

func (b *Bridge) EditStream(connectionID, streamName string, req models.StreamConfigRequest) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	si, err := ac.JS.StreamInfo(streamName)
	if err != nil {
		return fmt.Errorf("stream not found: %w", err)
	}

	// Merge editable fields onto existing config (preserve non-editable fields like Name, Storage, Retention etc.)
	updated := si.Config
	updated.Subjects = req.Subjects
	updated.Description = req.Description
	updated.Replicas = req.Replicas
	updated.MaxBytes = req.MaxBytes
	updated.MaxMsgs = req.MaxMsgs
	updated.MaxMsgSize = req.MaxMsgSize
	updated.MaxMsgsPerSubject = req.MaxMsgsPerSubject
	updated.NoAck = req.NoAck
	updated.AllowRollup = req.AllowRollup
	updated.AllowDirect = req.AllowDirect
	updated.MirrorDirect = req.MirrorDirect
	updated.DiscardNewPerSubject = req.DiscardNewPerSubject
	updated.Metadata = req.Metadata

	if req.Replicas <= 0 {
		updated.Replicas = 1
	}
	if req.MaxAge > 0 {
		updated.MaxAge = time.Duration(req.MaxAge) * time.Second
	} else {
		updated.MaxAge = 0
	}
	if req.DuplicateWindow > 0 {
		updated.Duplicates = time.Duration(req.DuplicateWindow) * time.Second
	} else {
		updated.Duplicates = 0
	}

	switch req.Discard {
	case "new":
		updated.Discard = gonats.DiscardNew
	default:
		updated.Discard = gonats.DiscardOld
	}

	switch req.Compression {
	case "s2":
		updated.Compression = gonats.S2Compression
	default:
		updated.Compression = gonats.NoCompression
	}

	_, err = ac.JS.UpdateStream(&updated)
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

func (b *Bridge) GetConsumers(connectionID, streamName string) ([]models.ConsumerInfo, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return nil, fmt.Errorf("JetStream not available")
	}

	consumers, ok := fetchConsumersForStream(ac, streamName, natsCallWait)
	if !ok && len(consumers) == 0 {
		return nil, fmt.Errorf("failed to list consumers for stream %s", streamName)
	}
	sort.Slice(consumers, func(i, j int) bool { return consumers[i].Name < consumers[j].Name })
	return consumers, nil
}

func (b *Bridge) CreateConsumer(connectionID, streamName, consumerName, filterSubject, deliverPolicy, ackPolicy string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	_, err := ac.JS.AddConsumer(streamName, &gonats.ConsumerConfig{
		Name:          consumerName,
		FilterSubject: filterSubject,
		Durable:       consumerName,
	})
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

func (b *Bridge) DeleteConsumer(connectionID, streamName, consumerName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	err := ac.JS.DeleteConsumer(streamName, consumerName)
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

func (b *Bridge) PauseConsumer(connectionID, streamName, consumerName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	// Note: Pause functionality via UpdateConsumer is limited in this version of nats.go
	// For now, we acknowledge the pause request
	// In a production system, you might use direct NATS client calls or upgrade nats.go
	_, err := ac.JS.ConsumerInfo(streamName, consumerName)
	return err
}

func (b *Bridge) ResumeConsumer(connectionID, streamName, consumerName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	// Note: Resume functionality via UpdateConsumer is limited in this version of nats.go
	// For now, we acknowledge the resume request
	_, err := ac.JS.ConsumerInfo(streamName, consumerName)
	return err
}

// KV Store Methods

func (b *Bridge) GetKVBucketsPaginated(connectionID string, offset, limit int, searchFilter string) (*models.PaginatedKVBuckets, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return &models.PaginatedKVBuckets{Buckets: []models.KVBucketInfo{}, Total: 0, Offset: offset, Limit: limit}, nil
	}

	if offset < 0 {
		offset = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	searchLower := strings.ToLower(searchFilter)

	streams, err := b.getAllStreamsCached(ac)
	if err != nil {
		return nil, err
	}

	// KV buckets are streams named "KV_<bucket-name>".
	allBuckets := make([]models.KVBucketInfo, 0)
	now := time.Now().UnixMilli()
	for _, si := range streams {
		if !strings.HasPrefix(si.Name, "KV_") {
			continue
		}
		bucketName := strings.TrimPrefix(si.Name, "KV_")
		if searchLower != "" && !strings.Contains(strings.ToLower(bucketName), searchLower) {
			continue
		}
		allBuckets = append(allBuckets, models.KVBucketInfo{
			Name:       bucketName,
			Entries:    si.Messages,
			Bytes:      si.Bytes,
			CreatedAt:  now,
			LastUpdate: now,
		})
	}

	total := len(allBuckets)
	start, end := offset, offset+limit
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	return &models.PaginatedKVBuckets{
		Buckets: append([]models.KVBucketInfo{}, allBuckets[start:end]...),
		Total:   total,
		Offset:  offset,
		Limit:   limit,
	}, nil
}

// kvFetchWorkers bounds concurrent kv.Get calls when loading a bucket.
const kvFetchWorkers = 20

// fetchKVEntries loads every live entry of a bucket using a worker pool. The
// bool reports whether all keys were read successfully.
func fetchKVEntries(kv gonats.KeyValue) ([]models.KVEntry, bool) {
	keys, err := kv.Keys()
	if err != nil {
		if err == gonats.ErrNoKeysFound {
			return []models.KVEntry{}, true
		}
		return []models.KVEntry{}, false
	}

	jobs := make(chan string, len(keys))
	for _, k := range keys {
		jobs <- k
	}
	close(jobs)

	workers := kvFetchWorkers
	if workers > len(keys) {
		workers = len(keys)
	}

	var (
		mu         sync.Mutex
		wg         sync.WaitGroup
		entries    = make([]models.KVEntry, 0, len(keys))
		incomplete bool
	)
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for key := range jobs {
				var entry gonats.KeyValueEntry
				var err error
				for attempt := 0; attempt < 3; attempt++ {
					entry, err = kv.Get(key)
					if err == nil || err == gonats.ErrKeyNotFound {
						break
					}
					time.Sleep(time.Duration(attempt+1) * 100 * time.Millisecond)
				}
				mu.Lock()
				switch {
				case err == nil:
					entries = append(entries, models.KVEntry{
						Key:       key,
						Value:     string(entry.Value()),
						Bytes:     len(entry.Value()),
						Timestamp: entry.Created().UnixMilli(),
						Revision:  entry.Revision(),
						Operation: "PUT",
					})
				case err != gonats.ErrKeyNotFound: // not-found means deleted since Keys()
					incomplete = true
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	sort.Slice(entries, func(i, j int) bool { return entries[i].Key < entries[j].Key })
	return entries, !incomplete
}

func (b *Bridge) GetKVEntriesPaginated(connectionID, bucketName string, offset, limit int, searchFilter string) (*models.PaginatedKVEntries, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return nil, fmt.Errorf("JetStream not available")
	}

	if offset < 0 {
		offset = 0
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	searchLower := strings.ToLower(searchFilter)

	// Get KV bucket (creates if doesn't exist)
	kv, err := ac.JS.KeyValue(bucketName)
	if err != nil {
		return nil, fmt.Errorf("failed to get KV bucket: %w", err)
	}

	allEntries, err := getCached(&ac.cache.mu, ac.cache.kvEntry(bucketName), b.timeoutConfig.ListCacheTTL, b.timeoutConfig.KVListTimeout,
		func() ([]models.KVEntry, bool) { return fetchKVEntries(kv) })
	if err != nil {
		return nil, fmt.Errorf("KV entries listing timed out")
	}

	filtered := allEntries
	if searchLower != "" {
		filtered = make([]models.KVEntry, 0, len(allEntries))
		for _, en := range allEntries {
			if strings.Contains(strings.ToLower(en.Key), searchLower) {
				filtered = append(filtered, en)
			}
		}
	}

	total := len(filtered)
	start, end := offset, offset+limit
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	return &models.PaginatedKVEntries{
		Entries: append([]models.KVEntry{}, filtered[start:end]...),
		Total:   total,
		Offset:  offset,
		Limit:   limit,
	}, nil
}

func (b *Bridge) PutKV(connectionID, bucketName, key, value string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	kv, err := ac.JS.KeyValue(bucketName)
	if err != nil {
		return fmt.Errorf("failed to get KV bucket: %w", err)
	}

	_, err = kv.Put(key, []byte(value))
	if err == nil {
		ac.cache.invalidateKV(bucketName)
	}
	return err
}

func (b *Bridge) DeleteKV(connectionID, bucketName, key string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	kv, err := ac.JS.KeyValue(bucketName)
	if err != nil {
		return fmt.Errorf("failed to get KV bucket: %w", err)
	}

	err = kv.Delete(key)
	if err == nil {
		ac.cache.invalidateKV(bucketName)
	}
	return err
}

func (b *Bridge) CreateKVBucket(connectionID, bucketName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	// CreateKeyValue creates the bucket if it doesn't exist
	_, err := ac.JS.CreateKeyValue(&gonats.KeyValueConfig{
		Bucket: bucketName,
	})
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

func (b *Bridge) DeleteKVBucket(connectionID, bucketName string) error {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return fmt.Errorf("not connected")
	}

	if ac.JS == nil {
		return fmt.Errorf("JetStream not available")
	}

	// KV buckets are stored as streams with name pattern "KV_<bucket-name>"
	err := ac.JS.DeleteStream("KV_" + bucketName)
	if err == nil {
		ac.cache.invalidate()
	}
	return err
}

// Observability

// Thresholds used to flag a consumer as "slow" in the observability view.
const (
	slowConsumerAckPendingThreshold = 100
	slowConsumerPendingMsgThreshold = 1000
	slowConsumerMaxResults          = 20
)

// GetHealth gathers connection-level I/O stats, JetStream account health vs limits,
// and a list of consumers that look stalled/backed up, for the Dashboard's observability section.
func (b *Bridge) GetHealth(connectionID string) (*models.HealthInfo, error) {
	b.mu.RLock()
	ac, ok := b.connections[connectionID]
	b.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("not connected")
	}

	stats := ac.NC.Stats()
	health := &models.HealthInfo{
		Connection: models.ConnectionStats{
			InMsgs:     stats.InMsgs,
			OutMsgs:    stats.OutMsgs,
			InBytes:    stats.InBytes,
			OutBytes:   stats.OutBytes,
			Reconnects: stats.Reconnects,
		},
		SlowConsumers: []models.SlowConsumer{},
	}

	if ac.JS == nil {
		return health, nil
	}

	ai, _ := getCached(&ac.cache.mu, &ac.cache.account, b.timeoutConfig.ListCacheTTL, b.timeoutConfig.StreamListTimeout,
		func() (*gonats.AccountInfo, bool) {
			ai, err := ac.JS.AccountInfo()
			return ai, err == nil && ai != nil
		})
	if ai != nil {
		health.JetStream = &models.JetStreamHealth{
			Memory:         ai.Memory,
			MemoryLimit:    ai.Limits.MaxMemory,
			Store:          ai.Store,
			StoreLimit:     ai.Limits.MaxStore,
			Streams:        ai.Streams,
			StreamsLimit:   ai.Limits.MaxStreams,
			Consumers:      ai.Consumers,
			ConsumersLimit: ai.Limits.MaxConsumers,
			APITotal:       ai.API.Total,
			APIErrors:      ai.API.Errors,
		}
	}

	// Reuse the cached consumer list (see getAllConsumersCached) instead of
	// walking every stream's consumers sequentially on every health poll —
	// that pattern is what made listing time out in the first place on
	// deployments with thousands of streams/consumers.
	// Never block the health poll on a cold cache: start the load and report
	// slow consumers from the next poll.
	var allConsumers []models.ConsumerInfo
	haveConsumers := ensureWarm(&ac.cache.mu, &ac.cache.consumers, b.timeoutConfig.ListCacheTTL, b.consumersFetcher(ac))
	if haveConsumers {
		var err error
		allConsumers, err = b.getAllConsumersCached(ac)
		haveConsumers = err == nil
	}
	if haveConsumers {
		slow := make([]models.SlowConsumer, 0)
		for _, ci := range allConsumers {
			reason := ""
			if ci.AckPending >= slowConsumerAckPendingThreshold {
				reason = "high ack-pending"
			} else if ci.PendingMessages >= uint64(slowConsumerPendingMsgThreshold) {
				reason = "high pending messages"
			} else {
				continue
			}

			slow = append(slow, models.SlowConsumer{
				ConsumerInfo: ci,
				Reason:       reason,
			})
			if len(slow) >= slowConsumerMaxResults {
				break
			}
		}
		health.SlowConsumers = slow
	}
	// If the cache/refresh failed or timed out, leave SlowConsumers empty
	// rather than failing the whole health check.

	return health, nil
}
