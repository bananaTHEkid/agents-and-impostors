import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { SocketProvider } from './contexts/SocketContext'
import ErrorBoundary from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SocketProvider>
        <App />
      </SocketProvider>
    </ErrorBoundary>
  </StrictMode>,
)
