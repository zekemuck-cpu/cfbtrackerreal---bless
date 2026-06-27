import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, EmptyState, Button } from '../../components/ui'
import { proxyImageUrl } from '../../utils/imageProxy'
import { isPlayerOnRoster, getPlayerClassForYear } from '../../context/DynastyContext'
import { finePositionGroup } from '../../data/positionGroups'
import { getTargetStatus } from '../../utils/recruitingTargets'
import { scoutGrade, scoutLetter, scoutDossier, dossierParagraphs, gradeBreakdown, inferPlayStyle, schemeFits, projectFreshmanOvr } from '../../utils/scoutGrade'
import { scoutCalibration } from '../../utils/scoutLearning'
import { ATTRIBUTE_COLUMNS, ATTRIBUTE_ABBR } from '../../utils/recruitAttributes'

// Scout Board (the Targets tab): tracked targets ranked by scout grade against
// roster needs. Styled to match the rest of the app — list rows like the
// commitments view, restrained/neutral text, an expandable scouting drawer per
// player, and a roster-needs strip that tucks away behind the header.

const GRADUATING = new Set(['Sr', 'RS Sr', 'Senior'])
const STAR = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0)))

// Per-position depth targets (returning next season): below `start` you can't
// field your starters (Need); below `min` you're under ideal depth (Thin). Keyed
// to finePositionGroup names; unknown groups use DEFAULT_DEPTH.
const POS_DEPTH = {
  QB: { min: 2, start: 1 }, RB: { min: 4, start: 2 }, FB: { min: 1, start: 1 }, WR: { min: 6, start: 3 }, TE: { min: 3, start: 1 },
  OT: { min: 4, start: 2 }, OG: { min: 4, start: 2 }, C: { min: 2, start: 1 },
  EDGE: { min: 4, start: 2 }, DT: { min: 4, start: 2 },
  OLB: { min: 3, start: 2 }, MIKE: { min: 2, start: 1 }, ILB: { min: 2, start: 1 }, LB: { min: 3, start: 2 },
  CB: { min: 5, start: 3 }, SAFETY: { min: 4, start: 2 }, FS: { min: 2, start: 1 }, SS: { min: 2, start: 1 },
  K: { min: 1, start: 1 }, P: { min: 1, start: 1 }, LS: { min: 1, start: 1 }, ATH: { min: 0, start: 0 },
}
const DEFAULT_DEPTH = { min: 3, start: 2 }
const needLevel = (returning, group) => {
  const d = POS_DEPTH[group] || DEFAULT_DEPTH
  if (returning < d.start) return { label: 'Need', rank: 2 }
  if (returning < d.min) return { label: 'Thin', rank: 1 }
  return { label: null, rank: 0 }
}

const Chevron = ({ open }) => (
  <svg
    className="w-3.5 h-3.5 flex-shrink-0 transition-transform text-txt-tertiary"
    style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)

