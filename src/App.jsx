import { useEffect, useState } from 'react'
import Landing from './components/Landing.jsx'
import Dashboard from './components/Dashboard.jsx'
import LegalPage from './components/LegalPage.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Hash routes keep the app a plain static site: no server rewrites needed.
const ROUTES = ['dashboard', 'terms', 'privacy']
const routeFromHash = () => {
  const h = location.hash.replace('#', '')
  return ROUTES.includes(h) ? h : 'landing'
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash)

  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (r) => {
    location.hash = r === 'landing' ? '' : r
  }

  return (
    <ErrorBoundary>
      {route === 'dashboard' ? (
        <Dashboard onHome={() => go('landing')} />
      ) : route === 'terms' || route === 'privacy' ? (
        <LegalPage page={route} />
      ) : (
        <Landing onOpen={() => go('dashboard')} />
      )}
    </ErrorBoundary>
  )
}
