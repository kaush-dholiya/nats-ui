import { useStore } from './stores/appStore'
import { Sidebar } from './components/layout/Sidebar'
import { ToastContainer } from './components/layout/Toast'
import { ConnectionManager } from './components/connections/ConnectionManager'
import { Dashboard } from './components/streams/Dashboard'
import { StreamsView } from './components/streams/StreamsView'
import { SubscribeView } from './components/messages/SubscribeView'
import { PublishView } from './components/messages/PublishView'

function App() {
  const { activeView } = useStore()

  const renderView = () => {
    switch (activeView) {
      case 'connections': return <ConnectionManager />
      case 'dashboard':   return <Dashboard />
      case 'streams':     return <StreamsView />
      case 'messages':    return <SubscribeView />
      case 'publish':     return <PublishView />
      default:            return <ConnectionManager />
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ marginLeft: '220px', flex: 1, minHeight: '100vh', overflow: 'auto' }}>
        {renderView()}
      </main>
      <ToastContainer />
    </div>
  )
}

export default App
