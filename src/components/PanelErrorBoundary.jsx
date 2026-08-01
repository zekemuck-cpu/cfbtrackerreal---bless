import { Component } from 'react'

/**
 * Generic render-error boundary for a single tab/panel. Mirrors
 * PlayerErrorBoundary, but for cases where there's no obvious deep-link
 * to a healer — it just keeps one malformed data record from blacking
 * out the whole page (the surrounding routes are only wrapped in
 * <Suspense>, which does NOT catch render throws).
 *
 * Pass `label` for the human-facing name of the panel and, optionally,
 * `name` for the console tag used when logging the real stack.
 */
export default class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[${this.props.name || 'PanelErrorBoundary'}] render failed`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const label = this.props.label || 'this section'
    const message = this.state.error?.message || String(this.state.error)

    return (
      <div className="min-h-[40vh] flex items-center justify-center px-6 py-12">
        <div className="card-elevated max-w-lg w-full p-8 text-center">
          <h2 className="text-xl font-bold text-txt-primary mb-2">
            We couldn't render {label}
          </h2>
          <p className="text-sm text-txt-secondary mb-6">
            Something in this dynasty's data is in a shape this view doesn't
            know how to display. The rest of the app is unaffected — you can
            switch tabs or reload. If it keeps happening, the message below
            helps us track it down.
          </p>
          <pre className="text-[11px] text-txt-tertiary bg-surface-2 rounded-md p-3 text-left overflow-auto max-h-32">
            {message}
          </pre>
        </div>
      </div>
    )
  }
}
