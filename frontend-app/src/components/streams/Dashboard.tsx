import { useEffect, useState } from 'react'
import { Layers, HardDrive, Cpu, Zap, Settings, ArrowDownUp, Activity, AlertTriangle } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { StreamAdmin } from './StreamAdmin'
import { api } from '../../lib/api'
import type { HealthInfo } from '../../types'

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function Dashboard() {
  const { session, streams, loadStreams } = useStore()
  const info = session?.serverInfo
  const [showAdmin, setShowAdmin] = useState(false)
  const [health, setHealth] = useState<HealthInfo | null>(null)

  useEffect(() => { loadStreams() }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    const poll = () => {
      api.getHealth(session.connectionId)
        .then(h => { if (!cancelled) setHealth(h) })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [session?.connectionId])

  const totalMessages = streams.reduce((a, s) => a + s.messages, 0)
  const totalBytes = streams.reduce((a, s) => a + s.bytes, 0)
  const totalConsumers = streams.reduce((a, s) => a + s.consumers, 0)

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '900px' }}>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, letterSpacing: '-0.3px' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
            {info?.name || 'NATS Server'} · v{info?.version}
            {info?.jetstream && (
              <span style={{
                marginLeft: '10px', fontSize: '11px', fontWeight: 600,
                color: 'var(--accent)', background: 'var(--accent-glow)',
                padding: '2px 8px', borderRadius: '20px',
                border: '1px solid rgba(59,130,246,0.2)',
              }}>JetStream</span>
            )}
          </p>
        </div>
        {session && (
          <button
            onClick={() => setShowAdmin(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '7px',
              background: 'var(--accent-glow)', border: '1px solid rgba(59,130,246,0.3)',
              color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
            }}
          >
            <Settings size={14} />
            Stream Admin
          </button>
        )}
      </div>

      {/* Server stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        <StatCard icon={HardDrive} label="Max Payload" value={info ? bytes(info.maxPayload) : '—'} color="var(--green)" />
        <StatCard icon={Layers} label="Streams" value={streams.length} color="var(--amber)" />
        <StatCard icon={Zap} label="Total Messages" value={totalMessages.toLocaleString()} color="var(--accent)" />
        <StatCard icon={HardDrive} label="Total Size" value={bytes(totalBytes)} color="var(--green)" />
        <StatCard icon={Cpu} label="Consumers" value={totalConsumers} color="var(--amber)" />
      </div>

      {/* Observability */}
      {health && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
          <Section title="Connection" icon={ArrowDownUp}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
              <Metric label="In Msgs" value={health.connection.inMsgs.toLocaleString()} />
              <Metric label="Out Msgs" value={health.connection.outMsgs.toLocaleString()} />
              <Metric label="In Bytes" value={bytes(health.connection.inBytes)} />
              <Metric label="Out Bytes" value={bytes(health.connection.outBytes)} />
              <Metric label="Reconnects" value={health.connection.reconnects} warn={health.connection.reconnects > 0} />
            </div>
          </Section>

          {health.jetstream && (
            <Section title="JetStream Health" icon={Activity}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                <Metric label="Memory" value={`${bytes(health.jetstream.memory)}${health.jetstream.memoryLimit >= 0 ? ` / ${bytes(health.jetstream.memoryLimit)}` : ''}`} />
                <Metric label="Storage" value={`${bytes(health.jetstream.store)}${health.jetstream.storeLimit >= 0 ? ` / ${bytes(health.jetstream.storeLimit)}` : ''}`} />
                <Metric label="Streams" value={`${health.jetstream.streams}${health.jetstream.streamsLimit >= 0 ? ` / ${health.jetstream.streamsLimit}` : ''}`} />
                <Metric label="Consumers" value={`${health.jetstream.consumers}${health.jetstream.consumersLimit >= 0 ? ` / ${health.jetstream.consumersLimit}` : ''}`} />
                <Metric label="API Calls" value={health.jetstream.apiTotal.toLocaleString()} />
                <Metric label="API Errors" value={health.jetstream.apiErrors.toLocaleString()} warn={health.jetstream.apiErrors > 0} />
              </div>
            </Section>
          )}

          <Section title="Slow / Stalled Consumers" icon={AlertTriangle}>
            {health.slowConsumers.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: '12px', padding: '4px 0' }}>No slow consumers detected</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Consumer', 'Stream', 'Ack Pending', 'Pending Msgs', 'Reason'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left', fontSize: '11px',
                        color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {health.slowConsumers.map((c, i) => (
                    <tr key={`${c.streamName}-${c.name}`} style={{
                      borderBottom: i < health.slowConsumers.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}>{c.name}</td>
                      <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>{c.streamName}</td>
                      <td style={{ padding: '8px 12px', fontSize: '12px' }}>{c.ackPending}</td>
                      <td style={{ padding: '8px 12px', fontSize: '12px' }}>{c.pendingMessages.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--amber)' }}>{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}

      {/* Stream Admin Modal */}
      {showAdmin && session && (
        <StreamAdmin
          connectionId={session.connectionId}
          streams={streams}
          onClose={() => setShowAdmin(false)}
          onRefresh={loadStreams}
        />
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon size={14} color="var(--accent)" />
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{title}</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {children}
      </div>
    </div>
  )
}

function Metric({ label, value, warn }: { label: string; value: any; warn?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '15px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: warn ? 'var(--amber)' : 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  )
}
