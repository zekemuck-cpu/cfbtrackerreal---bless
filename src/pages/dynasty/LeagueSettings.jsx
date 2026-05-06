/**
 * Members — three-tier role model.
 *
 *   Commish (owner): full control. Add/remove/rename members, assign
 *     teams, promote/demote co-commishes, transfer the commish role.
 *   Co-Commish: same powers as commish EXCEPT cannot touch the commish
 *     or other co-commishes (no removing, no demoting, no role transfer).
 *   Member: read+write on dynasty data, no membership management.
 *
 * Names + team assignments are stored on the dynasty doc so every user
 * sees the same labels. Commish + co-commishes can hold MULTIPLE teams
 * to shepherd teams that don't yet have an assigned coach (or to cover
 * for a member who's away). Regular members are capped at one team.
 */

import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { PageHero, Card, Button, Badge, EmptyState, TeamLogo } from '../../components/ui'
import { getTeamLogoByTid } from '../../data/teams'
import { getCoachStints } from '../../data/coachStats'
import {
  createInviteDoc,
  deleteInviteDoc,
  subscribeToInvites,
} from '../../services/dynastyService'
import {
  getEditors,
  getRole,
  canManageMembers,
  canManageCoCommishes,
  canActOnUser,
  maxTeamsForRole,
  addEditor,
  removeEditor,
  addCoCommish,
  removeCoCommish,
  getMemberLabel,
  setMemberLabelValue,
  getMemberTeams,
  addMemberTeam,
  removeMemberTeam,
  setMemberTeam,
  dropMemberMetadata,
  buildCommishTransfer,
  stampHistoryForYear,
  getCoachNameForUid,
  createInviteToken,
  isInviteValid,
  buildInviteUrl,
  getCoachingStaffForUid,
  setCoachingStaffForUid,
  ROLE_COMMISH,
  ROLE_COCOMMISH,
  ROLE_MEMBER,
} from '../../data/leagueModel'
import MemberTimelineEditor from '../../components/MemberTimelineEditor'

