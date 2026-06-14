import { useState, useRef, useCallback, useEffect } from 'react'
import { Radio, Play, Square, Trash2, Filter, X, ChevronDown, ChevronRight, Info, AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'
import { createSubscription, type SubscriptionHandle } from '../../lib/ws'
import type { MessageEnvelope, ContentFilter, FilterType } from '../../types'

const MAX_MESSAGES = 500

const FILTER_TYPES: { value: FilterType; label: string; desc: string }[] = [
  { value: 'contains', label: 'Contains', desc: 'Raw payload contains this string (searches entire JSON text)' },
  { value: 'exact', label: 'Exact Match', desc: 'Raw payload exactly equals this string' },
  { value: 'regex', label: 'Regex', desc: 'Match using a regular expression against raw payload' },
  { value: 'jsonpath', label: 'JSON Field', desc: 'Match a specific field in JSON body using dot-notation (e.g. key, user.city)' },
]

export function SubscribeView() {
  const { session, prefilledSubject, setPrefilledSubject } = useStore()
  const [subject, setSubject] = useState(prefilledSubject || '>')

  useEffect(() => {
    if (prefilledSubject) {
      setSubject(prefilledSubject)
      setPrefilledSubject('')
    }
  }, [])

  const [messages, setMessages] = useState<MessageEnvelope[]>([])
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [showFilter, setShowFilter] = useState(false)
  const [filter, setFilter] = useState<ContentFilter>({ type: 'jsonpath', field: '', value: '', negate: false, caseSensitive: true })
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const subRef = useRef<SubscriptionHandle | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [totalReceived, setTotalReceived] = useState(0)
  const [totalMatched, setTotalMatched] = useState(0)

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScroll])

  const filterActive = !!(filter.value.trim())

  const handleMessage = useCallback((msg: MessageEnvelope) => {
    setMessages(prev => {
      const next = [...prev, msg]
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
    })
    setTotalMatched(n => n + 1)
  }, [])

  const start = () => {
    if (!session) return
    setMessages([])
    setTotalReceived(0)
    setTotalMatched(0)

    const req = {
      subject,
      // Send filter whenever value is non-empty — no separate toggle needed
      contentFilter: filterActive ? filter : undefined,
    }

    subRef.current = createSubscription(
      session.connectionId,
      req,
      handleMessage,
      (s) => {
        if (s === 'connected') setStatus('connected')
        else if (s === 'error') setStatus('error')
        else if (s === 'disconnected') setStatus('idle')
      }
    )
    setStatus('connecting')
  }

  const stop = () => {
    subRef.current?.unsubscribe()
    subRef.current = null
    setStatus('idle')
  }

  const isRunning = status === 'connected' || status === 'connecting'

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '28px', gap: '14px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.3px' }}>Subscribe</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            Live message stream with content-aware filtering
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          {isRunning && <div className="live-dot" />}
          {isRunning && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {totalMatched.toLocaleString()} matched
              {filterActive && totalReceived > 0 && ` / ${totalReceived.toLocaleString()} total`}
            </span>
          )}
        </div>
      </div>

      {/* Control bar */}
      <div style={{
        display: 'flex', gap: '10px', flexShrink: 0,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '10px',
      }}>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject or wildcard (e.g. orders.>)"
          disabled={isRunning}
          style={{
            flex: 1, padding: '8px 12px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '7px', color: 'var(--text-primary)',
            fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none',
            opacity: isRunning ? 0.6 : 1,
          }}
        />
        <button
          onClick={() => setShowFilter(!showFilter)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 13px', borderRadius: '7px',
            background: filterActive ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)',
            border: `1px solid ${filterActive ? 'rgba(245,158,11,0.5)' : 'var(--border)'}`,
            color: filterActive ? 'var(--amber)' : 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '12px', fontWeight: 500,
            fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
          }}
        >
          <Filter size={13} />
          Content Filter
          {filterActive && (
            <span style={{
              background: 'var(--amber)', color: '#000', fontSize: '10px',
              fontWeight: 700, borderRadius: '10px', padding: '1px 6px',
            }}>ACTIVE</span>
          )}
        </button>
        {isRunning ? (
          <button onClick={stop} style={runBtnStyle('var(--red)')}>
            <Square size={13} fill="currentColor" /> Stop
          </button>
        ) : (
          <button onClick={start} disabled={!session} style={runBtnStyle('var(--green)')}>
            <Play size={13} fill="currentColor" /> Subscribe
          </button>
        )}
      </div>

      {/* Content Filter panel */}
      {showFilter && (
        <ContentFilterPanel
          filter={filter}
          setFilter={setFilter}
          onClose={() => setShowFilter(false)}
          disabled={isRunning}
        />
      )}

      {/* Active filter indicator bar */}
      {filterActive && !showFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
          padding: '8px 12px', borderRadius: '7px',
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          fontSize: '12px',
        }}>
          <Filter size={12} color="var(--amber)" />
          <span style={{ color: 'var(--amber)', fontWeight: 500 }}>Filter active:</span>
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {FILTER_TYPES.find(t => t.value === filter.type)?.label}
            {filter.field && <> on <span style={{ color: 'var(--amber)' }}>{filter.field}</span></>}
            {' = '}
            <span style={{ color: 'var(--text-primary)' }}>"{filter.value}"</span>
            {filter.negate && <span style={{ color: 'var(--red)' }}> (negated)</span>}
          </span>
          <button onClick={() => setFilter({ ...filter, value: '' })} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-dim)', padding: 0, display: 'flex',
          }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Message list */}
      <div style={{
        flex: 1, overflow: 'auto', minHeight: 0,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: '10px',
      }}>
        {messages.length === 0 ? (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', gap: '10px',
          }}>
            <Radio size={28} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {isRunning ? 'Listening for messages…' : 'Press Subscribe to start listening'}
            </p>
            {filterActive && isRunning && (
              <p style={{ fontSize: '12px', color: 'var(--amber)' }}>
                Filter active — only matching messages will appear
              </p>
            )}
          </div>
        ) : (
          <div style={{ padding: '8px' }}>
            {messages.map((msg, idx) => (
              <MessageRow
                key={idx}
                msg={msg}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setTotalReceived(0); setTotalMatched(0) }} style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'none', border: '1px solid var(--border)', borderRadius: '6px',
            padding: '4px 10px', fontSize: '12px', color: 'var(--text-dim)',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>
    </div>
  )
}

