import { create } from 'zustand'
import type { Connection, ActiveSession, StreamInfo } from '../types'
import { api, setGlobalTimeout } from '../lib/api'
import { toast } from '../components/layout/Toast'

interface AppState {
  connections: Connection[]
  loadConnections: () => Promise<void>
  addConnection: (c: Omit<Connection, 'id'>) => Promise<void>
  updateConnection: (id: string, c: Partial<Connection>) => Promise<void>
  deleteConnection: (id: string) => Promise<void>

  session: ActiveSession | null
  connect: (id: string) => Promise<void>
  disconnect: () => Promise<void>

  streams: StreamInfo[]
  loadStreams: () => Promise<void>

  // Pre-fill subject when navigating from stream detail
  prefilledSubject: string
  setPrefilledSubject: (s: string) => void

  activeView: 'connections' | 'dashboard' | 'streams' | 'consumers' | 'kv' | 'messages' | 'publish'
  setActiveView: (v: AppState['activeView']) => void
}

export const useStore = create<AppState>((set, get) => ({
  connections: [],
  session: null,
  streams: [],
  prefilledSubject: '',
  activeView: 'connections',

  loadConnections: async () => {
    try {
      const connections = await api.listConnections()
      set({ connections })
    } catch {
      set({ connections: [] })
    }
  },

  addConnection: async (conn) => {
    const created = await api.createConnection(conn)
    set((s) => ({ connections: [...s.connections, created] }))
  },

  updateConnection: async (id, conn) => {
    const updated = await api.updateConnection(id, conn)
    set((s) => ({
      connections: s.connections.map((c) => (c.id === id ? updated : c)),
    }))
  },

  deleteConnection: async (id) => {
    await api.deleteConnection(id)
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }))
  },

  connect: async (id) => {
    set({ session: { connectionId: id, serverInfo: null!, status: 'connecting' } })
    try {
      // Set timeout for this connection
      const { connections } = get()
      const conn = connections.find(c => c.id === id)
      if (conn?.timeout && conn.timeout > 0) {
        setGlobalTimeout(conn.timeout)
      }

      const { server } = await api.connect(id)
      set({ session: { connectionId: id, serverInfo: server, status: 'connected' }, activeView: 'dashboard' })
      toast('success', `Connected to ${server.name} v${server.version}`)
    } catch (e) {
      set({ session: null })
      throw e
    }
  },

  disconnect: async () => {
    const { session } = get()
    if (session) await api.disconnect(session.connectionId).catch(() => {})
    set({ session: null, streams: [], activeView: 'connections' })
    toast('info', 'Disconnected')
  },

  loadStreams: async () => {
    const { session } = get()
    if (!session) return
    try {
      const streams = await api.getStreams(session.connectionId)
      set({ streams: streams ?? [] })
    } catch {
      set({ streams: [] }) // JetStream might not be enabled
    }
  },

  setPrefilledSubject: (prefilledSubject) => set({ prefilledSubject }),
  setActiveView: (activeView) => set({ activeView }),
}))
