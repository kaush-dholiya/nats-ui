import { useState, useEffect } from 'react'
import { Plus, Server, Pencil, Trash2, PlugZap, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { toast } from '../layout/Toast'
import type { Connection } from '../../types'

const emptyForm = { name: '', url: 'nats://localhost:4222', username: '', password: '' }

export function ConnectionManager() {
  const { connections, loadConnections, addConnection, updateConnection, deleteConnection, connect } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadConnections() }, [])

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); setError(null) }
  const openEdit = (c: Connection) => {
    setForm({ name: c.name, url: c.url, username: c.username || '', password: '' })
    setEditId(c.id)
    setShowForm(true)
    setError(null)
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.url.trim()) { setError('Name and URL are required'); return }
    try {
      if (editId) {
        await updateConnection(editId, form)
      } else {
        await addConnection(form)
      }
      setShowForm(false)
      setEditId(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleConnect = async (id: string) => {
    setConnecting(id)
    setError(null)
    try {
      await connect(id)
    } catch (e: any) {
      const msg = `Failed to connect: ${e.message}`
      setError(msg)
      toast('error', msg)
    } finally {
      setConnecting(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this connection?')) {
      await deleteConnection(id)
      toast('info', 'Connection deleted')
    }
  }

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
            Connections
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            {connections.length} saved connection{connections.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: '8px',
          padding: '8px 16px', fontSize: '13px', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'var(--font-sans)',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
        >
          <Plus size={15} />
          New Connection
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '20px',
          color: 'var(--red)', fontSize: '13px',
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Connection list */}
      {connections.length === 0 && !showForm ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          border: '1px dashed var(--border)', borderRadius: '12px',
          color: 'var(--text-dim)',
        }}>
          <Server size={32} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            No connections yet
          </p>
          <p style={{ fontSize: '13px' }}>Add your first NATS server to get started</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {connections.map((c) => (
            <ConnectionCard
              key={c.id}
              connection={c}
              onConnect={() => handleConnect(c.id)}
              onEdit={() => openEdit(c)}
              onDelete={() => handleDelete(c.id)}
              isConnecting={connecting === c.id}
            />
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <ConnectionForm
          form={form}
          setForm={setForm}
          editId={editId}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          error={error}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setError(null) }}
        />
      )}
    </div>
  )
}

function ConnectionCard({ connection, onConnect, onEdit, onDelete, isConnecting }: {
  connection: Connection
  onConnect: () => void
  onEdit: () => void
  onDelete: () => void
  isConnecting: boolean
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '16px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '38px', height: '38px', borderRadius: '8px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Server size={17} color="var(--accent)" />
        </div>
        <div>
          <div style={{ fontWeight: 500, fontSize: '14px' }}>{connection.name}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
            {connection.url}
            {connection.username && <span style={{ marginLeft: '8px', color: 'var(--text-dim)' }}>• {connection.username}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <IconBtn onClick={onEdit} title="Edit"><Pencil size={14} /></IconBtn>
        <IconBtn onClick={onDelete} title="Delete" danger><Trash2 size={14} /></IconBtn>
        <button
          onClick={onConnect}
          disabled={isConnecting}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--accent-glow)', color: 'var(--accent)',
            border: '1px solid rgba(59,130,246,0.3)', borderRadius: '7px',
            padding: '6px 13px', fontSize: '12px', fontWeight: 500,
            cursor: isConnecting ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
            opacity: isConnecting ? 0.7 : 1,
          }}
        >
          {isConnecting
            ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Connecting…</>
            : <><PlugZap size={13} /> Connect</>
          }
        </button>
      </div>
    </div>
  )
}

function IconBtn({ onClick, children, title, danger }: {
  onClick: () => void; children: React.ReactNode; title?: string; danger?: boolean
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: '30px', height: '30px', borderRadius: '6px',
      background: 'transparent', border: '1px solid var(--border)',
      color: danger ? 'var(--red)' : 'var(--text-secondary)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.1)' : 'var(--bg-elevated)'
        e.currentTarget.style.borderColor = danger ? 'rgba(239,68,68,0.4)' : 'var(--accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {children}
    </button>
  )
}

function ConnectionForm({ form, setForm, editId, showPassword, setShowPassword, error, onSubmit, onCancel }: any) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, backdropFilter: 'blur(4px)',
    }}>
      <div className="animate-fade-in" style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: '14px', padding: '28px', width: '440px', maxWidth: '95vw',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '24px' }}>
          {editId ? 'Edit Connection' : 'New Connection'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Name">
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="My NATS Server" style={inputStyle} />
          </Field>
          <Field label="URL">
            <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder="nats://localhost:4222" style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Username (optional)">
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="username" style={inputStyle} />
            </Field>
            <Field label="Password (optional)">
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder={editId ? '(unchanged)' : 'password'}
                  style={{ ...inputStyle, paddingRight: '36px' }}
                />
                <button onClick={() => setShowPassword(!showPassword)} style={{
                  position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)',
                  padding: 0, display: 'flex',
                }}>
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </Field>
          </div>
        </div>

        {error && (
          <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={onSubmit} style={{ ...btnStyle, background: 'var(--accent)', color: '#fff' }}>
            {editId ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
  borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none',
  transition: 'border-color 0.15s',
}

const btnStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: '7px', border: 'none',
  fontSize: '13px', fontWeight: 500, cursor: 'pointer',
  fontFamily: 'var(--font-sans)',
}
