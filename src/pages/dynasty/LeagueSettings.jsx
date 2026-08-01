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
import { getContrastTextColor } from '../../utils/colorUtils'

// Same broadcast sheen the team-page header uses: a diagonal highlight plus a
// soft vertical darken, layered over the team's primary color.
const TEAM_SHEEN =
  'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.42) 100%)'
import { getCoachStints } from '../../data/coachStats'
import {
  createInviteDoc,
  deleteInviteDoc,
  subscribeToInvites,
  addEditorAtomic,
  removeMemberAtomic,
  setCoCommishAtomic,
  setMemberTeamsAtomic,
  addLocalCoachAtomic,
  removeLocalCoachAtomic,
  leaveDynasty as leaveDynastyAtomic,
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
  getLocalCoachIds,
  getLocalCoachOwner,
  isLocalCoachId,
  createLocalCoachId,
  addLocalCoachToMap,
  removeLocalCoachFromMap,
  ROLE_COMMISH,
  ROLE_COCOMMISH,
  ROLE_MEMBER,
} from '../../data/leagueModel'
import {
  getCoaches,
  getCoach,
  getCoachesControlledBy,
  getCurrentTeamTidForCoach,
  applyControlledCoachTeam,
  deriveMemberTeamsIndex,
  removeCoachSeason,
  setCoachSeason,
  deleteCoach,
  generateCid,
  COACH_ROLES,
  COACH_ROLE_LABELS,
} from '../../data/coachModel'
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
  const [timelineCid, setTimelineCid] = useState(null)
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
  // The roster counts CONTROLLED coaches (each member's separately-tracked
  // careers), so a solo owner running two coaches reads as two.
  const controlledCoachCount = Object.values(getCoaches(currentDynasty))
    .filter(c => c && c.controlledBy != null).length
  const totalMembers = Math.max(1 + otherEditors.length, controlledCoachCount)

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
      await addEditorAtomic(currentDynasty.id, uid)
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
      await removeMemberAtomic(currentDynasty.id, uid)
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
      // Optimistically push the new invite into local state so the user
      // sees the link immediately. The subscribeToInvites listener
      // requires the firestore.rules to permit `list` on the invites
      // subcollection — if rules haven't been deployed yet, the listener
      // returns no docs and the link would otherwise vanish on next tick.
      // The optimistic entry stays around for this session; subsequent
      // reloads need the deployed rules to repopulate.
      setInvites((prev) => {
        if (prev.some((inv) => inv.token === token)) return prev
        return [
          ...prev,
          {
            token,
            role: ROLE_MEMBER,
            createdBy: user.uid,
            createdAt: Date.now(),
            expiresAt,
            redeemedBy: null,
            redeemedAt: null,
          },
        ]
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
      await leaveDynastyAtomic(currentDynasty.id, user.uid)
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

  // ── Coach writes ─────────────────────────────────────────────────
  // coaches[cid] is the source of truth. We persist the full coaches map
  // plus the re-derived security index (merged over the existing one so no
  // member ever loses game-write access), dual-mode via updateDynasty. The
  // legacy uid-keyed maps are left untouched as a frozen pre-migration
  // snapshot. `_coachesControlMigrated` rides along so the load-migration
  // stays a no-op once the user has touched a coach.
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

  const newCoach = (uid) => ({
    cid: generateCid(),
    name: 'New Coach',
    controlledBy: uid,
    status: 'active',
    departedYear: null,
    byYear: {},
  })

  // Assign a team to a member: fill one of their teamless coaches if any,
  // else create a NEW coach for that team (separate tracked career per team).
  // Anyone may manage their OWN coaches; commish/co-commish manage anyone's.
  const handleAssignTeam = async (uid, tidStr) => {
    if (!canManage && uid !== user.uid) return
    const tid = Number(tidStr)
    if (!Number.isFinite(tid)) return
    // A member can't take a team another coach already controls — only the
    // commish can reassign across coaches.
    if (!canManage) {
      const taken = Object.values(getCoaches(currentDynasty)).some(c =>
        c && c.controlledBy != null && c.controlledBy !== user.uid &&
        Number(getCurrentTeamTidForCoach(c, currentDynasty.currentYear)) === tid
      )
      if (taken) {
        toast.error('That team is controlled by another coach. Ask the commissioner to reassign it.')
        return
      }
    }
    setBusyUid(uid)
    try {
      const year = currentDynasty.currentYear
      const mine = getCoachesControlledBy(currentDynasty, uid)
      const teamless = mine.find(c => getCurrentTeamTidForCoach(c, year) == null)
      let base = getCoaches(currentDynasty)
      let cid
      if (teamless) {
        cid = teamless.cid
      } else {
        const c = newCoach(uid)
        base = { ...base, [c.cid]: c }
        cid = c.cid
      }
      const { coaches } = applyControlledCoachTeam({ ...currentDynasty, coaches: base }, cid, year, tid)
      await writeCoaches(coaches)
    } catch (err) {
      console.error('[Members] assign team failed:', err)
      toast.error('Failed to assign team.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleAddCoach = async (uid) => {
    if (!canManage && uid !== user.uid) return
    setBusyUid(uid)
    try {
      const c = newCoach(uid)
      await writeCoaches({ ...getCoaches(currentDynasty), [c.cid]: c })
      toast.success('Coach added. Assign it a team.')
    } catch (err) {
      console.error('[Members] add coach failed:', err)
      toast.error('Failed to add coach.')
    } finally {
      setBusyUid(null)
    }
  }

  // Set (or clear) a specific coach's team for the current season — the
  // per-coach team picker on each card. tidStr '' clears the team.
  const handleSetCoachTeam = async (cid, tidStr) => {
    const coach = getCoach(currentDynasty, cid)
    if (!coach) return
    if (!canManage && coach.controlledBy !== user.uid) return
    const year = currentDynasty.currentYear
    const tid = tidStr === '' ? null : Number(tidStr)
    if (tidStr !== '' && !Number.isFinite(tid)) return
    // Members can't take a team another coach already controls.
    if (tid != null && !canManage) {
      const taken = Object.values(getCoaches(currentDynasty)).some(c =>
        c && c.controlledBy != null && c.cid !== cid &&
        Number(getCurrentTeamTidForCoach(c, year)) === tid
      )
      if (taken) {
        toast.error('That team is controlled by another coach. Ask the commissioner to reassign it.')
        return
      }
    }
    setBusyUid(cid)
    try {
      if (tid == null) {
        await writeCoaches({ ...getCoaches(currentDynasty), [cid]: removeCoachSeason(coach, year) })
      } else {
        const { coaches } = applyControlledCoachTeam(currentDynasty, cid, year, tid)
        await writeCoaches(coaches)
      }
    } catch (err) {
      console.error('[Members] set coach team failed:', err)
      toast.error('Failed to update team.')
    } finally {
      setBusyUid(null)
    }
  }

  // Set a coach's POSITION (HC/OC/DC) for the current season. Writes
  // byYear[year].role on the coach entity — the single source of truth that
  // Coach Career, the team-page staff list, and the Timeline all read, so
  // the position updates everywhere at once.
  const handleSetCoachRole = async (cid, role) => {
    const coach = getCoach(currentDynasty, cid)
    if (!coach) return
    if (!canManage && coach.controlledBy !== user.uid) return
    if (!COACH_ROLES.includes(role)) return
    const year = currentDynasty.currentYear
    setBusyUid(cid)
    try {
      await writeCoaches({ ...getCoaches(currentDynasty), [cid]: setCoachSeason(coach, year, { role }) })
    } catch (err) {
      console.error('[Members] set coach position failed:', err)
      toast.error('Failed to update position.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleRemoveCoach = async (cid) => {
    const coach = getCoach(currentDynasty, cid)
    if (!coach) return
    if (!canManage && coach.controlledBy !== user.uid) return
    const label = coach.name || 'this coach'
    const ok = await confirm({
      title: 'Remove coach?',
      message: `Delete ${label} and the record tracked under them? This can't be undone.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    })
    if (!ok) return
    setBusyUid(cid)
    try {
      await writeCoaches(deleteCoach(getCoaches(currentDynasty), cid))
      setTimelineCid(prev => (prev === cid ? null : prev))
      toast.info('Coach removed.')
    } catch (err) {
      console.error('[Members] remove coach failed:', err)
      toast.error('Failed to remove coach.')
    } finally {
      setBusyUid(null)
    }
  }

  const handleRenameCoach = async (cid) => {
    const draft = nameDrafts[cid]
    const coach = getCoach(currentDynasty, cid)
    if (!coach) return
    const current = coach.name || ''
    if (draft === undefined || draft.trim() === current) {
      setNameDrafts(prev => ({ ...prev, [cid]: undefined }))
      return
    }
    setBusyUid(cid)
    try {
      await writeCoaches({ ...getCoaches(currentDynasty), [cid]: { ...coach, name: draft.trim() } })
      setNameDrafts(prev => ({ ...prev, [cid]: undefined }))
    } catch (err) {
      console.error('[Members] rename coach failed:', err)
      toast.error('Failed to save name.')
    } finally {
      setBusyUid(null)
    }
  }

  const handlePromote = async (uid) => {
    if (!canManageCo) return
    setBusyUid(uid)
    try {
      await setCoCommishAtomic(currentDynasty.id, uid, true)
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
      await setCoCommishAtomic(currentDynasty.id, uid, false)
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
      // The rules only allow transferring ownership to a PREMIUM member
      // (otherwise the dynasty's writes would brick — audit C4). A
      // permission-denied here almost always means the target isn't
      // premium; surface that instead of a raw Firestore error.
      const denied = /insufficient permissions|permission-denied/i.test(err?.message || '')
      toast.error(denied
        ? `${label} must have their own premium subscription before they can become commish.`
        : (err.message || 'Failed to transfer commish role.'))
    } finally {
      setBusyUid(null)
    }
  }

  // ── render ────────────────────────────────────────────────────────

  // A coach card styled like the team-page header: the whole row is the
  // coach's team color with the broadcast sheen, contrast-aware text sits
  // directly on the color, and the logo is in a white circle. Teamless
  // coaches fall back to a neutral surface. Inline team picker + Timeline +
  // delete.
  const renderCoachLine = (coach) => {
    const cid = coach.cid
    const canEdit = canManage || coach.controlledBy === user.uid
    const busy = busyUid === cid
    const cy = currentDynasty.currentYear
    const tid = getCurrentTeamTidForCoach(coach, cy)
    const team = tid != null ? teamsSource[tid] : null
    // Coaching position (HC/OC/DC) for the current season — defaults to HC.
    const coachRole = coach.byYear?.[cy]?.role ?? coach.byYear?.[String(cy)]?.role ?? 'HC'
    const logo = tid != null ? getTeamLogoByTid(tid, teamsSource) : null
    const teamColor = (tid != null && teamsSource[tid]?.primaryColor) || null
    const onColor = !!teamColor
    const textColor = onColor
      ? getContrastTextColor(teamColor, teamsSource[tid]?.secondaryColor)
      : null
    const lightText = (textColor || '').toLowerCase() === '#ffffff'
    // Subtle, contrast-correct overlay for the controls (pill/buttons) so they
    // read on any team color: light film on dark teams, dark film on light ones.
    const chip = onColor ? (lightText ? 'bg-white/15' : 'bg-black/10') : 'bg-surface-1'
    const chipHover = onColor ? (lightText ? 'hover:bg-white/25' : 'hover:bg-black/20') : 'hover:bg-surface-3'
    const draftValue = nameDrafts[cid] !== undefined ? nameDrafts[cid] : (coach.name || '')
    return (
      <div
        key={cid}
        className={`coach-card flex items-center gap-3 rounded-xl pl-2 pr-2 py-2 overflow-hidden border ${onColor ? 'border-black/15' : 'bg-surface-2 border-surface-4'}`}
        style={onColor ? { backgroundColor: teamColor, backgroundImage: TEAM_SHEEN, color: textColor } : undefined}
      >
        {/* Team logo in a white circle. */}
        <span
          className="flex items-center justify-center rounded-full bg-white flex-shrink-0 shadow-sm ring-1 ring-black/10"
          style={{ width: 36, height: 36 }}
        >
          {logo
            ? <img src={logo} alt="" className="w-7 h-7 object-contain" />
            : <span className="w-3 h-3 rounded-full bg-surface-4 inline-block" aria-hidden="true" />}
        </span>

        {/* Coach name sits directly on the color. */}
        {canEdit ? (
          <input
            type="text"
            value={draftValue}
            placeholder="Coach name"
            onChange={e => setNameDrafts(prev => ({ ...prev, [cid]: e.target.value }))}
            onBlur={() => handleRenameCoach(cid)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.target.blur() }
              if (e.key === 'Escape') { setNameDrafts(prev => ({ ...prev, [cid]: undefined })); e.target.blur() }
            }}
            disabled={busy}
            // Inline transparent beats the global `input { background: surface-2 }`
            // rule (6 :not() clauses outrank Tailwind's bg-transparent), so the
            // name reads as plain text on the team color, not a dark field.
            style={{ backgroundColor: 'transparent', ...(onColor ? { color: textColor } : {}) }}
            className={`flex-1 min-w-0 font-display font-bold focus:outline-none text-base leading-tight ${onColor ? (lightText ? 'placeholder-white/55' : 'placeholder-black/45') : 'text-txt-primary placeholder-txt-muted'}`}
          />
        ) : (
          <span className={`flex-1 min-w-0 truncate font-display font-bold text-base ${onColor ? '' : 'text-txt-primary'}`} style={onColor ? { color: textColor } : undefined}>
            {coach.name || 'Coach'}
          </span>
        )}

        {/* Team picker — click to assign or change; the native select overlays. */}
        {canEdit ? (
          <label
            className={`relative inline-flex items-center gap-1.5 flex-shrink-0 pl-2 pr-1.5 py-1 rounded-lg transition-colors cursor-pointer ${chip} ${chipHover} ${onColor ? '' : 'border border-surface-4'}`}
            style={onColor ? { color: textColor } : undefined}
          >
            <span className={`text-xs font-semibold truncate max-w-[150px] ${onColor ? '' : (team ? 'text-txt-secondary' : 'text-txt-muted')}`}>
              {team?.name || 'Assign team'}
            </span>
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <select
              value={tid ?? ''}
              onChange={e => handleSetCoachTeam(cid, e.target.value)}
              disabled={busy}
              aria-label="Set coach's team"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              <option value="">No team</option>
              {teamOptions.map(t => (
                <option key={t.tid} value={t.tid}>{t.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className={`text-xs flex-shrink-0 ${onColor ? 'opacity-90' : 'text-txt-tertiary'}`} style={onColor ? { color: textColor } : undefined}>{team?.name || 'No team'}</span>
        )}

        {/* Position picker (HC/OC/DC) — sits right next to the team. Writes
            byYear[year].role, the same field every coach display reads. */}
        {canEdit && tid != null ? (
          <label
            className={`relative inline-flex items-center gap-1 flex-shrink-0 pl-2 pr-1.5 py-1 rounded-lg transition-colors cursor-pointer ${chip} ${chipHover} ${onColor ? '' : 'border border-surface-4'}`}
            style={onColor ? { color: textColor } : undefined}
            title={COACH_ROLE_LABELS[coachRole] || coachRole}
          >
            <span className={`text-xs font-semibold ${onColor ? '' : 'text-txt-secondary'}`}>{coachRole}</span>
            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <select
              value={coachRole}
              onChange={e => handleSetCoachRole(cid, e.target.value)}
              disabled={busy}
              aria-label="Set coach's position"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {COACH_ROLES.map(r => (
                <option key={r} value={r}>{COACH_ROLE_LABELS[r] || r}</option>
              ))}
            </select>
          </label>
        ) : (tid != null && (
          <span
            className={`text-xs font-semibold flex-shrink-0 ${onColor ? 'opacity-90' : 'text-txt-tertiary'}`}
            style={onColor ? { color: textColor } : undefined}
            title={COACH_ROLE_LABELS[coachRole] || coachRole}
          >
            {coachRole}
          </span>
        ))}

        {canEdit && (
          <div className="flex items-center gap-0.5 flex-shrink-0" style={onColor ? { color: textColor } : undefined}>
            <button
              type="button"
              onClick={() => setTimelineCid(cid)}
              disabled={busy}
              className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 ${onColor ? chipHover : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-3'}`}
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => handleRemoveCoach(cid)}
              disabled={busy}
              aria-label="Remove coach"
              title="Remove coach"
              className={`p-1.5 rounded-md transition-colors disabled:opacity-50 ${onColor ? chipHover : 'text-txt-muted hover:text-red-400 hover:bg-surface-3'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderRow = (uid) => {
    const role = getRole(currentDynasty, uid)
    if (!role) return null
    const isYou = uid === user.uid
    const myCoaches = getCoachesControlledBy(currentDynasty, uid)
    const isBusy = busyUid === uid
    const canActOnThis = canActOnUser(currentDynasty, user.uid, uid)
    const canPromote = canManageCo && isCloudDynasty && role === ROLE_MEMBER
    const canDemote = canManageCo && isCloudDynasty && role === ROLE_COCOMMISH
    const canTransfer = canManageCo && isCloudDynasty && role !== ROLE_COMMISH
    const canEditCoaches = canManage || isYou

    const hasAnyAction = canManage && role !== ROLE_COMMISH && (canPromote || canDemote || canTransfer || canActOnThis)

    return (
      <div key={uid} className="member-group">
        {/* Member header — just the user's ID (copyable), plus access actions. */}
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(uid).then(() => toast.success('User ID copied'), () => {})}
            className="font-mono text-[11px] text-txt-muted hover:text-txt-tertiary transition-colors truncate max-w-full"
            title="Copy user ID"
          >
            {uid}
          </button>

          {hasAnyAction && (
            <div className="flex items-center gap-1 ml-auto">
              {canPromote && (
                <Button variant="outline" size="sm" onClick={() => handlePromote(uid)} disabled={isBusy}>Promote</Button>
              )}
              {canDemote && (
                <Button variant="outline" size="sm" onClick={() => handleDemote(uid)} disabled={isBusy}>Demote</Button>
              )}
              {canTransfer && (
                <Button variant="outline" size="sm" onClick={() => handleMakeCommish(uid)} disabled={isBusy}>Make Commish</Button>
              )}
              {canActOnThis && (
                <Button variant="outline" size="sm" onClick={() => handleRemove(uid)} disabled={isBusy}>Remove</Button>
              )}
            </div>
          )}
        </div>

        {/* Coaches — each a separate tracked career on its own team. */}
        <div className="space-y-2">
          {myCoaches.length === 0 && !canEditCoaches && (
            <span className="text-xs text-txt-muted italic">No coach assigned</span>
          )}
          {myCoaches.map(coach => renderCoachLine(coach))}
          {canEditCoaches && (
            <button
              type="button"
              onClick={() => handleAddCoach(uid)}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-surface-4 text-xs font-semibold text-txt-tertiary hover:text-txt-primary hover:border-surface-5 hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              + Add coach
            </button>
          )}
        </div>
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
      <Card>
        <header className="flex items-baseline justify-between mb-1">
          <h3
            className="label-sm text-txt-primary"
            style={{ letterSpacing: '2px', fontSize: '11px', fontWeight: 700 }}
          >
            COACHES
          </h3>
          <span
            className="label-xs text-txt-tertiary tabular"
            style={{ letterSpacing: '1.5px', fontSize: '9px' }}
          >
            {controlledCoachCount} {controlledCoachCount === 1 ? 'COACH' : 'COACHES'}
          </span>
        </header>
        <p className="text-xs text-txt-tertiary mb-4">
          {canManage
            ? 'Each coach is a separately tracked career with its own name, team, and record. Add a coach for every team you run.'
            : 'Edit your coach name and team below. Other assignments are managed by the commish.'}
        </p>
        <div className="space-y-6">
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
              INVITE A USER
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
                className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-primary cursor-pointer focus:outline-none focus:border-surface-5"
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
                  className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm font-mono border border-surface-4 focus:border-surface-5 focus:outline-none"
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
        <p className="text-xs text-txt-muted px-1">
          This dynasty is stored only on this device. To invite another user,{' '}
          <Link to="/account" className="text-txt-secondary underline hover:text-txt-primary transition-colors">
            upgrade to Premium
          </Link>{' '}
          and convert it to cloud.
        </p>
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
            can still see your career; you just lose edit access.
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
            another member's row to transfer ownership; once transferred, you become a regular
            member and can leave from this same page.
          </p>
        </Card>
      )}

      {timelineCid && (
        <MemberTimelineEditor
          isOpen={timelineCid != null}
          onClose={() => setTimelineCid(null)}
          cid={timelineCid}
        />
      )}
    </div>
  )
}
