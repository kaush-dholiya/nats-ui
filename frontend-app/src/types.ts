export interface Connection {
  id: string
  name: string
  url: string
  username?: string
  password?: string
  timeout?: number
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
  numSubjects: number
  replicas: number
  storage: string
  retention: string
  maxMsgs: number
  maxBytes: number
  maxAge: number
  maxConsumers: number
}

export interface StreamConfigRequest {
  name: string
  subjects: string[]
  description?: string
  storage?: string
  retention?: string
  replicas?: number
  maxAge?: number
  maxBytes?: number
  maxMsgs?: number
  maxMsgSize?: number
  maxMsgsPerSubject?: number
  maxConsumers?: number
  discard?: string
  discardNewPerSubject?: boolean
  duplicateWindow?: number
  noAck?: boolean
  allowRollup?: boolean
  allowDirect?: boolean
  mirrorDirect?: boolean
  denyDelete?: boolean
  denyPurge?: boolean
  compression?: string
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
  field: string
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
