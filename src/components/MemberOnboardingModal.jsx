/**
 * MemberOnboardingModal — fires once for a freshly-joined member who
 * lands on the dashboard with no team yet. Asks them to pick a team
 * and confirm their display name in 30 seconds, so the rest of the UI
 * (Coach Career, Coaches leaderboard, scoreboard headlines) has the
 * data it needs to attribute their work.
 *
 * Trigger conditions (all must be true):
 *   - user is signed in
 *   - user is an editor (in dynasty.editors[]) but NOT the owner
 *   - dynasty.memberTeams[uid] is empty/undefined
 *   - user hasn't dismissed onboarding for this dynasty (localStorage)
 *
 * Single source of truth — writes to memberLabels, memberTeams, and
 * memberTeamHistory on save. Dismiss-only flow stamps localStorage so
 * the modal doesn't re-fire.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useDynasty } from '../context/DynastyContext'
import { Modal, Button, TeamLogo } from './ui'
import { useToast } from './ui/Toast'
import {
  getEditors,
  getMemberTeams,
  getCoachesForTeamYear,
  setMemberLabelValue,
  claimTeamForYear,
} from '../data/leagueModel'

const dismissKey = (dynastyId, uid) => `onboardingDismissed:${dynastyId}:${uid}`

export default function MemberOnboardingModal() {
  const { user } = useAuth()
  const { currentDynasty, updateDynasty } = useDynasty()
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [teamDraft, setTeamDraft] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  // Decide whether to open the modal on each dynasty/user change.
  useEffect(() => {
    if (!user || !currentDynasty) {
      setIsOpen(false)
      return
    }
    if (currentDynasty.userId === user.uid) {
      setIsOpen(false)
      return
    }
    if (!getEditors(currentDynasty).includes(user.uid)) {
      setIsOpen(false)
      return
    }
    if (getMemberTeams(currentDynasty, user.uid).length > 0) {
      setIsOpen(false)
      return
    }
    try {
      if (sessionStorage.getItem(dismissKey(currentDynasty.id, user.uid)) === '1') {
        setIsOpen(false)
        return
      }
    } catch {}
    // Prefill the label from the Google account display name.
    setLabelDraft(user.displayName || '')
    setIsOpen(true)
  }, [user?.uid, user?.displayName, currentDynasty?.id])

  const teamsSource = currentDynasty?.teams || {}
  const teamOptions = useMemo(() => (
    Object.entries(teamsSource)
      .filter(([, t]) => t && t.name && !t.isFCS)
      .map(([tid, t]) => ({
        tid: Number(tid),
        name: t.name,
        abbr: t.abbr || '',
        // Flag teams currently assigned to another member — picking one
        // is allowed (timeline editor handles conflicts) but the user
        // should know it's taken.
        takenBy: getCoachesForTeamYear(currentDynasty, Number(tid), currentDynasty.currentYear)
          .filter(u => u !== user?.uid),
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [teamsSource, currentDynasty, user?.uid])

  const filteredOptions = useMemo(() => {
    if (!search) return teamOptions
    const q = search.toLowerCase()
    return teamOptions.filter(t =>
      t.name.toLowerCase().includes(q) || t.abbr.toLowerCase().includes(q)
    )
  }, [teamOptions, search])

  const handleSkip = () => {
    if (!user || !currentDynasty) return
    try {
      sessionStorage.setItem(dismissKey(currentDynasty.id, user.uid), '1')
    } catch {}
    setIsOpen(false)
  }

  const handleSave = async () => {
    if (!user || !currentDynasty) return
    const tid = Number(teamDraft)
    if (!Number.isFinite(tid)) {
      toast.error('Pick a team to continue.')
      return
    }
    setBusy(true)
    try {
      const trimmed = (labelDraft || '').trim()
      const updates = {}
      if (trimmed) {
        updates.memberLabels = setMemberLabelValue(currentDynasty, user.uid, trimmed)
      }

      // Live current-year team list. Claim semantics: strip the tid from
      // any other uid that currently holds it (the timeline editor uses
      // the same convention — one coach per team per season).
      const liveNext = { ...(currentDynasty.memberTeams || {}) }
      const tNum = Number(tid)
      for (const otherUid of Object.keys(liveNext)) {
        if (otherUid === user.uid) continue
        const arr = Array.isArray(liveNext[otherUid]) ? liveNext[otherUid].map(Number) : []
        const filtered = arr.filter(t => t !== tNum)
        if (filtered.length === arr.length) continue
        if (filtered.length === 0) delete liveNext[otherUid]
        else liveNext[otherUid] = filtered
      }
      liveNext[user.uid] = [tNum]
      updates.memberTeams = liveNext

      // Per-year history: same claim semantics for the current year.
      updates.memberTeamHistory = claimTeamForYear(
        currentDynasty.memberTeamHistory,
        user.uid,
        currentDynasty.currentYear,
        tNum,
      )

      await updateDynasty(currentDynasty.id, updates)
      toast.success(`Welcome to ${currentDynasty.dynastyName || 'the dynasty'}!`)
      setIsOpen(false)
    } catch (err) {
      console.error('[MemberOnboardingModal] save failed:', err)
      toast.error('Failed to save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleSkip}
      title="Welcome to the dynasty"
      size="md"
      closeOnBackdrop={false}
      closeOnEscape={false}
      hideClose
      footer={(
        <div className="flex items-center justify-between gap-2 w-full">
          <Button variant="outline" onClick={handleSkip} disabled={busy}>
            Skip for now
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={busy || !teamDraft}>
            {busy ? 'Saving…' : 'Save & Continue'}
          </Button>
        </div>
      )}
    >
      <p className="text-sm text-txt-secondary mb-4">
        Set your name and pick the team you're coaching. The rest of the app uses these to
        attribute games, awards, and recruits to your career — you can always tweak them on the
        Members page later.
      </p>

      {/* Member label */}
      <div className="mb-4">
        <label className="block text-xs text-txt-tertiary mb-1">Your coach name</label>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          placeholder="e.g. Nick Saban"
          className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm border border-surface-4 focus:border-surface-5 focus:outline-none"
          disabled={busy}
        />
      </div>

      {/* Team picker — searchable list */}
      <div className="mb-2">
        <label className="block text-xs text-txt-tertiary mb-1">Pick your team</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search teams…"
          className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm border border-surface-4 focus:border-surface-5 focus:outline-none mb-2"
          disabled={busy}
        />
        <div
          className="max-h-64 overflow-y-auto rounded-md border border-surface-4"
          style={{ backgroundColor: 'var(--surface-1)' }}
        >
          {filteredOptions.length === 0 ? (
            <div className="text-xs text-txt-tertiary text-center py-6">
              No teams match "{search}".
            </div>
          ) : (
            filteredOptions.map(t => {
              const selected = String(t.tid) === String(teamDraft)
              return (
                <button
                  key={t.tid}
                  type="button"
                  onClick={() => setTeamDraft(String(t.tid))}
                  disabled={busy}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    selected ? 'bg-surface-3' : 'hover:bg-surface-2'
                  }`}
                >
                  <TeamLogo tid={t.tid} teams={teamsSource} size="xs" />
                  <span className="text-sm font-semibold text-txt-primary flex-1 truncate">
                    {t.name}
                  </span>
                  {t.takenBy.length > 0 && (
                    <span className="text-[10px] text-txt-tertiary">currently assigned</span>
                  )}
                  {selected && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-success)' }}>
                      Selected
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
      <p className="text-[11px] text-txt-tertiary mt-2">
        Picking a team that's currently assigned to another coach will reassign it. The other
        coach keeps their past seasons in their timeline.
      </p>
    </Modal>
  )
}
