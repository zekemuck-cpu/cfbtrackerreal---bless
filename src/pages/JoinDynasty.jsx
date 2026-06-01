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
import {
  getDynasty,
  updateDynasty as fsUpdateDynasty,
  getInviteDoc,
  redeemInviteDoc,
} from '../services/dynastyService'
import {
  isInviteValid,
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
        // Fetch the invite doc FIRST. The Firestore rule allows any
        // signed-in user to `get` an invite by exact token, so this
        // works even before the user is in editors[]. The dynasty
        // doc itself is gated behind editors-or-public, so we read it
        // optimistically — if it fails (rules block), we still render
        // a usable join page from the invite alone.
        const inv = await getInviteDoc(dynastyId, token)
        if (cancelled) return
        if (!inv) {
          setStatus('invalid')
          return
        }
        // Already redeemed BY ME but (per phase-2 failure) maybe not yet an
        // editor? Treat as resumable rather than dead — handleAccept will skip
        // re-claiming and just (re)append to editors. Only a redemption by
        // SOMEONE ELSE, or expiry, is a hard "invalid".
        const redeemedByMe = inv.redeemedBy && inv.redeemedBy === user.uid
        if (!isInviteValid(inv) && !redeemedByMe) {
          setInvite(inv)
          setStatus('invalid')
          return
        }
        setInvite(inv)

        // Try to read the dynasty for richer preview (name, etc.). If
        // the user isn't an editor yet (the common case), this read
        // will fail with permission-denied — fine, we just skip the
        // preview enhancement and rely on the invite's own metadata.
        try {
          const d = await getDynasty(dynastyId)
          if (cancelled) return
          if (d) {
            setDynasty(d)
            const isAlreadyMember = d.userId === user.uid
              || (Array.isArray(d.editors) && d.editors.includes(user.uid))
            if (isAlreadyMember) {
              setStatus('already')
              return
            }
          }
        } catch {
          // Read failure here is expected for non-editors. Swallow
          // and proceed to the redeem flow.
        }

        setStatus('ready')
      } catch (err) {
        console.error('[JoinDynasty] lookup failed:', err)
        if (!cancelled) {
          setStatus('rules_blocked')
          setErrorMessage(err?.message || 'Could not read the invite.')
        }
      }
    })()

    return () => { cancelled = true }
  }, [authLoading, user, dynastyId, token])

  const handleAccept = async () => {
    if (!user || !invite) return
    setStatus('redeeming')
    try {
      // Phase 1 — claim the invite. Writes redeemedBy/redeemedAt onto
      // the invite doc. The Firestore rule on invites/{token} enforces
      // that the invite was unredeemed AND the new redeemedBy equals
      // request.auth.uid, so a stranger can't claim it on someone else's
      // behalf and a race-loser can't double-redeem.
      // Skip phase 1 if this invite is already claimed by us (a prior attempt
      // where phase 2 failed) — re-claiming a redeemed invite would be blocked
      // by the rule, and we just need to (re)run phase 2 to land in editors[].
      if (invite.redeemedBy !== user.uid) {
        await redeemInviteDoc(dynastyId, token, user.uid)
      }

      // Phase 2 — append our uid to dynasty.editors[]. The Firestore
      // rule on the dynasty doc verifies the lastRedemption marker
      // points at our just-claimed invite.
      //
      // We send only the safe set of fields the redemption rule allows:
      // editors, lastRedemption, and (if the invite was issued as
      // cocommish) coCommishes via the regular editor write that's
      // unlocked once we're an editor — DOES NOT WORK in the same call;
      // splitting cocommish promotion to a follow-up call below.
      // Dedup with a Set so a stale in-memory editors[] can't double-add us.
      const existingEditors = Array.isArray(dynasty?.editors) ? dynasty.editors : []
      const nextEditors = [...new Set([...existingEditors, user.uid])]
      await fsUpdateDynasty(dynastyId, {
        editors: nextEditors,
        lastRedemption: { uid: user.uid, token, at: Date.now() },
      })

      // Phase 3 (optional) — if the invite was issued as cocommish,
      // promote ourselves now that we're an editor (the editor-write
      // rule covers this, no special redemption check needed).
      if (invite.role === ROLE_COCOMMISH && dynasty) {
        try {
          const nextCoCommishes = addCoCommish({
            ...dynasty,
            editors: nextEditors,
          }, user.uid)
          await fsUpdateDynasty(dynastyId, { coCommishes: nextCoCommishes })
        } catch (e) {
          console.warn('[JoinDynasty] cocommish promotion failed:', e)
          // Non-fatal — they're still an editor.
        }
      }

      setStatus('success')
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
