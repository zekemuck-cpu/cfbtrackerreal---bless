import { Link } from 'react-router-dom'

/**
 * "Install Mobile App" entry — same lighter ghost-card styling as ContactCTA
 * so it groups cleanly with the sample-dynasty and contact rows. Only useful on
 * the mobile layout (add-to-home-screen), so callers gate it with `lg:hidden`.
 */
export default function InstallAppCTA({ className = '' }) {
  return (
    <Link to="/install" className={`ghost-card group block ${className}`}>
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-baseline gap-2 sm:gap-3 flex-wrap">
          <span className="font-display text-sm sm:text-base font-semibold text-txt-secondary tracking-tight leading-tight">
            Want the app on your home screen?
          </span>
        </div>
        <span className="btn-refined flex-shrink-0">
          Install
        </span>
      </div>
    </Link>
  )
}
