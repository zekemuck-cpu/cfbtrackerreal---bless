import { Link } from 'react-router-dom'

/**
 * Compact "get in touch" card — placed on Home, Login, and anywhere else
 * a casual nudge toward feedback makes sense. Discord-brand accent on the
 * left keeps it visually distinct without shouting.
 */
export default function ContactCTA({ className = '' }) {
  return (
    <Link
      to="/contact"
      className={`block rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg group ${className}`}
      style={{
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--rule-soft)',
      }}
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #5865F2 0%, #404EED 100%)',
            boxShadow: '0 2px 8px rgba(88, 101, 242, 0.3)',
          }}
          aria-hidden="true"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-txt-primary">Got feedback, bugs, or ideas?</div>
          <div className="text-sm text-txt-tertiary">
            Join the Discord, send a message, or hit me up on Reddit.
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-sm font-semibold text-txt-secondary group-hover:text-txt-primary transition-colors flex-shrink-0">
          Contact
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </div>
      </div>
    </Link>
  )
}
