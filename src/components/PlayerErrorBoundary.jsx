import { Component } from 'react'
import { Link } from 'react-router-dom'

/**
 * Catches render errors inside the Player profile page so a single
 * malformed player record can't black out the whole tab. Most often
 * triggered by a movementByYear or teamHistory entry that landed in
 * a shape no renderer knows how to handle (legacy migrations, partial
 * writes, etc.) — in that case the heal in syncDerivedFieldsFromV2 +
 * applyMigrations will clean it up the next time the player saves,
 * but until then we want the user to have a working path forward
 * instead of a blank screen.
 *
 * Render path: pass `editPath` (link to the Player Editor) so the
 * fallback can deep-link the user to the place where they can fix it.
 */
export default class PlayerErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[PlayerErrorBoundary] render failed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    const { editPath, backPath } = this.props
    const message = this.state.error?.message || String(this.state.error)

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
        <div className="card-elevated max-w-lg w-full p-8 text-center">
          <h2 className="text-xl font-bold text-txt-primary mb-2">
            We couldn't render this player
          </h2>
          <p className="text-sm text-txt-secondary mb-6">
            One of the fields on this player record is in a shape the page
            doesn't know how to display. Open the editor to inspect and
            re-save — that triggers an auto-clean of any malformed data.
          </p>
          <pre className="text-[11px] text-txt-tertiary bg-surface-2 rounded-md p-3 mb-6 text-left overflow-auto max-h-32">
            {message}
          </pre>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {editPath && (
              <Link
                to={editPath}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface-3 text-white hover:bg-surface-4 transition-colors"
              >
                Open Editor
              </Link>
            )}
            {backPath && (
              <Link
                to={backPath}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors"
              >
                Back
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }
}
