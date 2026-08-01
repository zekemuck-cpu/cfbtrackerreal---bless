import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty, isPlayerOnRoster } from '../context/DynastyContext'
import { isTargetPlayer, getTargetStatus, isMyTarget } from '../utils/recruitingTargets'
import { useEdition } from '../editions/useEdition'
import { isDynastyBlueprintEnabled } from '../editions'
import { Button, Input } from './ui'
import { useToast } from './ui/Toast'
import {
  getStaffForTeamYear,
  makeCoach,
  upsertCoach,
  deleteCoach,
  removeCoachSeason,
  deriveCoachingStaffNames,
  applyCoachingStaffNames,
  COACH_ROLES,
  COACH_ROLE_LABELS,
} from '../data/coachModel'
import {
  getSeasonEntry,
  getSupportStaff,
  setSupportStaff,
  patchSeasonEntry,
  parseDp,
  getFacilities,
  getFacilityEquipment,
  getCarriedFacilityTier,
  setFacilities,
} from '../data/dynastyPointsModel'
import { sumPlayerNil, setPlayerNil, getPlayerNil } from '../data/playerNilModel'
import { groupForPosition } from '../data/positionGroups'
import PanelErrorBoundary from './PanelErrorBoundary'
import SupportStaffEditor from './SupportStaffEditor'
import FacilitiesEditor from './FacilitiesEditor'
import NilSheet from './NilSheet'
import staffIcon from '../assets/blueprint/staff.png'
import facilitiesIcon from '../assets/blueprint/facilities.png'
import recruitIcon from '../assets/blueprint/recruit.png'
import rosterIcon from '../assets/blueprint/roster.png'
import pointsIcon from '../assets/blueprint/points.png'

// Dynasty Points Blueprint — an INPUT-DRIVEN tracker (CFB 27 only),
// rendered as the Program Overview tab on the Team page.
//
// Modeled on the in-game "Program Overview / Dynasty Point Allocation"
// screen: a donut of the budget split + a color-coded lane list. We do
// NOT simulate EA's math — the user types the budget + each lane's spend;
// the donut, percentages, and Unspent all derive. The season comes from
// the Team page (`year` prop), so there's no year picker here.

const fmt = (n) => (n == null || n === '' || isNaN(n) ? '—' : Number(n).toLocaleString())

// In-game position-group order for the Roster NIL breakdown (K + P shown as K/P).
const POS_GROUP_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K/P', 'Other']
const nilGroupOf = (player) => {
  const g = groupForPosition(player?.position)
  if (g === 'K' || g === 'P') return 'K/P'
  return g || 'Other'
}

