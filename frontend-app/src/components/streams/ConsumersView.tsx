import { useEffect, useState } from 'react'
import {
  Users, RefreshCw, Search, Trash2, Layers, AlertCircle, Clock,
  X, MessageSquare, Play, Loader2, ChevronRight, ChevronDown, RotateCcw, CheckCircle2, Filter as FilterIcon,
  Download,
} from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'
import { exportMessages } from '../../lib/exportMessages'
import type { MessageEnvelope } from '../../types'

interface Consumer {
  name: string
  streamName: string
  pendingMessages: number
  ackPending: number
  waitingPulls: number
  totalDelivered: number
  deliverPolicy: string
  ackPolicy: string
  filterSubject: string
  isPull: boolean
  deliverSubject: string
  pausedUntil?: string
}

// Matches a NATS subject against a filter subject containing `*` / `>` wildcards.
function subjectMatches(subject: string, filter: string): boolean {
  if (!filter) return true
  const subTokens = subject.split('.')
  const filTokens = filter.split('.')
  for (let i = 0; i < filTokens.length; i++) {
    const f = filTokens[i]
    if (f === '>') return true
    if (i >= subTokens.length) return false
    if (f !== '*' && f !== subTokens[i]) return false
  }
  return subTokens.length === filTokens.length
}

