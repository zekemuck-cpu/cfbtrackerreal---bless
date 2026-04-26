/**
 * PendingInvitationsCard
 *
 * Surfaces league invitations the current user has received. Used on the
 * Account page. Subscribes to the user's email-keyed invitations and
 * shows accept / decline for each.
 *
 * Accepting: stamps inviteeUid on the invitation. Commish-side
 * reconciliation (LeagueSettings page) detects the accepted invite and
 * adds the user to dynasty.members[]. Until the commish opens that page
 * (or the next dynasty load triggers reconciliation), the user won't
 * see the dynasty in their list — that's a Phase 2 polish (push the
 * member-add to a Cloud Function so it runs server-side immediately).
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from './ui/Toast'
import { Card, Button, Badge } from './ui'
import {
  subscribeToMyInvitations,
  acceptInvitation,
  declineInvitation,
} from '../services/invitationsService'

export default function PendingInvitationsCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [invitations, setInvitations] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!user?.email) return
    const unsub = subscribeToMyInvitations(user.email, setInvitations)
    return unsub
  }, [user?.email])

  if (!user || invitations.length === 0) return null

  const handleAccept = async (inv) => {
    setBusyId(inv.id)
    try {
      await acceptInvitation(inv.id, user.uid)
      toast.success(`Accepted invitation to ${inv.dynastyName || 'league'}`)
    } catch (err) {
      console.error('[PendingInvitations] accept failed:', err)
      toast.error('Failed to accept invitation')
    } finally {
      setBusyId(null)
    }
  }

  const handleDecline = async (inv) => {
    setBusyId(inv.id)
    try {
      await declineInvitation(inv.id)
      toast.info('Invitation declined')
    } catch (err) {
      console.error('[PendingInvitations] decline failed:', err)
      toast.error('Failed to decline invitation')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card accent="top">
      <div className="flex items-center justify-between mb-3">
        <h3 className="label-sm text-txt-primary">League Invitations</h3>
        <Badge variant="warning">{invitations.length}</Badge>
      </div>
      <div className="divide-y divide-surface-3/50">
        {invitations.map(inv => (
          <div key={inv.id} className="py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-txt-primary truncate">
                {inv.dynastyName || 'Unnamed dynasty'}
              </div>
              <div className="text-xs text-txt-tertiary mt-0.5 truncate">
                Invited by {inv.commissionerEmail || 'commissioner'}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => handleDecline(inv)} disabled={busyId === inv.id}>
                Decline
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleAccept(inv)} disabled={busyId === inv.id}>
                {busyId === inv.id ? '…' : 'Accept'}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-txt-tertiary mt-3">
        After accepting, the league appears in your dynasties list once the commissioner has reconciled the new member.
      </p>
    </Card>
  )
}