// A clickable position-group chip — doubles as the breakdown (shows group NIL)
// and the filter (click to focus the sheet on that group).
function NilGroupChip({ label, total, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${active ? 'bg-surface-3 text-txt-primary' : 'bg-surface-2 text-txt-secondary hover:bg-surface-3'}`}
      style={{ border: '1px solid var(--surface-4)' }}
    >
      <span className="font-semibold">{label}</span>
      <span className="tabular-nums text-txt-tertiary">{fmt(total)}</span>
    </button>
  )
}

const LANE_COLORS = {
  staff: '#3b82f6',
  facilities: '#a855f7',
  recruitingNil: '#f97316',
  rosterNil: '#eab308',
}
const UNSPENT_COLOR = '#52525b'

const LANE_ICONS = {
  staff: staffIcon,
  facilities: facilitiesIcon,
  recruitingNil: recruitIcon,
  rosterNil: rosterIcon,
}

function LaneIcon({ laneKey, className = 'w-6 h-6' }) {
  if (laneKey === 'unspent') {
    return <img src={pointsIcon} alt="" className={`${className} object-contain flex-shrink-0`} />
  }
  return <img src={LANE_ICONS[laneKey]} alt="" className={`${className} rounded-md object-cover flex-shrink-0`} />
}

function Donut({ segments, budget, unspent, size = 200, stroke = 24 }) {
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const total = budget && budget > 0 ? budget : 0
  let offset = 0
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          {total > 0 && segments.map((s) => {
            if (!s.value || s.value <= 0) return null
            const len = (s.value / total) * circumference
            const el = (
              <circle
                key={s.key}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1px' }}>Dynasty Points Budget</span>
        <span className="font-outfit font-black tabular-nums text-3xl text-txt-primary leading-none mt-1.5">
          {budget == null ? '—' : fmt(Math.max(0, unspent ?? 0))}
        </span>
        <span className="text-xs text-txt-tertiary tabular-nums mt-0.5">/ {fmt(budget)}</span>
      </div>
    </div>
  )
}

function DynastyBlueprintPanelInner({ year, tid }) {
  const { currentDynasty, updateDynasty, updatePlayer, isViewOnly } = useDynasty()
  const { config } = useEdition()
  const { toast } = useToast()

  const [showAddCoach, setShowAddCoach] = useState(false)
  const [newCoach, setNewCoach] = useState({ name: '', role: 'OC', level: '', salary: '' })

  const lanes = config?.dynastyPoints?.lanes ?? []
  const supportStaffEffects = config?.dynastyPoints?.supportStaff?.effects ?? []
  const selectedYear = Number(year ?? currentDynasty?.currentYear)

  const blankForm = { budget: '', staff: '', facilities: '', recruitingNil: '', rosterNil: '' }
  const [form, setForm] = useState(blankForm)
  const [saving, setSaving] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  // Which spend category's detail panel is open on the right (Program Overview style).
  const [category, setCategory] = useState('staff')
  // Roster NIL position-group filter ('ALL' or a group key from POS_GROUP_ORDER).
  const [rosterPosFilter, setRosterPosFilter] = useState('ALL')

  // Hydrate the form whenever the season (or its stored data) changes.
  useEffect(() => {
    const stored = getSeasonEntry(currentDynasty, selectedYear, tid)
    if (!stored) {
      setForm(blankForm)
      return
    }
    const a = stored.allocations || {}
    setForm({
      budget: stored.budget ?? '',
      staff: a.staff ?? '',
      facilities: a.facilities ?? '',
      recruitingNil: a.recruitingNil ?? '',
      rosterNil: a.rosterNil ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, tid, currentDynasty?.lastModified])

  // Edition enables Dynasty Points AND the user hasn't hidden Blueprint. Also
  // covers a stale deep-link to ?tab=blueprint after hiding — the panel just
  // renders nothing.
  if (!isDynastyBlueprintEnabled(currentDynasty)) return null

  // Coaching staff for this team-season (derived from dynasty.coaches).
  const staff = tid != null ? getStaffForTeamYear(currentDynasty, tid, selectedYear) : []
  // Support staff recorded for this season (hired preseason-only in-game).
  const supportStaff = getSupportStaff(currentDynasty, selectedYear, tid)
  // The Staff allocation lane is AUTO-DERIVED: every coach's salary + every
  // support-staff cost this season. Add/edit either and the budget updates live.
  const coachSalaryTotal = staff.reduce((sum, { record }) => sum + (Number(record.salary) || 0), 0)
  const supportStaffTotal = supportStaff.reduce((sum, s) => sum + (Number(s.cost) || 0), 0)
  const staffTotal = coachSalaryTotal + supportStaffTotal

  const resetAddCoach = () => {
    setShowAddCoach(false)
    setNewCoach({ name: '', role: 'OC', level: '', salary: '' })
  }

  const handleAddCoach = async () => {
    if (isViewOnly || !newCoach.name.trim() || tid == null) return
    const coach = makeCoach({
      name: newCoach.name,
      year: selectedYear,
      teamTid: tid,
      role: newCoach.role,
      level: newCoach.level,
      salary: newCoach.salary,
    })
    try {
      const nextCoaches = upsertCoach(currentDynasty.coaches, coach)
      // Bridge: mirror the tracked coordinators' names into the legacy
      // coachingStaff fields so the team-header popup + Dashboard reflect them.
      const names = deriveCoachingStaffNames(nextCoaches, tid, selectedYear)
      const nextTeams = applyCoachingStaffNames(currentDynasty.teams, tid, selectedYear, names)
      await updateDynasty(currentDynasty.id, { coaches: nextCoaches, teams: nextTeams })
      resetAddCoach()
      toast.success('Added coach')
    } catch (err) {
      console.error('[DynastyBlueprintPanel] add coach failed:', err)
      toast.error('Failed to add coach.')
    }
  }

  // Remove a coach from THIS season. If that empties their record, drop the
  // coach entity entirely; otherwise keep them (they have other seasons).
  const handleRemoveFromStaff = async (cid) => {
    if (isViewOnly) return
    const coach = currentDynasty.coaches?.[cid]
    if (!coach) return
    const removedRole = coach.byYear?.[String(selectedYear)]?.role
    const updated = removeCoachSeason(coach, selectedYear)
    const nextCoaches = Object.keys(updated.byYear || {}).length === 0
      ? deleteCoach(currentDynasty.coaches, cid)
      : upsertCoach(currentDynasty.coaches, updated)
    try {
      // Bridge: clear the removed role's legacy name if no cid coach fills it now.
      const names = deriveCoachingStaffNames(nextCoaches, tid, selectedYear, {
        clearRoles: removedRole ? [removedRole] : [],
      })
      const nextTeams = applyCoachingStaffNames(currentDynasty.teams, tid, selectedYear, names)
      await updateDynasty(currentDynasty.id, { coaches: nextCoaches, teams: nextTeams })
    } catch (err) {
      console.error('[DynastyBlueprintPanel] remove coach failed:', err)
      toast.error('Failed to remove coach.')
    }
  }

  // Promote an existing legacy-named coordinator into a tracked cid coach,
  // pre-filling the add form with the name + role so salary can be added.
  const handleTrackLegacy = (role, name) => {
    if (isViewOnly) return
    setNewCoach({ name: name || '', role, level: '', salary: '' })
    setShowAddCoach(true)
  }

  // Support staff are stored on the season's Blueprint entry. Merge-write so
  // the budget/allocations on that entry are preserved (and vice-versa).
  const writeSupportStaff = async (next) => {
    await updateDynasty(currentDynasty.id, { dynastyPoints: setSupportStaff(currentDynasty, selectedYear, next, tid) })
  }

  const handleAddSupportStaff = async (item) => {
    if (isViewOnly) return
    try {
      await writeSupportStaff([...supportStaff, item])
      toast.success('Added support staff')
    } catch (err) {
      console.error('[DynastyBlueprintPanel] add support staff failed:', err)
      toast.error('Failed to add support staff.')
    }
  }

  const handleRemoveSupportStaff = async (idx) => {
    if (isViewOnly) return
    try {
      await writeSupportStaff(supportStaff.filter((_, i) => i !== idx))
    } catch (err) {
      console.error('[DynastyBlueprintPanel] remove support staff failed:', err)
      toast.error('Failed to remove support staff.')
    }
  }

  // ── Facilities ────────────────────────────────────────────────────────
  const facilityTiers = config?.dynastyPoints?.facilities?.tiers ?? []
  const equipmentEffects = config?.dynastyPoints?.facilities?.equipmentEffects ?? []
  const equipmentTiers = config?.dynastyPoints?.facilities?.equipmentTiers ?? []
  const facilities = getFacilities(currentDynasty, selectedYear, tid)
  const facilityEquipment = getFacilityEquipment(currentDynasty, selectedYear, tid)
  const carriedFacilityTier = getCarriedFacilityTier(currentDynasty, selectedYear, tid)
  // The active tier (explicit for this year, else carried from a prior season).
  const activeFacilityTier = facilityTiers.find((t) => t.key === (facilities.tier || carriedFacilityTier)) || null

  // Merge-write facilities so tier vs grade vs equipment never clobber each other.
  const writeFacilities = async (patch) => {
    if (isViewOnly) return
    try {
      await updateDynasty(currentDynasty.id, { dynastyPoints: setFacilities(currentDynasty, selectedYear, patch, tid) })
    } catch (err) {
      console.error('[DynastyBlueprintPanel] facilities write failed:', err)
      toast.error('Failed to save facilities.')
    }
  }
  const handleSelectTier = (tier) => writeFacilities({ tier })
  const handleSetGrade = (grade) => writeFacilities({ grade })
  const handleAddEquipment = (item) => writeFacilities({ equipment: [...facilityEquipment, item] })
  const handleUpdateEquipment = (idx, item) => writeFacilities({ equipment: facilityEquipment.map((eq, i) => (i === idx ? item : eq)) })
  const handleRemoveEquipment = (idx) => writeFacilities({ equipment: facilityEquipment.filter((_, i) => i !== idx) })

  // ── NIL (per-player; both lanes auto-derive from these, like Staff) ──────
  const allPlayers = currentDynasty?.players ?? []
  // Recruiting NIL = open/committed-to-you targets whose CLASS YEAR is this
  // Blueprint season (lost-to-another-school targets drop out — the in-game
  // refund). Targets are filed by class year (targetYear); a committed recruit
  // enrolls at targetYear+1. Keying both lanes off the SAME season guarantees a
  // player is in exactly one lane per season — a target in season Y (not yet on
  // the roster) or a roster player in Y (no longer a target) — so nothing is
  // double-counted, and the carry-forward (offer → enroll-year roster NIL) lands
  // cleanly in the next season's Roster NIL.
  // isMyTarget: in a shared league every member's targets live in the same
  // players array, so NIL spend must only count this team's board.
  const isOpenOrOurs = (p, y) => isTargetPlayer(p) && isMyTarget(p, tid) && Number(p.targetYear) === y && getTargetStatus(p, tid) !== 'committed_elsewhere'
  const recruitTargets = tid == null ? [] : allPlayers.filter((p) => isOpenOrOurs(p, selectedYear))
  // Roster NIL: normally the players on the roster in `selectedYear`. But at end
  // of season the "Set {nextYear} Roster NIL" flow opens the blueprint for
  // nextYear BEFORE the year is advanced — and returning players don't get
  // teamsByYear[nextYear] until the advance-week carryover, so only committed
  // recruits (who get it at commit time) would show. When selectedYear is that
  // not-yet-advanced next year, also include the current (selectedYear-1) roster
  // so you can set NIL for returning players before they carry over. Recruits
  // already resolve via the nextYear membership, and returning players are never
  // targets, so the two lanes still can't double-count.
  const isProjectedNextYear = selectedYear === Number(currentDynasty?.currentYear) + 1
  const rosterPlayers = tid == null ? [] : allPlayers.filter((p) =>
    isPlayerOnRoster(p, tid, selectedYear, currentDynasty) ||
    (isProjectedNextYear && isPlayerOnRoster(p, tid, selectedYear - 1, currentDynasty))
  )
  const recruitingNilTotal = sumPlayerNil(recruitTargets, selectedYear)
  const rosterNilTotal = sumPlayerNil(rosterPlayers, selectedYear)

  // Roster NIL by position group (the Team Stats "NIL spend" view, for your team)
  // — also the filter for the sheet below. Computed from positions + nilByYear.
  const rosterGroupTotals = {}
  rosterPlayers.forEach((p) => {
    const g = nilGroupOf(p)
    rosterGroupTotals[g] = (rosterGroupTotals[g] || 0) + (getPlayerNil(p, selectedYear) || 0)
  })
  const rosterGroupsPresent = POS_GROUP_ORDER.filter((g) => rosterPlayers.some((p) => nilGroupOf(p) === g))
  const filteredRosterPlayers = rosterPosFilter === 'ALL'
    ? rosterPlayers
    : rosterPlayers.filter((p) => nilGroupOf(p) === rosterPosFilter)
  const filteredRosterTotal = rosterPosFilter === 'ALL' ? rosterNilTotal : (rosterGroupTotals[rosterPosFilter] || 0)

  // Discoverability: the recruiting board files a class under its class year,
  // which (per the Recruiting redirect) often isn't the season you're playing.
  // If this season has no targets but an adjacent class does, point the user to it.
  const adjacentTargetYear = (tid != null && recruitTargets.length === 0)
    ? [selectedYear - 1, selectedYear + 1].find((y) => allPlayers.some((p) => isOpenOrOurs(p, y)))
    : null

  // Single-doc write of one player's NIL for a season (curried; both lanes use
  // the Blueprint season since targets are keyed by their class year == season).
  const handleSaveNil = (yearKey) => async (player, amount) => {
    if (isViewOnly) return
    try {
      await updatePlayer(currentDynasty.id, setPlayerNil(player, yearKey, amount))
    } catch (err) {
      console.error('[DynastyBlueprintPanel] save NIL failed:', err)
      toast.error('Failed to save NIL.')
    }
  }
  const starMeta = (p) => (p.stars ? `${p.stars}★` : '—')
  const ovrMeta = (p) => p.overallByYear?.[String(selectedYear)] ?? p.overallByYear?.[selectedYear] ?? p.overall ?? '—'

  const budget = parseDp(form.budget)
  // Staff + both NIL lanes auto-derive; only Facilities is a manual lane input.
  const laneValues = lanes.map((l) => {
    if (l.key === 'staff') return staffTotal
    if (l.key === 'recruitingNil') return recruitingNilTotal
    if (l.key === 'rosterNil') return rosterNilTotal
    return parseDp(form[l.key]) ?? 0
  })
  const allocated = laneValues.reduce((s, v) => s + v, 0)
  const unspent = budget == null ? null : budget - allocated
  const overspent = unspent != null && unspent < 0

  const pctOf = (v) => (budget && budget > 0 ? Math.round((v / budget) * 100) : null)

  const segments = [
    ...lanes.map((l, i) => ({ key: l.key, value: laneValues[i], color: LANE_COLORS[l.key] })),
    { key: 'unspent', value: unspent != null && unspent > 0 ? unspent : 0, color: UNSPENT_COLOR },
  ]

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async ({ silent = false } = {}) => {
    if (isViewOnly) return
    setSaving(true)
    try {
      // patchSeasonEntry merge-preserves supportStaff (and anything else) on
      // the season entry — only budget + allocations are replaced here.
      const nextDynastyPoints = patchSeasonEntry(currentDynasty, selectedYear, {
        budget,
        allocations: {
          staff: staffTotal,            // auto: coach salaries + support-staff costs
          facilities: parseDp(form.facilities),
          recruitingNil: recruitingNilTotal, // auto: sum of target NIL offers
          rosterNil: rosterNilTotal,    // auto: sum of roster NIL
        },
      }, tid)
      await updateDynasty(currentDynasty.id, { dynastyPoints: nextDynastyPoints })
      if (!silent) toast.success(`Saved ${selectedYear} Blueprint`)
    } catch (err) {
      console.error('[DynastyBlueprintPanel] save failed:', err)
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Auto-save when a field loses focus (budget pencil, lane inputs) so edits
  // persist without needing the explicit Save button — matching how coaches and
  // support staff already save immediately.
  const commitField = () => { handleSave({ silent: true }) }

  // Left-nav spend categories (mirrors the in-game Dynasty Blueprint nav).
  const CATEGORY_ICONS = { staff: staffIcon, facilities: facilitiesIcon, recruitingNil: recruitIcon, rosterNil: rosterIcon }
  const CATEGORIES = [
    { key: 'staff', label: 'Manage Staff', desc: 'Coordinators & support staff.' },
    { key: 'facilities', label: 'Manage Facilities', desc: 'Facility tier & equipment spend.' },
    { key: 'recruitingNil', label: 'Recruiting NIL', desc: 'NIL for high-school & transfer recruits.' },
    { key: 'rosterNil', label: 'Manage Roster NIL', desc: 'NIL to retain your current roster.' },
  ]

  // Coaching-staff list (HC/OC/DC slots) — rendered inside the Staff detail panel.
  const renderCoachingStaff = () => {
    if (tid == null) return null
    const legacyStaff = currentDynasty?.teams?.[tid]?.byYear?.[String(selectedYear)]?.coachingStaff || {}
    const usedCids = new Set()
    const slotFor = (role) => {
      const entry = staff.find((s) => s.record.role === role && !usedCids.has(s.coach.cid))
      if (entry) usedCids.add(entry.coach.cid)
      return entry
    }
    const roleDefs = [
      { role: 'HC', field: 'hcName', entry: slotFor('HC') },
      { role: 'OC', field: 'ocName', entry: slotFor('OC') },
      { role: 'DC', field: 'dcName', entry: slotFor('DC') },
    ]
    const extras = staff.filter((s) => !usedCids.has(s.coach.cid))

    const trackedRow = (coach, record) => (
      <div key={coach.cid} className="flex items-center gap-3 py-2.5 border-b border-surface-3">
        <span className="w-9 flex-shrink-0 text-xs font-bold text-txt-tertiary">{record.role}</span>
        <Link to={`/dynasty/${currentDynasty.id}/coach/${coach.cid}`} className="flex-1 min-w-0 text-sm font-semibold text-txt-primary hover:underline truncate">
          {coach.name || 'Unnamed coach'}
        </Link>
        {record.level != null && <span className="text-xs text-txt-tertiary tabular-nums flex-shrink-0">Lvl {record.level}</span>}
        <span className="flex items-center gap-1 tabular-nums text-sm text-txt-primary w-20 justify-end flex-shrink-0">
          <img src={pointsIcon} alt="" className="w-4 h-4 object-contain" />
          {record.salary == null ? '—' : fmt(record.salary)}
        </span>
        {!isViewOnly && (
          <button type="button" onClick={() => handleRemoveFromStaff(coach.cid)} className="text-xs text-txt-tertiary hover:text-[color:var(--accent-error)] flex-shrink-0 w-14 text-right">Remove</button>
        )}
      </div>
    )

    return (
      <div>
        {roleDefs.map(({ role, field, entry }) => {
          if (entry) return trackedRow(entry.coach, entry.record)
          const legacyName = legacyStaff[field]
          return (
            <div key={role} className="flex items-center gap-3 py-2.5 border-b border-surface-3">
              <span className="w-9 flex-shrink-0 text-xs font-bold text-txt-tertiary">{role}</span>
              <div className="flex-1 min-w-0">
                {legacyName ? <span className="text-sm font-semibold text-txt-primary truncate block">{legacyName}</span>
                  : <span className="text-sm text-txt-tertiary">{COACH_ROLE_LABELS[role]}</span>}
              </div>
              {!isViewOnly && role !== 'HC' && (
                <button type="button" onClick={() => handleTrackLegacy(role, legacyName || '')} className="text-xs text-txt-secondary hover:text-txt-primary flex-shrink-0">
                  {legacyName ? '+ Track salary' : '+ Add'}
                </button>
              )}
            </div>
          )
        })}
        {extras.map(({ coach, record }) => trackedRow(coach, record))}

        {showAddCoach && (
          <div className="mt-3 p-3 rounded-md" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-5"><Input value={newCoach.name} onChange={(e) => setNewCoach({ ...newCoach, name: e.target.value })} placeholder="Coach name" autoFocus /></div>
              <div className="sm:col-span-2">
                <select value={newCoach.role} onChange={(e) => setNewCoach({ ...newCoach, role: e.target.value })} className="w-full bg-surface-2 border border-surface-4 rounded-md px-2 py-2 text-sm text-txt-primary">
                  {COACH_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2"><Input type="number" min="0" value={newCoach.level} onChange={(e) => setNewCoach({ ...newCoach, level: e.target.value })} placeholder="Level" className="tabular text-right" /></div>
              <div className="sm:col-span-3"><Input type="number" min="0" value={newCoach.salary} onChange={(e) => setNewCoach({ ...newCoach, salary: e.target.value })} placeholder="Salary" className="tabular text-right" /></div>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={resetAddCoach}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleAddCoach} disabled={!newCoach.name.trim()}>Add</Button>
            </div>
          </div>
        )}
        {!isViewOnly && !showAddCoach && (
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => { setNewCoach({ name: '', role: 'OC', level: '', salary: '' }); setShowAddCoach(true) }}>+ Add another</Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="py-2">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-4">
        {/* Dynasty Point Allocation — click a lane to manage that category */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4 pb-4" style={{ borderBottom: '1px solid var(--surface-3)' }}>
            <img src={pointsIcon} alt="Dynasty Points Budget" className="w-8 h-8 object-contain flex-shrink-0" />
            {editingBudget ? (
              <div className="w-44">
                <Input
                  type="number"
                  min="0"
                  value={form.budget}
                  onChange={(e) => setField('budget', e.target.value)}
                  onBlur={() => { setEditingBudget(false); commitField() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setEditingBudget(false); commitField() } }}
                  autoFocus
                  disabled={isViewOnly}
                  className="tabular"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { if (!isViewOnly) setEditingBudget(true) }}
                disabled={isViewOnly}
                className="flex items-center gap-2 group disabled:cursor-default"
              >
                <span className="font-outfit font-black tabular-nums text-2xl leading-none text-txt-primary">
                  {form.budget === '' || form.budget == null ? 'Set budget' : fmt(parseDp(form.budget))}
                </span>
                {!isViewOnly && (
                  <svg className="w-4 h-4 text-txt-tertiary group-hover:text-txt-secondary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                )}
              </button>
            )}
          </div>

          <p className="label-xs text-txt-tertiary mb-3" style={{ letterSpacing: '1px' }}>Dynasty Point Allocation</p>

          <div className="flex flex-col md:flex-row items-center gap-5">
            <div className="flex-1 w-full">
              {lanes.map((l, i) => {
                const val = laneValues[i]
                const pct = pctOf(val)
                const active = category === l.key
                return (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => setCategory(l.key)}
                    className={`w-full flex items-center gap-3 py-2 px-1.5 rounded-md text-left transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
                  >
                    <LaneIcon laneKey={l.key} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-txt-primary leading-tight truncate">{l.label}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-outfit font-black tabular-nums text-base text-txt-primary leading-none">{fmt(val)}</div>
                      <div className="text-[11px] tabular-nums text-txt-tertiary mt-0.5">{pct == null ? '—' : `${pct}%`}</div>
                    </div>
                  </button>
                )
              })}

              <div className="flex items-center gap-3 py-2 px-1.5 mt-1" style={{ borderTop: '1px solid var(--surface-3)' }}>
                <LaneIcon laneKey="unspent" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-txt-primary leading-tight">Unspent</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-outfit font-black tabular-nums text-base leading-none" style={{ color: overspent ? 'var(--accent-error)' : 'var(--text-primary)' }}>
                    {unspent == null ? '—' : fmt(unspent)}
                  </div>
                  <div className="text-[11px] tabular-nums text-txt-tertiary mt-0.5">{pctOf(unspent) == null ? '' : `${pctOf(unspent)}%`}</div>
                </div>
              </div>
            </div>

            <Donut segments={segments} budget={budget} unspent={unspent} />
          </div>
        </div>

        {/* RIGHT — selected-category detail */}
        <div className="card p-4 sm:p-5">
          {category === 'staff' ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <img src={staffIcon} alt="" className="w-6 h-6 rounded-md object-cover" />
                  <span className="font-display font-bold uppercase tracking-wide text-sm text-txt-primary">Staff</span>
                </div>
                <span className="flex items-center gap-1 tabular-nums font-bold text-txt-primary">
                  <img src={pointsIcon} alt="" className="w-4 h-4 object-contain" />{fmt(staffTotal)}
                </span>
              </div>

              <div className="py-3 mb-4 space-y-2" style={{ borderTop: '1px solid var(--surface-3)', borderBottom: '1px solid var(--surface-3)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-txt-secondary">Coaching Staff</span>
                  <span className="flex items-center gap-1 tabular-nums text-sm text-txt-primary"><img src={pointsIcon} alt="" className="w-4 h-4 object-contain" />{fmt(coachSalaryTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-txt-secondary">Support Staff</span>
                  <span className="flex items-center gap-1 tabular-nums text-sm text-txt-primary"><img src={pointsIcon} alt="" className="w-4 h-4 object-contain" />{fmt(supportStaffTotal)}</span>
                </div>
              </div>

              <p className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1px' }}>Coordinators</p>
              {renderCoachingStaff()}

              <p className="label-xs text-txt-tertiary mt-6 mb-2" style={{ letterSpacing: '1px' }}>Support Staff</p>
              <SupportStaffEditor
                supportStaff={supportStaff}
                effects={supportStaffEffects}
                onAdd={handleAddSupportStaff}
                onRemove={handleRemoveSupportStaff}
                isViewOnly={isViewOnly}
              />
            </>
          ) : category === 'facilities' ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <img src={facilitiesIcon} alt="" className="w-6 h-6 rounded-md object-cover" />
                  <span className="font-display font-bold uppercase tracking-wide text-sm text-txt-primary">Facilities</span>
                </div>
                <span className="flex items-center gap-1 tabular-nums font-bold text-txt-primary">
                  <img src={pointsIcon} alt="" className="w-4 h-4 object-contain" />{fmt(parseDp(form.facilities) ?? 0)}
                </span>
              </div>

              <div className="py-3 mb-4" style={{ borderTop: '1px solid var(--surface-3)', borderBottom: '1px solid var(--surface-3)' }}>
                <label className="label-xs text-txt-tertiary block mb-1.5">Facilities Spend (DP)</label>
                <Input
                  type="number"
                  min="0"
                  value={form.facilities ?? ''}
                  onChange={(e) => setField('facilities', e.target.value)}
                  onBlur={commitField}
                  placeholder="0"
                  disabled={isViewOnly}
                  className="tabular text-right"
                />
                {activeFacilityTier && (
                  <p className="text-[11px] text-txt-tertiary mt-2">
                    {activeFacilityTier.label} · annual maintenance {fmt(activeFacilityTier.annualCost)} DP
                  </p>
                )}
              </div>

              <FacilitiesEditor
                facilities={facilities}
                tiers={facilityTiers}
                equipmentEffects={equipmentEffects}
                equipmentTiers={equipmentTiers}
                carriedTier={carriedFacilityTier}
                onSelectTier={handleSelectTier}
                onSetGrade={handleSetGrade}
                onAddEquipment={handleAddEquipment}
                onUpdateEquipment={handleUpdateEquipment}
                onRemoveEquipment={handleRemoveEquipment}
                isViewOnly={isViewOnly}
              />
            </>
          ) : category === 'recruitingNil' ? (
            <NilSheet
              title="Recruiting NIL"
              icon={recruitIcon}
              rows={recruitTargets.map((p) => ({ player: p, meta: starMeta(p) }))}
              year={selectedYear}
              dynastyId={currentDynasty.id}
              total={recruitingNilTotal}
              metaLabel="Stars"
              onSave={handleSaveNil(selectedYear)}
              isViewOnly={isViewOnly}
              emptyMessage={adjacentTargetYear
                ? `No targets filed under ${selectedYear}. Your tracked recruiting class is under the ${adjacentTargetYear} season — switch the year (top of the team page) to manage their NIL.`
                : "No tracked recruiting targets for this class. Add prospects on the Recruiting board, then set each one's NIL offer here."}
            />
          ) : category === 'rosterNil' ? (
            <>
              {/* Position-group NIL breakdown — click a group to filter the sheet. */}
              {rosterPlayers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <NilGroupChip label="All" total={rosterNilTotal} active={rosterPosFilter === 'ALL'} onClick={() => setRosterPosFilter('ALL')} />
                  {rosterGroupsPresent.map((g) => (
                    <NilGroupChip key={g} label={g} total={rosterGroupTotals[g] || 0} active={rosterPosFilter === g} onClick={() => setRosterPosFilter(g)} />
                  ))}
                </div>
              )}
              <NilSheet
                title="Roster NIL"
                icon={rosterIcon}
                rows={filteredRosterPlayers.map((p) => ({ player: p, meta: ovrMeta(p) }))}
                year={selectedYear}
                dynastyId={currentDynasty.id}
                total={filteredRosterTotal}
                metaLabel="OVR"
                onSave={handleSaveNil(selectedYear)}
                isViewOnly={isViewOnly}
                emptyMessage="No players on the roster for this season yet."
              />
            </>
          ) : (() => {
            const c = CATEGORIES.find((x) => x.key === category)
            const suggested = lanes.find((l) => l.key === category)?.suggestedPct
            return (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <img src={CATEGORY_ICONS[category]} alt="" className="w-6 h-6 rounded-md object-cover" />
                  <span className="font-display font-bold uppercase tracking-wide text-sm text-txt-primary">{c?.label}</span>
                </div>
                <p className="text-xs text-txt-tertiary mb-4">{c?.desc}</p>
                <label className="label-xs text-txt-tertiary block mb-1.5">Allocated (DP)</label>
                <Input
                  type="number"
                  min="0"
                  value={form[category] ?? ''}
                  onChange={(e) => setField(category, e.target.value)}
                  onBlur={commitField}
                  placeholder="0"
                  disabled={isViewOnly}
                  className="tabular text-right"
                />
                {suggested != null && <p className="text-[11px] text-txt-tertiary mt-2">Suggested {suggested}% of budget</p>}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// Wrap the panel so a single malformed data record (a bad player/coach/NIL
// entry) can't black out the whole team page. The dynasty routes are only
// under <Suspense>, which does not catch render throws — without this a throw
// here left the user on a blank screen until a full reload.
export default function DynastyBlueprintPanel(props) {
  return (
    <PanelErrorBoundary name="DynastyBlueprintPanel" label="the Dynasty Blueprint">
      <DynastyBlueprintPanelInner {...props} />
    </PanelErrorBoundary>
  )
}
