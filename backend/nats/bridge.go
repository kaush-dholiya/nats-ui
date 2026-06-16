package nats

import (
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"nats-ui/config"
	"nats-ui/models"

	"github.com/gofiber/websocket/v2"
	gonats "github.com/nats-io/nats.go"
)

type ActiveConnection struct {
	ID   string
	NC   *gonats.Conn
	JS   gonats.JetStreamContext
	mu   sync.Mutex
	subs map[string]*gonats.Subscription
}

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
		ID:   conn.ID,
		NC:   nc,
		JS:   js,
		subs: make(map[string]*gonats.Subscription),
	}

	b.mu.Lock()
	b.connections[conn.ID] = ac
	b.mu.Unlock()

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

	// Always return empty slice, never nil
	streams := make([]models.StreamInfo, 0)

	if ac.JS == nil {
		return streams, nil // JetStream not enabled — not an error
	}

	// Use a channel with timeout to prevent hanging on slow/broken connections
	done := make(chan []models.StreamInfo, 1)
	go func() {
		result := make([]models.StreamInfo, 0)
		for info := range ac.JS.Streams() {
			si := models.StreamInfo{
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
			result = append(result, si)
		}
		done <- result
	}()

	// Wait for result or timeout
	select {
	case result := <-done:
		return result, nil
	case <-time.After(b.timeoutConfig.StreamListTimeout):
		return streams, fmt.Errorf("stream listing timed out")
	}
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

	// Normalize search filter to lowercase for case-insensitive matching
	searchLower := strings.ToLower(searchFilter)

	// Use a channel with timeout to prevent hanging
	done := make(chan *models.PaginatedStreams, 1)
	go func() {
		allStreams := make([]models.StreamInfo, 0)

		// Fetch all streams and apply filter
		for info := range ac.JS.Streams() {
			nameLower := strings.ToLower(info.Config.Name)

			// Apply search filter if provided
			if searchLower != "" && !strings.Contains(nameLower, searchLower) {
				continue
			}

			si := models.StreamInfo{
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
			allStreams = append(allStreams, si)
		}

		// Calculate pagination
		total := len(allStreams)
		start := offset
		end := offset + limit

		if start > total {
			start = total
		}
		if end > total {
			end = total
		}

		paginatedStreams := allStreams[start:end]
		if paginatedStreams == nil {
			paginatedStreams = []models.StreamInfo{}
		}

		done <- &models.PaginatedStreams{
			Streams: paginatedStreams,
			Total:   total,
			Offset:  offset,
			Limit:   limit,
		}
	}()

	// Wait for result or timeout
	select {
	case result := <-done:
		return result, nil
	case <-time.After(b.timeoutConfig.StreamListTimeout):
		return nil, fmt.Errorf("stream listing timed out")
	}
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

	// Normalize search filter to lowercase for case-insensitive matching
	searchLower := strings.ToLower(searchFilter)

	// Use a channel with timeout to prevent hanging
	done := make(chan *models.PaginatedConsumers, 1)
	go func() {
		allConsumers := make([]models.ConsumerInfo, 0)

		// Iterate through all streams and their consumers
		for streamInfo := range ac.JS.Streams() {
			streamName := streamInfo.Config.Name

			// Iterate through consumers of this stream
			for consumerInfo := range ac.JS.Consumers(streamName) {
				// Apply search filter if provided
				if searchLower != "" {
					consumerNameLower := strings.ToLower(consumerInfo.Name)
					streamNameLower := strings.ToLower(streamName)
					filterSubjectLower := strings.ToLower(consumerInfo.Config.FilterSubject)

					// Check if any of the three fields match
					if !strings.Contains(consumerNameLower, searchLower) &&
						!strings.Contains(streamNameLower, searchLower) &&
						!strings.Contains(filterSubjectLower, searchLower) {
						continue
					}
				}

				consumer := models.ConsumerInfo{
					Name:            consumerInfo.Name,
					StreamName:      streamName,
					DeliverPolicy:   fmt.Sprintf("%v", consumerInfo.Config.DeliverPolicy),
					AckPolicy:       fmt.Sprintf("%v", consumerInfo.Config.AckPolicy),
					FilterSubject:   consumerInfo.Config.FilterSubject,
					PendingMessages: consumerInfo.NumPending,
					AckPending:      consumerInfo.NumAckPending,
					WaitingPulls:    consumerInfo.NumWaiting,
					TotalDelivered:  consumerInfo.Delivered.Consumer,
					IsPull:          consumerInfo.Config.DeliverSubject == "",
					DeliverSubject:  consumerInfo.Config.DeliverSubject,
				}
				allConsumers = append(allConsumers, consumer)
			}
		}

		// Calculate pagination
		total := len(allConsumers)
		start := offset
		end := offset + limit

		if start > total {
			start = total
		}
		if end > total {
			end = total
		}

		paginatedConsumers := allConsumers[start:end]
		if paginatedConsumers == nil {
			paginatedConsumers = []models.ConsumerInfo{}
		}

		done <- &models.PaginatedConsumers{
			Consumers: paginatedConsumers,
			Total:     total,
			Offset:    offset,
			Limit:     limit,
		}
	}()

	// Wait for result or timeout
	select {
	case result := <-done:
		return result, nil
	case <-time.After(b.timeoutConfig.ConsumerListTimeout):
		return nil, fmt.Errorf("consumer listing timed out")
	}
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

	return ac.JS.DeleteStream(streamName)
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

	consumers := make([]models.ConsumerInfo, 0)
	for ci := range ac.JS.Consumers(streamName) {
		consumers = append(consumers, models.ConsumerInfo{
			Name:            ci.Name,
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

	return ac.JS.DeleteConsumer(streamName, consumerName)
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

	done := make(chan *models.PaginatedKVBuckets, 1)
	go func() {
		allBuckets := make([]models.KVBucketInfo, 0)

		// Get all KV buckets
		for streamInfo := range ac.JS.Streams() {
			// KV buckets are stored as streams with name pattern "KV_<bucket-name>"
			if !strings.HasPrefix(streamInfo.Config.Name, "KV_") {
				continue
			}

			bucketName := strings.TrimPrefix(streamInfo.Config.Name, "KV_")
			if searchLower != "" && !strings.Contains(strings.ToLower(bucketName), searchLower) {
				continue
			}

			bucket := models.KVBucketInfo{
				Name:       bucketName,
				Entries:    streamInfo.State.Msgs,
				Bytes:      streamInfo.State.Bytes,
				CreatedAt:  time.Now().UnixMilli(), // Would need stream metadata for actual creation time
				LastUpdate: time.Now().UnixMilli(),
			}
			allBuckets = append(allBuckets, bucket)
		}

		total := len(allBuckets)
		start := offset
		end := offset + limit

		if start > total {
			start = total
		}
		if end > total {
			end = total
		}

		paginatedBuckets := allBuckets[start:end]
		if paginatedBuckets == nil {
			paginatedBuckets = []models.KVBucketInfo{}
		}

		done <- &models.PaginatedKVBuckets{
			Buckets: paginatedBuckets,
			Total:   total,
			Offset:  offset,
			Limit:   limit,
		}
	}()

	select {
	case result := <-done:
		return result, nil
	case <-time.After(b.timeoutConfig.KVListTimeout):
		return nil, fmt.Errorf("KV bucket listing timed out")
	}
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

	done := make(chan *models.PaginatedKVEntries, 1)
	go func() {
		allEntries := make([]models.KVEntry, 0)

		// Get all keys from bucket
		keys, err := kv.Keys()
		if err == nil {
			for _, key := range keys {
				if searchLower != "" && !strings.Contains(strings.ToLower(key), searchLower) {
					continue
				}

				entry, err := kv.Get(key)
				if err != nil {
					continue // Skip deleted entries
				}

				kvEntry := models.KVEntry{
					Key:       key,
					Value:     string(entry.Value()),
					Bytes:     len(entry.Value()),
					Timestamp: entry.Created().UnixMilli(),
					Revision:  entry.Revision(),
					Operation: "PUT",
				}
				allEntries = append(allEntries, kvEntry)
			}
		}

		total := len(allEntries)
		start := offset
		end := offset + limit

		if start > total {
			start = total
		}
		if end > total {
			end = total
		}

		paginatedEntries := allEntries[start:end]
		if paginatedEntries == nil {
			paginatedEntries = []models.KVEntry{}
		}

		done <- &models.PaginatedKVEntries{
			Entries: paginatedEntries,
			Total:   total,
			Offset:  offset,
			Limit:   limit,
		}
	}()

	select {
	case result := <-done:
		return result, nil
	case <-time.After(b.timeoutConfig.KVListTimeout):
		return nil, fmt.Errorf("KV entries listing timed out")
	}
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

	return kv.Delete(key)
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
	return ac.JS.DeleteStream("KV_" + bucketName)
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

	if ai, err := ac.JS.AccountInfo(); err == nil && ai != nil {
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

	// Use a channel with timeout to avoid hanging if the cluster is slow to enumerate.
	done := make(chan []models.SlowConsumer, 1)
	go func() {
		slow := make([]models.SlowConsumer, 0)
		for streamInfo := range ac.JS.Streams() {
			streamName := streamInfo.Config.Name
			for ci := range ac.JS.Consumers(streamName) {
				reason := ""
				if ci.NumAckPending >= slowConsumerAckPendingThreshold {
					reason = "high ack-pending"
				} else if ci.NumPending >= uint64(slowConsumerPendingMsgThreshold) {
					reason = "high pending messages"
				} else {
					continue
				}

				slow = append(slow, models.SlowConsumer{
					ConsumerInfo: models.ConsumerInfo{
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
					},
					Reason: reason,
				})
				if len(slow) >= slowConsumerMaxResults {
					break
				}
			}
		}
		done <- slow
	}()

	select {
	case slow := <-done:
		health.SlowConsumers = slow
	case <-time.After(b.timeoutConfig.ConsumerListTimeout):
		// Leave SlowConsumers empty rather than failing the whole health check.
	}

	return health, nil
}
