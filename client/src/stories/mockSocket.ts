type Listener = (...args: any[]) => void

type MockOptions = {
  events?: Record<string, any>
  emitResponses?: Record<string, any>
}

export const createMockSocket = ({ events = {}, emitResponses = {} }: MockOptions = {}) => {
  const listeners: Record<string, Listener[]> = {}

  const socket = {
    id: 'mock-socket',
    connected: true,
    on(event: string, cb: Listener) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
      if (Object.prototype.hasOwnProperty.call(events, event)) {
        const payload = events[event]
        setTimeout(() => cb(payload), 0)
      }
      return socket
    },
    off(event: string, cb?: Listener) {
      if (!listeners[event]) return socket
      if (!cb) {
        delete listeners[event]
        return socket
      }
      listeners[event] = listeners[event].filter((fn) => fn !== cb)
      return socket
    },
    emit(event: string, payload?: any, ack?: Listener) {
      const response = emitResponses[event]
      if (typeof ack === 'function' && typeof response !== 'undefined') {
        setTimeout(() => ack(response), 0)
      }
      const fns = listeners[event] || []
      fns.forEach((fn) => fn(payload))
      return socket
    },
  }

  return socket as any
}
