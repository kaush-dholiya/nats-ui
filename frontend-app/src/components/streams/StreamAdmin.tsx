import { useState, useRef } from 'react'
import { Plus, X, Trash2, Pause, Play, ChevronDown, ChevronRight, Edit2 } from 'lucide-react'
import { api } from '../../lib/api'
import type { StreamInfo, StreamConfigRequest, StreamFullConfig } from '../../types'

interface StreamAdminProps {
  connectionId: string
  onClose: () => void
  streams: StreamInfo[]
  onRefresh: () => void
}

// ── Shared form defaults ──────────────────────────────────────────────────────

const defaultConfig = (): StreamConfigRequest => ({
  name: '',
  subjects: [],
  description: '',
  storage: 'file',
  retention: 'limits',
  replicas: 1,
  maxAge: 0,
  maxBytes: -1,
  maxMsgs: -1,
  maxMsgSize: -1,
  maxMsgsPerSubject: 0,
  maxConsumers: -1,
  discard: 'old',
  discardNewPerSubject: false,
  duplicateWindow: 0,
  noAck: false,
  allowRollup: false,
  allowDirect: false,
  mirrorDirect: false,
  denyDelete: false,
  denyPurge: false,
  compression: '',
  firstSeq: 0,
  allowMsgTTL: false,
  allowAtomicPublish: false,
  allowBatchPublish: false,
  metadata: {},
})

function fullConfigToRequest(full: StreamFullConfig): StreamConfigRequest {
  return {
    name: full.name,
    subjects: full.subjects ?? [],
    description: full.description ?? '',
    storage: full.storage ?? 'file',
    retention: full.retention ?? 'limits',
    replicas: full.replicas ?? 1,
    maxAge: full.maxAge ?? 0,
    maxBytes: full.maxBytes ?? -1,
    maxMsgs: full.maxMsgs ?? -1,
    maxMsgSize: full.maxMsgSize ?? -1,
    maxMsgsPerSubject: full.maxMsgsPerSubject ?? 0,
    maxConsumers: full.maxConsumers ?? -1,
    discard: full.discard ?? 'old',
    discardNewPerSubject: full.discardNewPerSubject ?? false,
    duplicateWindow: full.duplicateWindow ?? 0,
    noAck: full.noAck ?? false,
    allowRollup: full.allowRollup ?? false,
    allowDirect: full.allowDirect ?? false,
    mirrorDirect: full.mirrorDirect ?? false,
    denyDelete: full.denyDelete ?? false,
    denyPurge: full.denyPurge ?? false,
    compression: full.compression ?? '',
    firstSeq: full.firstSeq ?? 0,
    allowMsgTTL: full.allowMsgTTL ?? false,
    allowAtomicPublish: full.allowAtomicPublish ?? false,
    allowBatchPublish: full.allowBatchPublish ?? false,
    metadata: full.metadata ?? {},
  }
}

// ── Root component ────────────────────────────────────────────────────────────

