package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// TimeoutConfig holds all timeout configurations for NATS operations
type TimeoutConfig struct {
	ConnectionTimeout   time.Duration
	StreamListTimeout   time.Duration
	ConsumerListTimeout time.Duration
	KVListTimeout       time.Duration
	MessageFetchTimeout time.Duration
}

// LoadTimeoutConfig loads timeout configuration from environment variables
// All timeouts default to 300 seconds if not specified
func LoadTimeoutConfig() *TimeoutConfig {
	return &TimeoutConfig{
		ConnectionTimeout:   parseTimeout("NATS_CONNECTION_TIMEOUT", 300),
		StreamListTimeout:   parseTimeout("NATS_STREAM_LIST_TIMEOUT", 300),
		ConsumerListTimeout: parseTimeout("NATS_CONSUMER_LIST_TIMEOUT", 300),
		KVListTimeout:       parseTimeout("NATS_KV_LIST_TIMEOUT", 300),
		MessageFetchTimeout: parseTimeout("NATS_MESSAGE_FETCH_TIMEOUT", 300),
	}
}

// parseTimeout parses a timeout from environment variable or returns default
func parseTimeout(envKey string, defaultSeconds int64) time.Duration {
	val := os.Getenv(envKey)
	if val == "" {
		return time.Duration(defaultSeconds) * time.Second
	}

	seconds, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		fmt.Printf("Warning: invalid %s value '%s', using default %d seconds\n", envKey, val, defaultSeconds)
		return time.Duration(defaultSeconds) * time.Second
	}

	if seconds <= 0 {
		fmt.Printf("Warning: %s must be positive, using default %d seconds\n", envKey, defaultSeconds)
		return time.Duration(defaultSeconds) * time.Second
	}

	return time.Duration(seconds) * time.Second
}
