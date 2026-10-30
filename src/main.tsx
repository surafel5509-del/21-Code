import React from 'react'
import { Capacitor } from '@capacitor/core'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './styles/app.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return <main style={{ padding: 32, color: '#dce9ef', fontFamily: 'system-ui' }}><h1>21 Code could not open</h1><p>Your projects may still be in local storage. Reload the page and export a backup if possible.</p><pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre><button onClick={() => window.location.reload()}>Reload workspace</button></main>
    return this.props.children
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>)
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { /* Offline caching is optional. */ }) })
