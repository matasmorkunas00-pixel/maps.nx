import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            background: '#111827',
            color: '#f9fafb',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 720,
              width: '100%',
              background: '#1f2937',
              border: '1px solid #374151',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>App crashed</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 8 }}>
              {this.state.errorMessage}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Open browser console for full stack trace, then share the first red error line.
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
