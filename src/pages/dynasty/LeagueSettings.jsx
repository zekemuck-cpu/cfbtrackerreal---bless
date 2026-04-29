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
 * to manage them on behalf of users without premium; regular members
 * are capped at one.
 */

import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { PageHero, Card, Button, Badge, EmptyState } from '../../components/ui'
import { getTeamLogoByTid } from '../../data/teams'
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
  ROLE_COMMISH,
  ROLE_COCOMMISH,
  ROLE_MEMBER,
} from '../../data/leagueModel'

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

  const handleRename = async (uid) => {
    if (!canManage) return
    const draft = nameDrafts[uid]
    const current = getMemberLabel(currentDynasty, uid)
    if (draft === undefined || draft.trim() === current) {
      setNameDrafts(prev => ({ ...prev, [uid]: undefined }))
      return
    }
    setBusyUid(uid)
    try {
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
    const canPromote = canManageCo && role === ROLE_MEMBER
    const canDemote = canManageCo && role === ROLE_COCOMMISH
    const canTransfer = canManageCo && role !== ROLE_COMMISH

    const placeholder = role === ROLE_COMMISH ? 'Commish'
                       : role === ROLE_COCOMMISH ? 'Co-Commish'
                       : 'Member'

    return (
      <div key={uid} className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Name row */}
            <div className="flex items-center gap-2 flex-wrap">
              {canManage ? (
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
                  className="font-medium text-txt-primary bg-transparent border-b border-transparent hover:border-surface-4 focus:border-blue-500 focus:outline-none px-1 py-0.5 text-sm min-w-[120px]"
                />
              ) : (
                <span className="font-medium text-txt-primary text-sm">
                  {label || (isYou ? 'You' : placeholder)}
                </span>
              )}
              <Badge variant={ROLE_BADGE_VARIANT[role]}>{ROLE_LABEL[role]}</Badge>
              {isYou && <span className="text-xs text-txt-tertiary">(you)</span>}
            </div>

            <code className="block text-[11px] text-txt-tertiary font-mono mt-0.5 break-all">
              {uid}
            </code>

            {/* Team chips */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {teams.length === 0 && !canManage && (
                <span className="text-xs text-txt-tertiary italic">No team assigned</span>
              )}
              {teams.map(tid => {
                const team = teamsSource[tid]
                const teamName = team?.name || `Team ${tid}`
                const logo = getTeamLogoByTid(tid, teamsSource)
                return (
                  <span
                    key={tid}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-xs"
                  >
                    {logo && <img src={logo} alt="" className="w-4 h-4 object-contain" />}
                    <span className="font-semibold text-txt-primary">{teamName}</span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTeam(uid, tid)}
                        disabled={isBusy}
                        aria-label={`Remove ${teamName}`}
                        className="ml-0.5 -mr-1 text-txt-muted hover:text-red-400 transition-colors disabled:opacity-50"
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
                  className="text-xs px-2 py-1 rounded-md bg-surface-2 border border-surface-4 text-txt-secondary hover:bg-surface-3 transition-colors cursor-pointer focus:outline-none focus:border-blue-500"
                >
                  <option value="">{teams.length === 0 ? 'Assign a team…' : '+ Add team…'}</option>
                  {availableTeamOptions.map(t => (
                    <option key={t.tid} value={t.tid}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Right-side actions */}
          {canManage && role !== ROLE_COMMISH && (
            <div className="flex flex-col gap-1 flex-shrink-0">
              {canPromote && (
                <Button variant="outline" size="sm" onClick={() => handlePromote(uid)} disabled={isBusy}>
                  Make Co-Commish
                </Button>
              )}
              {canDemote && (
                <Button variant="outline" size="sm" onClick={() => handleDemote(uid)} disabled={isBusy}>
                  Demote
                </Button>
              )}
              {canTransfer && (
                <Button variant="outline" size="sm" onClick={() => handleMakeCommish(uid)} disabled={isBusy}>
                  Make Commish
                </Button>
              )}
              {canActOnThis && (
                <Button variant="outline" size="sm" onClick={() => handleRemove(uid)} disabled={isBusy}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 page-enter">
      <PageHero
        eyebrow={ROLE_LABEL[myRole]}
        title="League Members"
        meta={
          <>
            <span className="tabular">{totalMembers}</span>
            <span className="text-txt-tertiary"> member{totalMembers === 1 ? '' : 's'}</span>
          </>
        }
      />

      <Card>
        <h3 className="label-sm text-txt-primary mb-1">Members</h3>
        <p className="text-xs text-txt-tertiary mb-2">
          {canManage
            ? 'Click a name to rename. Members get one team each; commish and co-commishes can hold multiple to manage teams for users without premium.'
            : 'Names and team assignments are managed by the commish.'}
        </p>
        <div className="divide-y divide-surface-3/50">
          {renderRow(currentDynasty.userId)}
          {sortedOthers.map(uid => renderRow(uid))}
        </div>
      </Card>

      {canManage && (
        <Card>
          <h3 className="label-sm text-txt-primary mb-3">Add a Member</h3>
          <form onSubmit={handleAdd} className="space-y-3">
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
            <Button type="submit" variant="primary" disabled={busyUid === '__add__' || !pendingUid.trim()}>
              {busyUid === '__add__' ? 'Adding…' : 'Add Member'}
            </Button>
          </form>
          <p className="text-xs text-txt-tertiary mt-4">
            New members can read and edit this dynasty. They must sign in to the app first to obtain a User ID — find it on their Account page.
          </p>
        </Card>
      )}

      {myRole !== ROLE_COMMISH && (
        <Card>
          <h3 className="label-sm text-txt-primary mb-1">Your User ID</h3>
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
    </div>
  )
}
