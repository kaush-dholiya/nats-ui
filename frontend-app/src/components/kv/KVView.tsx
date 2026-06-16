import { useEffect, useState } from 'react'
import { Database, RefreshCw, Search, Plus, Trash2, Copy, Check, Layers } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { api } from '../../lib/api'

interface KVBucket {
  name: string
  entries: number
  bytes: number
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`
  return `${(n / 1073741824).toFixed(1)} GB`
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
  const [deletingBucket, setDeletingBucket] = useState<string | null>(null)

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
    setDeletingBucket(bucket)
    try {
      await api.deleteKVBucket(session.connectionId, bucket)
      loadBuckets(search, offset)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setDeletingBucket(null)
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

  if (selectedBucket) {
    return (
      <div style={{ height: '100vh', overflow: 'hidden' }}>
        <KVBucketDetail bucket={selectedBucket} onClose={() => setSelectedBucket(null)} onDelete={handleDeleteBucket} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        padding: '20px 28px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.3px', marginBottom: '2px' }}>KV Store</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{total} bucket{total !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input
            value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Search buckets…"
            style={{
              width: '100%', padding: '7px 10px 7px 28px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '7px', color: 'var(--text-primary)', fontSize: '12px',
              fontFamily: 'var(--font-sans)', outline: 'none',
            }}
          />
        </div>
        <button onClick={() => setShowCreateBucket(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '7px', padding: '7px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
          <Plus size={13} /> New Bucket
        </button>
        <button
          onClick={() => loadBuckets(search, offset)}
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

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px 20px' }}>
        {loading && buckets.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{
                height: '52px', borderRadius: '8px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite',
                opacity: 1 - i * 0.08,
              }} />
            ))}
          </div>
        ) : buckets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-dim)' }}>
            <Database size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>{search ? 'No buckets match your search' : 'No KV buckets found'}</p>
            {!search && <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-dim)' }}>Create a bucket to get started</p>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', marginBottom: '4px' }}>
              <div style={{ flex: '2 1 200px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-dim)', paddingBottom: '6px' }}>Bucket Name</div>
              <div style={{ flex: '2 1 200px', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-dim)', paddingBottom: '6px' }}>Stream Name</div>
              <div style={{ width: '120px', textAlign: 'center', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-dim)', paddingBottom: '6px' }}>Bucket Size</div>
              <div style={{ width: '110px', textAlign: 'center', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-dim)', paddingBottom: '6px' }}>Number of Keys</div>
              <div style={{ width: '40px', paddingBottom: '6px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {buckets.map(bucket => (
                <KVBucketRow
                  key={bucket.name}
                  bucket={bucket}
                  deleting={deletingBucket === bucket.name}
                  onSelect={() => setSelectedBucket(bucket.name)}
                  onDelete={() => handleDeleteBucket(bucket.name)}
                />
              ))}
            </div>
          </>
        )}
      </div>

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
        {loading ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 120px', gap: '0', borderBottom: '1px solid var(--border)', padding: '0 16px', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10 }}>
              <div style={{ padding: '12px 0', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Key</div>
              <div style={{ padding: '12px 12px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Value</div>
              <div style={{ padding: '12px 0', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Action</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '300px 1fr 120px', gap: '0',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(59,130,246,0.02)',
                  padding: '12px 16px', alignItems: 'center',
                  opacity: 0.5,
                }}>
                  <div style={{
                    height: '12px', background: 'var(--border)', borderRadius: '3px',
                    width: '120px', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }} />
                  <div style={{
                    height: '12px', background: 'var(--border)', borderRadius: '3px',
                    width: '60%', marginLeft: '12px', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }} />
                  <div style={{
                    height: '12px', background: 'var(--border)', borderRadius: '3px',
                    width: '40px', marginLeft: 'auto', animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }} />
                </div>
              ))}
            </div>
          </>
        ) : entries.length === 0 ? (
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

function KVBucketRow({ bucket, deleting, onSelect, onDelete }: {
  bucket: KVBucket; deleting: boolean; onSelect: () => void; onDelete: () => void
}) {
  const streamName = `KV_${bucket.name}`

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', cursor: 'pointer',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: '8px', padding: '10px 14px', transition: 'border-color 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ flex: '2 1 200px', minWidth: 0, paddingRight: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Database size={13} color="var(--text-dim)" style={{ flexShrink: 0 }} />
        <div style={{
          fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {bucket.name}
        </div>
      </div>

      <div style={{ flex: '2 1 200px', minWidth: 0, paddingRight: '12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '12px', color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <Layers size={11} style={{ flexShrink: 0 }} />
          {streamName}
        </div>
      </div>

      <div style={{ width: '120px', textAlign: 'center', paddingRight: '8px' }}>
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {bytes(bucket.bytes)}
        </span>
      </div>

      <div style={{ width: '110px', textAlign: 'center', paddingRight: '8px' }}>
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: bucket.entries === 0 ? 'var(--text-dim)' : 'var(--text-primary)' }}>
          {bucket.entries.toLocaleString()}
        </span>
      </div>

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
