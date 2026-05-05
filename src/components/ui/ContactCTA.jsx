import { Link } from 'react-router-dom'

/**
 * Compact "get in touch" entry. Footer-weight affordance — uses the
 * lighter ghost-card styling so it doesn't compete with actual page
 * content (dynasty cards, primary CTAs). Single tight row, no
 * subtitle paragraph.
 */
export default function ContactCTA({ className = '' }) {
  return (
    <Link to="/contact" className={`ghost-card group block ${className}`}>
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-baseline gap-2 sm:gap-3 flex-wrap">
          <span className="font-display text-sm sm:text-base font-semibold text-txt-secondary tracking-tight leading-tight">
            Got feedback, bugs, or ideas?
          </span>
          <span className="text-xs text-txt-tertiary">
            Discord · Reddit · DM
          </span>
        </div>
        <span className="btn-refined flex-shrink-0">
          Contact
        </span>
      </div>
    </Link>
  )
}
