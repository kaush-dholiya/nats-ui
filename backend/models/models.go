package models

type Connection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
	Timeout  int    `json:"timeout"` // API timeout in seconds (0 = default 30s)
}

type ConnectRequest struct {
	ConnectionID string `json:"connectionId"`
}

type PublishRequest struct {
	Subject string            `json:"subject"`
	Payload string            `json:"payload"`
	Headers map[string]string `json:"headers,omitempty"`
}

type SubscribeRequest struct {
	Subject       string         `json:"subject"`
	ContentFilter *ContentFilter `json:"contentFilter,omitempty"`
}

// ContentFilter is the killer feature — filter messages by their content
type ContentFilter struct {
	Type          string `json:"type"`          // "contains", "regex", "jsonpath", "exact"
	Field         string `json:"field"`         // For jsonpath: e.g. "$.user.id"
	Value         string `json:"value"`         // The value to match against
	Negate        bool   `json:"negate"`        // If true, exclude matching messages
	CaseSensitive bool   `json:"caseSensitive"` // If false, perform case-insensitive matching
}

type StreamInfo struct {
	Name      string   `json:"name"`
	Subjects  []string `json:"subjects"`
	Messages  uint64   `json:"messages"`
	Bytes     uint64   `json:"bytes"`
	Consumers int      `json:"consumers"`
}

// StreamConfigRequest is used for both create and update operations.
// Duration fields (MaxAge, DuplicateWindow) are in seconds; 0 means disabled/unlimited.
// Limit fields (MaxBytes, MaxMsgs, MaxMsgSize, MaxConsumers) use -1 for unlimited.
type StreamConfigRequest struct {
	Name                 string            `json:"name"`
	Subjects             []string          `json:"subjects"`
	Description          string            `json:"description"`
	Storage              string            `json:"storage"`   // "file" | "memory"
	Retention            string            `json:"retention"` // "limits" | "workqueue" | "interest"
	Replicas             int               `json:"replicas"`
	MaxAge               int64             `json:"maxAge"`     // seconds, 0 = no limit
	MaxBytes             int64             `json:"maxBytes"`   // -1 = unlimited
	MaxMsgs              int64             `json:"maxMsgs"`    // -1 = unlimited
	MaxMsgSize           int32             `json:"maxMsgSize"` // -1 = unlimited
	MaxMsgsPerSubject    int64             `json:"maxMsgsPerSubject"`
	MaxConsumers         int               `json:"maxConsumers"` // -1 = unlimited
	Discard              string            `json:"discard"`      // "old" | "new"
	DiscardNewPerSubject bool              `json:"discardNewPerSubject"`
	DuplicateWindow      int64             `json:"duplicateWindow"` // seconds, 0 = default
	NoAck                bool              `json:"noAck"`
	AllowRollup          bool              `json:"allowRollup"`
	AllowDirect          bool              `json:"allowDirect"`
	MirrorDirect         bool              `json:"mirrorDirect"`
	DenyDelete           bool              `json:"denyDelete"`
	DenyPurge            bool              `json:"denyPurge"`
	Compression          string            `json:"compression"` // "" | "s2"
	FirstSeq             uint64            `json:"firstSeq"`
	AllowMsgTTL          bool              `json:"allowMsgTTL"`
	AllowAtomicPublish   bool              `json:"allowAtomicPublish"`
	AllowBatchPublish    bool              `json:"allowBatchPublish"`
	Metadata             map[string]string `json:"metadata"`
}

