// Shared "Recruiting Plan" row — used by the Daily Brief (one row per position)
// and by Program Outlook's per-position vertical box.
export default function RecruitingPlanRow({ pos, hs, portal, targetName, targetIsPortal, targetPid, flag, onClick, onRemove, onRemoveGeneric }) {
  const isCritical = flag === 'critical';
  const isDepth    = flag === 'depth';
  const posColor   = 'text-txt-secondary';
  const rowBg      = 'bg-surface-3 border-surface-4';
  const pillBase   = 'text-[9px] font-bold px-1.5 py-0.5 rounded border bg-surface-4 border-surface-4 text-txt-secondary';

  // Named targets keep their original casing; generic slots are uppercase.
  const hsPills = [];
  if (hs > 0) {
    const namedHs = targetName && !targetIsPortal;
    if (namedHs) hsPills.push({ label: targetName, isName: true });
    const remaining = namedHs ? hs - 1 : hs;
    for (let i = 0; i < remaining; i++) hsPills.push({ label: '1 HS', isName: false });
  }
  const portalPills = [];
  if (portal > 0) {
    const namedPortal = targetName && targetIsPortal;
    if (namedPortal) portalPills.push({ label: targetName, isName: true });
    const remaining = namedPortal ? portal - 1 : portal;
    for (let i = 0; i < remaining; i++) portalPills.push({ label: '1 PORTAL', isName: false });
  }

  const removeIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  // isName pills remove that specific recruit from the board (onRemove).
  // Generic "1 HS"/"1 Portal" pills instead decrement that target count by
  // one (onRemoveGeneric) — same effect as the "−" stepper in Program
  // Outlook's Targeting Strategy, just reachable straight from the pill.
  const pill = (label, isName, type, i, key) => {
    const canRemove = isName ? (!!onRemove && !!targetPid) : !!onRemoveGeneric;
    return (
      <span
        key={key}
        className={`${pillBase} ${isName ? '' : 'uppercase'} ${canRemove ? 'group inline-flex items-center gap-1 pr-1' : ''}`}
      >
        {label}
        {canRemove && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); isName ? onRemove(targetPid) : onRemoveGeneric(type); }}
            title={isName ? 'Remove from recruiting plan' : `Remove one ${type === 'hs' ? 'HS' : 'Portal'} target`}
            className="shrink-0 rounded-sm text-txt-tertiary hover:text-red-400 hover:bg-surface-5 transition opacity-0 group-hover:opacity-100"
          >
            {removeIcon}
          </button>
        )}
      </span>
    );
  };

  return (
    <div
      onClick={onClick || undefined}
      title={onClick ? `View ${pos} in Program Outlook` : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 border ${rowBg} ${onClick ? 'cursor-pointer transition-colors hover:bg-surface-4 hover:border-surface-5' : ''}`}
    >
      {pos && <span className={`text-[11px] font-black tracking-wide w-7 shrink-0 ${posColor}`}>{pos}</span>}
      <div className="flex items-center gap-1 flex-wrap flex-1">
        {hsPills.map(({ label, isName }, i) => pill(label, isName, 'hs', i, `hs-${i}`))}
        {portalPills.map(({ label, isName }, i) => pill(label, isName, 'portal', i, `portal-${i}`))}
      </div>
      {isCritical && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 text-[#E3242B]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
      {isDepth && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 text-[#FFC72C]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
    </div>
  );
}