export function ConsumersView() {
  const { session } = useStore()
  const [selected, setSelected] = useState<Consumer | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit] = useState(100)
  const [paginatedData, setPaginatedData] = useState<{
    consumers: Consumer[]; total: number; offset: number; limit: number
  } | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async (q: string, off: number) => {
    if (!session?.connectionId) return
    setLoading(true)
    setError('')
    try {
      const result = await api.getConsumersPaginated(session.connectionId, off, limit, q)
      setPaginatedData(result)
    } catch (e: any) {
      setError(e.message)
      setPaginatedData({ consumers: [], total: 0, offset: off, limit })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setOffset(0)
    if (searchTimeout) clearTimeout(searchTimeout)
    setSearchTimeout(setTimeout(() => load(value, 0), 300))
  }

  const handleDelete = async (consumer: Consumer) => {
    if (!session?.connectionId) return
    const key = `${consumer.streamName}/${consumer.name}`
    if (!confirm(`Delete consumer "${consumer.name}" from stream "${consumer.streamName}"?`)) return
    setDeletingId(key)
    try {
      await api.deleteConsumer(session.connectionId, consumer.streamName, consumer.name)
      load(search, offset)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (session?.connectionId) {
      setOffset(0)
      setSearch('')
      load('', 0)
    }
  }, [session?.connectionId])

  const consumers = paginatedData?.consumers ?? []
  const total = paginatedData?.total ?? 0
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.max(1, Math.ceil(total / limit))

  if (selected && session?.connectionId) {
    return (
      <div className="animate-fade-in" style={{ height: '100vh', overflow: 'hidden' }}>
        <ConsumerDetail
          consumer={selected}
          connectionId={session.connectionId}
          onClose={() => setSelected(null)}
        />
      </div>
    )
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        padding: '20px 28px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.3px', marginBottom: '2px' }}>Consumers</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            {total} consumer{total !== 1 ? 's' : ''}{totalPages > 1 && ` · page ${currentPage}/${totalPages}`}
          </p>
        </div>
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search name, stream, subject…"
            style={{
              width: '100%', padding: '7px 10px 7px 28px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px',
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          />
        </div>
        <button
          onClick={() => load(search, offset)}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '7px', padding: '7px 10px', cursor: 'pointer',
            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{
          margin: '12px 28px 0', padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--red)',
        }}>
          <AlertCircle size={13} /> {error}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px 20px' }}>
        {loading && consumers.length === 0 ? (
          <SkeletonGrid />
        ) : consumers.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <>
            {/* Column headers */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', marginBottom: '4px' }}>
              <ColHead style={{ flex: '2 1 180px' }}>Consumer</ColHead>
              <ColHead style={{ flex: '1 1 140px' }}>Stream</ColHead>
              <ColHead style={{ flex: '1 1 140px' }}>Filter Subject</ColHead>
              <ColHead style={{ width: '70px', textAlign: 'center' }}>Type</ColHead>
              <ColHead style={{ width: '90px', textAlign: 'center' }}>Delivered</ColHead>
              <ColHead style={{ width: '80px', textAlign: 'center' }}>Pending</ColHead>
              <ColHead style={{ width: '70px', textAlign: 'center' }}>Lag</ColHead>
              <ColHead style={{ width: '80px', textAlign: 'center' }}>Waiting</ColHead>
              <ColHead style={{ width: '90px', textAlign: 'center' }}>Ack Policy</ColHead>
              <ColHead style={{ width: '40px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {consumers.map(c => (
                <ConsumerRow
                  key={`${c.streamName}/${c.name}`}
                  consumer={c}
                  deleting={deletingId === `${c.streamName}/${c.name}`}
                  onSelect={() => setSelected(c)}
                  onDelete={() => handleDelete(c)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)' }}>
                <span>Showing {offset + 1}&ndash;{Math.min(offset + limit, total)} of {total}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <PageBtn disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - limit); setOffset(o); load(search, o) }}>
                    Prev
                  </PageBtn>
                  <PageBtn disabled={offset + limit >= total} onClick={() => { const o = offset + limit; setOffset(o); load(search, o) }}>
                    Next
                  </PageBtn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ConsumerRow({ consumer: c, deleting, onSelect, onDelete }: {
  consumer: Consumer; deleting: boolean; onSelect: () => void; onDelete: () => void
}) {
  const isPaused = !!c.pausedUntil
  const lag = c.ackPending
  const hasLag = lag > 0

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', cursor: 'pointer',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '10px 14px', transition: 'border-color 0.12s',
        opacity: isPaused ? 0.75 : 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* Name + deliver policy */}
      <div style={{ flex: '2 1 180px', minWidth: 0, paddingRight: '12px' }}>
        <div style={{
          fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          {isPaused && <Clock size={11} color="var(--yellow, #f59e0b)" aria-label={`Paused until ${c.pausedUntil}`} />}
          {c.name}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
          {friendlyDeliverPolicy(c.deliverPolicy)}
        </div>
      </div>

      {/* Stream */}
      <div style={{ flex: '1 1 140px', minWidth: 0, paddingRight: '12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '12px', color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <Layers size={11} style={{ flexShrink: 0 }} />
          {c.streamName}
        </div>
      </div>

      {/* Filter subject */}
      <div style={{ flex: '1 1 140px', minWidth: 0, paddingRight: '12px' }}>
        <div style={{
          fontSize: '11px', fontFamily: 'var(--font-mono)',
          color: c.filterSubject ? 'var(--text-secondary)' : 'var(--text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {c.filterSubject || <span style={{ fontStyle: 'italic' }}>all subjects</span>}
        </div>
      </div>

      {/* Type */}
      <div style={{ width: '70px', textAlign: 'center', paddingRight: '8px' }}>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
          background: c.isPull ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.1)',
          color: c.isPull ? 'var(--accent)' : 'var(--green)',
          letterSpacing: '0.2px', textTransform: 'uppercase',
        }}>
          {c.isPull ? 'Pull' : 'Push'}
        </span>
      </div>

      {/* Delivered */}
      <Num value={c.totalDelivered} width="90px" dim={c.totalDelivered === 0} />

      {/* Pending */}
      <Num value={c.pendingMessages} width="80px" dim={c.pendingMessages === 0} />

      {/* Lag */}
      <div style={{ width: '70px', textAlign: 'center', paddingRight: '8px' }}>
        <span style={{
          fontSize: '12px', fontFamily: 'var(--font-mono)',
          color: hasLag ? '#f59e0b' : 'var(--text-dim)',
          fontWeight: hasLag ? 600 : 400,
        }}>
          {hasLag ? lag.toLocaleString() : '—'}
        </span>
      </div>

      {/* Waiting pulls */}
      <div style={{ width: '80px', textAlign: 'center', paddingRight: '8px' }}>
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: c.waitingPulls > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
          {c.isPull ? (c.waitingPulls > 0 ? `+${c.waitingPulls}` : '—') : '—'}
        </span>
      </div>

      {/* Ack policy */}
      <div style={{ width: '90px', textAlign: 'center', paddingRight: '8px' }}>
        <AckBadge policy={c.ackPolicy} />
      </div>

      {/* Delete */}
      <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={onDelete}
          disabled={deleting}
          style={{
            background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
            color: 'var(--text-dim)', padding: '4px', borderRadius: '5px',
            display: 'flex', alignItems: 'center', opacity: deleting ? 0.4 : 1, transition: 'color 0.12s, background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'none' }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function ColHead({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.4px', color: 'var(--text-dim)', paddingBottom: '6px', ...style,
    }}>
      {children}
    </div>
  )
}

function Num({ value, width, dim }: { value: number; width: string; dim?: boolean }) {
  return (
    <div style={{ width, textAlign: 'center', paddingRight: '8px' }}>
      <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: dim ? 'var(--text-dim)' : 'var(--text-primary)' }}>
        {dim ? '—' : value.toLocaleString()}
      </span>
    </div>
  )
}

