/**
 * MemberTimelineEditor — retroactively claim/release teams per season
 * for a single member. Solves the "I joined mid-dynasty, the commish
 * was running my team for the first 2 years" gap by letting the commish
 * (or the member themselves) reassign past seasons cleanly.
 *
 * One source of truth: writes to `dynasty.memberTeamHistory[uid][year]`.
 * Adding a tid to a year automatically removes it from any OTHER uid's
 * same-year list (a team has at most one coach per season). Members'
 * Coach Career page reads from the same map, so the change shows up
 * everywhere immediately.
 */

import { useMemo, useState } from 'react'
import { Modal, Button, EmptyState, TeamLogo } from './ui'
import { useToast } from './ui/Toast'
import { useDynasty } from '../context/DynastyContext'
import {
  getCoachNameForUid,
  getMemberTeamsForYear,
  getCoachesForTeamYear,
  claimTeamForYear,
  releaseTeamForYear,
  getRole,
  maxTeamsForRole,
} from '../data/leagueModel'

export default function MemberTimelineEditor({ isOpen, onClose, uid }) {
  const { currentDynasty, updateDynasty } = useDynasty()
  const { toast } = useToast()
  const [busyYear, setBusyYear] = useState(null)
  const [pendingPick, setPendingPick] = useState({}) // { [year]: tidString }

  if (!currentDynasty || !uid) return null

  const startYear = Number(currentDynasty.startYear) || Number(currentDynasty.currentYear)
  const currentYear = Number(currentDynasty.currentYear)
  const teamsSource = currentDynasty.teams || {}
  const memberName = getCoachNameForUid(currentDynasty, uid, 'Member')

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

  // Write the new memberTeamHistory map. If the modified year IS the
  // dynasty's current year, ALSO sync memberTeams[uid] (the live store)
  // so the row's display doesn't bounce back via the live-state fallback
  // in getMemberTeamsForYear (which only kicks in when history is empty
  // for the current year).
  //
  // Without this sync, removing a team from the current year via the
  // X chip strips memberTeamHistory[uid][currentYear] but leaves
  // memberTeams[uid] intact — so the next render reads the live store
  // and re-displays the team. Same applies to claiming on the current
  // year: history gets the team but live state stays empty, leaving
  // Coach Career and the Members row out of sync until next save.
  const writeHistory = async (nextHistory, modifiedYear) => {
    const updates = { memberTeamHistory: nextHistory }
    if (Number(modifiedYear) === Number(currentDynasty.currentYear)) {
      // Derive what memberTeams[uid] should be from the just-written
      // history snapshot. If the year entry is now empty, drop the uid
      // from memberTeams; otherwise mirror the same tids.
      const tidsForCurrent =
        nextHistory?.[uid]?.[currentDynasty.currentYear] ||
        nextHistory?.[uid]?.[String(currentDynasty.currentYear)] ||
        []
      const nextLive = { ...(currentDynasty.memberTeams || {}) }
      if (tidsForCurrent.length === 0) {
        delete nextLive[uid]
      } else {
        nextLive[uid] = tidsForCurrent.map(Number).filter(Number.isFinite)
      }
      updates.memberTeams = nextLive
    }
    await updateDynasty(currentDynasty.id, updates)
  }

  // Members coach at most one team per season; commish/co-commish are uncapped.
  const cap = maxTeamsForRole(getRole(currentDynasty, uid))

  const handleClaim = async (year, tidStr) => {
    const tid = Number(tidStr)
    if (!Number.isFinite(tid)) return
    // Enforce the per-season team cap (the dropdown otherwise allows unlimited
    // adds). Already-assigned tids are filtered out of the options, so a claim
    // here is always a NEW team for the year.
    const already = getMemberTeamsForYear(currentDynasty, uid, year)
    if (cap !== Infinity && already.length >= cap) {
      toast.error(`${memberName} can only coach ${cap} team per season.`)
      setPendingPick(p => ({ ...p, [year]: '' }))
      return
    }
    const otherUids = getCoachesForTeamYear(currentDynasty, tid, year).filter(u => u !== uid)
    setBusyYear(year)
    try {
      const next = claimTeamForYear(currentDynasty.memberTeamHistory, uid, year, tid)
      await writeHistory(next, year)
      setPendingPick(p => ({ ...p, [year]: '' }))
      if (otherUids.length > 0) {
        const stolenFrom = otherUids
          .map(u => getCoachNameForUid(currentDynasty, u, 'a coach'))
          .join(', ')
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

  const handleRelease = async (year, tid) => {
    setBusyYear(year)
    try {
      const next = releaseTeamForYear(currentDynasty.memberTeamHistory, uid, year, tid)
      await writeHistory(next, year)
    } catch (err) {
      console.error('[MemberTimeline] release failed:', err)
      toast.error('Failed to update timeline.')
    } finally {
      setBusyYear(null)
    }
  }

  const handleCopyFromAbove = async (year) => {
    // Find the closest year strictly newer than `year` that has tids set.
    let sourceTids = null
    for (const y of years) {
      if (y <= year) break
      const tids = getMemberTeamsForYear(currentDynasty, uid, y)
      if (tids.length > 0) { sourceTids = tids; break }
    }
    if (!sourceTids || sourceTids.length === 0) return
    // Respect the per-season cap when copying a multi-team year down.
    const toCopy = cap === Infinity ? sourceTids : sourceTids.slice(0, cap)
    setBusyYear(year)
    try {
      let next = currentDynasty.memberTeamHistory
      for (const tid of toCopy) {
        next = claimTeamForYear(next, uid, year, tid)
      }
      await writeHistory(next, year)
    } catch (err) {
      console.error('[MemberTimeline] copy failed:', err)
      toast.error('Failed to copy.')
    } finally {
      setBusyYear(null)
    }
  }

  const handleClearYear = async (year) => {
    setBusyYear(year)
    try {
      const next = { ...(currentDynasty.memberTeamHistory || {}) }
      const userMap = { ...(next[uid] || {}) }
      delete userMap[year]
      delete userMap[String(year)]
      if (Object.keys(userMap).length === 0) delete next[uid]
      else next[uid] = userMap
      await writeHistory(next, year)
    } catch (err) {
      console.error('[MemberTimeline] clear failed:', err)
      toast.error('Failed to clear year.')
    } finally {
      setBusyYear(null)
    }
  }

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
        takes it away from whoever else had it that year — only one coach per team per season.
        Helpful when a member joined the dynasty mid-stream and needs past seasons claimed.
      </p>

      {years.length === 0 ? (
        <EmptyState title="No seasons yet" message="This dynasty has no completed seasons to assign." />
      ) : (
        <div className="divide-y divide-surface-3/40">
          {years.map(year => {
            const tids = getMemberTeamsForYear(currentDynasty, uid, year)
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
                              onClick={() => handleRelease(year, tid)}
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
                      const otherUids = getCoachesForTeamYear(currentDynasty, t.tid, year)
                        .filter(u => u !== uid)
                      const taken = otherUids.length > 0
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