function Row({ r, rank, pathPrefix, playStyle, model, room = [] }) {
  const { p, score, tier, need, status } = r
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const lost = status === 'committed_elsewhere'
  const committed = status === 'committed_us'
  // Project his realistic first-year OVR (star-anchored, NOT the scout grade)
  // so the depth-chart line can slot him against the real room.
  const projOvr = projectFreshmanOvr(p, score, model)
  const depth = Number.isFinite(r.returning) ? { group: r.group || p.position, returning: r.returning, rank: need?.rank ?? 0, room, projOvr } : null
  const paragraphs = open ? dossierParagraphs(scoutDossier(p, playStyle, depth, model)) : []
  const breakdown = open ? gradeBreakdown(p, model) : null
  const attrEntries = ATTRIBUTE_COLUMNS
    .filter((name) => p.attributes?.[name] != null && p.attributes[name] !== '')
    .map((name) => ({ name, abbr: ATTRIBUTE_ABBR[name] || name, value: Number(p.attributes[name]) }))

  // Sub-line: the recruit's national / position / state recruiting ranks.
  const ranks = []
  if (p.nationalRank) ranks.push({ v: p.nationalRank, l: 'Nat' })
  if (p.positionRank) ranks.push({ v: p.positionRank, l: p.position || 'Pos' })
  if (p.stateRank && p.state) ranks.push({ v: p.stateRank, l: p.state })

  // Expanded meta (bio + ranks) shown beneath the attributes grid.
  const meta = []
  if (p.hometown) meta.push(`${p.hometown}${p.state ? `, ${p.state}` : ''}`)
  if (p.nationalRank) meta.push(`#${p.nationalRank} National`)
  if (p.positionRank) meta.push(`#${p.positionRank} ${p.position || 'POS'}`)
  if (p.stateRank && p.state) meta.push(`#${p.stateRank} ${p.state}`)

  const fmtAdj = (v) => (v > 0 ? `+${v}` : `${v}`)

  // One attribute readout: order by archetype importance (weight), then value, so
  // the grade-driving traits lead — no need for a separate weight column.
  const weightOf = {}
  if (breakdown) for (const f of breakdown.factors) weightOf[f.name] = f.weight
  const orderedAttrs = [...attrEntries].sort(
    (a, b) => (weightOf[b.name] || 0) - (weightOf[a.name] || 0) || b.value - a.value,
  )

  return (
    <div style={{ borderTop: rank > 1 ? '1px solid var(--surface-4)' : 'none', opacity: lost ? 0.55 : 1 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 sm:gap-3.5 px-4 py-3 hover:bg-surface-2 transition-colors text-left"
      >
        <span className="w-5 text-right tabular-nums font-display flex-shrink-0 leading-none text-txt-tertiary" style={{ fontSize: '1rem', fontWeight: 700 }}>
          {rank}
        </span>

        <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border" style={{ backgroundColor: 'var(--surface-3)', borderColor: 'var(--surface-4)' }}>
          {p.pictureUrl
            ? <img src={proxyImageUrl(p.pictureUrl, 200)} alt="" className="w-full h-full object-cover" />
            : <span className="text-[10px] font-black uppercase text-txt-secondary" style={{ letterSpacing: '0.04em' }}>{(p.position || 'ATH').slice(0, 3)}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); navigate(`${pathPrefix}/player/${p.pid}`) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); navigate(`${pathPrefix}/player/${p.pid}`) } }}
              className="text-[15px] font-bold text-txt-primary truncate hover:underline cursor-pointer"
            >
              {p.name}
            </span>
            {Number(p.stars) > 0 && <span className="text-[10px] flex-shrink-0 tracking-tight" style={{ color: 'var(--accent-warning)' }}>{STAR(p.stars)}</span>}
            {committed && <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide flex-shrink-0">· Committed</span>}
            {lost && <span className="text-[9px] font-bold uppercase text-txt-tertiary tracking-wide flex-shrink-0">· Lost</span>}
          </div>
          <div className="flex items-baseline gap-x-3 truncate mt-1 text-[11px]" style={{ letterSpacing: '0.3px' }}>
            <span className="uppercase text-txt-secondary font-semibold flex-shrink-0">{p.position || 'ATH'}</span>
            {p.archetype && <span className="uppercase text-txt-tertiary flex-shrink-0">{p.archetype}</span>}
            {ranks.length > 0 && (
              <span className="inline-flex items-baseline gap-x-2.5 tabular-nums min-w-0 truncate">
                {ranks.map((rk) => (
                  <span key={rk.l} className="inline-flex items-baseline gap-1">
                    <span className="font-bold text-txt-secondary">#{rk.v}</span>
                    <span className="text-txt-tertiary uppercase">{rk.l}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0 w-12">
          <div className="font-display leading-none text-txt-primary" style={{ fontSize: '1.55rem', fontWeight: 800 }} title={tier ? tier.label : 'Unscouted'}>
            {score != null ? scoutLetter(score) : '—'}
          </div>
        </div>

        <Chevron open={open} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-0.5 sm:pl-[4.5rem] sm:pr-6">
          {/* The report reads as one piece: lead-styled prose, then a quiet
              data ledger (attributes → grade rationale → bio), hairline-tied. */}
          {paragraphs.length > 0 && (
            <div className="max-w-[68ch] space-y-1.5">
              {paragraphs.map((para, i) => (
                <p
                  key={i}
                  className={i === 0
                    ? 'text-[12.5px] leading-snug text-txt-primary'
                    : 'text-[12px] leading-snug text-txt-secondary'}
                >
                  {para}
                </p>
              ))}
            </div>
          )}

          <div className="mt-3.5 grid gap-x-10 gap-y-3.5 sm:grid-cols-2 max-w-[68ch]">
            {/* Attribute readout — a single clean set of bars, key traits first */}
            {orderedAttrs.length > 0 && (
              <div>
                <div className="label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>Attributes</div>
                <div className="space-y-1">
                  {orderedAttrs.map((e) => (
                    <div key={e.name} className="flex items-center gap-3">
                      <span className="text-[11px] text-txt-secondary w-28 flex-shrink-0 truncate" title={e.name}>{e.name}</span>
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-4)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((e.value / 99) * 100))}%`, backgroundColor: 'var(--text-secondary)' }} />
                      </div>
                      <span className="text-[12px] tabular-nums font-bold text-txt-primary w-6 text-right flex-shrink-0">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Grade rationale — borderless ledger, the math behind the letter */}
            {breakdown && (
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Grade Rationale</span>
                  <span className="text-[11px] tabular-nums text-txt-tertiary">{breakdown.letter} · {breakdown.score} grade</span>
                </div>
                <div className="space-y-1">
                  {breakdown.adjustments.map((a) => (
                    <div key={a.label} className="flex items-baseline gap-3">
                      <span className="flex-1 min-w-0 text-[11px] leading-tight text-txt-secondary">
                        {a.label}<span className="text-txt-tertiary"> · {a.note}</span>
                      </span>
                      <span className="text-[12px] tabular-nums font-bold text-txt-primary w-8 text-right flex-shrink-0">
                        {a.kind === 'base' ? a.value : fmtAdj(a.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bio — quiet footer rule */}
          {meta.length > 0 && (
            <div className="mt-3.5 pt-2.5 max-w-[68ch]" style={{ borderTop: '1px solid var(--surface-4)' }}>
              <span className="text-[11px] text-txt-tertiary tabular-nums">{meta.join('   ·   ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScoutBoard({ dynasty, year, userTid, pathPrefix, viewingOwnTeam = true, onResolveTargets = null, resolveCount = 0 }) {
  const yearN = Number(year)
  const currentYear = Number(dynasty?.currentYear)
  const [deptOpen, setDeptOpen] = useState(false)

  const needsByGroup = useMemo(() => {
    const out = {}
    for (const p of dynasty?.players || []) {
      if (!isPlayerOnRoster(p, userTid, currentYear, dynasty)) continue
      const g = finePositionGroup(p.position)
      if (!g) continue
      const cls = getPlayerClassForYear(p, currentYear)
      const rec = out[g] || (out[g] = { group: g, depth: 0, graduating: 0 })
      rec.depth += 1
      if (GRADUATING.has(cls)) rec.graduating += 1
    }
    for (const g of Object.values(out)) {
      g.returning = g.depth - g.graduating
      g.need = needLevel(g.returning, g.group)
    }
    return out
  }, [dynasty?.players, userTid, currentYear, dynasty])

  // The actual returning ROOM per position group next season — name, OVR, and
  // class for each non-graduating active-roster player — so a recruit's dossier
  // can slot his projected freshman OVR against real players, not a headcount.
  const roomByGroup = useMemo(() => {
    const out = {}
    for (const p of dynasty?.players || []) {
      if (!isPlayerOnRoster(p, userTid, currentYear, dynasty)) continue
      const g = finePositionGroup(p.position)
      if (!g) continue
      const cls = getPlayerClassForYear(p, currentYear)
      if (GRADUATING.has(cls)) continue // graduates — not in next year's room
      const ovrRaw = p.overallByYear?.[currentYear] ?? p.overallByYear?.[String(currentYear)] ?? p.overall
      const ovr = ovrRaw != null && ovrRaw !== '' ? Number(ovrRaw) : null
      ;(out[g] || (out[g] = [])).push({ name: p.name, ovr, cls, pid: p.pid })
    }
    for (const g of Object.values(out)) g.sort((a, b) => (b.ovr ?? -1) - (a.ovr ?? -1))
    return out
  }, [dynasty?.players, userTid, currentYear, dynasty])

  // Team offensive identity (from pass/rush yards) → per-target scheme fit.
  const playStyle = useMemo(() => {
    const roster = (dynasty?.players || []).filter((p) => isPlayerOnRoster(p, userTid, currentYear, dynasty))
    return inferPlayStyle(roster, currentYear)
  }, [dynasty?.players, userTid, currentYear, dynasty])

  // Self-calibrating model learned from how past scouted recruits actually
  // turned out (predicted grade vs. initial OVR). Sharpens grades over time.
  const model = useMemo(() => scoutCalibration(dynasty?.players || []), [dynasty?.players])

  const ranked = useMemo(() => {
    if (!viewingOwnTeam) return []
    const rows = []
    for (const p of dynasty?.players || []) {
      if (!p.isTarget || Number(p.targetYear) !== yearN) continue
      const { score, tier } = scoutGrade(p, model)
      const group = finePositionGroup(p.position)
      const need = group ? needsByGroup[group]?.need : null
      const returning = group ? needsByGroup[group]?.returning : null
      rows.push({ p, score, tier, group, need, returning, fits: schemeFits(p.archetype, playStyle), status: getTargetStatus(p, userTid) })
    }
    rows.sort((a, b) => {
      const aLost = a.status === 'committed_elsewhere' ? 1 : 0
      const bLost = b.status === 'committed_elsewhere' ? 1 : 0
      if (aLost !== bLost) return aLost - bLost
      const as = a.score == null ? -1 : a.score
      const bs = b.score == null ? -1 : b.score
      if (bs !== as) return bs - as
      return (Number(b.p.stars) || 0) - (Number(a.p.stars) || 0)
    })
    return rows
  }, [dynasty?.players, yearN, userTid, needsByGroup, playStyle, model, viewingOwnTeam])

  if (ranked.length === 0) {
    return (
      <Card>
        <EmptyState
          title={viewingOwnTeam ? 'No Targets to Scout' : "Another team's recruiting class"}
          message={viewingOwnTeam
            ? "Track prospects via the recruiting sheet (set their Commitment to \"Uncommitted\" and fill in attributes), and they'll be ranked here by grade against your roster needs."
            : "Targets are your own team's board. Switch back to your team's recruiting page to see them."}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Scouting department — the self-learning calibration readout */}
      {model && model.n > 0 && (
        <section className="media-card overflow-hidden">
          <button
            type="button"
            onClick={() => setDeptOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 hover:bg-surface-2 transition-colors text-left"
          >
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: '13px', letterSpacing: '0.02em' }}>Scouting Department</span>
              <span className="text-[11px] text-txt-tertiary tabular-nums truncate">
                {model.active ? `${model.n} graded · error down ${model.residualMAE.gainPct}%` : `learning · ${model.n} of 6 tracked`}
              </span>
            </div>
            <Chevron open={deptOpen} />
          </button>
          {deptOpen && (
            <div className="px-4 sm:px-5 pb-4 pt-2 border-t space-y-3" style={{ borderColor: 'var(--surface-4)' }}>
              {!model.active ? (
                <p className="text-[12px] text-txt-secondary leading-relaxed">
                  Your grades calibrate themselves by checking past evaluations against how those recruits actually turned out.
                  {' '}{model.n} scouted {model.n === 1 ? 'prospect has' : 'prospects have'} enrolled so far — a few more graduating classes and the board starts auto-correcting.
                </p>
              ) : (
                <>
                  <p className="text-[12px] text-txt-secondary leading-relaxed">
                    Calibrated from {model.n} scouted recruits who have since enrolled. The learned corrections cut ranking error by {model.residualMAE.gainPct}% (average miss {model.residualMAE.after.toFixed(1)} pts). Your raw grades run about {Math.round(model.levelGap)} points above a freshman&apos;s initial OVR.
                  </p>
                  {model.topCorrections.length > 0 && (
                    <div>
                      <div className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1px' }}>Biggest learned adjustments</div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                        {model.topCorrections.map((c) => (
                          <span key={c.scope + c.label} className="text-[12px] inline-flex items-baseline gap-1.5">
                            <span className="text-txt-secondary">{c.label}</span>
                            <span className="tabular-nums font-bold text-txt-primary">{c.value > 0 ? '+' : ''}{c.value.toFixed(1)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(Object.keys(model.learnedWeights).length > 0 || Object.keys(model.devPriors).length > 0) && (
                    <div className="text-[11px] text-txt-tertiary">
                      {Object.keys(model.learnedWeights).length > 0 && `${Object.keys(model.learnedWeights).length} archetype${Object.keys(model.learnedWeights).length === 1 ? '' : 's'} re-weighted from outcomes`}
                      {Object.keys(model.learnedWeights).length > 0 && Object.keys(model.devPriors).length > 0 ? ' · ' : ''}
                      {Object.keys(model.devPriors).length > 0 && `${Object.keys(model.devPriors).length} hidden-dev prior${Object.keys(model.devPriors).length === 1 ? '' : 's'} learned`}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Big board */}
      <section className="media-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'var(--surface-4)' }}>
          <h3 className="font-display font-black uppercase leading-none text-txt-primary" style={{ fontSize: '15px', letterSpacing: '0.02em' }}>Big Board</h3>
          {onResolveTargets && (
            <Button variant="secondary" size="sm" onClick={onResolveTargets}>New commits? ({resolveCount})</Button>
          )}
        </div>
        <div>
          {ranked.map((r, i) => <Row key={r.p.pid} r={r} rank={i + 1} pathPrefix={pathPrefix} playStyle={playStyle} model={model} room={roomByGroup[r.group] || []} />)}
        </div>
      </section>
    </div>
  )
}
