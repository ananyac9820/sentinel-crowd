import { Component } from 'react'

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
        <div className="panel max-w-md p-6">
          <p className="label text-warn">Error</p>
          <p className="mt-2 font-semibold">Something went wrong on this screen.</p>
          <p className="mt-1 text-sm text-muted">Reloading restarts the dashboard in Simulation mode.</p>
          <button
            onClick={() => {
              location.hash = '#dashboard'
              location.reload()
            }}
            className="btn btn-primary mt-5"
          >
            Reload dashboard
          </button>
        </div>
      </div>
    )
  }
}
