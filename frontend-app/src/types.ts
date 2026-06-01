export interface Connection {
  id: string
  name: string
  url: string
  username?: string
  password?: string
}

export interface ServerInfo {
  name: string
  host: string
  port: number
  version: string
  maxPayload: number
  jetstream: boolean
}

export interface StreamInfo {
  name: string
  subjects: string[]
  messages: number
  bytes: number
  consumers: number
}

export type FilterType = 'contains' | 'exact' | 'regex' | 'jsonpath'

export interface ContentFilter {
  type: FilterType
  field: string      // dot-notation JSON path e.g. "user.address.city", empty = raw
  value: string
  negate: boolean
  caseSensitive: boolean
}

export interface MessageEnvelope {
  subject: string
  payload: string
  headers: Record<string, string>
  timestamp: number
  sequence?: number
  matched: boolean
  matchPath?: string
}

export interface SubscribeRequest {
  subject: string
  contentFilter?: ContentFilter
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ActiveSession {
  connectionId: string
  serverInfo: ServerInfo
  status: ConnectionStatus
}