function ContentFilterPanel({ filter, setFilter, onClose, disabled }: {
  filter: ContentFilter; setFilter: (f: ContentFilter) => void
  onClose: () => void; disabled: boolean
}) {
  const currentType = FILTER_TYPES.find(t => t.value === filter.type)!


  return (
    <div className="animate-fade-in" style={{
      background: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.3)',
      borderRadius: '10px', padding: '16px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} color="var(--amber)" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Content Filter</span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '20px' }}>
            Filter applies automatically when Value is set
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}>
          <X size={14} />
        </button>
      </div>

      {/* Filter type selector — big clickable cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '14px' }}>
        {FILTER_TYPES.map(t => (
          <button key={t.value} onClick={() => !disabled && setFilter({ ...filter, type: t.value })}
            disabled={disabled}
            style={{
              padding: '8px 10px', borderRadius: '7px', border: `1px solid ${filter.type === t.value ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
              background: filter.type === t.value ? 'var(--accent-glow)' : 'var(--bg-elevated)',
              color: filter.type === t.value ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 500,
              fontFamily: 'var(--font-sans)', textAlign: 'center',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: filter.type === 'jsonpath' ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '10px' }}>
        {/* JSON field — only for jsonpath */}
        {filter.type === 'jsonpath' && (
          <div>
            <label style={labelStyle}>
              JSON Field Path <span style={{ color: 'var(--red)', fontWeight: 600 }}>*</span>
            </label>
            <input
              value={filter.field}
              onChange={e => setFilter({ ...filter, field: e.target.value })}
              placeholder="e.g.  key   or   user.address.city"
              disabled={disabled}
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
              Dot-notation path into JSON. Example: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>key</code> matches <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{`{"key": "..."}`}</code>
            </p>
          </div>
        )}

        {/* Value */}
        <div>
          <label style={labelStyle}>
            {filter.type === 'regex' ? 'Pattern' : 'Value to match'}
            <span style={{ marginLeft: '6px', color: 'var(--green)', fontSize: '10px', fontWeight: 400 }}>
              — filter activates automatically
            </span>
          </label>
          <input
            value={filter.value}
            onChange={e => setFilter({ ...filter, value: e.target.value })}
            placeholder={filter.type === 'regex' ? '^order\\.(created|updated)' : filter.type === 'jsonpath' ? 'exact value to match' : 'string to search for…'}
            disabled={disabled}
            autoFocus
            style={{ ...inputStyle, fontFamily: filter.type === 'regex' ? 'var(--font-mono)' : 'var(--font-sans)' }}
          />
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={filter.negate} onChange={e => setFilter({ ...filter, negate: e.target.checked })} disabled={disabled} />
          <span>Exclude matches <span style={{ color: 'var(--text-dim)' }}>(show messages that do NOT match)</span></span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={filter.caseSensitive} onChange={e => setFilter({ ...filter, caseSensitive: e.target.checked })} disabled={disabled} />
          <span>Case sensitive <span style={{ color: 'var(--text-dim)' }}>(match exact casing)</span></span>
        </label>
      </div>

      {/* Hint box */}
      <div style={{
        display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: '7px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        fontSize: '12px', color: 'var(--text-secondary)', alignItems: 'flex-start',
      }}>
        <Info size={13} color="var(--accent)" style={{ flexShrink: 0, marginTop: '1px' }} />
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>{currentType.label}:</strong> {currentType.desc}
          {filter.type === 'contains' && (
            <span style={{ display: 'block', marginTop: '4px', color: 'var(--amber)' }}>
              <AlertTriangle size={11} style={{ display: 'inline', marginRight: '4px' }} />
              Tip: Use <strong>JSON Field</strong> type for precise field matching. Contains searches the raw JSON string and may match field names too.
            </span>
          )}
          {filter.type === 'jsonpath' && filter.field && filter.value && (
            <span style={{ display: 'block', marginTop: '4px', color: 'var(--green)' }}>
              Will match messages where <code style={{ fontFamily: 'var(--font-mono)' }}>{filter.field}</code> = <code style={{ fontFamily: 'var(--font-mono)' }}>"{filter.value}"</code>
            </span>
          )}
        </div>
      </div>

      {disabled && (
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '10px', textAlign: 'center' }}>
          Stop the subscription to change filter settings
        </p>
      )}
    </div>
  )
}

