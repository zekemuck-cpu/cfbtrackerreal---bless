import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { usePathPrefix } from '../hooks/usePathPrefix'
import { Button, Input } from './ui'

// Calendar Jumper — a NON-DESTRUCTIVE preview tool. It overrides what
// season/phase/week the app *thinks* it's in (via phaseOverride in context)
// WITHOUT writing anything to the dynasty. Jump around freely to test
// each phase's to-dos/forms, then "Exit preview" to return to reality.
// Phase-triggered auto-writes (CFP/bowl shells) are gated off while a
// preview is active, so previewing can never create or change data.

const PHASES = [
  { key: 'preseason', label: 'Preseason' },
  { key: 'regular_season', label: 'Regular Season' },
  { key: 'conference_championship', label: 'Conf. Championship' },
  { key: 'postseason', label: 'Postseason (Bowls / CFP)' },
  { key: 'offseason', label: 'Offseason' },
]

function weekOptions(phase) {
  switch (phase) {
    case 'regular_season': return Array.from({ length: 16 }, (_, i) => i) // 0–15
    case 'postseason': return [1, 2, 3, 4, 5]
    case 'offseason': return [1, 2, 3, 4, 5, 6, 7, 8]
    default: return [0]
  }
}

const QUICK = [
  ['Preseason', 'preseason', 0],
  ['Reg Wk 1', 'regular_season', 1],
  ['Conf Champ', 'conference_championship', 0],
  ['Bowl Wk 1', 'postseason', 1],
  ['Natty', 'postseason', 4],
  ['Offseason', 'offseason', 1],
  ['Signing Day', 'offseason', 6],
]

const selectClass = 'w-full bg-surface-2 border border-surface-4 rounded-md px-2 py-2 text-sm text-txt-primary'

export default function CalendarJumper() {
  const { currentDynasty, phaseOverride, setPhaseOverride } = useDynasty()
  const pathPrefix = usePathPrefix()

  const [year, setYear] = useState(String(currentDynasty?.currentYear ?? ''))
  const [phase, setPhase] = useState(currentDynasty?.currentPhase ?? 'preseason')
  const [week, setWeek] = useState(String(currentDynasty?.currentWeek ?? 0))

  if (!currentDynasty || !setPhaseOverride) return null

  const weeks = weekOptions(phase)
  const setPhaseSafe = (p) => {
    setPhase(p)
    const opts = weekOptions(p)
    if (!opts.includes(Number(week))) setWeek(String(opts[0]))
  }

  const preview = () => setPhaseOverride({ year: Number(year), phase, week: Number(week) })
  const exit = () => setPhaseOverride(null)

  return (
    <div className="space-y-3">
      {phaseOverride ? (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-md"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-warning) 18%, var(--surface-2))', border: '1px solid var(--accent-warning)' }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--accent-warning)' }}>
            PREVIEW · {phaseOverride.year} · {String(phaseOverride.phase).replace(/_/g, ' ')} · wk {phaseOverride.week} — not saved
          </span>
          <Button variant="outline" size="sm" onClick={exit}>Exit preview</Button>
        </div>
      ) : (
        <p className="text-xs text-txt-secondary m-0">
          Real: <strong className="text-txt-primary">{currentDynasty.currentYear}</strong> ·{' '}
          {String(currentDynasty.currentPhase || '').replace(/_/g, ' ')} · week {currentDynasty.currentWeek}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="label-xs text-txt-tertiary block mb-1">Year</label>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="tabular" />
        </div>
        <div>
          <label className="label-xs text-txt-tertiary block mb-1">Phase</label>
          <select value={phase} onChange={(e) => setPhaseSafe(e.target.value)} className={selectClass}>
            {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label-xs text-txt-tertiary block mb-1">Week</label>
          <select value={week} onChange={(e) => setWeek(e.target.value)} className={selectClass}>
            {weeks.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map(([lbl, p, w]) => (
          <Button key={lbl} variant="outline" size="sm" onClick={() => { setPhaseSafe(p); setWeek(String(w)) }}>{lbl}</Button>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <Button variant="primary" size="sm" onClick={preview}>Preview</Button>
        {phaseOverride && <Button variant="outline" size="sm" onClick={exit}>Exit preview</Button>}
        <Link to={pathPrefix} className="btn-refined text-center">Go to Dashboard</Link>
      </div>

      <p className="text-[11px] text-txt-tertiary m-0">
        Non-destructive — this only changes what phase/week the app shows so you can test that point in the calendar. Nothing is saved to the dynasty.
      </p>
    </div>
  )
}
