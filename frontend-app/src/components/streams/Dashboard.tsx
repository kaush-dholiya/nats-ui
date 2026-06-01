import { useEffect, useState } from 'react'
import { Layers, HardDrive, Cpu, Zap, Settings } from 'lucide-react'
import { useStore } from '../../stores/appStore'
import { StreamAdmin } from './StreamAdmin'

function bytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function Dashboard() {
  const { session, streams, loadStreams } = useStore()
  const info = session?.serverInfo
  const [showAdmin, setShowAdmin] = useState(false)

  useEffect(() => { loadStreams() }, [])

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

      {/* Streams table */}
      {streams.length > 0 && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={14} color="var(--accent)" />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>JetStream Streams</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Name', 'Subjects', 'Messages', 'Size', 'Consumers'].map(h => (
                  <th key={h} style={{
                    padding: '10px 20px', textAlign: 'left', fontSize: '11px',
                    color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {streams.map((s, i) => (
                <tr key={s.name} style={{
                  borderBottom: i < streams.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}>{s.name}</td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    {s.subjects?.join(', ') || '—'}
                  </td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-primary)', fontSize: '13px' }}>{s.messages.toLocaleString()}</td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>{bytes(s.bytes)}</td>
                  <td style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>{s.consumers}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
