import type { Connection, ServerInfo, StreamInfo, StreamConfigRequest, StreamFullConfig, ContentFilter, MessageEnvelope, HealthInfo } from '../types'

const BASE = '/api'
let globalTimeout = 30

export function setGlobalTimeout(seconds: number) {
  globalTimeout = seconds > 0 ? seconds : 30
}

async function req<T>(path: string, options?: RequestInit, timeoutSeconds?: number): Promise<T> {
  const timeout = timeoutSeconds && timeoutSeconds > 0 ? timeoutSeconds : globalTimeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000)
  try {
    const res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    if (res.status === 204) return undefined as T
    return res.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

export const api = {
  // Connections
  listConnections: () => req<Connection[]>('/connections'),
  createConnection: (conn: Omit<Connection, 'id'>) =>
    req<Connection>('/connections', { method: 'POST', body: JSON.stringify(conn) }),
  updateConnection: (id: string, conn: Partial<Connection>) =>
    req<Connection>(`/connections/${id}`, { method: 'PUT', body: JSON.stringify(conn) }),
  deleteConnection: (id: string) =>
    req<void>(`/connections/${id}`, { method: 'DELETE' }),

  // Connect/disconnect
  connect: (id: string) =>
    req<{ status: string; server: ServerInfo }>(`/connections/${id}/connect`, { method: 'POST' }),
  disconnect: (id: string) =>
    req<void>(`/connections/${id}/disconnect`, { method: 'POST' }),
  getStatus: (id: string) =>
    req<{ connected: boolean }>(`/connections/${id}/status`),
  getHealth: (id: string) =>
    req<HealthInfo>(`/connections/${id}/health`),

  // Streams
  getStreams: (id: string) => req<StreamInfo[]>(`/connections/${id}/streams`),
  getStreamsPaginated: (id: string, offset: number, limit: number, search: string = '') => {
    const params = new URLSearchParams()
    params.append('offset', offset.toString())
    params.append('limit', limit.toString())
    if (search) params.append('search', search)
    return req<{ streams: StreamInfo[]; total: number; offset: number; limit: number }>(`/connections/${id}/streams?${params}`)
  },
  getStreamInfo: (id: string, stream: string) =>
    req<StreamFullConfig>(`/connections/${id}/streams/${stream}`),
  createStream: (id: string, config: StreamConfigRequest) =>
    req<void>(`/connections/${id}/streams`, { method: 'POST', body: JSON.stringify(config) }),
  editStream: (id: string, stream: string, config: StreamConfigRequest) =>
    req<void>(`/connections/${id}/streams/${stream}`, { method: 'PUT', body: JSON.stringify(config) }),
  deleteStream: (id: string, stream: string) =>
    req<void>(`/connections/${id}/streams/${stream}`, { method: 'DELETE' }),
  purgeStream: (id: string, stream: string) =>
    req<void>(`/connections/${id}/streams/${stream}/purge`, { method: 'POST' }),
  getStreamMessages: (id: string, stream: string, limit: number, contentFilter?: ContentFilter, startSeq?: number, endSeq?: number, startTime?: number, endTime?: number) =>
    req<MessageEnvelope[]>(`/connections/${id}/streams/${stream}/messages`, {
      method: 'POST',
      body: JSON.stringify({ limit, contentFilter, startSeq: startSeq || 0, endSeq: endSeq || 0, startTime: startTime || 0, endTime: endTime || 0 }),
    }),
  replayStreamMessages: (
    id: string, stream: string,
    opts: { targetSubject?: string; startSeq?: number; endSeq?: number; startTime?: number; endTime?: number; delayMs?: number; limit?: number }
  ) =>
    req<{ replayed: number; skipped: number; error?: string }>(
      `/connections/${id}/streams/${stream}/replay`,
      { method: 'POST', body: JSON.stringify(opts) },
      120,
    ),

  // Consumers
  getConsumers: (id: string, stream: string) =>
    req<any[]>(`/connections/${id}/streams/${stream}/consumers`),
  getConsumersPaginated: (id: string, offset: number, limit: number, search: string = '') => {
    const params = new URLSearchParams()
    params.append('offset', offset.toString())
    params.append('limit', limit.toString())
    if (search) params.append('search', search)
    return req<{ consumers: any[]; total: number; offset: number; limit: number }>(`/connections/${id}/consumers?${params}`)
  },
  createConsumer: (id: string, stream: string, name: string, filter: string, deliverPolicy: string, ackPolicy: string) =>
    req<void>(`/connections/${id}/streams/${stream}/consumers`, {
      method: 'POST',
      body: JSON.stringify({ name, filter, deliverPolicy, ackPolicy }),
    }),
  deleteConsumer: (id: string, stream: string, consumer: string) =>
    req<void>(`/connections/${id}/streams/${stream}/consumers/${consumer}`, { method: 'DELETE' }),
  pauseConsumer: (id: string, stream: string, consumer: string) =>
    req<void>(`/connections/${id}/streams/${stream}/consumers/${consumer}/pause`, { method: 'POST' }),
  resumeConsumer: (id: string, stream: string, consumer: string) =>
    req<void>(`/connections/${id}/streams/${stream}/consumers/${consumer}/resume`, { method: 'POST' }),

  // KV
  createKVBucket: (id: string, name: string) =>
    req<void>(`/connections/${id}/kv`, { method: 'POST', body: JSON.stringify({ name }) }),
  getKVBuckets: (id: string, offset: number, limit: number, search: string = '') => {
    const params = new URLSearchParams()
    params.append('offset', offset.toString())
    params.append('limit', limit.toString())
    if (search) params.append('search', search)
    return req<{ buckets: any[]; total: number; offset: number; limit: number }>(`/connections/${id}/kv?${params}`)
  },
  getKVEntries: (id: string, bucket: string, offset: number, limit: number, search: string = '') => {
    const params = new URLSearchParams()
    params.append('offset', offset.toString())
    params.append('limit', limit.toString())
    if (search) params.append('search', search)
    return req<{ entries: any[]; total: number; offset: number; limit: number }>(`/connections/${id}/kv/${bucket}?${params}`)
  },
  putKV: (id: string, bucket: string, key: string, value: string) =>
    req<void>(`/connections/${id}/kv/${bucket}`, { method: 'POST', body: JSON.stringify({ key, value }) }),
  deleteKV: (id: string, bucket: string, key: string) =>
    req<void>(`/connections/${id}/kv/${bucket}/${key}`, { method: 'DELETE' }),
  deleteKVBucket: (id: string, bucket: string) =>
    req<void>(`/connections/${id}/kv/${bucket}`, { method: 'DELETE' }),

  // Publish
  publish: (id: string, subject: string, payload: string, headers?: Record<string, string>) =>
    req<void>(`/connections/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ subject, payload, headers }),
    }),

  // Request/Reply
  request: (id: string, subject: string, payload: string, timeout: number, headers?: Record<string, string>) =>
    req<{ subject: string; payload: string; headers?: Record<string, string>; elapsed: number }>(
      `/connections/${id}/request`,
      { method: 'POST', body: JSON.stringify({ subject, payload, headers, timeout }) },
      timeout + 5,
    ),
}
