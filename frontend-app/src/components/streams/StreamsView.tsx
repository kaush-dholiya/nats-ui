import { useEffect, useState } from 'react'
import {
  Layers, MessageSquare,
  ChevronRight, RefreshCw, Search, X,
  Radio, Send, Filter, ChevronDown, Play, Loader2,
  Trash2, Zap, RotateCcw, CheckCircle2
} from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'
import type { StreamInfo, MessageEnvelope, ContentFilter, FilterType } from '../../types'

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(1)} GB`
}

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'regex', label: 'Regex' },
  { value: 'jsonpath', label: 'JSON Path' },
]

export function StreamsView() {
  const { session } = useStore()
  const [selected, setSelected] = useState<StreamInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit] = useState(50)
  const [paginatedData, setPaginatedData] = useState<{ streams: StreamInfo[]; total: number; offset: number; limit: number } | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  const loadPaginatedStreams = async (searchQuery: string, pageOffset: number) => {
    if (!session?.connectionId) return
    setLoading(true)
    try {
      const result = await api.getStreamsPaginated(session.connectionId, pageOffset, limit, searchQuery)
      setPaginatedData(result)
    } catch (err: any) {
      console.error('Failed to load streams:', err)
      setPaginatedData({ streams: [], total: 0, offset: pageOffset, limit })
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
      loadPaginatedStreams(value, 0)
    }, 300)
    setSearchTimeout(timeout)
  }

  const handleNextPage = () => {
    const newOffset = offset + limit
    if (paginatedData && newOffset < paginatedData.total) {
      setOffset(newOffset)
      loadPaginatedStreams(search, newOffset)
    }
  }

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - limit)
    setOffset(newOffset)
    loadPaginatedStreams(search, newOffset)
  }

  useEffect(() => {
    if (session?.connectionId) {
      setOffset(0)
      setSearch('')
      if (searchTimeout) clearTimeout(searchTimeout)
      loadPaginatedStreams('', 0)
    }
  }, [session?.connectionId])

  const streams = paginatedData?.streams ?? []
  const total = paginatedData?.total ?? 0
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!selected ? (
        /* ── Full-width grid ── */
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '24px 28px 14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.3px' }}>Streams</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                {total} {total !== 1 ? 'streams' : 'stream'}{totalPages > 1 ? ` • page ${currentPage}/${totalPages}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input value={search} onChange={e => handleSearch(e.target.value)}
                  placeholder="Search streams…"
                  style={{
                    padding: '7px 10px 7px 30px', width: '220px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px',
                    fontFamily: 'var(--font-sans)', outline: 'none',
                  }} />
              </div>
              <button onClick={() => loadPaginatedStreams(search, offset)} style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '7px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center',
              }}>
                <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 28px 20px' }}>
            {loading && streams.length === 0 ? (
              <StreamGridSkeleton />
            ) : streams.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
                <Layers size={32} style={{ margin: '0 auto 14px', opacity: 0.25 }} />
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {search ? 'No streams match your search' : 'No JetStream streams found'}
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Stream', 'Subjects', 'Storage', 'Replicas', 'Messages', 'Size', 'Consumers', 'Limits', ''].map(h => (
                      <ColHead key={h} label={h} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {streams.map(stream => (
                    <StreamGridRow
                      key={stream.name}
                      stream={stream}
                      connectionId={session?.connectionId || ''}
                      onSelect={() => setSelected(stream)}
                      onDeleted={() => loadPaginatedStreams(search, offset)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: '10px 28px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)' }}>
              <span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <PageBtn label="← Prev" disabled={offset === 0} onClick={handlePrevPage} />
                <PageBtn label="Next →" disabled={offset + limit >= total} onClick={handleNextPage} />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Detail panel (slide in) ── */
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }} className="animate-fade-in">
          {session && (
            <StreamDetail
              stream={selected}
              connectionId={session.connectionId}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Grid helpers ──────────────────────────────────────────────────────────────

function ColHead({ label }: { label: string }) {
  return (
    <th style={{
      padding: '8px 12px', textAlign: 'center', fontSize: '10px', fontWeight: 700,
      color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.6px',
      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
    }}>{label}</th>
  )
}

function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '4px 10px', borderRadius: '5px', fontSize: '11px',
      background: disabled ? 'var(--bg-surface)' : 'var(--bg-elevated)',
      border: '1px solid var(--border)', cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? 'var(--text-dim)' : 'var(--text-secondary)',
      opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  )
}

function StreamGridSkeleton() {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {[...Array(6)].map((_, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: 0.5 }}>
            {[...Array(9)].map((_, j) => (
              <td key={j} style={{ padding: '14px 12px' }}>
                <div style={{ height: '12px', background: 'var(--border)', borderRadius: '3px', width: j === 0 ? '120px' : '60px', animation: 'pulse 1.5s ease infinite' }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StreamGridRow({ stream, connectionId, onSelect, onDeleted }: {
  stream: StreamInfo; connectionId: string;
  onSelect: () => void; onDeleted: () => void;
}) {
  const [hover, setHover] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await api.deleteStream(connectionId, stream.name)
      onDeleted()
    } catch (err: any) {
      setError(err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handlePurge = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Purge all messages from "${stream.name}"?`)) {
      try { await api.purgeStream(connectionId, stream.name); onDeleted() }
      catch (err: any) { alert(err.message) }
    }
  }

  const storageBg = stream.storage === '0' || stream.storage?.toLowerCase().includes('file') ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)'
  const storageColor = stream.storage === '0' || stream.storage?.toLowerCase().includes('file') ? 'var(--accent)' : 'var(--green)'
  const storageLabel = stream.storage === '0' || stream.storage?.toLowerCase().includes('file') ? 'File' : 'Memory'

  const retentionLabel = (() => {
    const r = String(stream.retention)
    if (r === '0' || r.toLowerCase().includes('limit')) return 'Limits'
    if (r.toLowerCase().includes('work')) return 'WorkQueue'
    if (r.toLowerCase().includes('interest')) return 'Interest'
    return r || 'Limits'
  })()

  const limitsText: string[] = []
  if (stream.maxMsgs && stream.maxMsgs !== -1) limitsText.push(`${stream.maxMsgs.toLocaleString()} msgs`)
  if (stream.maxBytes && stream.maxBytes !== -1) limitsText.push(bytes(stream.maxBytes))
  if (stream.maxAge && stream.maxAge !== 0) {
    const s = stream.maxAge
    limitsText.push(s < 60 ? `${s}s` : s < 3600 ? `${(s/60).toFixed(0)}m` : s < 86400 ? `${(s/3600).toFixed(0)}h` : `${(s/86400).toFixed(0)}d`)
  }

  return (
    <>
      <tr
        onClick={onSelect}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setConfirmDelete(false) }}
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: hover ? 'var(--bg-elevated)' : 'transparent',
          cursor: 'pointer', transition: 'background 0.1s',
        }}
      >
        {/* Stream name */}
        <td style={{ padding: '12px 12px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={12} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)', fontSize: '12px' }}>{stream.name}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>{retentionLabel}</div>
            </div>
          </div>
        </td>
        {/* Subjects */}
        <td style={{ padding: '12px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '11px', maxWidth: '180px' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(stream.subjects ?? []).length === 0
              ? <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>none</span>
              : stream.subjects.join(', ')}
          </div>
          {stream.numSubjects > 0 && (
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>{stream.numSubjects} unique</div>
          )}
        </td>
        {/* Storage */}
        <td style={{ padding: '12px 12px', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: storageBg, color: storageColor }}>
            {storageLabel}
          </span>
        </td>
        {/* Replicas */}
        <td style={{ padding: '12px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '12px' }}>
          {stream.replicas || 1}
        </td>
        {/* Messages */}
        <td style={{ padding: '12px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '12px', textAlign: 'center' }}>
          {stream.messages.toLocaleString()}
        </td>
        {/* Size */}
        <td style={{ padding: '12px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '12px', textAlign: 'center' }}>
          {bytes(stream.bytes)}
        </td>
        {/* Active consumers */}
        <td style={{ padding: '12px 12px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '12px' }}>
          {stream.consumers}
        </td>
        {/* Limits */}
        <td style={{ padding: '12px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {limitsText.length > 0
            ? limitsText.join(' / ')
            : <span style={{ color: 'var(--text-dim)' }}>∞</span>}
        </td>
        {/* Actions */}
        <td style={{ padding: '12px 10px', textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
          {hover && (
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
              <button onClick={handlePurge} style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '3px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--amber)',
              }}>
                <Zap size={11} /> Purge
              </button>
              <button onClick={handleDelete} disabled={deleting} style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '3px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                background: confirmDelete ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${confirmDelete ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.25)'}`,
                color: 'var(--red)',
              }}>
                <Trash2 size={11} />
                {deleting ? 'Deleting…' : confirmDelete ? 'Confirm' : 'Delete'}
              </button>
            </div>
          )}
        </td>
      </tr>
      {error && (
        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <td colSpan={9} style={{ padding: '6px 12px', color: 'var(--red)', fontSize: '11px', background: 'rgba(239,68,68,0.06)' }}>{error}</td>
        </tr>
      )}
    </>
  )
}

// ─── Stream Detail ────────────────────────────────────────────────────────────

type DetailTab = 'messages' | 'info'

function StreamDetail({ stream, connectionId, onClose }: {
  stream: StreamInfo; connectionId: string; onClose: () => void
}) {
  const { setActiveView, setPrefilledSubject } = useStore()
  const [tab, setTab] = useState<DetailTab>('messages')
  const [messages, setMessages] = useState<MessageEnvelope[]>([])
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(100)
  const [showFilter, setShowFilter] = useState(false)
  const [filter, setFilter] = useState<ContentFilter>({ type: 'contains', field: '', value: '', negate: false, caseSensitive: true })
  const [filterEnabled, setFilterEnabled] = useState(false)
  const [startSeq, setStartSeq] = useState<string>('')
  const [endSeq, setEndSeq] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchMessages = async () => {
    setLoading(true)
    setError(null)
    setExpandedIdx(null)
    try {
      const cf = filterEnabled && filter.value ? filter : undefined
      const startSeqNum = startSeq ? parseInt(startSeq, 10) : undefined
      const endSeqNum = endSeq ? parseInt(endSeq, 10) : undefined
      const startTimeMs = startTime ? new Date(startTime).getTime() : undefined
      const endTimeMs = endTime ? new Date(endTime).getTime() : undefined
      const msgs = await api.getStreamMessages(connectionId, stream.name, limit, cf, startSeqNum, endSeqNum, startTimeMs, endTimeMs)
      setMessages(msgs ?? [])
    } catch (e: any) {
      setError(e.message)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages() }, [stream.name])

  const goSubscribe = () => {
    const subject = stream.subjects?.[0] ?? '>'
    setPrefilledSubject(subject)
    setActiveView('messages')
  }

  const goPublish = () => {
    const subject = stream.subjects?.[0] ?? ''
    setPrefilledSubject(subject)
    setActiveView('publish')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '6px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '7px', background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={15} color="var(--accent)" />
              </div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{stream.name}</h2>
            </div>
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              {(stream.subjects ?? []).map(s => (
                <span key={s} style={{
                  fontSize: '11px', fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  borderRadius: '4px', padding: '2px 7px', color: 'var(--text-secondary)',
                }}>{s}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}>
            <X size={15} />
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '20px', padding: '10px 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '14px' }}>
          <StatPill label="Messages" value={stream.messages.toLocaleString()} />
          <StatPill label="Size" value={bytes(stream.bytes)} />
          <StatPill label="Consumers" value={stream.consumers.toString()} />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button onClick={goSubscribe} style={actionBtnStyle('var(--accent)')}>
            <Radio size={13} /> Subscribe to Stream
          </button>
          <button onClick={goPublish} style={actionBtnStyle('var(--green)')}>
            <Send size={13} /> Publish to Stream
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
          {(['messages', 'info'] as DetailTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '12px', fontWeight: 500,
              fontFamily: 'var(--font-sans)', textTransform: 'capitalize',
              marginBottom: '-1px',
            }}>{t === 'messages' ? `Messages (${messages.length})` : 'Info'}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        {tab === 'messages' ? (
          <MessagesTab
            messages={messages}
            loading={loading}
            error={error}
            limit={limit}
            setLimit={setLimit}
            showFilter={showFilter}
            setShowFilter={setShowFilter}
            filter={filter}
            setFilter={setFilter}
            filterEnabled={filterEnabled}
            setFilterEnabled={setFilterEnabled}
            startSeq={startSeq}
            setStartSeq={setStartSeq}
            endSeq={endSeq}
            setEndSeq={setEndSeq}
            startTime={startTime}
            setStartTime={setStartTime}
            endTime={endTime}
            setEndTime={setEndTime}
            onFetch={fetchMessages}
            expandedIdx={expandedIdx}
            setExpandedIdx={setExpandedIdx}
            connectionId={connectionId}
            streamName={stream.name}
          />
        ) : (
          <InfoTab stream={stream} />
        )}
      </div>
    </div>
  )
}

function MessagesTab({ messages, loading, error, limit, setLimit, showFilter, setShowFilter,
  filter, setFilter, filterEnabled, setFilterEnabled, startSeq, setStartSeq, endSeq, setEndSeq,
  startTime, setStartTime, endTime, setEndTime, onFetch, expandedIdx, setExpandedIdx, connectionId, streamName }: any) {
  const [showReplay, setShowReplay] = useState(false)
  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{
          padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
          fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
        }}>
          {[50, 100, 200, 500].map(n => <option key={n} value={n}>Last {n}</option>)}
        </select>

        <button onClick={() => setShowFilter(!showFilter)} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 11px', borderRadius: '6px',
          background: filterEnabled ? 'rgba(245,158,11,0.1)' : 'var(--bg-elevated)',
          border: `1px solid ${filterEnabled ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
          color: filterEnabled ? 'var(--amber)' : 'var(--text-secondary)',
          cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)',
        }}>
          <Filter size={12} />
          Content Filter
          {filterEnabled && filter.value && (
            <span style={{ background: 'var(--amber)', color: '#000', fontSize: '10px', fontWeight: 700, borderRadius: '10px', padding: '1px 5px' }}>ON</span>
          )}
        </button>

        {/* Sequence range inputs */}
        <input
          type="number"
          value={startSeq}
          onChange={e => setStartSeq(e.target.value)}
          placeholder="Start seq"
          style={{
            padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
            fontFamily: 'var(--font-mono)', outline: 'none', width: '100px',
          }}
        />
        <input
          type="number"
          value={endSeq}
          onChange={e => setEndSeq(e.target.value)}
          placeholder="End seq"
          style={{
            padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
            fontFamily: 'var(--font-mono)', outline: 'none', width: '100px',
          }}
        />

        {/* Datetime range inputs */}
        <input
          type="datetime-local"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
          style={{
            padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px',
            fontFamily: 'var(--font-sans)', outline: 'none', width: '160px',
          }}
        />
        <input
          type="datetime-local"
          value={endTime}
          onChange={e => setEndTime(e.target.value)}
          style={{
            padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px',
            fontFamily: 'var(--font-sans)', outline: 'none', width: '160px',
          }}
        />

        <button onClick={onFetch} disabled={loading} style={{
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

        <button onClick={() => setShowReplay(r => !r)} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 11px', borderRadius: '6px',
          background: showReplay ? 'rgba(139,92,246,0.12)' : 'var(--bg-elevated)',
          border: `1px solid ${showReplay ? 'rgba(139,92,246,0.35)' : 'var(--border)'}`,
          color: showReplay ? '#a78bfa' : 'var(--text-secondary)',
          cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)',
        }}>
          <RotateCcw size={12} /> Replay
        </button>
      </div>

      {showReplay && (
        <ReplayPanel
          connectionId={connectionId}
          streamName={streamName}
          startSeq={startSeq}
          endSeq={endSeq}
          startTime={startTime}
          endTime={endTime}
        />
      )}

      {/* Filter panel */}
      {showFilter && (
        <div className="animate-fade-in" style={{
          background: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: '8px', padding: '12px', marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)' }}>Content Filter</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
              <Toggle checked={filterEnabled} onChange={setFilterEnabled} />
              <span style={{ color: filterEnabled ? 'var(--amber)' : 'var(--text-dim)' }}>{filterEnabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '8px' }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={filter.type} onChange={(e: any) => setFilter({ ...filter, type: e.target.value })}
                style={selectStyle}>
                {FILTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>JSON Field <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span></label>
              <input value={filter.field} onChange={(e: any) => setFilter({ ...filter, field: e.target.value })}
                placeholder="e.g. user.city" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Value</label>
              <input value={filter.value} onChange={(e: any) => setFilter({ ...filter, value: e.target.value })}
                placeholder="value to match…" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={filter.negate} onChange={e => setFilter({ ...filter, negate: e.target.checked })} />
              Negate (exclude matches)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={filter.caseSensitive} onChange={e => setFilter({ ...filter, caseSensitive: e.target.checked })} />
              Case sensitive
            </label>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '10px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Messages */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              borderRadius: '6px', border: '1px solid var(--border-subtle)',
              background: 'var(--bg-elevated)', padding: '7px 10px',
              height: '40px', display: 'flex', alignItems: 'center',
              opacity: 0.5,
            }}>
              <div style={{
                display: 'flex', gap: '8px', width: '100%',
                animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}>
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
          <p style={{ fontSize: '12px', marginTop: '4px' }}>Try increasing the limit or adjusting your filter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {messages.map((msg: MessageEnvelope, idx: number) => (
            <MessageRow key={idx} msg={msg} connectionId={connectionId} expanded={expandedIdx === idx} onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)} />
          ))}
        </div>
      )}
    </div>
  )
}

function InfoTab({ stream }: { stream: StreamInfo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <InfoRow label="Stream Name" value={stream.name} mono />
      <InfoRow label="Total Messages" value={stream.messages.toLocaleString()} />
      <InfoRow label="Storage Size" value={`${stream.bytes.toLocaleString()} bytes`} />
      <InfoRow label="Active Consumers" value={stream.consumers.toString()} />
      <InfoRow label="Subjects" value={(stream.subjects ?? []).join(', ') || '—'} mono />
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)' }}>{value}</span>
    </div>
  )
}

function MessageRow({ msg, connectionId, expanded, onToggle }: { msg: MessageEnvelope; connectionId?: string; expanded: boolean; onToggle: () => void }) {
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
        {msg.matchPath && (
          <span style={{ fontSize: '10px', color: 'var(--amber)', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '3px', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
            {"\u2713"} {msg.matchPath}
          </span>
        )}
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
              {"\u2192"} <span style={{ fontFamily: 'var(--font-mono)' }}>{msg.subject}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function ReplayPanel({ connectionId, streamName, startSeq, endSeq, startTime, endTime }: {
  connectionId: string; streamName: string;
  startSeq: string; endSeq: string; startTime: string; endTime: string;
}) {
  const [targetSubject, setTargetSubject] = useState('')
  const [delayMs, setDelayMs] = useState(0)
  const [limit, setLimit] = useState(500)
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ replayed: number; skipped: number; error?: string } | null>(null)

  const handleReplay = async () => {
    setStatus('running')
    setResult(null)
    try {
      const opts: any = { delayMs, limit }
      if (targetSubject.trim()) opts.targetSubject = targetSubject.trim()
      if (startSeq) opts.startSeq = parseInt(startSeq, 10)
      if (endSeq) opts.endSeq = parseInt(endSeq, 10)
      if (startTime) opts.startTime = new Date(startTime).getTime()
      if (endTime) opts.endTime = new Date(endTime).getTime()
      const r = await api.replayStreamMessages(connectionId, streamName, opts)
      setResult(r)
      setStatus(r.error ? 'error' : 'done')
    } catch (e: any) {
      setResult({ replayed: 0, skipped: 0, error: e.message })
      setStatus('error')
    }
  }

  return (
    <div className="animate-fade-in" style={{
      background: 'var(--bg-surface)', border: '1px solid rgba(139,92,246,0.25)',
      borderRadius: '8px', padding: '14px 16px', marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
        <RotateCcw size={13} color="#a78bfa" />
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#a78bfa' }}>Replay Messages</span>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          {"—"} re-publishes the fetched range back to NATS
        </span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Target Subject
          </label>
          <input
            value={targetSubject}
            onChange={e => setTargetSubject(e.target.value)}
            placeholder="original subject"
            style={{
              padding: '6px 10px', width: '200px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
              fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Delay (ms)
          </label>
          <input
            type="number" min={0} max={10000} value={delayMs}
            onChange={e => setDelayMs(Math.max(0, parseInt(e.target.value) || 0))}
            style={{
              padding: '6px 10px', width: '90px', textAlign: 'center',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
              fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Max Messages
          </label>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{
            padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
            fontFamily: 'var(--font-sans)', cursor: 'pointer', outline: 'none',
          }}>
            {[50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button
          onClick={handleReplay}
          disabled={!connectionId || status === 'running'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
            background: status === 'running' ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.15)',
            border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa',
            cursor: status === 'running' ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
          }}
        >
          {status === 'running'
            ? <><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Replaying{"…"}</>
            : <><RotateCcw size={12} /> Run Replay</>}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: '10px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
          background: status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`,
          color: status === 'error' ? 'var(--red)' : 'var(--green)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {status === 'error'
            ? <>{result.error}</>
            : <><CheckCircle2 size={13} /> Replayed <strong>{result.replayed}</strong> message{result.replayed !== 1 ? 's' : ''}
              {result.skipped > 0 && <span style={{ color: 'var(--text-dim)' }}> ({result.skipped} skipped)</span>}
              {targetSubject.trim() && <span style={{ color: 'var(--text-dim)' }}> {"→"} <span style={{ fontFamily: 'var(--font-mono)', color: '#a78bfa' }}>{targetSubject.trim()}</span></span>}
            </>}
        </div>
      )}

      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        Range is taken from the seq / time filters above. Leave <em>Target Subject</em> empty to replay each message to its original subject.
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      width: '28px', height: '16px', borderRadius: '8px', flexShrink: 0,
      background: checked ? 'var(--amber)' : 'var(--border)',
      cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
    }}>
      <div style={{
        position: 'absolute', top: '2px', left: checked ? '14px' : '2px',
        width: '12px', height: '12px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </div>
  )
}

const actionBtnStyle = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '6px',
  padding: '7px 13px', borderRadius: '7px',
  background: `${color}15`, border: `1px solid ${color}30`, color,
  cursor: 'pointer', fontSize: '12px', fontWeight: 500,
  fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
})

const labelStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600,
  display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px',
  fontFamily: 'var(--font-sans)', outline: 'none', height: '32px',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'none' as any,
}
