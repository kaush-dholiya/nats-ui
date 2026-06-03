import { Server, LayoutDashboard, Layers, Users, Database, Radio, Send, Unplug } from 'lucide-react'
import { useStore } from '../../stores/appStore'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'streams', label: 'Streams', icon: Layers },
  { id: 'consumers', label: 'Consumers', icon: Users },
  { id: 'kv', label: 'KV Store', icon: Database },
  { id: 'messages', label: 'Subscribe', icon: Radio },
  { id: 'publish', label: 'Publish', icon: Send },
] as const

export function Sidebar() {
  const { session, activeView, setActiveView, disconnect, connections } = useStore()

  const activeConn = connections.find(c => c.id === session?.connectionId)

  return (
    <aside style={{
      width: '220px', flexShrink: 0,
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'fixed', left: 0, top: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '7px',
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>N</span>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '-0.2px' }}>NATS UI</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>v0.1.0</div>
          </div>
        </div>
      </div>

      {/* Active connection badge */}
      {session && (
        <div style={{
          margin: '12px 12px 0',
          background: 'var(--green-glow)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '8px', padding: '10px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Connected
            </span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {activeConn?.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {session.serverInfo?.version ? `nats v${session.serverInfo.version}` : activeConn?.url}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {/* Connections link always shown */}
        <NavItem
          icon={Server}
          label="Connections"
          active={activeView === 'connections'}
          onClick={() => setActiveView('connections')}
        />

        {/* Only show these when connected */}
        {session && navItems.map(item => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeView === item.id}
            onClick={() => setActiveView(item.id)}
          />
        ))}
      </nav>

      {/* Disconnect */}
      {session && (
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border-subtle)' }}>
          <button onClick={disconnect} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
            padding: '8px 12px', borderRadius: '7px',
            background: 'transparent', border: 'none',
            color: 'var(--red)', cursor: 'pointer', fontSize: '13px',
            fontFamily: 'var(--font-sans)', transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Unplug size={15} />
            Disconnect
          </button>
        </div>
      )}
    </aside>
  )
}

function NavItem({ icon: Icon, label, active, onClick }: {
  icon: any; label: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
      padding: '8px 12px', borderRadius: '7px',
      background: active ? 'var(--accent-glow)' : 'transparent',
      border: `1px solid ${active ? 'rgba(59,130,246,0.2)' : 'transparent'}`,
      color: active ? 'var(--accent)' : 'var(--text-secondary)',
      cursor: 'pointer', fontSize: '13px', fontWeight: active ? 500 : 400,
      fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
      textAlign: 'left',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-elevated)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}
