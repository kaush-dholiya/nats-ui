import type { MessageEnvelope, SubscribeRequest } from '../types'

export type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SubscriptionHandle {
  unsubscribe: () => void
}

export function createSubscription(
  connectionId: string,
  request: SubscribeRequest,
  onMessage: (msg: MessageEnvelope) => void,
  onStatus: (status: WSStatus) => void
): SubscriptionHandle {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/${connectionId}/subscribe`)

  onStatus('connecting')

  ws.onopen = () => {
    // Backend sends a ping first to confirm the connection is ready.
    // We wait for it in onmessage before sending our subscribe request.
    // But also send immediately as fallback in case backend doesn't ping.
    // We'll send after a short tick to ensure backend is in ReadMessage.
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(request))
      }
    }, 50)
  }

  ws.onmessage = (event) => {
    try {
      const frame = JSON.parse(event.data)
      if (frame.type === 'ping') {
        // Backend is ready — send subscribe request now
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(request))
        }
      } else if (frame.type === 'subscribed') {
        onStatus('connected')
      } else if (frame.type === 'message') {
        onMessage(frame.payload as MessageEnvelope)
      } else if (frame.type === 'error') {
        console.error('Subscribe error:', frame.payload)
        onStatus('error')
      }
    } catch {
      // ignore parse errors
    }
  }

  ws.onerror = () => onStatus('error')
  ws.onclose = () => onStatus('disconnected')

  return {
    unsubscribe: () => ws.close(),
  }
}
