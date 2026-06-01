import { useState, useEffect } from 'react'
import { Send, Plus, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'

export function PublishView() {
  const { session, prefilledSubject, setPrefilledSubject } = useStore()
  const [subject, setSubject] = useState(prefilledSubject || '')

  useEffect(() => {
    if (prefilledSubject) {
      setSubject(prefilledSubject)
      setPrefilledSubject('')
    }
  }, [])
  const [payload, setPayload] = useState('{\n  \n}')
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([])
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }])
  const removeHeader = (i: number) => setHeaders(headers.filter((_, idx) => idx !== i))
  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    setHeaders(headers.map((h, idx) => idx === i ? { ...h, [field]: val } : h))
  }

  const prettifyJson = () => {
    try { setPayload(JSON.stringify(JSON.parse(payload), null, 2)) } catch { }
  }

  const handlePublish = async () => {
    if (!session || !subject.trim()) return
    setStatus('idle')
    try {
      const hdrs = headers.reduce((acc, h) => {
        if (h.key) acc[h.key] = h.value
        return acc
      }, {} as Record<string, string>)

      await api.publish(session.connectionId, subject, payload, Object.keys(hdrs).length ? hdrs : undefined)
      setStatus('success')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (e: any) {
      setStatus('error')
      setErrorMsg(e.message)
    }
  }

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '700px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.3px' }}>Publish</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
          Send a message to a NATS subject
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Subject */}
        <div>
          <label style={labelStyle}>Subject</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="orders.created"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </div>

        {/* Payload */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={labelStyle}>Payload</label>
            <button onClick={prettifyJson} style={{
              fontSize: '11px', color: 'var(--text-dim)', background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}>
              Format JSON
            </button>
          </div>
          <textarea
            value={payload}
            onChange={e => setPayload(e.target.value)}
            rows={10}
            style={{
              ...inputStyle,
              fontFamily: 'var(--font-mono)', fontSize: '12px',
              resize: 'vertical', lineHeight: 1.6,
            }}
          />
        </div>

        {/* Headers */}
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
              <input value={h.key} onChange={e => updateHeader(i, 'key', e.target.value)}
                placeholder="Key" style={{ ...inputStyle, width: '40%', fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
              <input value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)}
                placeholder="Value" style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
              <button onClick={() => removeHeader(i)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px',
              }}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>

        {/* Status */}
        {status === 'success' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)', fontSize: '13px' }}>
            <CheckCircle2 size={15} /> Message published successfully
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)', fontSize: '13px' }}>
            <AlertCircle size={15} /> {errorMsg}
          </div>
        )}

        {/* Publish button */}
        <button
          onClick={handlePublish}
          disabled={!session || !subject.trim()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '10px 24px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
            cursor: !session || !subject.trim() ? 'not-allowed' : 'pointer',
            opacity: !session || !subject.trim() ? 0.5 : 1,
            fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
            alignSelf: 'flex-start',
          }}
        >
          <Send size={14} /> Publish Message
        </button>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600,
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.3px',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none',
}
