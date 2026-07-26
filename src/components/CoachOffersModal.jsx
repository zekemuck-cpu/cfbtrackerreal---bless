import { getTeamLogoByTid, stripMascotFromName, getMascotName } from '../data/teams'
import { EmptyState } from './ui'

/**
 * Read-only "Schools Interested In Me" list — every pending job offer the
 * save currently has out for the user's own coach (cfb27SaveSync.js's
 * coachOffersUpdate / extractPlayers.cjs's buildCoachOffers). Mirrors the
 * in-game Coach Carousel's own "Schools Interested In Me" panel. Always a
 * live snapshot of dynasty.coachOffers — nothing here is editable, since
 * accepting/declining an offer happens in the save itself and the next sync
 * reflects it (see the "Taking a New Job?" auto-detection).
 */
export default function CoachOffersModal({ isOpen, onClose, offers, teams, pathPrefix, currentYear }) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[calc(100dvh-4rem)] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-txt-primary">Job Offers</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="hover:opacity-70"
            style={{ color: 'var(--text-primary)' }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!offers || offers.length === 0 ? (
          <EmptyState title="No Offers Right Now" message="No schools currently have a job offer out for you." />
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => {
              const mascotName = offer.tid != null ? getMascotName(offer.tid, teams) : null
              const schoolName = stripMascotFromName(mascotName) || mascotName || offer.teamAbbr || 'Unknown School'
              const logo = offer.tid != null ? getTeamLogoByTid(offer.tid, teams) : null
              return (
                <div
                  key={`${offer.tid}-${offer.position}`}
                  className="p-3 rounded-lg flex items-center gap-3"
                  style={{ backgroundColor: 'var(--surface-3)' }}
                >
                  <span className="w-10 h-10 rounded-full bg-white p-1 flex-shrink-0 flex items-center justify-center">
                    {logo ? <img src={logo} alt="" className="w-full h-full object-contain" /> : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-txt-primary truncate">{schoolName}</div>
                    <div className="text-xs text-txt-tertiary">{offer.position} · {offer.status || 'Pending'}</div>
                    <div className="text-xs text-txt-secondary mt-0.5">
                      Offering {offer.offeredPoints} program points (you value {offer.expectedPoints}) · {offer.length}-year deal
                    </div>
                  </div>
                  {offer.tid != null && pathPrefix && (
                    <a
                      href={`${pathPrefix}/team/${offer.tid}/${currentYear}`}
                      className="btn-refined text-center flex-shrink-0"
                    >
                      View
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
