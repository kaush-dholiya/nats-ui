export interface Connection {
  id: string
  name: string
  url: string
  username?: string
  password?: string
  timeout?: number  // API timeout in seconds (0 or undefined = default 30s)
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

export interface StreamConfigRequest {
  name: string
  subjects: string[]
  description?: string
  storage?: string           // "file" | "memory"
  retention?: string         // "limits" | "workqueue" | "interest"
  replicas?: number
  maxAge?: number            // seconds, 0 = no limit
  maxBytes?: number          // -1 = unlimited
  maxMsgs?: number           // -1 = unlimited
  maxMsgSize?: number        // -1 = unlimited
  maxMsgsPerSubject?: number
  maxConsumers?: number      // -1 = unlimited
  discard?: string           // "old" | "new"
  discardNewPerSubject?: boolean
  duplicateWindow?: number   // seconds
  noAck?: boolean
  allowRollup?: boolean
  allowDirect?: boolean
  mirrorDirect?: boolean
  denyDelete?: boolean
  denyPurge?: boolean
  compression?: string       // "" | "s2"
  firstSeq?: number
  allowMsgTTL?: boolean
  allowAtomicPublish?: boolean
  allowBatchPublish?: boolean
  metadata?: Record<string, string>
}

export interface StreamFullConfig extends StreamConfigRequest {
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