function AckBadge({ policy }: { policy: string }) {
  const color = policy === '0' || policy.toLowerCase().includes('explicit')
    ? 'var(--green)' : policy.toLowerCase().includes('all')
      ? 'var(--accent)' : 'var(--text-dim)'
  return (
    <span style={{
      fontSize: '10px', color, fontFamily: 'var(--font-mono)',
      background: `${color}18`, padding: '2px 6px', borderRadius: '4px',
    }}>
      {friendlyAckPolicy(policy)}
    </span>
  )
}

function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '4px 10px', borderRadius: '5px', fontSize: '11px',
      background: disabled ? 'var(--bg-surface)' : 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-dim)' : 'var(--text-secondary)',
      opacity: disabled ? 0.5 : 1,
    }}>
      {children}
    </button>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} style={{
          height: '52px', borderRadius: '8px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
          opacity: 1 - i * 0.08,
        }} />
      ))}
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
      <Users size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
        {search ? 'No consumers match your search' : 'No consumers found'}
      </p>
      {!search && (
        <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-dim)' }}>
          Create consumers from the Streams view
        </p>
      )}
    </div>
  )
}

function friendlyDeliverPolicy(p: string): string {
  const map: Record<string, string> = {
    '0': 'All messages', '1': 'Last message', '2': 'New only',
    '3': 'By start seq', '4': 'By start time', '5': 'Last per subject',
  }
  return map[p] ?? p
}

function friendlyAckPolicy(p: string): string {
  const map: Record<string, string> = { '0': 'Explicit', '1': 'All', '2': 'None' }
  return map[p] ?? p
}

// ─── Consumer Detail (messages) ────────────────────────────────────────────

