import { useEffect, useState } from 'react'
import { Users, RefreshCw, Search, Trash2, Layers, AlertCircle, Clock } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'

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

export function ConsumersView() {
  const { session } = useStore()
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

function ConsumerRow({ consumer: c, deleting, onDelete }: {
  consumer: Consumer; deleting: boolean; onDelete: () => void
}) {
  const isPaused = !!c.pausedUntil
  const lag = c.ackPending
  const hasLag = lag > 0

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center',
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
      <div style={{ width: '40px', display: 'flex', justifyContent: 'center' }}>
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
