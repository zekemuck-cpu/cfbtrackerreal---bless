/**
 * MemberTimelineEditor — retroactively set which team a COACH ran each
 * season. Solves the "I joined mid-dynasty, the commish was running my
 * team for the first 2 years" gap by reassigning past seasons cleanly.
 *
 * Source of truth: `dynasty.coaches[cid].byYear[year].teamTid` (one team
 * per coach per season). Assigning a team to a year automatically takes it
 * away from any OTHER controlled coach that had it that year (one coach per
 * team per season). Coach Career reads the same entity, so changes show up
 * everywhere immediately.
 */

import { useMemo, useState } from 'react'
import { Modal, Button, EmptyState, TeamLogo } from './ui'
import { useToast } from './ui/Toast'
import { useDynasty } from '../context/DynastyContext'
import { getCoachNameForUid } from '../data/leagueModel'
import {
  getCoach,
  getCoaches,
  getCoachesControlledBy,
  setCoachSeason,
  removeCoachSeason,
  applyControlledCoachTeam,
  deriveMemberTeamsIndex,
  COACH_ROLES,
  COACH_ROLE_LABELS,
} from '../data/coachModel'

export default function MemberTimelineEditor({ isOpen, onClose, cid }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { toast } = useToast()
  const [busyYear, setBusyYear] = useState(null)
  const [pendingPick, setPendingPick] = useState({}) // { [year]: tidString }

  if (!currentDynasty || !cid) return null
  const coach = getCoach(currentDynasty, cid)
  if (!coach) return null

  const startYear = Number(currentDynasty.startYear) || Number(currentDynasty.currentYear)
  const currentYear = Number(currentDynasty.currentYear)
  const teamsSource = currentDynasty.teams || {}
  const memberName = coach.name || getCoachNameForUid(currentDynasty, coach.controlledBy, 'Coach')

  // The team this coach ran in a given year (0 or 1), as an array so the
  // existing chip UI is unchanged.
  const teamsForYear = (year) => {
    const tid = Number(coach.byYear?.[year]?.teamTid ?? coach.byYear?.[String(year)]?.teamTid)
    return Number.isFinite(tid) ? [tid] : []
  }
  // This coach's position (HC/OC/DC) for a given year — defaults to HC.
  const roleForYear = (year) =>
    coach.byYear?.[year]?.role ?? coach.byYear?.[String(year)]?.role ?? 'HC'
  // Other CONTROLLED coaches holding `tid` in `year` (a claim steals from them).
  const otherCoachesOnTeamYear = (tid, year) =>
    Object.values(getCoaches(currentDynasty)).filter(c =>
      c && c.cid !== cid && c.controlledBy != null &&
      Number(c.byYear?.[year]?.teamTid ?? c.byYear?.[String(year)]?.teamTid) === Number(tid),
    )

  const writeCoaches = async (nextCoaches) => {
    const memberTeams = {
      ...(currentDynasty.memberTeams || {}),
      ...deriveMemberTeamsIndex({ ...currentDynasty, coaches: nextCoaches }),
    }
    await updateDynasty(currentDynasty.id, {
      coaches: nextCoaches,
      memberTeams,
      _coachesControlMigrated: true,
    })
  }

  const years = useMemo(() => {
    if (!Number.isFinite(startYear) || !Number.isFinite(currentYear)) return []
    const out = []
    for (let y = currentYear; y >= startYear; y--) out.push(y)
    return out
  }, [startYear, currentYear])

  const teamOptions = useMemo(() => (
    Object.entries(teamsSource)
      .filter(([, t]) => t && t.name)
      .map(([tid, t]) => ({ tid: Number(tid), name: t.name, abbr: t.abbr || '' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [teamsSource])

  // A coach runs at most one team per season.
  const cap = 1

  const handleClaim = async (year, tidStr) => {
    const tid = Number(tidStr)
    if (!Number.isFinite(tid)) return
    const stolen = otherCoachesOnTeamYear(tid, year)
    setBusyYear(year)
    try {
      const { coaches } = applyControlledCoachTeam(currentDynasty, cid, year, tid)
      await writeCoaches(coaches)
      setPendingPick(p => ({ ...p, [year]: '' }))
      if (stolen.length > 0) {
        const stolenFrom = stolen.map(c => c.name || 'a coach').join(', ')
        toast.info(`Took ${teamsSource[tid]?.name || `Team ${tid}`} ${year} from ${stolenFrom}.`)
      } else {
        toast.success(`${memberName} now coaches ${teamsSource[tid]?.name || `Team ${tid}`} for ${year}.`)
      }
    } catch (err) {
      console.error('[MemberTimeline] claim failed:', err)
      toast.error('Failed to update timeline.')
    } finally {
      setBusyYear(null)
    }
  }

  const handleSetRole = async (year, role) => {
    if (!COACH_ROLES.includes(role)) return
    setBusyYear(year)
    try {
      // Merge just the role into that season — teamTid and everything else
      // on the record are preserved. Coach displays, staff lists, and the
      // team header all read this same byYear[year].role, so the position
      // updates everywhere at once.
      const next = setCoachSeason(coach, year, { role })
      await writeCoaches({ ...getCoaches(currentDynasty), [cid]: next })
    } catch (err) {
      console.error('[MemberTimeline] set role failed:', err)
      toast.error('Failed to update position.')
    } finally {
      setBusyYear(null)
    }
  }

  const handleRelease = async (year) => {
    setBusyYear(year)
    try {
      const next = removeCoachSeason(coach, year)
      await writeCoaches({ ...getCoaches(currentDynasty), [cid]: next })
    } catch (err) {
      console.error('[MemberTimeline] release failed:', err)
      toast.error('Failed to update timeline.')
    } finally {
      setBusyYear(null)
    }
  }

  const handleCopyFromAbove = async (year) => {
    // Find the closest year strictly newer than `year` that has a team set.
    let sourceTid = null
    for (const y of years) {
      if (y <= year) break
      const t = teamsForYear(y)[0]
      if (t != null) { sourceTid = t; break }
    }
    if (sourceTid == null) return
    setBusyYear(year)
    try {
      const { coaches } = applyControlledCoachTeam(currentDynasty, cid, year, sourceTid)
      await writeCoaches(coaches)
    } catch (err) {
      console.error('[MemberTimeline] copy failed:', err)
      toast.error('Failed to copy.')
    } finally {
      setBusyYear(null)
    }
  }

  const handleClearYear = (year) => handleRelease(year)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${memberName}'s Timeline`}
      size="lg"
      footer={(
        <Button variant="outline" onClick={onClose}>Done</Button>
      )}
    >
      <p className="text-xs text-txt-tertiary mb-3">
        Set which team {memberName} coached each season. Adding a team to a year automatically
        takes it away from whoever else had it that year; only one coach per team per season.
        Helpful when a member joined the dynasty mid-stream and needs past seasons claimed.
      </p>

      {years.length === 0 ? (
        <EmptyState title="No seasons yet" message="This dynasty has no completed seasons to assign." />
      ) : (
        <div className="divide-y divide-surface-3/40">
          {years.map(year => {
            const tids = teamsForYear(year)
            const isBusy = busyYear === year
            const pickValue = pendingPick[year] || ''
            const assignedSet = new Set(tids.map(Number))
            const availableOptions = teamOptions.filter(t => !assignedSet.has(t.tid))
            return (
              <div key={year} className="py-2.5 flex items-start gap-3">
                <div
                  className="font-display font-black tabular text-txt-primary flex-shrink-0 leading-none pt-1"
                  style={{ fontSize: '15px', width: '52px' }}
                >
                  {year}
                </div>

                <div className="flex-1 min-w-0">
                  {tids.length === 0 ? (
                    <span className="text-xs text-txt-tertiary italic">Not coaching</span>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tids.map(tid => {
                        const team = teamsSource[tid]
                        const teamName = team?.name || `Team ${tid}`
                        return (
                          <span
                            key={tid}
                            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-md bg-surface-2 border border-surface-4 text-xs"
                          >
                            <TeamLogo tid={tid} teams={teamsSource} size="xs" />
                            <span className="font-semibold text-txt-primary">{teamName}</span>
                            <button
                              type="button"
                              onClick={() => handleRelease(year)}
                              disabled={isBusy}
                              aria-label={`Remove ${teamName}`}
                              title={`Remove ${teamName}`}
                              className="ml-0.5 px-1.5 py-1 rounded text-txt-tertiary hover:text-red-400 hover:bg-surface-3 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {tids.length > 0 && (
                    <select
                      value={roleForYear(year)}
                      onChange={(e) => handleSetRole(year, e.target.value)}
                      disabled={isBusy}
                      aria-label={`Position for ${year}`}
                      title="Coaching position this season"
                      className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-secondary cursor-pointer focus:outline-none focus:border-surface-5"
                    >
                      {COACH_ROLES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                  {(cap === Infinity || tids.length < cap) && (
                  <select
                    value={pickValue}
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) return
                      setPendingPick(p => ({ ...p, [year]: v }))
                      handleClaim(year, v)
                    }}
                    disabled={isBusy}
                    className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-secondary cursor-pointer focus:outline-none focus:border-surface-5"
                    style={{ maxWidth: '160px' }}
                  >
                    <option value="">{tids.length === 0 ? 'Assign team…' : '+ Add team…'}</option>
                    {availableOptions.map(t => {
                      // Show a tiny hint when this team currently belongs
                      // to someone else this year — claiming will steal it.
                      const taken = otherCoachesOnTeamYear(t.tid, year).length > 0
                      return (
                        <option key={t.tid} value={t.tid}>
                          {t.name}{taken ? ' (assigned)' : ''}
                        </option>
                      )
                    })}
                  </select>
                  )}

                  {tids.length === 0 && year < currentYear && (
                    <button
                      type="button"
                      onClick={() => handleCopyFromAbove(year)}
                      disabled={isBusy}
                      className="text-xs px-2 py-1 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors disabled:opacity-50"
                      title="Copy assignment from the next year forward"
                    >
                      ↑ copy
                    </button>
                  )}

                  {tids.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleClearYear(year)}
                      disabled={isBusy}
                      className="text-xs px-2 py-1 rounded-md text-txt-tertiary hover:text-red-400 hover:bg-surface-3 transition-colors disabled:opacity-50"
                      title="Clear this year"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