function MessageRow({ msg, connectionId, expanded, onToggle }: {
  msg: MessageEnvelope; connectionId?: string; expanded: boolean; onToggle: () => void
}) {
  const [republishState, setRepublishState] = useState<'idle' | 'success' | 'error'>('idle')
  const dt = new Date(msg.timestamp)
  const dateStr = dt.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const ts = `${dateStr} ${timeStr}`
  let isJson = false
  let prettyPayload = msg.payload
  try {
    prettyPayload = JSON.stringify(JSON.parse(msg.payload), null, 2)
    isJson = true
  } catch { }

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
      borderRadius: '7px', marginBottom: '3px',
      border: '1px solid var(--border-subtle)',
      background: expanded ? 'var(--bg-elevated)' : 'transparent',
      overflow: 'hidden', transition: 'background 0.1s',
    }}
      onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent' }}
    >
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', width: '165px', flexShrink: 0 }}>{ts}</span>
        <span style={{
          fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 500,
          color: 'var(--accent)', background: 'var(--accent-glow)',
          padding: '2px 8px', borderRadius: '4px', flexShrink: 0,
        }}>{msg.subject}</span>
        <span style={{
          flex: 1, fontSize: '12px', fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)', overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{msg.payload}</span>
        {msg.matchPath && (
          <span style={{
            fontSize: '10px', color: 'var(--amber)', background: 'rgba(245,158,11,0.1)',
            padding: '2px 7px', borderRadius: '4px', flexShrink: 0, fontFamily: 'var(--font-mono)',
          }}>✓ {msg.matchPath}</span>
        )}
        {expanded ? <ChevronDown size={12} color="var(--text-dim)" /> : <ChevronRight size={12} color="var(--text-dim)" />}
      </div>
      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          <pre style={{
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '12px', fontSize: '12px',
            fontFamily: 'var(--font-mono)', color: isJson ? 'var(--green)' : 'var(--text-primary)',
            overflow: 'auto', maxHeight: '300px', margin: 0, lineHeight: 1.6,
          }}>{prettyPayload}</pre>
          {Object.keys(msg.headers || {}).length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.entries(msg.headers).map(([k, v]) => (
                <span key={k} style={{
                  fontSize: '11px', fontFamily: 'var(--font-mono)',
                  background: 'var(--bg-overlay)', border: '1px solid var(--border)',
                  borderRadius: '4px', padding: '2px 8px', color: 'var(--text-secondary)',
                }}>
                  <span style={{ color: 'var(--text-dim)' }}>{k}:</span> {v}
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleRepublish}
              disabled={!connectionId || republishState !== 'idle'}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                border: '1px solid var(--border)', cursor: connectionId ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: republishState === 'success' ? 'rgba(16,185,129,0.1)' : republishState === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)',
                color: republishState === 'success' ? 'var(--green)' : republishState === 'error' ? 'var(--red)' : 'var(--text-secondary)',
                borderColor: republishState === 'success' ? 'rgba(16,185,129,0.3)' : republishState === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--border)',
              }}
            >
              {republishState === 'success'
                ? <><CheckCircle2 size={12} /> Re-published</>
                : republishState === 'error'
                  ? <><X size={12} /> Failed</>
                  : <><RotateCcw size={12} /> Re-publish</>}
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              → <span style={{ fontFamily: 'var(--font-mono)' }}>{msg.subject}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

const runBtnStyle = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '6px',
  padding: '8px 16px', borderRadius: '7px',
  background: `${color}18`, border: `1px solid ${color}40`,
  color, cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
})

const labelStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600,
  display: 'block', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.3px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none',
}
