import { useEffect, useState } from 'react'
import {
  Layers, Users, HardDrive, MessageSquare,
  ChevronRight, RefreshCw, Search, X,
  Radio, Send, Filter, ChevronDown, Play, Loader2,
  Trash2, MoreVertical, Edit, Zap
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
  const { session, streams, loadStreams } = useStore()
  const [selected, setSelected] = useState<StreamInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const refresh = async () => {
    setLoading(true)
    await loadStreams()
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const filtered = (streams ?? []).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.subjects ?? []).some(sub => sub.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="animate-fade-in" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Stream list panel */}
      <div style={{
        width: selected ? '300px' : '100%',
        flexShrink: 0,
        borderRight: selected ? '1px solid var(--border)' : 'none',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s',
      }}>
        <div style={{ padding: '28px 20px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.3px' }}>Streams</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>
                {(streams ?? []).length} JetStream stream{(streams ?? []).length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={refresh} style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '7px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center',
            }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search streams or subjects…"
              style={{
                width: '100%', padding: '8px 10px 8px 30px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px',
                fontFamily: 'var(--font-sans)', outline: 'none',
              }} />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 10px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
              <Layers size={28} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {search ? 'No streams match your search' : 'No JetStream streams found'}
              </p>
            </div>
          ) : (
            filtered.map(stream => (
              <StreamRow
                key={stream.name}
                stream={stream}
                selected={selected?.name === stream.name}
                onClick={() => setSelected(selected?.name === stream.name ? null : stream)}
                connectionId={session?.connectionId || ''}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && session && (
        <div style={{ flex: 1, overflow: 'auto' }} className="animate-fade-in">
          <StreamDetail
            stream={selected}
            connectionId={session.connectionId}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  )
}

function StreamRow({ stream, selected, onClick, connectionId }: { stream: StreamInfo; selected: boolean; onClick: () => void; connectionId: string }) {
  const [showActions, setShowActions] = useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete stream "${stream.name}"? This cannot be undone.`)) {
      try {
        await api.deleteStream(connectionId, stream.name)
        window.location.reload()
      } catch (err: any) {
        alert(`Error: ${err.message}`)
      }
    }
  }

  const handlePurge = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Purge all messages from "${stream.name}"? This cannot be undone.`)) {
      try {
        await api.purgeStream(connectionId, stream.name)
        window.location.reload()
      } catch (err: any) {
        alert(`Error: ${err.message}`)
      }
    }
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      style={{
        padding: '11px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '3px',
        background: selected ? 'var(--accent-glow)' : 'transparent',
        border: `1px solid ${selected ? 'rgba(59,130,246,0.25)' : 'transparent'}`,
        transition: 'all 0.12s', position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '6px', flexShrink: 0,
            background: selected ? 'rgba(59,130,246,0.15)' : 'var(--bg-overlay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Layers size={13} color={selected ? 'var(--accent)' : 'var(--text-dim)'} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)', color: selected ? 'var(--accent)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stream.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(stream.subjects ?? []).join(', ') || 'no subjects'}
            </div>
          </div>
        </div>
        {showActions ? (
          <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={handlePurge}
              style={{
                background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                color: 'var(--amber)', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
              }}
              title="Purge all messages"
            >
              <Zap size={12} /> Purge
            </button>
            <button
              onClick={handleDelete}
              style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                color: 'var(--red)', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
              }}
              title="Delete stream"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        ) : (
          <ChevronRight size={12} color={selected ? 'var(--accent)' : 'var(--text-dim)'} style={{ flexShrink: 0 }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '8px', paddingLeft: '39px' }}>
        <MiniStat icon={MessageSquare} label={stream.messages.toLocaleString()} />
        <MiniStat icon={HardDrive} label={bytes(stream.bytes)} />
        <MiniStat icon={Users} label={`${stream.consumers}`} />
      </div>
    </div>
  )
}

function MiniStat({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-dim)' }}>
      <Icon size={10} /> {label}
    </span>
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
  startTime, setStartTime, endTime, setEndTime, onFetch, expandedIdx, setExpandedIdx }: any) {
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
      </div>

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
      {messages.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          <MessageSquare size={24} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No messages found</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>Try increasing the limit or adjusting your filter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {messages.map((msg: MessageEnvelope, idx: number) => (
            <MessageRow key={idx} msg={msg} expanded={expandedIdx === idx} onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)} />
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

function MessageRow({ msg, expanded, onToggle }: { msg: MessageEnvelope; expanded: boolean; onToggle: () => void }) {
  const dt = new Date(msg.timestamp)
  const dateStr = dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const ts = `${dateStr} ${timeStr}`
  let isJson = false
  let prettyPayload = msg.payload
  try { prettyPayload = JSON.stringify(JSON.parse(msg.payload), null, 2); isJson = true } catch { }

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
            ✓ {msg.matchPath}
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
        </div>
      )}
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
