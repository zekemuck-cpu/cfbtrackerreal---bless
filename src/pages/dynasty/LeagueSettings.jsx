/**
 * League Settings — commish-only management UI for the multiplayer league.
 *
 * Surfaces:
 *   - Roster of current members (with their owned teams + commish badge)
 *   - Pending invitations (with revoke button)
 *   - Invite-by-email form (with optional initial team assignment)
 *
 * Phase 1 scope: invite, revoke, see members + pending invites. Editing
 * permissions / removing members / transferring commish are Phase 2+.
 *
 * Reconciliation: when an invitee accepts an invitation, the invitations
 * doc flips status to 'accepted'. This page subscribes to the dynasty's
 * invitations and, when an accepted one is detected for an email that
 * isn't already in members[], adds the new member to dynasty.members[]
 * (commish-side reconciliation since they always have write authority).
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { PageHero, Card, Button, Badge, EmptyState } from '../../components/ui'
import {
  getMembers,
  getMemberByEmail,
  getMemberByUid,
  isCommish,
  createMember,
  computeMemberUids,
  MAX_MEMBERS_PER_LEAGUE,
} from '../../data/leagueModel'
import {
  createInvitation,
  revokeInvitation,
  subscribeToDynastyInvitations,
} from '../../services/invitationsService'

export default function LeagueSettings() {
  const { user } = useAuth()
  const { currentDynasty, updateDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeamTid, setInviteTeamTid] = useState('')
  const [inviting, setInviting] = useState(false)
  const [invitations, setInvitations] = useState([])

  const members = useMemo(() => getMembers(currentDynasty), [currentDynasty])
  const teamsSource = currentDynasty?.teams || {}

  // Build the team picker options once. Sort by abbr for stable display.
  const teamOptions = useMemo(() => {
    const out = []
    for (const [tid, team] of Object.entries(teamsSource)) {
      if (!team || !team.abbr) continue
      out.push({ tid: Number(tid), abbr: team.abbr, name: team.name })
    }
    return out.sort((a, b) => (a.abbr || '').localeCompare(b.abbr || ''))
  }, [teamsSource])

  // Subscribe to invitations for this dynasty. Need dynastyOwnerUid to
  // satisfy the rule's safe-query check (commish-side reads constrained
  // to invitations they own).
  useEffect(() => {
    if (!currentDynasty?.id || !currentDynasty?.userId) return
    const unsub = subscribeToDynastyInvitations(
      currentDynasty.id,
      currentDynasty.userId,
      setInvitations,
    )
    return unsub
  }, [currentDynasty?.id, currentDynasty?.userId])

  // Reconciliation: detect newly-accepted invitations and add the user
  // to members[]. Guarded by a ref-tracked seen set so we don't process
  // the same accept twice within a session.
  const reconciledInviteIdsRef = useRef(new Set())
  useEffect(() => {
    if (!currentDynasty?.id || !user) return
    const isUserCommish = isCommish(currentDynasty, user.uid)
    if (!isUserCommish) return // only commish reconciles

    const accepted = invitations.filter(i => i.status === 'accepted')
    if (accepted.length === 0) return

    // Track which invitation IDs map to which new members so the error
    // path can reset only the ones we actually attempted (newMembers
    // skips entries already-member or already-reconciled, so the
    // indexes don't align with `accepted`).
    const newMembers = []
    const newMemberInviteIds = []
    for (const inv of accepted) {
      if (reconciledInviteIdsRef.current.has(inv.id)) continue
      if (getMemberByEmail(currentDynasty, inv.inviteeEmail)) {
        reconciledInviteIdsRef.current.add(inv.id)
        continue
      }
      newMembers.push(createMember({
        uid: inv.inviteeUid || null,
        email: inv.inviteeEmail,
        teams: inv.initialTeams || [],
        isCommish: false,
      }))
      newMemberInviteIds.push(inv.id)
      reconciledInviteIdsRef.current.add(inv.id)
    }

    if (newMembers.length === 0) return

    const merged = [...members, ...newMembers]
    updateDynasty(currentDynasty.id, {
      members: merged,
      memberUids: computeMemberUids(merged),
    }).catch(err => {
      console.error('[LeagueSettings] reconciliation failed:', err)
      // Reset the seen flags so we retry on next render
      newMemberInviteIds.forEach(id => reconciledInviteIdsRef.current.delete(id))
    })
  }, [invitations, currentDynasty, members, user, updateDynasty])

  // Auth + permission gates -------------------------------------------
  if (!currentDynasty) return null
  if (!user) return <Navigate to="/login" replace />

  const userIsCommish = isCommish(currentDynasty, user.uid)
  if (!userIsCommish) {
    return (
      <div className="space-y-4 page-enter">
        <PageHero eyebrow="Commish" title="League Settings" />
        <Card>
          <EmptyState
            title="Commish only"
            message="Only the league commissioner can manage members."
          />
          <div className="mt-4 flex justify-center">
            <Link to={pathPrefix}>
              <Button variant="outline">Back to Dynasty</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  // Handlers ----------------------------------------------------------
  const pendingInvitations = invitations.filter(i => i.status === 'pending')

  const handleInvite = async (e) => {
    e?.preventDefault()
    if (!inviteEmail.trim()) return

    // Pre-flight: cap check (members + pending invites)
    const total = members.length + pendingInvitations.length
    if (total >= MAX_MEMBERS_PER_LEAGUE) {
      toast.error(`Member cap is ${MAX_MEMBERS_PER_LEAGUE}. Remove members or revoke invites first.`)
      return
    }

    // Pre-flight: already a member?
    if (getMemberByEmail(currentDynasty, inviteEmail)) {
      toast.error('That email is already a member of this league.')
      return
    }

    const initialTeams = inviteTeamTid ? [Number(inviteTeamTid)] : []

    setInviting(true)
    try {
      await createInvitation({
        dynastyId: currentDynasty.id,
        dynastyName: currentDynasty.dynastyName || currentDynasty.teamName || '',
        dynastyOwnerUid: currentDynasty.userId,
        commissionerEmail: user.email,
        inviteeEmail: inviteEmail,
        initialTeams,
      })
      toast.success(`Invitation sent to ${inviteEmail.toLowerCase().trim()}`)
      setInviteEmail('')
      setInviteTeamTid('')
    } catch (err) {
      console.error('[LeagueSettings] invite failed:', err)
      toast.error(err.message || 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleRevoke = async (invitation) => {
    const ok = await confirm({
      title: 'Revoke invitation?',
      message: `Cancel the pending invite to ${invitation.inviteeEmail}?`,
      confirmLabel: 'Revoke',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await revokeInvitation(invitation.id)
      toast.info('Invitation revoked.')
    } catch (err) {
      console.error('[LeagueSettings] revoke failed:', err)
      toast.error('Failed to revoke invitation')
    }
  }

  // Render ------------------------------------------------------------
  return (
    <div className="space-y-4 page-enter">
      <PageHero
        eyebrow="Commish"
        title="League Settings"
        meta={
          <>
            <span className="tabular">{members.length}</span>
            <span className="text-txt-tertiary"> / {MAX_MEMBERS_PER_LEAGUE} members</span>
            {pendingInvitations.length > 0 && (
              <>
                <span className="text-txt-tertiary"> · </span>
                <span className="tabular">{pendingInvitations.length}</span>
                <span className="text-txt-tertiary"> pending</span>
              </>
            )}
          </>
        }
      />

      {/* Members --------------------------------------------------- */}
      <Card>
        <h3 className="label-sm text-txt-primary mb-3">Members</h3>
        <div className="divide-y divide-surface-3/50">
          {members.map((m, i) => {
            const isYou = m.uid && m.uid === user.uid
            return (
              <div key={`${m.uid || m.email}-${i}`} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-txt-primary truncate">{m.email}</span>
                    {m.isCommish && <Badge variant="warning">Commish</Badge>}
                    {isYou && <span className="text-xs text-txt-tertiary">(you)</span>}
                  </div>
                  <div className="text-xs text-txt-tertiary mt-0.5">
                    {(m.teams || []).length === 0
                      ? 'No teams assigned'
                      : `Teams: ${m.teams.map(tid => teamsSource[tid]?.abbr || tid).join(', ')}`}
                  </div>
                </div>
                {/* Phase 1: no remove button. Editing membership comes
                    in a follow-up phase along with permissions UI. */}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Pending invitations -------------------------------------- */}
      {pendingInvitations.length > 0 && (
        <Card>
          <h3 className="label-sm text-txt-primary mb-3">Pending Invitations</h3>
          <div className="divide-y divide-surface-3/50">
            {pendingInvitations.map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-txt-primary truncate">
                    {inv.inviteeEmail}
                  </div>
                  <div className="text-xs text-txt-tertiary mt-0.5">
                    Initial teams: {(inv.initialTeams || []).length === 0
                      ? 'none'
                      : inv.initialTeams.map(tid => teamsSource[tid]?.abbr || tid).join(', ')}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleRevoke(inv)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Invite form --------------------------------------------- */}
      <Card>
        <h3 className="label-sm text-txt-primary mb-3">Invite a Member</h3>
        <form onSubmit={handleInvite} className="space-y-3">
          <div>
            <label className="block text-xs text-txt-tertiary mb-1">Email address</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm border border-surface-4 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-txt-tertiary mb-1">
              Initial team assignment <span className="text-txt-tertiary/70">(optional)</span>
            </label>
            <select
              value={inviteTeamTid}
              onChange={e => setInviteTeamTid(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-sm border border-surface-4 focus:border-blue-500 focus:outline-none"
            >
              <option value="">— Assign team later —</option>
              {teamOptions.map(t => (
                <option key={t.tid} value={t.tid}>{t.abbr} · {t.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="primary" disabled={inviting || !inviteEmail.trim()}>
            {inviting ? 'Sending…' : 'Send Invitation'}
          </Button>
        </form>
        <p className="text-xs text-txt-tertiary mt-4">
          Member must be premium to write to their team. They can join as a read-only spectator without premium.
        </p>
      </Card>
    </div>
  )
}
