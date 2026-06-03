import { useState } from 'react'
import { Plus, X, Trash2, Pause, Play, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import type { StreamInfo } from '../../types'

interface StreamAdminProps {
  connectionId: string
  onClose: () => void
  streams: StreamInfo[]
  onRefresh: () => void
}

export function StreamAdmin({ connectionId, onClose, streams, onRefresh }: StreamAdminProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('manage')
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Create stream form
  const [newStreamName, setNewStreamName] = useState('')
  const [newStreamSubjects, setNewStreamSubjects] = useState('')

  const handleCreateStream = async () => {
    if (!newStreamName.trim()) {
      alert('Stream name is required')
      return
    }
    const subjects = newStreamSubjects
      .split('\n')
      .map(s => s.trim())
      .filter(s => s)

    if (subjects.length === 0) {
      alert('At least one subject is required')
      return
    }

    setLoading(true)
    try {
      await api.createStream(connectionId, newStreamName, subjects)
      setNewStreamName('')
      setNewStreamSubjects('')
      setActiveTab('manage')
      onRefresh()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '12px', width: '90%', maxWidth: '800px',
        maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Stream Administration</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dim)', padding: '4px', display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '0', borderBottom: '1px solid var(--border)',
          padding: '0 24px', flexShrink: 0,
        }}>
          {(['manage', 'create'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 16px', background: 'none', border: 'none',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                textTransform: 'capitalize', marginBottom: '-1px',
              }}
            >
              {tab === 'manage' ? 'Manage Streams' : 'Create Stream'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          {activeTab === 'manage' ? (
            <ManageStreamsTab
              connectionId={connectionId}
              streams={streams}
              selectedStream={selectedStream}
              setSelectedStream={setSelectedStream}
            />
          ) : (
            <CreateStreamTab
              newStreamName={newStreamName}
              setNewStreamName={setNewStreamName}
              newStreamSubjects={newStreamSubjects}
              setNewStreamSubjects={setNewStreamSubjects}
              onCreate={handleCreateStream}
              loading={loading}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ManageStreamsTab({
  connectionId,
  streams,
  selectedStream,
  setSelectedStream,
}: {
  connectionId: string
  streams: StreamInfo[]
  selectedStream: string | null
  setSelectedStream: (s: string | null) => void
}) {
  const [consumers, setConsumers] = useState<any[]>([])
  const [loadingConsumers, setLoadingConsumers] = useState(false)

  const loadConsumers = async (streamName: string) => {
    setLoadingConsumers(true)
    try {
      const c = await api.getConsumers(connectionId, streamName)
      setConsumers(c || [])
    } catch (err: any) {
      alert(`Error loading consumers: ${err.message}`)
    } finally {
      setLoadingConsumers(false)
    }
  }

  const handleSelectStream = async (streamName: string) => {
    if (selectedStream === streamName) {
      setSelectedStream(null)
      setConsumers([])
    } else {
      setSelectedStream(streamName)
      await loadConsumers(streamName)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
          Streams ({streams.length})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {streams.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>No streams available</p>
          ) : (
            streams.map(stream => (
              <div key={stream.name}>
                <div
                  onClick={() => handleSelectStream(stream.name)}
                  style={{
                    padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    border: `1px solid ${selectedStream === stream.name ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {selectedStream === stream.name ? (
                    <ChevronDown size={14} color="var(--accent)" />
                  ) : (
                    <ChevronRight size={14} color="var(--text-dim)" />
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)', flex: 1 }}>
                    {stream.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {stream.consumers} consumers
                  </span>
                </div>

                {/* Consumers list */}
                {selectedStream === stream.name && (
                  <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--accent)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      {loadingConsumers ? 'Loading consumers...' : `Consumers (${consumers.length})`}
                    </div>
                    {consumers.length === 0 ? (
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No consumers</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {consumers.map(consumer => (
                          <ConsumerRow
                            key={consumer.name}
                            consumer={consumer}
                            streamName={stream.name}
                            connectionId={connectionId}
                            onRefresh={() => loadConsumers(stream.name)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ConsumerRow({
  consumer,
  streamName,
  connectionId,
  onRefresh,
}: {
  consumer: any
  streamName: string
  connectionId: string
  onRefresh: () => void
}) {
  const [loading, setLoading] = useState(false)

  const handlePause = async () => {
    setLoading(true)
    try {
      await api.pauseConsumer(connectionId, streamName, consumer.name)
      onRefresh()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleResume = async () => {
    setLoading(true)
    try {
      await api.resumeConsumer(connectionId, streamName, consumer.name)
      onRefresh()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (confirm(`Delete consumer "${consumer.name}"?`)) {
      setLoading(true)
      try {
        await api.deleteConsumer(connectionId, streamName, consumer.name)
        onRefresh()
      } catch (err: any) {
        alert(`Error: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div style={{
      padding: '10px', background: 'var(--bg-base)', borderRadius: '6px',
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{consumer.name}</span>
      <button
        onClick={handlePause}
        disabled={loading}
        style={{
          background: 'rgba(245,158,11,0.15)', border: 'none', color: 'var(--amber)',
          borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
        title="Pause consumer"
      >
        <Pause size={10} />
      </button>
      <button
        onClick={handleResume}
        disabled={loading}
        style={{
          background: 'rgba(34,197,94,0.15)', border: 'none', color: 'var(--green)',
          borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
        title="Resume consumer"
      >
        <Play size={10} />
      </button>
      <button
        onClick={handleDelete}
        disabled={loading}
        style={{
          background: 'rgba(239,68,68,0.15)', border: 'none', color: 'var(--red)',
          borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
        title="Delete consumer"
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

function CreateStreamTab({
  newStreamName,
  setNewStreamName,
  newStreamSubjects,
  setNewStreamSubjects,
  onCreate,
  loading,
}: {
  newStreamName: string
  setNewStreamName: (s: string) => void
  newStreamSubjects: string
  setNewStreamSubjects: (s: string) => void
  onCreate: () => void
  loading: boolean
}) {
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          Stream Name
        </label>
        <input
          type="text"
          value={newStreamName}
          onChange={e => setNewStreamName(e.target.value)}
          placeholder="e.g., orders"
          style={{
            width: '100%', padding: '8px 12px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px',
            fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          Subjects (one per line)
        </label>
        <textarea
          value={newStreamSubjects}
          onChange={e => setNewStreamSubjects(e.target.value)}
          placeholder="orders.create&#10;orders.update&#10;orders.delete"
          style={{
            width: '100%', padding: '8px 12px', height: '120px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px',
            fontFamily: 'var(--font-mono)', outline: 'none', resize: 'none',
          }}
        />
      </div>

      <button
        onClick={onCreate}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px', borderRadius: '6px',
          background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.3)',
          color: 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-sans)',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <Plus size={14} />
        {loading ? 'Creating...' : 'Create Stream'}
      </button>
    </div>
  )
}
