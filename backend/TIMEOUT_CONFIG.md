# NATS API Timeout Configuration

This document describes how to configure timeouts for NATS API operations.

## Overview

All timeout values are now configurable via environment variables. If not specified, all timeouts default to **300 seconds** (5 minutes).

## Environment Variables

### Connection Timeout
- **Variable:** `NATS_CONNECTION_TIMEOUT`
- **Default:** 300 seconds
- **Description:** Timeout for establishing initial connection to NATS server

### Stream List Timeout
- **Variable:** `NATS_STREAM_LIST_TIMEOUT`
- **Default:** 300 seconds
- **Description:** Timeout for listing streams from NATS

### Consumer List Timeout
- **Variable:** `NATS_CONSUMER_LIST_TIMEOUT`
- **Default:** 300 seconds
- **Description:** Timeout for listing consumers from NATS

### KV List Timeout
- **Variable:** `NATS_KV_LIST_TIMEOUT`
- **Default:** 300 seconds
- **Description:** Timeout for listing KV buckets and entries

### Message Fetch Timeout
- **Variable:** `NATS_MESSAGE_FETCH_TIMEOUT`
- **Default:** 300 seconds
- **Description:** Timeout for fetching messages from stream

## Usage Examples

### Set all timeouts to 10 minutes (600 seconds)
```bash
export NATS_CONNECTION_TIMEOUT=600
export NATS_STREAM_LIST_TIMEOUT=600
export NATS_CONSUMER_LIST_TIMEOUT=600
export NATS_KV_LIST_TIMEOUT=600
export NATS_MESSAGE_FETCH_TIMEOUT=600

./backend
```

### Set specific timeouts (others use defaults)
```bash
export NATS_CONNECTION_TIMEOUT=60  # 1 minute for connection
export NATS_STREAM_LIST_TIMEOUT=180  # 3 minutes for stream listing

./backend
```

### Docker/Docker Compose
```dockerfile
ENV NATS_CONNECTION_TIMEOUT=300
ENV NATS_STREAM_LIST_TIMEOUT=300
ENV NATS_CONSUMER_LIST_TIMEOUT=300
ENV NATS_KV_LIST_TIMEOUT=300
ENV NATS_MESSAGE_FETCH_TIMEOUT=300
```

Or in docker-compose.yml:
```yaml
environment:
  NATS_CONNECTION_TIMEOUT: 300
  NATS_STREAM_LIST_TIMEOUT: 300
  NATS_CONSUMER_LIST_TIMEOUT: 300
  NATS_KV_LIST_TIMEOUT: 300
  NATS_MESSAGE_FETCH_TIMEOUT: 300
```

## Behavior

- **Valid timeout:** Must be a positive integer (in seconds)
- **Invalid/Missing value:** Falls back to default (300 seconds)
- **Zero or negative:** Warning logged, defaults to 300 seconds
- **On startup:** All configured timeouts are logged

## Example Startup Output

```
2024-01-15 10:30:45 Loaded timeout config - 
  Connection: 5m0s, 
  StreamList: 5m0s, 
  ConsumerList: 5m0s, 
  KVList: 5m0s, 
  MessageFetch: 5m0s
```

## Recommendations

- **For fast networks:** 60-120 seconds
- **For typical deployments:** 300 seconds (default)
- **For slow/unreliable networks:** 600+ seconds
- **Connection timeout:** Often smaller than operation timeouts (60-120s recommended)
