/**
 * Tiny external-link chip pointing at collegefootball.gg's Recruiting
 * Insight Engine. Dropped into every recruiting task card (in-season
 * bye week + bowl weeks, offseason recruiting weeks + signing day) so
 * users have a one-click shortcut from the to-do list.
 */
export default function RecruitingInsightLink({ className = '' }) {
  return (
    <a
      href="https://collegefootball.gg/recruiting-insight-engine/"
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-txt-tertiary hover:text-txt-primary transition-colors ${className}`.trim()}
      style={{ letterSpacing: '1.5px' }}
      title="Open the Recruiting Insight Engine (collegefootball.gg)"
    >
      <svg
        className="w-3 h-3 sm:w-3.5 sm:h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
      Insight Engine
    </a>
  )
}
