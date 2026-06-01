import { useState, useCallback, useEffect } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

// Simple module-level event bus for toasts
type ToastListener = (toast: Toast) => void
const listeners: ToastListener[] = []

export function toast(type: ToastType, message: string) {
  const t: Toast = { id: Math.random().toString(36).slice(2), type, message }
  listeners.forEach(fn => fn(t))
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(prev => [...prev, t])
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id))
      }, 3500)
    }
    listeners.push(handler)
    return () => { const i = listeners.indexOf(handler); if (i >= 0) listeners.splice(i, 1) }
  }, [])

  const remove = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px',
      zIndex: 100, display: 'flex', flexDirection: 'column', gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} className="animate-fade-in" style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'var(--bg-elevated)', border: `1px solid ${borderColor(t.type)}`,
          borderRadius: '9px', padding: '11px 14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          pointerEvents: 'all', minWidth: '260px', maxWidth: '380px',
        }}>
          {t.type === 'success' && <CheckCircle2 size={15} color="var(--green)" style={{ flexShrink: 0 }} />}
          {t.type === 'error' && <AlertCircle size={15} color="var(--red)" style={{ flexShrink: 0 }} />}
          {t.type === 'info' && <Info size={15} color="var(--accent)" style={{ flexShrink: 0 }} />}
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>{t.message}</span>
          <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0, flexShrink: 0 }}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

function borderColor(type: ToastType) {
  if (type === 'success') return 'rgba(16,185,129,0.3)'
  if (type === 'error') return 'rgba(239,68,68,0.3)'
  return 'rgba(59,130,246,0.3)'
}
