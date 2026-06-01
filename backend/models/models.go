package models

type Connection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	URL      string `json:"url"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
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
	Subject      string       `json:"subject"`
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
	Name      string `json:"name"`
	Subjects  []string `json:"subjects"`
	Messages  uint64 `json:"messages"`
	Bytes     uint64 `json:"bytes"`
	Consumers int    `json:"consumers"`
}

type ConsumerInfo struct {
	Name           string `json:"name"`
	DeliverPolicy  string `json:"deliverPolicy"`
	AckPolicy      string `json:"ackPolicy"`
	FilterSubject  string `json:"filterSubject"`
	PendingMessages uint64 `json:"pendingMessages"`
	PausedUntil    string `json:"pausedUntil,omitempty"`
}

type MessageEnvelope struct {
	Subject   string            `json:"subject"`
	Payload   string            `json:"payload"`
	Headers   map[string]string `json:"headers"`
	Timestamp int64             `json:"timestamp"`
	Sequence  uint64            `json:"sequence,omitempty"`
	Matched   bool              `json:"matched"` // did it match content filter?
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
