// Shared duplicate-review list — one row per cluster of recruits that look like the
// same person entered more than once (matched conservatively by
// findDuplicateClusters: name + position + archetype + stars, all exact). Every
// member starts checked ("kept"); unchecking marks it for deletion. Used by both
// RecruitingDatabaseMigrationModal (the one-time pool setup) and
// DuplicateReviewModal (ongoing imports) so there's one implementation of this UI.
export default function DuplicateReviewList({ duplicateClusters, isKept, onToggle }) {
  return (
    <>
      <p className="text-xs text-txt-tertiary leading-relaxed">
        These recruits look like the same person entered more than once (same name,
        position, archetype, and star rating). Uncheck any entry you want removed —
        everything stays by default.
      </p>
      {duplicateClusters.map((cluster, i) => (
        <div key={i} className="bg-surface-3 border border-surface-4 rounded-lg p-3 space-y-2">
          <p className="text-xs font-bold text-txt-primary">
            {cluster[0].name} · {cluster[0].position} · {cluster[0].archetype} · {cluster[0].stars}★
          </p>
          {cluster.map(p => (
            <label key={p.pid} className="flex items-center gap-2 text-xs text-txt-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={isKept(p.pid)}
                onChange={() => onToggle(p.pid)}
                className="accent-current"
              />
              <span>
                {p._mergedFromDynastyName ? <>From <strong className="text-txt-primary">{p._mergedFromDynastyName}</strong> · </> : null}
                {p.devTrait ? `${p.devTrait} · ` : ''}
                {p.attributes && Object.keys(p.attributes).length ? `${Object.keys(p.attributes).length} attrs scouted` : 'not scouted'}
              </span>
            </label>
          ))}
        </div>
      ))}
    </>
  )
}