export function StreamAdmin({ connectionId, onClose, streams, onRefresh }: StreamAdminProps) {
  const [activeTab, setActiveTab] = useState<'manage' | 'create' | 'edit'>('manage')
  const [editingStream, setEditingStream] = useState<string | null>(null)
  const [editConfig, setEditConfig] = useState<StreamConfigRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [createConfig, setCreateConfig] = useState<StreamConfigRequest>(defaultConfig())
  const contentRef = useRef<HTMLDivElement>(null)

  const scrollTop = () => contentRef.current?.scrollTo({ top: 0 })

  const handleCreate = async () => {
    if (!createConfig.name.trim()) { alert('Stream name is required'); return }
    if (!createConfig.subjects?.length) { alert('At least one subject is required'); return }
    setLoading(true)
    try {
      await api.createStream(connectionId, createConfig)
      setCreateConfig(defaultConfig())
      setActiveTab('manage')
      scrollTop()
      onRefresh()
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleEditClick = async (streamName: string) => {
    setLoading(true)
    try {
      const full = await api.getStreamInfo(connectionId, streamName)
      setEditConfig(fullConfigToRequest(full))
      setEditingStream(streamName)
      setActiveTab('edit')
      scrollTop()
    } catch (err: any) {
      alert(`Error loading stream config: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editConfig || !editingStream) return
    setLoading(true)
    try {
      await api.editStream(connectionId, editingStream, editConfig)
      setActiveTab('manage')
      scrollTop()
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
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: '12px', width: '92%', maxWidth: '860px',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600 }}>
            {activeTab === 'edit' ? `Edit Stream: ${editingStream}` : 'Stream Administration'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px', flexShrink: 0 }}>
          {([['manage', 'Manage Streams'], ['create', 'Create Stream']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => { setActiveTab(tab); scrollTop() }} style={{
              padding: '12px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: '13px', fontWeight: 500, marginBottom: '-1px',
            }}>{label}</button>
          ))}
          {activeTab === 'edit' && (
            <button style={{
              padding: '12px 16px', background: 'none', border: 'none',
              borderBottom: '2px solid var(--accent)', color: 'var(--accent)',
              cursor: 'pointer', fontSize: '13px', fontWeight: 500, marginBottom: '-1px',
            }}>Edit Stream</button>
          )}
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'manage' && (
            <ManageTab
              connectionId={connectionId}
              streams={streams}
              onEdit={handleEditClick}
              loadingEdit={loading}
            />
          )}
          {activeTab === 'create' && (
            <StreamConfigForm
              config={createConfig}
              onChange={setCreateConfig}
              isCreate
              onSubmit={handleCreate}
              loading={loading}
              onCancel={() => { setActiveTab('manage'); scrollTop() }}
            />
          )}
          {activeTab === 'edit' && editConfig && (
            <StreamConfigForm
              config={editConfig}
              onChange={setEditConfig}
              isCreate={false}
              onSubmit={handleUpdate}
              loading={loading}
              onCancel={() => { setActiveTab('manage'); scrollTop() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Manage tab ────────────────────────────────────────────────────────────────

function ManageTab({ connectionId, streams, onEdit, loadingEdit }: {
  connectionId: string
  streams: StreamInfo[]
  onEdit: (name: string) => void
  loadingEdit: boolean
}) {
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [consumers, setConsumers] = useState<any[]>([])
  const [loadingConsumers, setLoadingConsumers] = useState(false)

  const handleSelectStream = async (name: string) => {
    if (selectedStream === name) { setSelectedStream(null); setConsumers([]); return }
    setSelectedStream(name)
    setLoadingConsumers(true)
    try {
      const c = await api.getConsumers(connectionId, name)
      setConsumers(c || [])
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setLoadingConsumers(false)
    }
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
        Streams ({streams.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
        {streams.length === 0
          ? <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>No streams found</p>
          : streams.map(stream => (
            <div key={stream.name}>
              <div onClick={() => handleSelectStream(stream.name)} style={{
                padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                border: `1px solid ${selectedStream === stream.name ? 'var(--accent)' : 'var(--border)'}`,
              }}>
                {selectedStream === stream.name
                  ? <ChevronDown size={14} color="var(--accent)" />
                  : <ChevronRight size={14} color="var(--text-dim)" />}
                <span style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-mono)', flex: 1 }}>
                  {stream.name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{stream.consumers} consumers</span>
                <button
                  onClick={e => { e.stopPropagation(); onEdit(stream.name) }}
                  disabled={loadingEdit}
                  style={{
                    background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
                    color: 'var(--accent)', borderRadius: '4px', padding: '4px 8px',
                    cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <Edit2 size={10} /> Edit
                </button>
              </div>
              {selectedStream === stream.name && (
                <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid var(--accent)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    {loadingConsumers ? 'Loading…' : `Consumers (${consumers.length})`}
                  </div>
                  {consumers.length === 0 && !loadingConsumers && (
                    <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No consumers</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {consumers.map(consumer => (
                      <ConsumerRow key={consumer.name} consumer={consumer} streamName={stream.name}
                        connectionId={connectionId} onRefresh={() => handleSelectStream(stream.name)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

// ── Unified stream config form (create + edit) ────────────────────────────────

function StreamConfigForm({ config, onChange, isCreate, onSubmit, loading, onCancel }: {
  config: StreamConfigRequest
  onChange: (c: StreamConfigRequest) => void
  isCreate: boolean
  onSubmit: () => void
  loading: boolean
  onCancel: () => void
}) {
  const set = (patch: Partial<StreamConfigRequest>) => onChange({ ...config, ...patch })
  const subjectsText = (config.subjects ?? []).join('\n')
  const setSubjects = (text: string) => set({ subjects: text.split('\n').map(s => s.trim()).filter(Boolean) })

  const [metaText, setMetaText] = useState(() =>
    Object.entries(config.metadata ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
  )

  const commitMeta = (text: string) => {
    setMetaText(text)
    const meta: Record<string, string> = {}
    text.split('\n').forEach(line => {
      const i = line.indexOf('=')
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    })
    set({ metadata: meta })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* ── Basic ── */}
      <Section title="Basic">
        <Row label="Name" required={isCreate} hint="Unique within the JetStream account. No spaces, dots, or wildcards.">
          <Input value={config.name} onChange={v => set({ name: v })} disabled={!isCreate} placeholder="e.g. orders" mono />
        </Row>
        <Row label="Description">
          <Input value={config.description ?? ''} onChange={v => set({ description: v })} placeholder="Optional description" />
        </Row>
        <Row label="Subjects" required hint="One per line. Wildcards supported (e.g. orders.*)">
          <textarea
            value={subjectsText}
            onChange={e => setSubjects(e.target.value)}
            placeholder={'orders.create\norders.update\norders.delete'}
            rows={4}
            style={textareaStyle}
          />
        </Row>
      </Section>

      {/* ── Storage ── */}
      <Section title="Storage">
        <Row label="Storage Type" hint="Cannot be changed after creation.">
          <Select value={config.storage ?? 'file'} onChange={v => set({ storage: v })} disabled={!isCreate}
            options={[['file', 'File (default)'], ['memory', 'Memory']]} />
        </Row>
        <Row label="Compression" hint="File-based only. s2 = Snappy compression.">
          <Select value={config.compression ?? ''} onChange={v => set({ compression: v })}
            options={[['', 'None (default)'], ['s2', 'S2 / Snappy']]} />
        </Row>
        <Row label="Replicas" hint="Copies in a clustered JetStream. Max 5.">
          <NumberInput value={config.replicas ?? 1} onChange={v => set({ replicas: v })} min={1} max={5} />
        </Row>
        {isCreate && (
          <Row label="First Sequence" hint="Override initial sequence number (default 1).">
            <NumberInput value={config.firstSeq ?? 0} onChange={v => set({ firstSeq: v })} min={0} placeholder="0 = default" />
          </Row>
        )}
      </Section>

      {/* ── Retention ── */}
      <Section title="Retention &amp; Limits">
        <Row label="Retention Policy" hint="Cannot be changed after creation.">
          <Select value={config.retention ?? 'limits'} onChange={v => set({ retention: v })} disabled={!isCreate}
            options={[['limits', 'Limits (default)'], ['workqueue', 'Work Queue'], ['interest', 'Interest']]} />
        </Row>
        <Row label="Max Age" hint="0 = no limit. Messages older than this are removed.">
          <DurationInput value={config.maxAge ?? 0} onChange={v => set({ maxAge: v })} />
        </Row>
        <Row label="Max Bytes" hint="-1 = unlimited. Total stream storage limit in bytes.">
          <NumberInput value={config.maxBytes ?? -1} onChange={v => set({ maxBytes: v })} min={-1} placeholder="-1 = unlimited" />
        </Row>
        <Row label="Max Messages" hint="-1 = unlimited. Total message count limit.">
          <NumberInput value={config.maxMsgs ?? -1} onChange={v => set({ maxMsgs: v })} min={-1} placeholder="-1 = unlimited" />
        </Row>
        <Row label="Max Msgs Per Subject" hint="0 = no limit. Per-subject message count limit.">
          <NumberInput value={config.maxMsgsPerSubject ?? 0} onChange={v => set({ maxMsgsPerSubject: v })} min={0} placeholder="0 = no limit" />
        </Row>
        <Row label="Max Message Size" hint="-1 = unlimited. Maximum single message size (bytes).">
          <NumberInput value={config.maxMsgSize ?? -1} onChange={v => set({ maxMsgSize: v })} min={-1} placeholder="-1 = unlimited" />
        </Row>
        <Row label="Max Consumers" hint="-1 = unlimited. Cannot be changed after creation.">
          <NumberInput value={config.maxConsumers ?? -1} onChange={v => set({ maxConsumers: v })} min={-1} placeholder="-1 = unlimited" disabled={!isCreate} />
        </Row>
      </Section>

      {/* ── Discard ── */}
      <Section title="Discard Policy">
        <Row label="Discard Policy" hint="Behavior when stream limits are hit.">
          <Select value={config.discard ?? 'old'} onChange={v => set({ discard: v })}
            options={[['old', 'Discard Old (default)'], ['new', 'Discard New']]} />
        </Row>
        <Row label="Discard New Per Subject" hint="Applies Discard New on a per-subject basis. Requires Discard New + Max Msgs Per Subject.">
          <Toggle checked={config.discardNewPerSubject ?? false} onChange={v => set({ discardNewPerSubject: v })} />
        </Row>
      </Section>

      {/* ── Deduplication ── */}
      <Section title="Deduplication">
        <Row label="Duplicate Window" hint="Window to track duplicate Nats-Msg-Id headers. 0 = default (2 min).">
          <DurationInput value={config.duplicateWindow ?? 0} onChange={v => set({ duplicateWindow: v })} />
        </Row>
      </Section>

      {/* ── Behaviour flags ── */}
      <Section title="Behaviour">
        <Row label="No Ack" hint="Disable per-message acknowledgements. Useful for archiving reply-subject messages.">
          <Toggle checked={config.noAck ?? false} onChange={v => set({ noAck: v })} />
        </Row>
        <Row label="Allow Rollup" hint="Allow Nats-Rollup header to replace all stream/subject messages with a single new message.">
          <Toggle checked={config.allowRollup ?? false} onChange={v => set({ allowRollup: v })} />
        </Row>
        <Row label="Allow Direct" hint="Each replica responds to direct get requests, not only the leader.">
          <Toggle checked={config.allowDirect ?? false} onChange={v => set({ allowDirect: v })} />
        </Row>
        <Row label="Mirror Direct" hint="Mirror participates in serving direct get requests from the origin stream.">
          <Toggle checked={config.mirrorDirect ?? false} onChange={v => set({ mirrorDirect: v })} />
        </Row>
        <Row label="Allow Msg TTL" hint="Allow per-message TTL via headers instead of relying solely on MaxAge." note={isCreate ? undefined : 'Can only be enabled, not disabled.'}>
          <Toggle checked={config.allowMsgTTL ?? false} onChange={v => set({ allowMsgTTL: v })} disabled={!isCreate && !(config.allowMsgTTL)} />
        </Row>
        <Row label="Allow Atomic Publish" hint="Allow atomically writing a batch of N messages.">
          <Toggle checked={config.allowAtomicPublish ?? false} onChange={v => set({ allowAtomicPublish: v })} />
        </Row>
        <Row label="Allow Batch Publish" hint="Allow writing a batch of N messages.">
          <Toggle checked={config.allowBatchPublish ?? false} onChange={v => set({ allowBatchPublish: v })} />
        </Row>
      </Section>

      {/* ── Restrictions ── */}
      <Section title="Restrictions">
        <Row label="Deny Delete" hint="Prevent message deletion via the API. Cannot be changed after creation.">
          <Toggle checked={config.denyDelete ?? false} onChange={v => set({ denyDelete: v })} disabled={!isCreate} />
        </Row>
        <Row label="Deny Purge" hint="Prevent purging messages via the API. Cannot be changed after creation.">
          <Toggle checked={config.denyPurge ?? false} onChange={v => set({ denyPurge: v })} disabled={!isCreate} />
        </Row>
      </Section>

      {/* ── Metadata ── */}
      <Section title="Metadata">
        <Row label="Key=Value Pairs" hint="Application-defined metadata. One key=value per line.">
          <textarea
            value={metaText}
            onChange={e => commitMeta(e.target.value)}
            placeholder={'env=production\nteam=platform'}
            rows={3}
            style={textareaStyle}
          />
        </Row>
      </Section>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
        <button onClick={onSubmit} disabled={loading} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '9px 18px', borderRadius: '7px',
          background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.3)',
          color: 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '13px', fontWeight: 500, opacity: loading ? 0.7 : 1,
        }}>
          <Plus size={14} />
          {loading ? (isCreate ? 'Creating…' : 'Saving…') : (isCreate ? 'Create Stream' : 'Save Changes')}
        </button>
        <button onClick={onCancel} style={{
          padding: '9px 18px', borderRadius: '7px',
          background: 'none', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px',
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Consumer row (unchanged logic) ───────────────────────────────────────────

function ConsumerRow({ consumer, streamName, connectionId, onRefresh }: {
  consumer: any; streamName: string; connectionId: string; onRefresh: () => void
}) {
  const [loading, setLoading] = useState(false)

  const act = async (fn: () => Promise<void>) => {
    setLoading(true)
    try { await fn(); onRefresh() }
    catch (err: any) { alert(`Error: ${err.message}`) }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      padding: '10px', background: 'var(--bg-base)', borderRadius: '6px',
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{consumer.name}</span>
      <Btn color="var(--amber)" bg="rgba(245,158,11,0.15)" disabled={loading}
        onClick={() => act(() => api.pauseConsumer(connectionId, streamName, consumer.name))}
        icon={<Pause size={10} />} />
      <Btn color="var(--green)" bg="rgba(34,197,94,0.15)" disabled={loading}
        onClick={() => act(() => api.resumeConsumer(connectionId, streamName, consumer.name))}
        icon={<Play size={10} />} />
      <Btn color="var(--red)" bg="rgba(239,68,68,0.15)" disabled={loading}
        onClick={() => { if (confirm(`Delete consumer "${consumer.name}"?`)) act(() => api.deleteConsumer(connectionId, streamName, consumer.name)) }}
        icon={<Trash2 size={10} />} />
    </div>
  )
}

// ── Small shared UI primitives ────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 11px', background: 'var(--bg-elevated)',
  border: '1px solid var(--border)', borderRadius: '6px',
  color: 'var(--text-primary)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase',
        color: 'var(--text-dim)', marginBottom: '14px', paddingBottom: '6px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  )
}

function Row({ label, children, hint, required, note }: {
  label: string; children: React.ReactNode; hint?: string; required?: boolean; note?: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'start' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
          {label}{required && <span style={{ color: 'var(--red)', marginLeft: '3px' }}>*</span>}
        </div>
        {hint && <div style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.4 }}>{hint}</div>}
        {note && <div style={{ fontSize: '11px', color: 'var(--amber)', lineHeight: 1.4, marginTop: '2px' }}>{note}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Input({ value, onChange, placeholder, mono, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; disabled?: boolean
}) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      style={{ ...inputStyle, fontFamily: mono ? 'var(--font-mono)' : undefined, opacity: disabled ? 0.6 : 1 }} />
  )
}

function Select({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void;
  options: [string, string][]; disabled?: boolean
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} style={{
      ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    }}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  )
}

function NumberInput({ value, onChange, min, max, placeholder, disabled }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; placeholder?: string; disabled?: boolean
}) {
  return (
    <input type="number" value={value} min={min} max={max}
      onChange={e => onChange(Number(e.target.value))}
      placeholder={placeholder} disabled={disabled}
      style={{ ...inputStyle, width: '180px', opacity: disabled ? 0.6 : 1 }} />
  )
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '32px' }}>
      <button
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: '40px', height: '22px', borderRadius: '11px', border: 'none',
          background: checked ? 'var(--accent)' : 'var(--border)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{
          position: 'absolute', top: '3px', left: checked ? '21px' : '3px',
          width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s',
        }} />
      </button>
      <span style={{ fontSize: '12px', color: checked ? 'var(--text-primary)' : 'var(--text-dim)' }}>
        {checked ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  )
}

const DURATION_UNITS: [string, number, string][] = [
  ['seconds', 1, 's'],
  ['minutes', 60, 'm'],
  ['hours', 3600, 'h'],
  ['days', 86400, 'd'],
]

function DurationInput({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  const [unit, setUnit] = useState<number>(3600) // default hours
  const displayVal = value > 0 ? Math.round(value / unit) : 0

  const handleVal = (raw: number) => onChange(raw <= 0 ? 0 : raw * unit)
  const handleUnit = (newUnit: number) => {
    setUnit(newUnit)
    if (value > 0) onChange(Math.round(value / newUnit) * newUnit) // re-snap
  }

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <input type="number" min={0} value={displayVal}
        onChange={e => handleVal(Number(e.target.value))}
        placeholder="0 = no limit"
        style={{ ...inputStyle, width: '120px' }} />
      <select value={unit} onChange={e => handleUnit(Number(e.target.value))} style={{ ...inputStyle, width: '110px' }}>
        {DURATION_UNITS.map(([label, secs]) => (
          <option key={secs} value={secs}>{label}</option>
        ))}
      </select>
      {value > 0 && (
        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{value}s</span>
      )}
    </div>
  )
}

function Btn({ color, bg, onClick, icon, disabled }: {
  color: string; bg: string; onClick: () => void; icon: React.ReactNode; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: bg, border: 'none', color, borderRadius: '4px',
      padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
    }}>{icon}</button>
  )
}
