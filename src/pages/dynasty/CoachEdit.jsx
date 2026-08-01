import { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { useEdition } from '../../editions/useEdition'
import { Button, Input } from '../../components/ui'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useToast } from '../../components/ui/Toast'
import ImageUpload from '../../components/ImageUpload'
import {
  getCoach,
  upsertCoach,
  setCoachSeason,
  removeCoachSeason,
  deriveCoachingStaffNames,
  applyCoachingStaffNames,
  COACH_ROLES,
} from '../../data/coachModel'

// Coach editor — the separate edit page (matches PlayerEdit). Reached via
// the pencil on the coach profile. Edits name + per-season team/role/level/
// salary, persists to dynasty.coaches[cid], bridges legacy names, then
// navigates back to the coach view.
export default function CoachEdit() {
  const { id, cid } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { features } = useEdition()
  const { toast } = useToast()

  const coach = getCoach(currentDynasty, cid)

  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!coach) {
      setDraft(null)
      return
    }
    setDraft({
      ...coach,
      byYear: Object.fromEntries(Object.entries(coach.byYear || {}).map(([y, r]) => [y, { ...r }])),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, currentDynasty?.lastModified])

  const teamOptions = useMemo(() => {
    const teams = currentDynasty?.teams || {}
    return Object.values(teams)
      .filter((t) => t && t.tid != null)
      .map((t) => ({ tid: Number(t.tid), name: t.name || t.abbr || `Team ${t.tid}` }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currentDynasty?.teams])

  const backToCoach = () => navigate(`${pathPrefix}/coach/${cid}`)

  if (!currentDynasty) return null

  if (!coach || !draft) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <div className="card p-6">
          <h1 className="display-sm text-txt-primary m-0 mb-2">Coach not found</h1>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => navigate(pathPrefix)}>Back</Button>
          </div>
        </div>
      </div>
    )
  }

  const salaryLabel = 'Salary'
  const seasonYears = Object.keys(draft.byYear || {}).map(Number).sort((a, b) => a - b)

  const setSeasonField = (year, field, value) => setDraft((d) => setCoachSeason(d, year, { [field]: value }))

  const addSeason = () => {
    const next = seasonYears.length ? Math.max(...seasonYears) + 1 : Number(currentDynasty.currentYear)
    const lastRec = seasonYears.length ? draft.byYear[String(Math.max(...seasonYears))] : {}
    setDraft((d) =>
      setCoachSeason(d, next, {
        teamTid: lastRec?.teamTid ?? currentDynasty.currentTid ?? null,
        role: lastRec?.role ?? 'OC',
        level: null,
        salary: null,
      })
    )
  }

  const removeSeason = (year) => setDraft((d) => removeCoachSeason(d, year))

  const handleSave = async () => {
    if (isViewOnly) return
    setSaving(true)
    try {
      const cleanByYear = {}
      for (const [y, r] of Object.entries(draft.byYear || {})) {
        cleanByYear[y] = {
          teamTid: r.teamTid != null && r.teamTid !== '' ? Number(r.teamTid) : null,
          role: r.role || 'OC',
          level: r.level != null && r.level !== '' ? Number(r.level) : null,
          salary: r.salary != null && r.salary !== '' ? Number(r.salary) : null,
          ...(r.hiredVia ? { hiredVia: r.hiredVia } : {}),
        }
      }
      const nextCoach = { ...coach, name: (draft.name || '').trim(), pictureUrl: (draft.pictureUrl || '').trim() || null, byYear: cleanByYear }
      const nextCoaches = upsertCoach(currentDynasty.coaches, nextCoach)
      let nextTeams = currentDynasty.teams
      for (const [y, r] of Object.entries(cleanByYear)) {
        if (r.teamTid == null) continue
        const names = deriveCoachingStaffNames(nextCoaches, r.teamTid, y)
        nextTeams = applyCoachingStaffNames(nextTeams, r.teamTid, y, names)
      }
      // Only include `teams` in the write when it actually changed. A
      // name/photo-only edit doesn't touch the coaching-staff-name mirror, so
      // sending the whole (potentially large) teams map every save is pure
      // bloat — and on a big dynasty it needlessly pushes the main-doc write
      // toward Firestore's 1 MB cap.
      const updates = { coaches: nextCoaches }
      if (nextTeams !== currentDynasty.teams) updates.teams = nextTeams
      await updateDynasty(currentDynasty.id, updates)
      toast.success('Saved coach')
      backToCoach()
    } catch (err) {
      console.error('[CoachEdit] save failed:', err)
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isViewOnly) {
    // Editing isn't available in read-only mode — bounce to the view.
    backToCoach()
    return null
  }

  return (
    <div className="max-w-3xl mx-auto py-6 sm:py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="display-md text-txt-primary truncate m-0 leading-tight">Edit Coach</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={backToCoach} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Name + photo */}
      <div className="card p-4 sm:p-5 mb-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-2">Coach Name</label>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Coach name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-txt-primary mb-2">Coach Photo</label>
          <ImageUpload
            value={draft.pictureUrl || ''}
            onChange={(url) => setDraft((d) => ({ ...d, pictureUrl: url }))}
          />
        </div>
      </div>

      {/* Career by season */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
          <h2 className="font-display font-bold uppercase tracking-wide text-sm text-txt-primary m-0">Career By Season</h2>
          <Button variant="outline" size="sm" onClick={addSeason}>+ Add Season</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-3 text-txt-tertiary text-left">
                <th className="py-2.5 px-4 font-semibold uppercase text-[11px] tracking-wide">Season</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide">Team</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide">Role</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide text-right">Level</th>
                <th className="py-2.5 px-3 font-semibold uppercase text-[11px] tracking-wide text-right">{salaryLabel}</th>
                <th className="py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {seasonYears.length === 0 && (
                <tr><td colSpan={6} className="py-5 text-center text-txt-tertiary text-sm">No seasons yet. Add one above.</td></tr>
              )}
              {seasonYears.map((y, idx) => {
                const r = draft.byYear[String(y)]
                return (
                  <tr key={y} style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface-2)', borderTop: '1px solid var(--surface-3)' }}>
                    <td className="py-2 px-4 text-txt-primary font-bold tabular-nums">{y}</td>
                    <td className="py-2 px-3">
                      <select
                        value={r.teamTid ?? ''}
                        onChange={(e) => setSeasonField(y, 'teamTid', e.target.value)}
                        className="bg-surface-2 border border-surface-4 rounded-md px-2 py-1.5 text-sm text-txt-primary max-w-[12rem]"
                      >
                        <option value="">—</option>
                        {teamOptions.map((t) => <option key={t.tid} value={t.tid}>{t.name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={r.role || 'OC'}
                        onChange={(e) => setSeasonField(y, 'role', e.target.value)}
                        className="bg-surface-2 border border-surface-4 rounded-md px-2 py-1.5 text-sm text-txt-primary"
                      >
                        {COACH_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="w-16 ml-auto">
                        <Input type="number" min="0" value={r.level ?? ''} onChange={(e) => setSeasonField(y, 'level', e.target.value)} className="tabular text-right" />
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="w-20 ml-auto">
                        <Input type="number" min="0" value={r.salary ?? ''} onChange={(e) => setSeasonField(y, 'salary', e.target.value)} className="tabular text-right" />
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button type="button" onClick={() => removeSeason(y)} className="text-xs text-txt-tertiary hover:text-[color:var(--accent-error)]">Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