// StreamFullConfig is returned by GET /streams/:stream and used to pre-populate the edit form.
type StreamFullConfig struct {
	Name                 string            `json:"name"`
	Subjects             []string          `json:"subjects"`
	Description          string            `json:"description"`
	Storage              string            `json:"storage"`
	Retention            string            `json:"retention"`
	Replicas             int               `json:"replicas"`
	MaxAge               int64             `json:"maxAge"`
	MaxBytes             int64             `json:"maxBytes"`
	MaxMsgs              int64             `json:"maxMsgs"`
	MaxMsgSize           int32             `json:"maxMsgSize"`
	MaxMsgsPerSubject    int64             `json:"maxMsgsPerSubject"`
	MaxConsumers         int               `json:"maxConsumers"`
	Discard              string            `json:"discard"`
	DiscardNewPerSubject bool              `json:"discardNewPerSubject"`
	DuplicateWindow      int64             `json:"duplicateWindow"`
	NoAck                bool              `json:"noAck"`
	AllowRollup          bool              `json:"allowRollup"`
	AllowDirect          bool              `json:"allowDirect"`
	MirrorDirect         bool              `json:"mirrorDirect"`
	DenyDelete           bool              `json:"denyDelete"`
	DenyPurge            bool              `json:"denyPurge"`
	Compression          string            `json:"compression"`
	FirstSeq             uint64            `json:"firstSeq"`
	AllowMsgTTL          bool              `json:"allowMsgTTL"`
	AllowAtomicPublish   bool              `json:"allowAtomicPublish"`
	AllowBatchPublish    bool              `json:"allowBatchPublish"`
	Metadata             map[string]string `json:"metadata"`
	// State
	Messages  uint64 `json:"messages"`
	Bytes     uint64 `json:"bytes"`
	Consumers int    `json:"consumers"`
}

type PaginatedStreams struct {
	Streams []StreamInfo `json:"streams"`
	Total   int          `json:"total"`
	Offset  int          `json:"offset"`
	Limit   int          `json:"limit"`
}

type ConsumerInfo struct {
	Name            string `json:"name"`
	StreamName      string `json:"streamName,omitempty"` // Added for consumers list view
	DeliverPolicy   string `json:"deliverPolicy"`
	AckPolicy       string `json:"ackPolicy"`
	FilterSubject   string `json:"filterSubject"`
	PendingMessages uint64 `json:"pendingMessages"`
	PausedUntil     string `json:"pausedUntil,omitempty"`
}

type PaginatedConsumers struct {
	Consumers []ConsumerInfo `json:"consumers"`
	Total     int            `json:"total"`
	Offset    int            `json:"offset"`
	Limit     int            `json:"limit"`
}

type MessageEnvelope struct {
	Subject   string            `json:"subject"`
	Payload   string            `json:"payload"`
	Headers   map[string]string `json:"headers"`
	Timestamp int64             `json:"timestamp"`
	Sequence  uint64            `json:"sequence,omitempty"`
	Matched   bool              `json:"matched"`             // did it match content filter?
	MatchPath string            `json:"matchPath,omitempty"` // which path matched
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type ServerInfo struct {
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Version    string `json:"version"`
	MaxPayload int64  `json:"maxPayload"`
	JetStream  bool   `json:"jetstream"`
}

type KVBucketInfo struct {
	Name       string `json:"name"`
	Entries    uint64 `json:"entries"`
	Bytes      uint64 `json:"bytes"`
	CreatedAt  int64  `json:"createdAt"`
	LastUpdate int64  `json:"lastUpdate"`
}

type PaginatedKVBuckets struct {
	Buckets []KVBucketInfo `json:"buckets"`
	Total   int            `json:"total"`
	Offset  int            `json:"offset"`
	Limit   int            `json:"limit"`
}

type KVEntry struct {
	Key       string `json:"key"`
	Value     string `json:"value"`
	Bytes     int    `json:"bytes"`
	Timestamp int64  `json:"timestamp"`
	Revision  uint64 `json:"revision"`
	Operation string `json:"operation"` // "PUT" or "DEL"
}

type PaginatedKVEntries struct {
	Entries []KVEntry `json:"entries"`
	Total   int       `json:"total"`
	Offset  int       `json:"offset"`
	Limit   int       `json:"limit"`
}
