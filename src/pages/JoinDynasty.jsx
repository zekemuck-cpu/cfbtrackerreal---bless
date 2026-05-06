/**
 * /join/:dynastyId/:token — invite redemption.
 *
 * Flow:
 *   1. New user opens the invite URL (commish shared it with them).
 *   2. If signed-out, send them to /login with returnTo= back here.
 *   3. Once signed-in, attempt to add their uid to dynasty.editors[]
 *      and mark the invite redeemed in pendingInvites[].
 *   4. On success, drop them into the dynasty's dashboard.
 *   5. On Firestore-rules failure, show a clear fallback message
 *      pointing the user back to the commish.
 *
 * Firestore rules required for the direct redemption to work without a
 * Cloud Function: the dynasty doc's update rule must allow a non-member
 * to add their own uid to editors[] iff a matching unredeemed invite
 * token exists in pendingInvites. See the comment block in
 * src/data/leagueModel.js (Invite tokens section) for the requirement.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDynasty, updateDynasty as fsUpdateDynasty } from '../services/dynastyService'
import { storageService } from '../services/storage'
import {
  findInvite,
  isInviteValid,
  markInviteRedeemed,
  addEditor,
  ROLE_COCOMMISH,
  addCoCommish,
} from '../data/leagueModel'
import { Card, Button, Badge, EmptyState, PageHero } from '../components/ui'
import BouncingLogos from '../components/BouncingLogos'

export default function JoinDynasty() {
  const { dynastyId, token } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading') // loading | invalid | already | redeeming | success | rules_blocked | error
  const [errorMessage, setErrorMessage] = useState('')
  const [dynasty, setDynasty] = useState(null)
  const [invite, setInvite] = useState(null)

  // Stash the URL so /login can bounce back here after sign-in.
  useEffect(() => {
    if (!authLoading && !user) {
      try {
        sessionStorage.setItem('postLoginRedirect', `/join/${dynastyId}/${token}`)
      } catch {}
    }
  }, [authLoading, user, dynastyId, token])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // Not signed in — render a sign-in CTA. We don't auto-redirect so
      // the user understands what they're signing in for.
      setStatus('signed_out')
      return
    }
    if (!dynastyId || !token) {
      setStatus('invalid')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const d = await getDynasty(dynastyId)
        if (cancelled) return
        if (!d) {
          setStatus('invalid')
          return
        }
        setDynasty(d)
        // Already a member? Just send them in.
        const isAlreadyMember = d.userId === user.uid
          || (Array.isArray(d.editors) && d.editors.includes(user.uid))
        if (isAlreadyMember) {
          setStatus('already')
          return
        }
        const inv = findInvite(d, token)
        if (!isInviteValid(inv)) {
          setInvite(inv)
          setStatus('invalid')
          return
        }
        setInvite(inv)
        setStatus('ready')
      } catch (err) {
        // Most likely a permission error (rules block non-editor reads
        // on the dynasty doc). Surface it as a clear message.
        console.error('[JoinDynasty] lookup failed:', err)
        if (!cancelled) {
          setStatus('rules_blocked')
          setErrorMessage(err?.message || 'Could not read the dynasty.')
        }
      }
    })()

    return () => { cancelled = true }
  }, [authLoading, user, dynastyId, token])

  const handleAccept = async () => {
    if (!user || !dynasty || !invite) return
    setStatus('redeeming')
    try {
      const nextEditors = addEditor(dynasty, user.uid)
      const nextInvites = markInviteRedeemed(dynasty, token, user.uid)
      const updates = {
        editors: nextEditors,
        pendingInvites: nextInvites,
      }
      // Apply role from the invite (e.g. invite was issued as cocommish).
      if (invite.role === ROLE_COCOMMISH) {
        updates.coCommishes = addCoCommish(dynasty, user.uid)
      }
      // Cloud dynasty — write through Firestore directly. The storage
      // service routes by storageType but the typical invite use-case
      // is cloud-only.
      if (dynasty.storageType === 'cloud') {
        await fsUpdateDynasty(dynastyId, updates)
      } else {
        await storageService.updateDynasty(dynastyId, updates)
      }
      setStatus('success')
      // Brief pause so the success card flashes, then redirect.
      setTimeout(() => navigate(`/dynasty/${dynastyId}`), 700)
    } catch (err) {
      console.error('[JoinDynasty] redeem failed:', err)
      setErrorMessage(err?.message || 'Failed to join.')
      setStatus('rules_blocked')
    }
  }

  const renderBody = () => {
    if (authLoading || status === 'loading') {
      return (
        <Card>
          <p className="text-sm text-txt-tertiary text-center">Loading invite…</p>
        </Card>
      )
    }
    if (status === 'signed_out') {
      return (
        <Card>
          <p className="text-sm text-txt-secondary mb-4 text-center">
            Sign in to join this dynasty.
          </p>
          <Link to="/login">
            <Button variant="primary" className="w-full">Sign In</Button>
          </Link>
        </Card>
      )
    }
    if (status === 'invalid') {
      return (
        <Card>
          <EmptyState
            title="Invite link is invalid or expired"
            message="Ask the commish to generate a new one and share it with you."
          />
        </Card>
      )
    }
    if (status === 'already') {
      return (
        <Card>
          <EmptyState
            title="You're already a member"
            message="No need to redeem — head to the dynasty."
          />
          <div className="mt-4 flex justify-center">
            <Link to={`/dynasty/${dynastyId}`}>
              <Button variant="primary">Open Dynasty</Button>
            </Link>
          </div>
        </Card>
      )
    }
    if (status === 'rules_blocked') {
      return (
        <Card>
          <h3 className="label-sm text-txt-primary mb-2">Couldn't auto-join</h3>
          <p className="text-sm text-txt-secondary mb-3">
            The dynasty's settings don't allow self-redemption from this link yet.
            Send the commish your User ID below — they can paste it into the Members
            page to add you directly.
          </p>
          <code className="block px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-xs font-mono break-all border border-surface-4 mb-2">
            {user?.uid}
          </code>
          {errorMessage && (
            <p className="text-[11px] text-txt-tertiary">{errorMessage}</p>
          )}
        </Card>
      )
    }
    if (status === 'success') {
      return (
        <Card>
          <p className="text-sm text-txt-primary text-center">Joined! Taking you to the dynasty…</p>
        </Card>
      )
    }
    // ready / redeeming
    return (
      <Card>
        <h3 className="label-sm text-txt-primary mb-1">You've been invited</h3>
        <p className="text-sm text-txt-secondary mb-4">
          Joining will give you edit access to <span className="font-semibold text-txt-primary">{dynasty?.dynastyName || dynasty?.teamName || 'this dynasty'}</span>.
        </p>
        {invite?.role === ROLE_COCOMMISH && (
          <div className="mb-3">
            <Badge variant="primary">Joining as Co-Commish</Badge>
          </div>
        )}
        <Button
          variant="primary"
          className="w-full"
          onClick={handleAccept}
          disabled={status === 'redeeming'}
        >
          {status === 'redeeming' ? 'Joining…' : 'Accept Invite'}
        </Button>
      </Card>
    )
  }

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <BouncingLogos />
      <div className="relative z-10 max-w-md mx-auto px-4 py-10 space-y-4">
        <PageHero title="Join Dynasty" />
        {renderBody()}
        <div className="text-center">
          <Link to="/" className="text-xs text-txt-tertiary hover:text-txt-primary">
            Back to Dynasties
          </Link>
        </div>
      </div>
    </div>
  )
}
