// Shared "Recruiting Plan" row — used by the Daily Brief (one row per position)
// and by Program Outlook's per-position vertical box.
export default function RecruitingPlanRow({ pos, hs, portal, targetName, targetIsPortal, flag, onClick }) {
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

  return (
    <div
      onClick={onClick || undefined}
      title={onClick ? `View ${pos} in Program Outlook` : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 border ${rowBg} ${onClick ? 'cursor-pointer transition-colors hover:bg-surface-4 hover:border-surface-5' : ''}`}
    >
      {pos && <span className={`text-[11px] font-display font-black tracking-wide w-7 shrink-0 ${posColor}`}>{pos}</span>}
      <div className="flex items-center gap-1 flex-wrap flex-1">
        {hsPills.map(({ label, isName }, i) => (
          <span key={`hs-${i}`} className={`${pillBase} ${isName ? '' : 'uppercase'}`}>{label}</span>
        ))}
        {portalPills.map(({ label, isName }, i) => (
          <span key={`portal-${i}`} className={`${pillBase} ${isName ? '' : 'uppercase'}`}>{label}</span>
        ))}
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
