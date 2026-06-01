import type { Connection, ServerInfo, StreamInfo, ContentFilter, MessageEnvelope } from '../types'

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json()
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

  // NATS ops - Streams
  getStreams: (id: string) => req<StreamInfo[]>(`/connections/${id}/streams`),
  createStream: (id: string, name: string, subjects: string[]) =>
    req<void>(`/connections/${id}/streams`, {
      method: 'POST',
      body: JSON.stringify({ name, subjects }),
    }),
  deleteStream: (id: string, stream: string) =>
    req<void>(`/connections/${id}/streams/${stream}`, { method: 'DELETE' }),
  purgeStream: (id: string, stream: string) =>
    req<void>(`/connections/${id}/streams/${stream}/purge`, { method: 'POST' }),
  editStream: (id: string, stream: string, subjects: string[]) =>
    req<void>(`/connections/${id}/streams/${stream}`, {
      method: 'PUT',
      body: JSON.stringify({ subjects }),
    }),
  getStreamMessages: (id: string, stream: string, limit: number, contentFilter?: ContentFilter, startSeq?: number, endSeq?: number, startTime?: number, endTime?: number) =>
    req<MessageEnvelope[]>(`/connections/${id}/streams/${stream}/messages`, {
      method: 'POST',
      body: JSON.stringify({ limit, contentFilter, startSeq: startSeq || 0, endSeq: endSeq || 0, startTime: startTime || 0, endTime: endTime || 0 }),
    }),

  // NATS ops - Consumers
  getConsumers: (id: string, stream: string) =>
    req<any[]>(`/connections/${id}/streams/${stream}/consumers`),
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

  // Publishing
  publish: (id: string, subject: string, payload: string, headers?: Record<string, string>) =>
    req<void>(`/connections/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ subject, payload, headers }),
    }),
}
