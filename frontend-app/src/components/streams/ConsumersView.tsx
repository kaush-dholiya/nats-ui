import { useEffect, useState } from 'react'
import {
  Layers, Users, MessageSquare,
  ChevronRight, RefreshCw, Search,
  ChevronDown
} from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'

interface Consumer {
  name: string
  streamName: string
  pendingMessages: number
  deliverPolicy: string
  ackPolicy: string
  filterSubject: string
}

export function ConsumersView() {
  const { session } = useStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit] = useState(50)
  const [paginatedData, setPaginatedData] = useState<{ consumers: Consumer[]; total: number; offset: number; limit: number } | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [expandedStreams, setExpandedStreams] = useState<Set<string>>(new Set())

  const loadPaginatedConsumers = async (searchQuery: string, pageOffset: number) => {
    if (!session?.connectionId) return
    setLoading(true)
    try {
      const result = await api.getConsumersPaginated(session.connectionId, pageOffset, limit, searchQuery)
      setPaginatedData(result)
    } catch (err: any) {
      console.error('Failed to load consumers:', err)
      setPaginatedData({ consumers: [], total: 0, offset: pageOffset, limit })
    } finally {
      setLoading(false)
    }
  }

  // Handle search with debouncing
  const handleSearch = (value: string) => {
    setSearch(value)
    setOffset(0)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(() => {
      loadPaginatedConsumers(value, 0)
    }, 300)
    setSearchTimeout(timeout)
  }

  const handleNextPage = () => {
    const newOffset = offset + limit
    if (paginatedData && newOffset < paginatedData.total) {
      setOffset(newOffset)
      loadPaginatedConsumers(search, newOffset)
    }
  }

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - limit)
    setOffset(newOffset)
    loadPaginatedConsumers(search, newOffset)
  }

  useEffect(() => {
    if (session?.connectionId) {
      setOffset(0)
      setSearch('')
      if (searchTimeout) clearTimeout(searchTimeout)
      loadPaginatedConsumers('', 0)
    }
  }, [session?.connectionId])

  const consumers = paginatedData?.consumers ?? []
  const total = paginatedData?.total ?? 0
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  // Group consumers by stream
  const consumersByStream = consumers.reduce((acc, consumer) => {
    if (!acc[consumer.streamName]) {
      acc[consumer.streamName] = []
    }
    acc[consumer.streamName].push(consumer)
    return acc
  }, {} as Record<string, Consumer[]>)

  const toggleStream = (streamName: string) => {
    const newSet = new Set(expandedStreams)
    if (newSet.has(streamName)) {
      newSet.delete(streamName)
    } else {
      newSet.add(streamName)
    }
    setExpandedStreams(newSet)
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Consumers list panel */}
      <div style={{
        width: '100%',
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '28px 20px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.3px' }}>Consumers</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>
                {total} total {total !== 1 ? 'consumers' : 'consumer'}{search ? ` • Page ${currentPage}/${totalPages}` : ''}
              </p>
            </div>
            <button onClick={() => loadPaginatedConsumers(search, offset)} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '7px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center',
            }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search by name, stream, or subject…"
              style={{
                width: '100%', padding: '8px 10px 8px 30px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px',
                fontFamily: 'var(--font-sans)', outline: 'none',
              }} />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 10px', display: 'flex', flexDirection: 'column' }}>
          {consumers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
              <Users size={28} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {search ? 'No consumers match your search' : 'No consumers found'}
              </p>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {Object.entries(consumersByStream).map(([streamName, streamConsumers]) => (
                  <div key={streamName} style={{ marginBottom: '8px' }}>
                    {/* Stream header */}
                    <div
                      onClick={() => toggleStream(streamName)}
                      style={{
                        padding: '11px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '3px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', gap: '9px',
                      }}
                    >
                      {expandedStreams.has(streamName) ? (
                        <ChevronDown size={14} color="var(--accent)" />
                      ) : (
                        <ChevronRight size={14} color="var(--text-dim)" />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <Layers size={13} color="var(--accent)" />
                        <span style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                          {streamName}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        {streamConsumers.length} consumer{streamConsumers.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Consumers under stream */}
                    {expandedStreams.has(streamName) && (
                      <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {streamConsumers.map(consumer => (
                          <ConsumerRow key={consumer.name} consumer={consumer} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div style={{ padding: '12px 10px 0', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)' }}>
                  <div>
                    Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={handlePrevPage}
                      disabled={offset === 0}
                      style={{
                        padding: '4px 8px', borderRadius: '5px',
                        background: offset === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                        border: '1px solid var(--border)', cursor: offset === 0 ? 'not-allowed' : 'pointer',
                        color: offset === 0 ? 'var(--text-dim)' : 'var(--text-secondary)', fontSize: '11px',
                        opacity: offset === 0 ? 0.5 : 1,
                      }}
                    >
                      ← Prev
                    </button>
                    <button
                      onClick={handleNextPage}
                      disabled={offset + limit >= total}
                      style={{
                        padding: '4px 8px', borderRadius: '5px',
                        background: offset + limit >= total ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                        border: '1px solid var(--border)', cursor: offset + limit >= total ? 'not-allowed' : 'pointer',
                        color: offset + limit >= total ? 'var(--text-dim)' : 'var(--text-secondary)', fontSize: '11px',
                        opacity: offset + limit >= total ? 0.5 : 1,
                      }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ConsumerRow({ consumer }: { consumer: Consumer }) {
  return (
    <div
      style={{
        padding: '11px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '3px',
        background: 'transparent', border: '1px solid var(--border)',
        transition: 'all 0.12s', position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-elevated)'
        e.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '5px', flexShrink: 0,
            background: 'var(--bg-overlay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Users size={11} color="var(--accent)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {consumer.name}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>
              {consumer.filterSubject ? `Filters: ${consumer.filterSubject}` : 'No filter'}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '7px', paddingLeft: '33px', flexWrap: 'wrap' }}>
        <Stat label={`${consumer.pendingMessages}`} icon={MessageSquare} title="Pending" />
        <Stat label={consumer.ackPolicy} icon={null} title="Ack Policy" />
        <Stat label={consumer.deliverPolicy} icon={null} title="Deliver Policy" />
      </div>
    </div>
  )
}

function Stat({ label, icon: Icon, title }: { label: string; icon: any; title?: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--text-dim)' }} title={title}>
      {Icon && <Icon size={9} />} {label}
    </span>
  )
}
