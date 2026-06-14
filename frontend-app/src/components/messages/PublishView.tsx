import { useState, useEffect } from 'react'
import { Send, Plus, X, CheckCircle2, AlertCircle, ArrowLeftRight, Clock, Loader2 } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'

type Mode = 'publish' | 'request'

export function PublishView() {
  const { session, prefilledSubject, setPrefilledSubject } = useStore()
  const [subject, setSubject] = useState(prefilledSubject || '')
  const [mode, setMode] = useState<Mode>('publish')

  useEffect(() => {
    if (prefilledSubject) {
      setSubject(prefilledSubject)
      setPrefilledSubject('')
    }
  }, [])

  const [payload, setPayload] = useState('{\n  \n}')
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([])
  const [reqTimeout, setReqTimeout] = useState(5)

  const [publishStatus, setPublishStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [publishError, setPublishError] = useState('')

  const [reqStatus, setReqStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [reqError, setReqError] = useState('')
  const [reply, setReply] = useState<{
    subject: string; payload: string; headers?: Record<string, string>; elapsed: number
  } | null>(null)

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }])
  const removeHeader = (i: number) => setHeaders(headers.filter((_, idx) => idx !== i))
  const updateHeader = (i: number, field: 'key' | 'value', val: string) =>
    setHeaders(headers.map((h, idx) => idx === i ? { ...h, [field]: val } : h))

  const prettifyJson = () => {
    try { setPayload(JSON.stringify(JSON.parse(payload), null, 2)) } catch { }
  }

  const prettifyReplyJson = (raw: string) => {
    try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
  }

  const buildHeaders = () => {
    const h = headers.reduce((acc, h) => {
      if (h.key) acc[h.key] = h.value
      return acc
    }, {} as Record<string, string>)
    return Object.keys(h).length ? h : undefined
  }

  const handlePublish = async () => {
    if (!session || !subject.trim()) return
    setPublishStatus('idle')
    try {
      await api.publish(session.connectionId, subject, payload, buildHeaders())
      setPublishStatus('success')
      setTimeout(() => setPublishStatus('idle'), 2500)
    } catch (e: any) {
      setPublishStatus('error')
      setPublishError(e.message)
    }
  }

  const handleRequest = async () => {
    if (!session || !subject.trim()) return
    setReqStatus('loading')
    setReply(null)
    setReqError('')
    try {
      const result = await api.request(session.connectionId, subject, payload, reqTimeout, buildHeaders())
      setReply(result)
      setReqStatus('success')
    } catch (e: any) {
      setReqError(e.message)
      setReqStatus('error')
    }
  }

  const disabled = !session || !subject.trim()

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '700px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.3px' }}>
            {mode === 'publish' ? 'Publish' : 'Request / Reply'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            {mode === 'publish'
              ? 'Send a fire-and-forget message to a NATS subject'
              : 'Send a request and wait for a single reply'}
          </p>
        </div>

        <div style={{
          display: 'flex', borderRadius: '8px', overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--bg-elevated)',
          flexShrink: 0, marginLeft: '16px',
        }}>
          {(['publish', 'request'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '6px 14px', fontSize: '12px', fontWeight: 500,
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              display: 'flex', alignItems: 'center', gap: '5px',
              transition: 'all 0.15s',
            }}>
              {m === 'publish' ? <Send size={11} /> : <ArrowLeftRight size={11} />}
              {m === 'publish' ? 'Publish' : 'Request'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="orders.created"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={labelStyle}>Payload</label>
            <button onClick={prettifyJson} style={{
              fontSize: '11px', color: 'var(--text-dim)', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>Format JSON</button>
          </div>
          <textarea
            value={payload}
            onChange={e => setPayload(e.target.value)}
            rows={10}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '12px', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={labelStyle}>Headers <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span></label>
            <button onClick={addHeader} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', color: 'var(--accent)', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              <Plus size={11} /> Add Header
            </button>
          </div>
          {headers.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
              <input
                value={h.key}
                onChange={e => updateHeader(i, 'key', e.target.value)}
                placeholder="Key"
                style={{ ...inputStyle, width: '40%', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <input
                value={h.value}
                onChange={e => updateHeader(i, 'value', e.target.value)}
                placeholder="Value"
                style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              <button onClick={() => removeHeader(i)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px',
              }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        {mode === 'request' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Timeout</label>
            <input
              type="number" min={1} max={60} value={reqTimeout}
              onChange={e => setReqTimeout(Math.max(1, parseInt(e.target.value) || 5))}
              style={{ ...inputStyle, width: '72px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>seconds</span>
          </div>
        )}

        {mode === 'publish' && (
          <>
            {publishStatus === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)', fontSize: '13px' }}>
                <CheckCircle2 size={15} /> Message published successfully
              </div>
            )}
            {publishStatus === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)', fontSize: '13px' }}>
                <AlertCircle size={15} /> {publishError}
              </div>
            )}
            <button onClick={handlePublish} disabled={disabled} style={actionBtnStyle(disabled)}>
              <Send size={14} /> Publish Message
            </button>
          </>
        )}

        {mode === 'request' && (
          <>
            <button
              onClick={handleRequest}
              disabled={disabled || reqStatus === 'loading'}
              style={actionBtnStyle(disabled || reqStatus === 'loading')}
            >
              {reqStatus === 'loading'
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Waiting for reply…</>
                : <><ArrowLeftRight size={14} /> Send Request</>}
            </button>

            {reqStatus === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)', fontSize: '13px' }}>
                <AlertCircle size={15} /> {reqError}
              </div>
            )}

            {reqStatus === 'success' && reply && (
              <div style={{
                border: '1px solid var(--border)', borderRadius: '10px',
                background: 'var(--bg-elevated)', overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(16,185,129,0.06)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <CheckCircle2 size={14} color="var(--green)" />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--green)' }}>Reply received</span>
                    <span style={{
                      fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-surface)', padding: '1px 6px',
                      borderRadius: '4px', border: '1px solid var(--border-subtle)',
                    }}>{reply.subject}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)', fontSize: '11px' }}>
                    <Clock size={11} /> {reply.elapsed} ms
                  </div>
                </div>

                {reply.headers && Object.keys(reply.headers).length > 0 && (
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                      Response Headers
                    </div>
                    {Object.entries(reply.headers).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                        <span style={{ color: 'var(--accent)', minWidth: '140px' }}>{k}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                <pre style={{
                  margin: 0, padding: '14px', fontSize: '12px',
                  fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                  lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  maxHeight: '320px', overflowY: 'auto',
                }}>
                  {reply.payload
                    ? prettifyReplyJson(reply.payload)
                    : <span style={{ color: 'var(--text-dim)' }}>(empty payload)</span>}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600,
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none',
}

const actionBtnStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  padding: '10px 24px', background: 'var(--accent)', color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
  alignSelf: 'flex-start',
})
