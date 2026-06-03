import { useEffect, useState } from 'react'
import { Database, ChevronRight, RefreshCw, Search, ChevronDown, Plus, Trash2, Copy, Check } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'

interface KVBucket {
  name: string
  entries: number
  bytes: number
}

export function KVView() {
  const { session } = useStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit] = useState(50)
  const [data, setData] = useState<{ buckets: KVBucket[]; total: number } | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [showCreateBucket, setShowCreateBucket] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')
  const [leftPaneWidth, setLeftPaneWidth] = useState(350)
  const [isDraggingPane, setIsDraggingPane] = useState(false)

  const loadBuckets = async (searchQuery: string, pageOffset: number) => {
    if (!session?.connectionId) return
    setLoading(true)
    try {
      const result = await api.getKVBuckets(session.connectionId, pageOffset, limit, searchQuery)
      setData(result)
    } catch (err) {
      console.error('Failed to load KV buckets:', err)
      setData({ buckets: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setOffset(0)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(() => loadBuckets(value, 0), 300)
    setSearchTimeout(timeout)
  }

  const handleCreateBucket = async () => {
    if (!newBucketName.trim() || !session?.connectionId) return
    try {
      await api.createKVBucket(session.connectionId, newBucketName)
      setNewBucketName('')
      setShowCreateBucket(false)
      loadBuckets(search, offset)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const handleDeleteBucket = async (bucket: string) => {
    if (!confirm(`Delete bucket "${bucket}"?`) || !session?.connectionId) return
    try {
      await api.deleteKVBucket(session.connectionId, bucket)
      loadBuckets(search, offset)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  useEffect(() => {
    if (session?.connectionId) {
      setOffset(0)
      setSearch('')
      loadBuckets('', 0)
    }
  }, [session?.connectionId])

  const buckets = data?.buckets ?? []
  const total = data?.total ?? 0

  const handleMouseDown = () => {
    setIsDraggingPane(true)
  }

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingPane(false)
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingPane || !selectedBucket) return
      const newWidth = Math.max(250, Math.min(e.clientX, window.innerWidth - 400))
      setLeftPaneWidth(newWidth)
    }
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [isDraggingPane, selectedBucket])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: selectedBucket ? `${leftPaneWidth}px` : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selectedBucket ? '1px solid var(--border)' : 'none', transition: isDraggingPane ? 'none' : 'width 0.2s' }}>
        <div style={{ padding: '28px 20px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 600 }}>KV Store</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '3px' }}>{total} bucket{total !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => loadBuckets(search, offset)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
              <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search buckets…" style={{ width: '100%', padding: '8px 10px 8px 30px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none' }} />
          </div>
          <button onClick={() => setShowCreateBucket(true)} style={{ width: '100%', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '7px', padding: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
            <Plus size={13} /> New Bucket
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 10px 10px' }}>
          {buckets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
              <Database size={28} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{search ? 'No buckets match' : 'No KV buckets found'}</p>
            </div>
          ) : (
            buckets.map(bucket => (
              <div key={bucket.name} onClick={() => setSelectedBucket(bucket.name)} style={{ padding: '11px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '3px', background: selectedBucket === bucket.name ? 'var(--accent-glow)' : 'transparent', border: `1px solid ${selectedBucket === bucket.name ? 'rgba(59,130,246,0.25)' : 'transparent'}`, transition: 'all 0.12s', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onMouseEnter={e => !selectedBucket && (e.currentTarget.style.background = 'var(--bg-elevated)')} onMouseLeave={e => !selectedBucket && (e.currentTarget.style.background = 'transparent')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  <Database size={13} color={selectedBucket === bucket.name ? 'var(--accent)' : 'var(--text-dim)'} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)', color: selectedBucket === bucket.name ? 'var(--accent)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bucket.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px' }}>{bucket.entries} entries</div>
                  </div>
                </div>
                {selectedBucket === bucket.name ? <ChevronDown size={12} color="var(--accent)" /> : <ChevronRight size={12} color="var(--text-dim)" />}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedBucket && (
        <>
          <div onMouseDown={handleMouseDown} style={{ width: '4px', background: isDraggingPane ? 'var(--accent)' : 'var(--border)', cursor: 'col-resize', flexShrink: 0, transition: isDraggingPane ? 'background 0.2s' : 'none' }} />
          <KVBucketDetail bucket={selectedBucket} onClose={() => setSelectedBucket(null)} onDelete={handleDeleteBucket} />
        </>
      )}

      {showCreateBucket && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px', width: '400px', maxWidth: '95vw' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Create KV Bucket</h2>
            <input value={newBucketName} onChange={e => setNewBucketName(e.target.value)} placeholder="Bucket name" style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', marginBottom: '16px' }} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateBucket(false)} style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleCreateBucket} style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KVBucketDetail({ bucket, onClose, onDelete }: { bucket: string; onClose: () => void; onDelete: (bucket: string) => void }) {
  const { session } = useStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit] = useState(50)
  const [data, setData] = useState<{ entries: any[]; total: number } | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const loadEntries = async (searchQuery: string, pageOffset: number) => {
    if (!session?.connectionId) return
    setLoading(true)
    try {
      const result = await api.getKVEntries(session.connectionId, bucket, pageOffset, limit, searchQuery)
      setData(result)
    } catch (err) {
      console.error('Failed to load entries:', err)
      setData({ entries: [], total: 0 })
    } finally {
      setLoading(false)
    }
  }

  const handleAddEntry = async () => {
    if (!newKey.trim() || !session?.connectionId) return
    try {
      await api.putKV(session.connectionId, bucket, newKey, newValue)
      setNewKey('')
      setNewValue('')
      setShowAddEntry(false)
      loadEntries(search, offset)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const handleDeleteEntry = async (key: string) => {
    if (!confirm(`Delete "${key}"?`) || !session?.connectionId) return
    try {
      await api.deleteKV(session.connectionId, bucket, key)
      loadEntries(search, offset)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setOffset(0)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(() => loadEntries(value, 0), 300)
    setSearchTimeout(timeout)
  }

  useEffect(() => {
    loadEntries('', 0)
  }, [bucket])

  const entries = data?.entries ?? []
  const total = data?.total ?? 0

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)' }}>
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600 }}>{bucket}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}>✕</button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '14px' }}>{total} entries</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button onClick={() => loadEntries(search, offset)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 13px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => setShowAddEntry(true)} style={{ background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '7px', padding: '7px 13px', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 500 }}>
            <Plus size={13} /> Add Entry
          </button>
          <button onClick={() => onDelete(bucket)} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '7px', padding: '7px 13px', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 500 }}>
            <Trash2 size={13} /> Delete Bucket
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search keys…" style={{ width: '100%', padding: '8px 10px 8px 30px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none' }} />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{search ? 'No entries match' : 'No entries in bucket'}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 120px', gap: '0', borderBottom: '1px solid var(--border)', padding: '0 16px', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
              <div style={{ padding: '12px 0', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Key</div>
              <div style={{ padding: '12px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Value</div>
              <div style={{ padding: '12px 0', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Action</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {entries.map((entry, idx) => (
                <KVEntryRow key={entry.key} entry={entry} idx={idx} onDelete={handleDeleteEntry} />
              ))}
            </div>
          </>
        )}
      </div>

      {showAddEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px', width: '500px', maxWidth: '95vw' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Add KV Entry to {bucket}</h2>
            <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key" style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none', marginBottom: '12px' }} />
            <textarea value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Value" style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-mono)', outline: 'none', minHeight: '100px', marginBottom: '16px', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddEntry(false)} style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={handleAddEntry} style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: 500, cursor: 'pointer', background: 'var(--accent)', color: '#fff' }}>Add Entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function KVEntryRow({ entry, idx, onDelete }: { entry: any; idx: number; onDelete: (key: string) => void }) {
  const [copied, setCopied] = useState(false)
  const [hoveredRow, setHoveredRow] = useState(false)

  const copyValue = () => {
    navigator.clipboard.writeText(entry.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const displayValue = entry.value.length > 50 ? entry.value.substring(0, 47) + '...' : entry.value

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr 200px',
        gap: '0',
        borderBottom: '1px solid var(--border-subtle)',
        background: hoveredRow ? 'rgba(59,130,246,0.08)' : (idx % 2 === 0 ? 'transparent' : 'rgba(59,130,246,0.02)'),
        transition: 'background 0.15s',
        alignItems: 'center'
      }}
      onMouseEnter={() => setHoveredRow(true)}
      onMouseLeave={() => setHoveredRow(false)}
    >
      <div style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
        {entry.key}
      </div>

      <div style={{ padding: '12px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} title={`Click to copy: ${entry.value}`} onClick={copyValue}>
        {displayValue}
      </div>

      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', opacity: hoveredRow ? 1 : 0.4, transition: 'opacity 0.15s' }}>
        <button
          onClick={copyValue}
          style={{
            background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.4)' : 'rgba(59,130,246,0.4)'}`,
            color: copied ? 'var(--green)' : 'var(--accent)',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={e => {
            if (!copied) {
              e.currentTarget.style.background = 'rgba(59,130,246,0.25)'
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)'
            }
          }}
          onMouseLeave={e => {
            if (!copied) {
              e.currentTarget.style.background = 'rgba(59,130,246,0.15)'
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'
            }
          }}
          title="Copy value to clipboard"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>

        <button
          onClick={() => onDelete(entry.key)}
          style={{
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: 'var(--red)',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.25)'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
          }}
          title="Delete this key-value pair"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  )
}