function ConsumerDetail({ consumer, connectionId, onClose }: {
  consumer: Consumer; connectionId: string; onClose: () => void
}) {
  const [messages, setMessages] = useState<MessageEnvelope[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(100)
  const [startSeq, setStartSeq] = useState('')
  const [endSeq, setEndSeq] = useState('')
  const [scopeToFilter, setScopeToFilter] = useState(!!consumer.filterSubject)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const fetchMessages = async () => {
    setLoading(true)
    setError(null)
    setExpandedIdx(null)
    try {
      const startSeqNum = startSeq ? parseInt(startSeq, 10) : undefined
      const endSeqNum = endSeq ? parseInt(endSeq, 10) : undefined
      const msgs = await api.getStreamMessages(connectionId, consumer.streamName, limit, undefined, startSeqNum, endSeqNum)
      const filtered = scopeToFilter && consumer.filterSubject
        ? (msgs ?? []).filter(m => subjectMatches(m.subject, consumer.filterSubject))
        : (msgs ?? [])
      setMessages(filtered)
    } catch (e: any) {
      setError(e.message)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages() }, [consumer.streamName, consumer.name])

  const isPaused = !!consumer.pausedUntil
  const lag = consumer.ackPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '6px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '7px', background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} color="var(--accent)" />
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{consumer.name}</h2>
              <span style={{
                fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
                background: consumer.isPull ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.1)',
                color: consumer.isPull ? 'var(--accent)' : 'var(--green)',
                letterSpacing: '0.2px', textTransform: 'uppercase',
              }}>
                {consumer.isPull ? 'Pull' : 'Push'}
              </span>
              {isPaused && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--yellow, #f59e0b)' }}>
                  <Clock size={11} /> Paused
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={11} color="var(--text-dim)" />
              <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{consumer.streamName}</span>
              {consumer.filterSubject && (
                <span style={{
                  fontSize: '11px', fontFamily: 'var(--font-mono)', marginLeft: '6px',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  borderRadius: '4px', padding: '2px 7px', color: 'var(--text-secondary)',
                }}>{consumer.filterSubject}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}>
            <X size={15} />
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '20px', padding: '10px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '14px' }}>
          <StatPill label="Delivered" value={consumer.totalDelivered.toLocaleString()} />
          <StatPill label="Pending" value={consumer.pendingMessages.toLocaleString()} />
          <StatPill label="Lag" value={lag > 0 ? lag.toLocaleString() : '—'} />
          {consumer.isPull && <StatPill label="Waiting Pulls" value={consumer.waitingPulls.toLocaleString()} />}
          <StatPill label="Ack Policy" value={friendlyAckPolicy(consumer.ackPolicy)} />
          <StatPill label="Deliver Policy" value={friendlyDeliverPolicy(consumer.deliverPolicy)} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 20px' }}>
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px', lineHeight: 1.5 }}>
          Messages from the underlying stream <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{consumer.streamName}</span>
          {consumer.filterSubject && ', scoped to this consumer’s filter subject when enabled below'}.
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{
            padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
            fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
          }}>
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>Last {n}</option>)}
          </select>

          <input
            type="number" value={startSeq} onChange={e => setStartSeq(e.target.value)}
            placeholder="Start seq"
            style={{
              padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
              fontFamily: 'var(--font-mono)', outline: 'none', width: '100px',
            }}
          />
          <input
            type="number" value={endSeq} onChange={e => setEndSeq(e.target.value)}
            placeholder="End seq"
            style={{
              padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
              fontFamily: 'var(--font-mono)', outline: 'none', width: '100px',
            }}
          />

          {consumer.filterSubject && (
            <button onClick={() => setScopeToFilter(s => !s)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 11px', borderRadius: '6px',
              background: scopeToFilter ? 'rgba(245,158,11,0.1)' : 'var(--bg-elevated)',
              border: `1px solid ${scopeToFilter ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
              color: scopeToFilter ? 'var(--amber)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)',
            }}>
              <FilterIcon size={12} /> Scope to {consumer.filterSubject}
            </button>
          )}

          <button onClick={fetchMessages} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '6px 13px', borderRadius: '6px',
            background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.3)',
            color: 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-sans)',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={12} fill="currentColor" />}
            {loading ? 'Loading…' : 'Fetch'}
          </button>

          <ExportButton messages={messages} filenamePrefix={`${consumer.name}-messages`} />
        </div>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '10px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{
                borderRadius: '6px', border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)', padding: '7px 10px',
                height: '40px', display: 'flex', alignItems: 'center', opacity: 0.5,
              }}>
                <div style={{ display: 'flex', gap: '8px', width: '100%', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                  <div style={{ width: '120px', height: '12px', background: 'var(--border)', borderRadius: '3px' }} />
                  <div style={{ flex: 1, height: '12px', background: 'var(--border)', borderRadius: '3px' }} />
                  <div style={{ width: '80px', height: '12px', background: 'var(--border)', borderRadius: '3px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
            <MessageSquare size={24} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No messages found</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Try increasing the limit or adjusting the range</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {messages.map((msg, idx) => (
              <ConsumerMessageRow
                key={idx}
                msg={msg}
                connectionId={connectionId}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

function ExportButton({ messages, filenamePrefix }: { messages: MessageEnvelope[]; filenamePrefix: string }) {
  const [open, setOpen] = useState(false)
  const disabled = !messages || messages.length === 0
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 11px', borderRadius: '6px',
          background: open ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)',
          border: `1px solid ${open ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
          color: disabled ? 'var(--text-dim)' : (open ? '#4ade80' : 'var(--text-secondary)'),
          cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Download size={12} /> Export
      </button>
      {open && !disabled && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20,
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '7px', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            minWidth: '120px', overflow: 'hidden',
          }}
        >
          {(['json', 'csv'] as const).map(fmt => (
            <div
              key={fmt}
              onClick={() => { exportMessages(messages, fmt, filenamePrefix); setOpen(false) }}
              style={{
                padding: '8px 12px', fontSize: '12px', color: 'var(--text-primary)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {fmt.toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConsumerMessageRow({ msg, connectionId, expanded, onToggle }: {
  msg: MessageEnvelope; connectionId?: string; expanded: boolean; onToggle: () => void
}) {
  const [republishState, setRepublishState] = useState<'idle' | 'success' | 'error'>('idle')
  const dt = new Date(msg.timestamp)
  const dateStr = dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const ts = `${dateStr} ${timeStr}`
  let isJson = false
  let prettyPayload = msg.payload
  try { prettyPayload = JSON.stringify(JSON.parse(msg.payload), null, 2); isJson = true } catch { }

  const handleRepublish = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!connectionId) return
    try {
      await api.publish(connectionId, msg.subject, msg.payload, Object.keys(msg.headers || {}).length ? msg.headers : undefined)
      setRepublishState('success')
      setTimeout(() => setRepublishState('idle'), 2000)
    } catch {
      setRepublishState('error')
      setTimeout(() => setRepublishState('idle'), 2000)
    }
  }

  return (
    <div style={{
      borderRadius: '6px', border: '1px solid var(--border-subtle)',
      background: expanded ? 'var(--bg-elevated)' : 'transparent',
      overflow: 'hidden', transition: 'background 0.1s',
    }}
      onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent' }}
    >
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{ts}</span>
          {msg.sequence && (
            <span style={{ color: 'var(--text-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--bg-overlay)', padding: '1px 5px', borderRadius: '3px' }}>#{msg.sequence}</span>
          )}
        </div>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>
          {msg.subject}
        </span>
        <span style={{ flex: 1, fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {msg.payload}
        </span>
        {expanded ? <ChevronDown size={11} color="var(--text-dim)" /> : <ChevronRight size={11} color="var(--text-dim)" />}
      </div>
      {expanded && (
        <div style={{ padding: '0 10px 10px' }}>
          <pre style={{
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            borderRadius: '5px', padding: '10px', fontSize: '11px',
            fontFamily: 'var(--font-mono)', color: isJson ? 'var(--green)' : 'var(--text-primary)',
            overflow: 'auto', maxHeight: '260px', margin: 0, lineHeight: 1.6,
          }}>{prettyPayload}</pre>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleRepublish}
              disabled={!connectionId || republishState !== 'idle'}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 500,
                border: '1px solid var(--border)', cursor: connectionId ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: republishState === 'success' ? 'rgba(16,185,129,0.1)' : republishState === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)',
                color: republishState === 'success' ? 'var(--green)' : republishState === 'error' ? 'var(--red)' : 'var(--text-secondary)',
                borderColor: republishState === 'success' ? 'rgba(16,185,129,0.3)' : republishState === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--border)',
              }}
            >
              {republishState === 'success'
                ? <><CheckCircle2 size={11} /> Re-published</>
                : republishState === 'error'
                  ? <><X size={11} /> Failed</>
                  : <><RotateCcw size={11} /> Re-publish</>}
            </button>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              {"→"} <span style={{ fontFamily: 'var(--font-mono)' }}>{msg.subject}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