function shortenUid(uid) {
  if (!uid || uid.length <= 12) return uid || ''
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`
}

const ROLE_LABEL = {
  [ROLE_COMMISH]: 'Commish',
  [ROLE_COCOMMISH]: 'Co-Commish',
  [ROLE_MEMBER]: 'Member',
}

const ROLE_BADGE_VARIANT = {
  [ROLE_COMMISH]: 'warning',
  [ROLE_COCOMMISH]: 'primary',
  [ROLE_MEMBER]: 'outline',
}

export default function LeagueSettings() {
  const { user } = useAuth()
  const { currentDynasty, updateDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [pendingUid, setPendingUid] = useState('')
  const [busyUid, setBusyUid] = useState(null)
  const [nameDrafts, setNameDrafts] = useState({})
  const [timelineUid, setTimelineUid] = useState(null)
  const [staffDraft, setStaffDraft] = useState(null) // { hcName, ocName, dcName } | null
  const [invites, setInvites] = useState([])
  // Default expiration for newly-generated invites. Stored client-side
  // only — the server stamps expiresAt at create time based on this
  // selection. 'never' is the safe default since hosts can revoke any
  // time from this same panel.
  const [inviteExpiry, setInviteExpiry] = useState('never')

  // Live subscription to the invites subcollection. Only meaningful for
  // cloud dynasties — local dynasties don't have a Firestore subscription
  // path and skip the listener entirely.
  useEffect(() => {
    if (!currentDynasty?.id) return
    if (currentDynasty.storageType !== 'cloud') return
    const unsub = subscribeToInvites(currentDynasty.id, setInvites)
    return unsub
  }, [currentDynasty?.id, currentDynasty?.storageType])

  if (!currentDynasty) return null
  if (!user) return <Navigate to="/login" replace />

  const myRole = getRole(currentDynasty, user.uid)
  if (!myRole) {
    return (
      <div className="space-y-4 page-enter">
        <PageHero eyebrow="Members" title="League Members" />
        <Card>
          <EmptyState title="No access" message="You aren't a member of this dynasty." />
          <div className="mt-4 flex justify-center">
            <Link to={pathPrefix}>
              <Button variant="outline">Back to Dynasty</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const canManage = canManageMembers(currentDynasty, user.uid)
  const canManageCo = canManageCoCommishes(currentDynasty, user.uid)
  // Sharing actions only make sense on cloud dynasties — a local
  // dynasty lives in this device's IndexedDB and there's nothing for
  // a second account to read. Renaming + team assignment still work
  // (they're useful for solo team-switching).
  const isCloudDynasty = currentDynasty.storageType === 'cloud'
  const canShareWithOthers = canManage && isCloudDynasty
  const teamsSource = currentDynasty?.teams || {}

  // Order: commish first, co-commishes next, members last.
  const editors = getEditors(currentDynasty)
  const otherEditors = editors.filter(uid => uid !== currentDynasty.userId)
  const sortedOthers = [...otherEditors].sort((a, b) => {
    const ra = getRole(currentDynasty, a)
    const rb = getRole(currentDynasty, b)
    if (ra === rb) return 0
    if (ra === ROLE_COCOMMISH) return -1
    if (rb === ROLE_COCOMMISH) return 1
    return 0
  })
  const totalMembers = 1 + otherEditors.length

  const teamOptions = Object.entries(teamsSource)
    .filter(([, t]) => t && t.name)
    .map(([tid, t]) => ({ tid: Number(tid), abbr: t.abbr || '', name: t.name }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // ── handlers ──────────────────────────────────────────────────────

  const handleAdd = async (e) => {
    e?.preventDefault()
    if (!canManage) return
    const uid = pendingUid.trim()
    if (!uid) return
    if (uid === currentDynasty.userId) {
      toast.error('That user is already the commish.')
      return
    }
    if (editors.includes(uid)) {
      toast.error('That user is already a member.')
      return
    }
    setBusyUid('__add__')
    try {
      await updateDynasty(currentDynasty.id, { editors: addEditor(currentDynasty, uid) })
      toast.success('Member added.')
      setPendingUid('')
    } catch (err) {
      console.error('[Members] add failed:', err)
      toast.error('Failed to add member.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleRemove = async (uid) => {
    if (!canActOnUser(currentDynasty, user.uid, uid)) return
    const label = getMemberLabel(currentDynasty, uid) || shortenUid(uid)
    const ok = await confirm({
      title: 'Remove member?',
      message: `Revoke access for ${label}?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (!ok) return
    setBusyUid(uid)
    try {
      await updateDynasty(currentDynasty.id, {
        editors: removeEditor(currentDynasty, uid),
        coCommishes: removeCoCommish(currentDynasty, uid),
        ...dropMemberMetadata(currentDynasty, uid),
      })
      toast.info('Member removed.')
    } catch (err) {
      console.error('[Members] remove failed:', err)
      toast.error('Failed to remove member.')
    } finally {
      setBusyUid(null)
    }
  }

  // ─── Invite tokens (subcollection) ──────────────────────────────
  // Invites live at dynasties/{id}/invites/{token}. The subcollection
  // is the single source of truth so Firestore rules can verify a
  // redemption by `get()`-ing the specific token doc — something the
  // older inline `pendingInvites[]` array couldn't support.
  const handleGenerateInvite = async () => {
    if (!canManage) return
    setBusyUid('__invite__')
    try {
      const token = createInviteToken()
      // Expiration is computed at create time so the rule's `expiresAt
      // > request.time` check uses a fixed instant rather than relying
      // on client clock skew at redeem time.
      const dayMs = 24 * 60 * 60 * 1000
      const expiresAt = inviteExpiry === '1d'  ? Date.now() + dayMs
                      : inviteExpiry === '7d'  ? Date.now() + 7 * dayMs
                      : inviteExpiry === '30d' ? Date.now() + 30 * dayMs
                      : null
      await createInviteDoc(currentDynasty.id, {
        token,
        role: ROLE_MEMBER,
        createdBy: user.uid,
        expiresAt,
      })
      toast.success('Invite link generated.')
    } catch (err) {
      console.error('[Members] generate invite failed:', err)
      toast.error('Failed to create invite.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleCopyInviteUrl = (token) => {
    const url = buildInviteUrl(currentDynasty.id, token)
    navigator.clipboard?.writeText(url).then(
      () => toast.success('Invite link copied.'),
      () => toast.error('Copy failed.'),
    )
  }

  const handleRevokeInvite = async (token) => {
    if (!canManage) return
    setBusyUid(`__invite__${token}`)
    try {
      await deleteInviteDoc(currentDynasty.id, token)
      toast.info('Invite revoked.')
    } catch (err) {
      console.error('[Members] revoke invite failed:', err)
      toast.error('Failed to revoke invite.')
    } finally {
      setBusyUid(null)
    }
  }

  // Self-leave: a non-commish member walks themselves out of the dynasty.
  // The commish can't use this — they must transfer the role first (the
  // button reflects that with a different label + confirm copy below).
  // Per-uid coaching staff. Each member can record their OWN HC/OC/DC
  // names so multi-coach dynasties don't trample each other when the
  // owner-flow writes to the legacy single-staff field.
  const myStaff = user?.uid ? getCoachingStaffForUid(currentDynasty, user.uid) : null
  const editingStaff = staffDraft != null ? staffDraft : myStaff

  const handleSaveStaff = async () => {
    if (!user?.uid || !editingStaff) return
    setBusyUid('__staff__')
    try {
      const next = setCoachingStaffForUid(currentDynasty, user.uid, editingStaff)
      await updateDynasty(currentDynasty.id, { memberCoachingStaff: next })
      setStaffDraft(null)
      toast.success('Coaching staff saved.')
    } catch (err) {
      console.error('[Members] save staff failed:', err)
      toast.error('Failed to save coaching staff.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleLeaveDynasty = async () => {
    if (!user?.uid) return
    if (myRole === ROLE_COMMISH) {
      toast.info('Transfer the commish role to another member before leaving.')
      return
    }
    const ok = await confirm({
      title: 'Leave this dynasty?',
      message:
        'You will lose edit access. Your past coaching record stays in the dynasty so the commish can still see your career, but you will no longer appear as an active member.',
      confirmLabel: 'Leave',
      variant: 'danger',
    })
    if (!ok) return
    setBusyUid(user.uid)
    try {
      await updateDynasty(currentDynasty.id, {
        editors: removeEditor(currentDynasty, user.uid),
        coCommishes: removeCoCommish(currentDynasty, user.uid),
        ...dropMemberMetadata(currentDynasty, user.uid),
      })
      toast.info('You left the dynasty.')
      // Drop them back to the dynasty list — they can't view this one anymore.
      window.location.href = '/'
    } catch (err) {
      console.error('[Members] self-leave failed:', err)
      toast.error('Failed to leave dynasty.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleRename = async (uid) => {
    // Anyone can rename their OWN row. Only the commish/co-commish can
    // rename others.
    const isSelf = uid === user.uid
    if (!isSelf && !canManage) return

    const draft = nameDrafts[uid]
    const current = getMemberLabel(currentDynasty, uid)
    if (draft === undefined || draft.trim() === current) {
      setNameDrafts(prev => ({ ...prev, [uid]: undefined }))
      return
    }
    setBusyUid(uid)
    try {
      // Single source of truth — write only memberLabels. The data layer
      // (DynastyContext getCurrentLockedCoachingStaff, advanceWeek CC
      // lockin, etc.) reads via getCoachNameForUid which prefers
      // memberLabels[uid] for everyone, including the owner. Pre-migration
      // dynasties whose owner row only has dynasty.coachName get a fallback
      // read in the same helper, so this rename can stop the dual-write.
      const next = setMemberLabelValue(currentDynasty, uid, draft)
      await updateDynasty(currentDynasty.id, { memberLabels: next })
      setNameDrafts(prev => ({ ...prev, [uid]: undefined }))
    } catch (err) {
      console.error('[Members] rename failed:', err)
      toast.error('Failed to save name.')
    } finally {
      setBusyUid(null)
    }
  }

  // Both the live memberTeams map and the per-year history snapshot
  // are written together — one call per change. The history stamp uses
  // the dynasty's current year, so the Coach Career page can later
  // rebuild who controlled what without revisiting Firestore.
  const writeMemberTeamsAndStamp = async (uid, nextMemberTeams) => {
    const teamsForUid = nextMemberTeams[uid] || []
    const nextHistory = stampHistoryForYear(
      currentDynasty.memberTeamHistory,
      uid,
      currentDynasty.currentYear,
      teamsForUid,
    )
    await updateDynasty(currentDynasty.id, {
      memberTeams: nextMemberTeams,
      memberTeamHistory: nextHistory,
    })
  }

  const handleAddTeam = async (uid, tidStr) => {
    if (!canManage) return
    const tid = Number(tidStr)
    if (!Number.isFinite(tid)) return
    const role = getRole(currentDynasty, uid)
    const cap = maxTeamsForRole(role)
    setBusyUid(uid)
    try {
      // For capped roles (members), `Add` always REPLACES.
      const next = cap === Infinity
        ? addMemberTeam(currentDynasty, uid, tid)
        : setMemberTeam(currentDynasty, uid, tid)
      await writeMemberTeamsAndStamp(uid, next)
    } catch (err) {
      console.error('[Members] assign team failed:', err)
      toast.error('Failed to assign team.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleRemoveTeam = async (uid, tid) => {
    if (!canManage) return
    setBusyUid(uid)
    try {
      const next = removeMemberTeam(currentDynasty, uid, tid)
      await writeMemberTeamsAndStamp(uid, next)
    } catch (err) {
      console.error('[Members] remove team failed:', err)
      toast.error('Failed to remove team.')
    } finally {
      setBusyUid(null)
    }
  }

  const handlePromote = async (uid) => {
    if (!canManageCo) return
    setBusyUid(uid)
    try {
      await updateDynasty(currentDynasty.id, {
        coCommishes: addCoCommish(currentDynasty, uid),
      })
      toast.success('Promoted to co-commish.')
    } catch (err) {
      console.error('[Members] promote failed:', err)
      toast.error('Failed to promote.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleDemote = async (uid) => {
    if (!canManageCo) return
    const label = getMemberLabel(currentDynasty, uid) || shortenUid(uid)
    const ok = await confirm({
      title: 'Demote co-commish?',
      message: `${label} will lose co-commish privileges and become a regular member.`,
      confirmLabel: 'Demote',
    })
    if (!ok) return
    setBusyUid(uid)
    try {
      await updateDynasty(currentDynasty.id, {
        coCommishes: removeCoCommish(currentDynasty, uid),
      })
      toast.info('Demoted to member.')
    } catch (err) {
      console.error('[Members] demote failed:', err)
      toast.error('Failed to demote.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleMakeCommish = async (uid) => {
    if (!canManageCo) return // Only commish can transfer
    const label = getMemberLabel(currentDynasty, uid) || shortenUid(uid)
    const ok = await confirm({
      title: 'Transfer commish role?',
      message: `${label} will become the commish. You will become a regular member and can no longer manage members or transfer ownership back unless they hand it back.`,
      confirmLabel: 'Transfer',
      variant: 'danger',
    })
    if (!ok) return
    setBusyUid(uid)
    try {
      const updates = buildCommishTransfer(currentDynasty, uid)
      await updateDynasty(currentDynasty.id, updates)
      toast.success(`${label} is now the commish.`)
    } catch (err) {
      console.error('[Members] transfer commish failed:', err)
      toast.error(err.message || 'Failed to transfer commish role.')
    } finally {
      setBusyUid(null)
    }
  }

  // ── render ────────────────────────────────────────────────────────

  const renderRow = (uid) => {
    const role = getRole(currentDynasty, uid)
    if (!role) return null
    const isYou = uid === user.uid
    const label = getMemberLabel(currentDynasty, uid)
    const draftValue = nameDrafts[uid] !== undefined ? nameDrafts[uid] : label
    const teams = getMemberTeams(currentDynasty, uid)
    const assignedSet = new Set(teams.map(Number))
    const availableTeamOptions = teamOptions.filter(t => !assignedSet.has(t.tid))
    const cap = maxTeamsForRole(role)
    const canAddMore = canManage && availableTeamOptions.length > 0 && (cap === Infinity || teams.length < cap)
    const isBusy = busyUid === uid
    const canActOnThis = canActOnUser(currentDynasty, user.uid, uid)
    const canPromote = canManageCo && isCloudDynasty && role === ROLE_MEMBER
    const canDemote = canManageCo && isCloudDynasty && role === ROLE_COCOMMISH
    const canTransfer = canManageCo && isCloudDynasty && role !== ROLE_COMMISH

    const placeholder = role === ROLE_COMMISH ? 'Commish'
                       : role === ROLE_COCOMMISH ? 'Co-Commish'
                       : 'Member'

    // Stint summary: most-recent stint's date range as a sub-line.
    // Same source the Coaches leaderboard uses, so the two surfaces
    // tell the same story.
    const stints = getCoachStints(currentDynasty, uid)
    const lastStint = stints.length > 0 ? stints[stints.length - 1] : null
    const stintLine = lastStint ? (
      lastStint.endYear >= currentDynasty.currentYear
        ? `${lastStint.startYear}–NOW · ${lastStint.years} ${lastStint.years === 1 ? 'season' : 'seasons'}`
        : `${lastStint.startYear}–${lastStint.endYear}`
    ) : null

    // Primary team for the rail-side logo. Uses the most-recent stint
    // when set, falls back to the live memberTeams entry.
    const primaryTid = lastStint?.tid ?? teams[0] ?? null

    const hasAnyAction = (canManage || isYou) || (
      canManage && role !== ROLE_COMMISH && (canPromote || canDemote || canTransfer || canActOnThis)
    )

    return (
      <div key={uid} className="member-row group relative flex items-start gap-3 py-3 sm:py-3.5 px-1">
        {/* Logo rail — primary team (most recent stint) or empty slot. */}
        <div className="flex-shrink-0 pt-0.5">
          {primaryTid != null ? (
            <TeamLogo tid={primaryTid} teams={teamsSource} size="md" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-surface-3" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Name row — inline-editable, role chip + (you) marker. */}
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {(canManage || isYou) ? (
              <input
                type="text"
                value={draftValue}
                placeholder={isYou ? 'You' : placeholder}
                onChange={e => setNameDrafts(prev => ({ ...prev, [uid]: e.target.value }))}
                onBlur={() => handleRename(uid)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
                  if (e.key === 'Escape') {
                    setNameDrafts(prev => ({ ...prev, [uid]: undefined }))
                    e.target.blur()
                  }
                }}
                disabled={isBusy}
                className="font-display font-bold text-txt-primary bg-transparent border-b border-transparent hover:border-surface-4 focus:border-blue-500 focus:outline-none px-1 -mx-1 py-0 text-base leading-tight min-w-[140px]"
              />
            ) : (
              <span className="font-display font-bold text-txt-primary text-base leading-tight">
                {label || (isYou ? 'You' : placeholder)}
              </span>
            )}
            <Badge variant={ROLE_BADGE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
            {isYou && (
              <span
                className="label-xs text-txt-tertiary"
                style={{ letterSpacing: '1.5px', fontSize: '9px' }}
              >
                YOU
              </span>
            )}
          </div>

          {/* Stint sub-line — same source as Coaches leaderboard. */}
          {stintLine && (
            <div
              className="label-xs text-txt-tertiary tabular mb-2"
              style={{ letterSpacing: '1.2px', fontSize: '10px' }}
            >
              {stintLine}
            </div>
          )}

          {/* Team chips. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {teams.length === 0 && !canManage && (
              <span className="text-[11px] text-txt-muted italic">No team assigned</span>
            )}
            {teams.map(tid => {
              const team = teamsSource[tid]
              const teamName = team?.name || `Team ${tid}`
              const logo = getTeamLogoByTid(tid, teamsSource)
              return (
                <span
                  key={tid}
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-md bg-surface-2 border border-surface-4 text-xs"
                >
                  {logo && <img src={logo} alt="" className="w-4 h-4 object-contain" />}
                  <span className="font-semibold text-txt-primary">{teamName}</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTeam(uid, tid)}
                      disabled={isBusy}
                      aria-label={`Remove ${teamName}`}
                      className="ml-0.5 px-1 text-txt-muted hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </span>
              )
            })}
            {canAddMore && (
              <select
                value=""
                onChange={e => {
                  if (e.target.value) handleAddTeam(uid, e.target.value)
                  e.target.value = ''
                }}
                disabled={isBusy}
                className="text-[11px] px-2 py-1 rounded-md bg-surface-1 border border-surface-4 text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors cursor-pointer focus:outline-none focus:border-blue-500"
              >
                <option value="">{teams.length === 0 ? 'Assign team…' : '+ Add'}</option>
                {availableTeamOptions.map(t => (
                  <option key={t.tid} value={t.tid}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* UID — quiet, copy-on-click affordance. */}
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(uid).then(
                  () => toast.success('UID copied'),
                  () => {},
                )
              }}
              className="font-mono text-[10px] text-txt-muted hover:text-txt-tertiary transition-colors truncate max-w-[280px]"
              title="Copy UID"
            >
              {uid}
            </button>
          </div>
        </div>

        {/* Right-side action cluster. Compact buttons; only Edit Timeline
            shows for self-rows. */}
        {hasAnyAction && (
          <div className="flex flex-col gap-1 flex-shrink-0">
            {(canManage || isYou) && (
              <Button variant="outline" size="sm" onClick={() => setTimelineUid(uid)} disabled={isBusy}>
                Timeline
              </Button>
            )}
            {canManage && role !== ROLE_COMMISH && canPromote && (
              <Button variant="outline" size="sm" onClick={() => handlePromote(uid)} disabled={isBusy}>
                Promote
              </Button>
            )}
            {canManage && role !== ROLE_COMMISH && canDemote && (
              <Button variant="outline" size="sm" onClick={() => handleDemote(uid)} disabled={isBusy}>
                Demote
              </Button>
            )}
            {canManage && role !== ROLE_COMMISH && canTransfer && (
              <Button variant="outline" size="sm" onClick={() => handleMakeCommish(uid)} disabled={isBusy}>
                Make Commish
              </Button>
            )}
            {canManage && role !== ROLE_COMMISH && canActOnThis && (
              <Button variant="outline" size="sm" onClick={() => handleRemove(uid)} disabled={isBusy}>
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Stat-strip values: members, pending invites, total seasons covered.
  const visibleInvitesCount = invites.filter(isInviteValid).length
  const totalSeasons = (() => {
    const cy = Number(currentDynasty.currentYear)
    const sy = Number(currentDynasty.startYear)
    return Number.isFinite(cy) && Number.isFinite(sy) && cy >= sy ? (cy - sy + 1) : 1
  })()

  return (
    <div className="space-y-4 page-enter">
      <PageHero
        eyebrow="Dynasty"
        title="Members"
      />

      {/* Broadcast stat strip — 3-up on desktop, stacks on mobile.
          Mirrors the rest of the redesigned dynasty pages so members
          gets the same visual rhythm as Coach Career / Coaches. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div
          className="px-3 py-2.5 rounded-lg bg-surface-2 flex flex-col gap-0.5"
          style={{ border: '1px solid var(--surface-4)' }}
        >
          <span
            className="label-xs text-txt-tertiary"
            style={{ letterSpacing: '1.5px', fontSize: '9px', fontWeight: 700 }}
          >
            COACHES
          </span>
          <span
            className="font-display font-black tabular text-txt-primary leading-none"
            style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}
          >
            {totalMembers}
          </span>
        </div>
        <div
          className="px-3 py-2.5 rounded-lg bg-surface-2 flex flex-col gap-0.5"
          style={{ border: '1px solid var(--surface-4)' }}
        >
          <span
            className="label-xs text-txt-tertiary"
            style={{ letterSpacing: '1.5px', fontSize: '9px', fontWeight: 700 }}
          >
            PENDING INVITES
          </span>
          <span
            className="font-display font-black tabular text-txt-primary leading-none"
            style={{
              fontSize: 'clamp(20px, 3vw, 28px)',
              color: visibleInvitesCount > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {visibleInvitesCount}
          </span>
        </div>
        <div
          className="px-3 py-2.5 rounded-lg bg-surface-2 flex flex-col gap-0.5"
          style={{ border: '1px solid var(--surface-4)' }}
        >
          <span
            className="label-xs text-txt-tertiary"
            style={{ letterSpacing: '1.5px', fontSize: '9px', fontWeight: 700 }}
          >
            SEASONS TRACKED
          </span>
          <span
            className="font-display font-black tabular text-txt-primary leading-none"
            style={{ fontSize: 'clamp(20px, 3vw, 28px)' }}
          >
            {totalSeasons}
          </span>
        </div>
      </div>

      <Card>
        <header className="flex items-baseline justify-between mb-2">
          <h3
            className="label-sm text-txt-primary"
            style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
          >
            ROSTER
          </h3>
          <span
            className="label-xs text-txt-tertiary tabular"
            style={{ letterSpacing: '1.5px', fontSize: '9px' }}
          >
            {totalMembers} {totalMembers === 1 ? 'COACH' : 'COACHES'}
          </span>
        </header>
        <p className="text-xs text-txt-tertiary mb-3">
          {canManage
            ? 'Click a name to rename. Each member coaches one team; commish and co-commishes can hold multiple to shepherd teams without an assigned coach.'
            : 'Click your own name to rename it. Team assignments are managed by the commish.'}
        </p>
        <div className="divide-y divide-surface-3/50">
          {renderRow(currentDynasty.userId)}
          {sortedOthers.map(uid => renderRow(uid))}
        </div>
      </Card>

      {canShareWithOthers && (
        <Card>
          <header className="flex items-baseline justify-between mb-1">
            <h3
              className="label-sm text-txt-primary"
              style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
            >
              INVITE A COACH
            </h3>
            {visibleInvitesCount > 0 && (
              <span
                className="label-xs text-txt-tertiary tabular"
                style={{ letterSpacing: '1.5px', fontSize: '9px' }}
              >
                {visibleInvitesCount} ACTIVE
              </span>
            )}
          </header>
          <p className="text-xs text-txt-tertiary mb-3">
            Generate a link, send it to your friend, and they join with one click after
            signing in.
          </p>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateInvite}
              disabled={busyUid === '__invite__'}
            >
              {busyUid === '__invite__' ? 'Generating…' : 'Generate Invite Link'}
            </Button>
            <label className="text-xs text-txt-tertiary flex items-center gap-1.5">
              Expires in
              <select
                value={inviteExpiry}
                onChange={(e) => setInviteExpiry(e.target.value)}
                disabled={busyUid === '__invite__'}
                className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-primary cursor-pointer focus:outline-none focus:border-blue-500"
              >
                <option value="never">Never</option>
                <option value="1d">1 day</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
              </select>
            </label>
          </div>

          {(() => {
            const visibleInvites = invites.filter(isInviteValid) // hide expired / redeemed
            if (visibleInvites.length === 0) return null
            const formatExpiry = (ms) => {
              if (!ms) return null
              const remaining = Number(ms) - Date.now()
              if (remaining <= 0) return 'expired'
              const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
              if (days >= 1) return `expires in ${days}d`
              const hours = Math.floor(remaining / (60 * 60 * 1000))
              if (hours >= 1) return `expires in ${hours}h`
              const mins = Math.max(1, Math.floor(remaining / (60 * 1000)))
              return `expires in ${mins}m`
            }
            return (
              <div className="space-y-2 mb-4">
                {visibleInvites.map(inv => {
                  const expiry = formatExpiry(inv.expiresAt)
                  return (
                    <div
                      key={inv.token}
                      className="p-2 rounded-md bg-surface-2 border border-surface-4 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-[11px] font-mono text-txt-primary break-all min-w-0">
                          {buildInviteUrl(currentDynasty.id, inv.token)}
                        </code>
                        <Button variant="outline" size="sm" onClick={() => handleCopyInviteUrl(inv.token)}>
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeInvite(inv.token)}
                          disabled={busyUid === `__invite__${inv.token}`}
                        >
                          Revoke
                        </Button>
                      </div>
                      {expiry && (
                        <div className="text-[10px] text-txt-tertiary px-1">{expiry}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          <details className="mt-4">
            <summary className="text-xs text-txt-tertiary cursor-pointer hover:text-txt-primary">
              Add by User ID instead
            </summary>
            <form onSubmit={handleAdd} className="space-y-3 mt-3">
              <div>
                <label className="block text-xs text-txt-tertiary mb-1">User ID</label>
                <input
                  type="text"
                  required
                  value={pendingUid}
                  onChange={e => setPendingUid(e.target.value)}
                  placeholder="Paste their User ID"
                  className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm font-mono border border-surface-4 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={busyUid === '__add__' || !pendingUid.trim()}>
                {busyUid === '__add__' ? 'Adding…' : 'Add Member'}
              </Button>
              <p className="text-xs text-txt-tertiary">
                Find their User ID on their Account page. Use this when you have their ID directly.
              </p>
            </form>
          </details>
        </Card>
      )}

      {canManage && !isCloudDynasty && (
        <Card>
          <h3
            className="label-sm text-txt-primary mb-1"
            style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
          >
            SHARING
          </h3>
          <p className="text-xs text-txt-tertiary">
            Local dynasties are stored only on this device. To share with another account, upgrade
            to Premium and convert this dynasty to cloud.
          </p>
        </Card>
      )}

      {myRole !== ROLE_COMMISH && (
        <Card>
          <h3
            className="label-sm text-txt-primary mb-1"
            style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
          >
            YOUR USER ID
          </h3>
          <p className="text-xs text-txt-tertiary mb-2">
            Share this ID if a commish needs to add you to another dynasty.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-xs font-mono break-all border border-surface-4">
              {user.uid}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(user.uid).then(
                  () => toast.success('Copied to clipboard'),
                  () => toast.error('Copy failed'),
                )
              }}
            >
              Copy
            </Button>
          </div>
        </Card>
      )}

      {/* Per-uid coaching staff. Each member records their OWN HC/OC/DC
          names — multi-coach dynasties no longer trample each other.
          Three-up grid with role labels as broadcast captions above each
          input slot, mirroring the Dashboard staff card. */}
      {myRole && myStaff && (
        <Card>
          <header className="flex items-baseline justify-between mb-1">
            <h3
              className="label-sm text-txt-primary"
              style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
            >
              YOUR STAFF
            </h3>
            {staffDraft != null && (
              <span
                className="label-xs"
                style={{ letterSpacing: '1.5px', fontSize: '9px', color: 'var(--accent-warning)' }}
              >
                UNSAVED
              </span>
            )}
          </header>
          <p className="text-xs text-txt-tertiary mb-3">
            Each coach's staff is tracked separately, so multi-coach dynasties don't share
            one field anymore.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { key: 'hcName', label: 'HEAD COACH' },
              { key: 'ocName', label: 'OFFENSIVE COORD.' },
              { key: 'dcName', label: 'DEFENSIVE COORD.' },
            ].map(({ key, label }) => (
              <div
                key={key}
                className="rounded-md bg-surface-2 px-3 py-2"
                style={{ border: '1px solid var(--surface-4)' }}
              >
                <label
                  className="block label-xs text-txt-tertiary mb-1"
                  style={{ letterSpacing: '1.5px', fontSize: '9px', fontWeight: 700 }}
                >
                  {label}
                </label>
                <input
                  type="text"
                  value={editingStaff[key] || ''}
                  onChange={e => setStaffDraft({ ...editingStaff, [key]: e.target.value })}
                  placeholder="—"
                  className="w-full bg-transparent text-txt-primary text-sm font-semibold focus:outline-none placeholder:text-txt-muted"
                />
              </div>
            ))}
          </div>
          {staffDraft != null && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveStaff}
                disabled={busyUid === '__staff__'}
              >
                {busyUid === '__staff__' ? 'Saving…' : 'Save Staff'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setStaffDraft(null)} disabled={busyUid === '__staff__'}>
                Cancel
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Self-leave: only shown for non-commish editors. The commish has
          to transfer the role first; we surface that as a hint instead
          of a button. */}
      {myRole && myRole !== ROLE_COMMISH && (
        <Card>
          <h3
            className="label-sm text-txt-primary mb-1"
            style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
          >
            LEAVE DYNASTY
          </h3>
          <p className="text-xs text-txt-tertiary mb-3">
            Walk yourself out. Your past coaching record stays in the timeline so the commish
            can still see your career — you just lose edit access.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveDynasty}
            disabled={busyUid === user.uid}
          >
            {busyUid === user.uid ? 'Leaving…' : 'Leave Dynasty'}
          </Button>
        </Card>
      )}

      {myRole === ROLE_COMMISH && otherEditors.length > 0 && (
        <Card>
          <h3
            className="label-sm text-txt-primary mb-1"
            style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
          >
            LEAVING THE DYNASTY
          </h3>
          <p className="text-xs text-txt-tertiary">
            As commish you can't leave directly. Use <span className="font-semibold text-txt-primary">Make Commish</span> on
            another member's row to transfer ownership — once transferred, you become a regular
            member and can leave from this same page.
          </p>
        </Card>
      )}

      {timelineUid && (
        <MemberTimelineEditor
          isOpen={timelineUid != null}
          onClose={() => setTimelineUid(null)}
          uid={timelineUid}
        />
      )}
    </div>
  )
}
