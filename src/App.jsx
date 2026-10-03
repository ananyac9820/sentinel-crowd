import { useState } from 'react'
import Landing from './components/Landing.jsx'
import Dashboard from './components/Dashboard.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

export default function App() {
  const [view, setView] = useState(() => (location.hash === '#dashboard' ? 'dashboard' : 'landing'))

  const go = (v) => {
    setView(v)
    history.replaceState(null, '', v === 'dashboard' ? '#dashboard' : '#')
  }

  return (
    <ErrorBoundary>
      {view === 'dashboard' ? <Dashboard onHome={() => go('landing')} /> : <Landing onOpen={() => go('dashboard')} />}
    </ErrorBoundary>
  )
}
