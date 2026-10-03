import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Last line of defence: never show a blank screen on stage.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <AlertTriangle className="mx-auto text-warn" />
          <p className="mt-3 font-semibold">Something went wrong on this screen</p>
          <p className="mt-1 text-sm text-slate-400">Reloading restarts the dashboard in Simulation mode.</p>
          <button
            onClick={() => {
              location.hash = '#dashboard'
              location.reload()
            }}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <RotateCcw size={15} /> Reload dashboard
          </button>
        </div>
      </div>
    )
  }
}
