// Shared "Recruiting Plan" row — used by the Daily Brief (one row per position)
// and by Program Outlook's per-position vertical box.
export default function RecruitingPlanRow({ pos, hs, portal, targetName, targetIsPortal, flag }) {
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
    <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 border ${rowBg}`}>
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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 16" className="w-3 h-3.5 shrink-0 text-red-400" fill="none">
          <line x1="2.5" y1="1" x2="2.5" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <rect x="2.5" y="1.5" width="10" height="6.5" rx="0.5" fill="currentColor"/>
        </svg>
      )}
      {isDepth && (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 16" className="w-3 h-3.5 shrink-0 text-yellow-400" fill="none">
          <line x1="2.5" y1="1" x2="2.5" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <rect x="2.5" y="1.5" width="10" height="6.5" rx="0.5" fill="currentColor"/>
        </svg>
      )}
    </div>
  );
}
