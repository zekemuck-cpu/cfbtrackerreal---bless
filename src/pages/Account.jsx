import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDynasty } from '../context/DynastyContext'
import { storageService } from '../services/storage'
import BouncingLogos from '../components/BouncingLogos'
import { Card, Button, Badge, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { PAYWALL_ENABLED, PREMIUM_PRICE, PREMIUM_PRICE_PER_MO } from '../config/billing'
import {
  adminGrantPremium,
  adminRevokePremium,
  adminRecoverOrphan,
  deleteAccount,
} from '../services/subscriptionService'

// Hard-coded admin allowlist for the dev tools panel. The server enforces
// the same allowlist on /api/admin/* endpoints, so this is just a UI
// nicety — the panel's buttons are inert for non-admins.
const ADMIN_EMAILS = new Set(['alex.guess1999@gmail.com'])

// Post-beta: self-grant is limited to the permanent free accounts (the
// owner is covered implicitly via ADMIN_EMAILS). Must mirror
// BETA_GRANT_EMAILS in api/_verifyAuth.js — the server is the actual
// gate; this client list only controls whether the free-access card shows.
const BETA_GRANT_EMAILS = new Set([
  'zekemuck@gmail.com',
])


export default function Account() {
  const { user, isPremium, upgradeToPremium, manageSubscription, subscription, signOut } = useAuth()
  const { dynasties } = useDynasty()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const [upgrading, setUpgrading] = useState(false)
  const [devStatus, setDevStatus] = useState(null)
  const [showDevTools, setShowDevTools] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Orphan-recovery form state. Used to pull players + games from a
  // pre-bug-fix cloud dynasty whose main doc was deleted but whose
  // subcollections are still in Firestore.
  const [recoverOldId, setRecoverOldId] = useState('')
  const [recoverTargetId, setRecoverTargetId] = useState('')
  const [recovering, setRecovering] = useState(false)
  // Re-sync repair: push a complete local dynasty into an existing cloud
  // dynasty whose migration landed incompletely (e.g. schedules + NIL missing).
  const [resyncLocalId, setResyncLocalId] = useState('')
  const [resyncCloudId, setResyncCloudId] = useState('')
  const [resyncing, setResyncing] = useState(false)

  const userEmailLower = user?.email?.toLowerCase()
  const isAdmin = !!userEmailLower && ADMIN_EMAILS.has(userEmailLower)
  // Anyone allowed to self-grant beta premium (admins are implicitly allowed).
  const canBetaGrant = !!userEmailLower && (BETA_GRANT_EMAILS.has(userEmailLower) || ADMIN_EMAILS.has(userEmailLower))

  const handleGrantPremium = async () => {
    setDevStatus('granting')
    try {
      await adminGrantPremium()
      setDevStatus('granted')
    } catch (error) {
      console.error('Failed to grant premium:', error)
      toast.error(error.message || 'Failed to grant premium')
      setDevStatus('error')
    }
  }

  const handleRevokePremium = async () => {
    setDevStatus('revoking')
    try {
      await adminRevokePremium()
      setDevStatus('revoked')
    } catch (error) {
      console.error('Failed to revoke premium:', error)
      toast.error(error.message || 'Failed to revoke premium')
      setDevStatus('error')
    }
  }

  const handleRecoverOrphan = async () => {
    if (!recoverOldId.trim() || !recoverTargetId.trim()) {
      toast.error('Both fields are required')
      return
    }
    setRecovering(true)
    try {
      // Step 1: pull orphan subcollections from Firestore via admin API
      const orphan = await adminRecoverOrphan(recoverOldId.trim())
      if (!orphan?.ok) {
        toast.error(orphan?.error || 'Recovery fetch failed')
        return
      }
      if (orphan.playerCount === 0 && orphan.gameCount === 0) {
        toast.warning(`No data found at ${recoverOldId.trim()}. Either it's empty or already cleaned.`)
        return
      }

      // Step 2: write into the chosen target dynasty (local or cloud)
      const result = await storageService.recoverOrphanIntoTarget(
        recoverTargetId.trim(),
        orphan.players,
        orphan.games
      )
      if (!result.success) {
        toast.error(result.error || 'Recovery write failed')
        return
      }

      toast.success(
        `Recovered ${orphan.playerCount} players and ${orphan.gameCount} games. Reload to see them.`
      )
      setRecoverOldId('')
      setRecoverTargetId('')
    } catch (err) {
      console.error('[Account] recovery failed:', err)
      toast.error(err.message || 'Recovery failed')
    } finally {
      setRecovering(false)
    }
  }

  const handleResync = async () => {
    if (!resyncLocalId || !resyncCloudId) {
      toast.error('Pick both a local source and a cloud target')
      return
    }
    if (resyncLocalId === resyncCloudId) {
      toast.error('Source and target must be different dynasties')
      return
    }
    setResyncing(true)
    try {
      const result = await storageService.resyncDynastyToCloud(resyncLocalId, resyncCloudId)
      if (result.success) {
        toast.success(`Re-synced: ${result.written.join(', ') || 'nothing to write'}. Reload the cloud dynasty to see it.`)
        setResyncLocalId('')
        setResyncCloudId('')
      } else if (result.written?.length) {
        toast.warning(`Partial re-sync. Uploaded: ${result.written.join(', ')}. Failed: ${result.failed.join(', ')}.`)
      } else {
        toast.error(result.error || 'Re-sync failed')
      }
    } catch (err) {
      console.error('[Account] re-sync failed:', err)
      toast.error(err.message || 'Re-sync failed')
    } finally {
      setResyncing(false)
    }
  }

  const handleManageSubscription = async () => {
    if (!manageSubscription) return
    try {
      await manageSubscription()
    } catch (err) {
      console.error('[Account] manage subscription failed:', err)
      // Most common failure: user is dev/beta-granted (no Stripe customer)
      // and shouldn't see this button at all. We hide it for those users
      // below, but if it slips through, show the error rather than failing
      // silently — the previous build had this onClick swallow the error.
      const msg = err?.message?.includes('no subscription')
        ? 'No Stripe subscription on this account, nothing to manage.'
        : (err?.message || 'Could not open the subscription portal. Try again later.')
      toast.error(msg)
    }
  }

  const handleUpgrade = async () => {
    if (!upgradeToPremium) return
    setUpgrading(true)
    try {
      await upgradeToPremium()
    } catch (error) {
      console.error('Upgrade error:', error)
      toast.error('Failed to start upgrade. Please try again.')
    } finally {
      setUpgrading(false)
    }
  }

  // Two-step delete confirmation: a dialog AND a typed-email check on the
  // server. Single click can't nuke an account.
  const handleDeleteAccount = async () => {
    if (!user?.email) return
    const confirmed = await confirm({
      title: 'Delete account permanently?',
      message:
        'This will cancel any active subscription, permanently delete every dynasty saved to the cloud, and remove your sign-in. Local-storage dynasties on this device are not affected. This cannot be undone.',
      confirmLabel: 'Delete account',
      variant: 'danger',
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      const result = await deleteAccount(user.email)
      if (result?.ok) {
        toast.info('Account deleted.')
        // Force-clear local sign-in state. Auth deletion already invalidated
        // the token, so any subsequent Firestore call would 401.
        try { await signOut() } catch { /* ignore */ }
        navigate('/')
      } else {
        const errs = (result?.errors || []).join('; ')
        toast.error(`Account deletion partially failed: ${errs || 'unknown error'}`)
      }
    } catch (e) {
      console.error('[Account] delete failed:', e)
      toast.error(e.message || 'Failed to delete account')
    } finally {
      setDeleting(false)
    }
  }

  const billingEnd =
    subscription?.currentPeriodEnd?.toDate?.()?.toLocaleDateString() ||
    (subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd).toLocaleDateString()) ||
    'N/A'

  if (!user) {
    return (
      <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
        <BouncingLogos />
        <div className="relative z-10 flex items-center justify-center p-8">
          <Card>
            <p className="text-txt-secondary mb-4 text-center">Sign in to view your account</p>
            <Link to="/login">
              <Button variant="primary" className="w-full">Sign In</Button>
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <BouncingLogos />

      <div className="relative z-10 max-w-xl mx-auto px-4 py-6 space-y-4">
        {/* Profile — identity, status, and the shareable User ID in one card. */}
        <Card>
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold"
                style={{ backgroundColor: 'var(--surface-3)', color: 'var(--text-primary)' }}
              >
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-txt-primary truncate">
                {user.displayName || 'User'}
              </div>
              <div className="text-sm text-txt-tertiary truncate">{user.email}</div>
            </div>
            <Badge variant={isPremium ? 'warning' : 'outline'}>
              {isPremium ? 'Cloud saves' : 'Local only'}
            </Badge>
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--surface-4)' }}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="label-xs text-txt-tertiary">User ID</span>
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded-md border border-surface-4 text-txt-secondary hover:bg-surface-3 transition-colors"
                onClick={() => {
                  navigator.clipboard?.writeText(user.uid).then(
                    () => toast.success('Copied to clipboard'),
                    () => toast.error('Copy failed'),
                  )
                }}
              >
                Copy
              </button>
            </div>
            <code className="block px-3 py-2 rounded-md bg-surface-2 text-txt-primary text-xs font-mono break-all border border-surface-4">
              {user.uid}
            </code>
            <p className="text-xs text-txt-tertiary mt-2">
              Share this ID with a dynasty owner to get edit access to their dynasty.
            </p>
          </div>
        </Card>

        {/* Cloud Saves — the single source of truth for the one paid add-on:
            the pitch, current status/billing, and the upgrade / beta CTA, all
            unified into one card. */}
        <Card>
          <h2 className="label-sm text-txt-primary mb-3 text-center">Cloud Saves</h2>
          {isPremium && !subscription?._devGranted ? (
            /* Paying subscriber */
            <p className="text-sm text-txt-secondary text-center">
              Thanks for supporting the app! Your <span className="text-txt-primary font-medium">cloud saves</span> keep
              your dynasties synced live across all your devices, with automatic backups. Everything else on the site is
              free, forever.
            </p>
          ) : subscription?._devGranted ? (
            /* Comped / free-access account */
            <p className="text-sm text-txt-secondary text-center">
              Everything on the site is free, forever. Your <span className="text-txt-primary font-medium">cloud saves</span> —
              live sync across devices with automatic backups — are enabled at no charge.
            </p>
          ) : (
            /* Free tier — the pitch */
            <>
              <p className="text-sm text-txt-primary text-center font-semibold mb-2">
                Everything on the site is free, forever.
              </p>
              <p className="text-sm text-txt-secondary text-center">
                The only paid add-on is <span className="text-txt-primary font-medium">cloud saves</span>: sync your
                dynasties live across all your devices, with automatic backups, instead of storing them only on this
                device — {PREMIUM_PRICE_PER_MO}, just enough to cover server costs (I&apos;m not looking to profit).
              </p>
            </>
          )}

          {isPremium ? (
            <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface-3)' }}>
              {subscription?.cancelAtPeriodEnd ? (
                <div style={{ color: 'var(--accent-warning)' }}>
                  <div className="font-medium mb-1">Cloud saves ending</div>
                  <div>Access ends on <span className="font-semibold tabular">{billingEnd}</span>.</div>
                  <div className="text-xs mt-1 opacity-80">
                    When it ends, your cloud dynasties are auto-copied to local storage.
                  </div>
                </div>
              ) : subscription?._devGranted ? (
                <div className="space-y-1 text-txt-secondary">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="font-medium" style={{ color: 'var(--accent-success)' }}>Enabled, free</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expires</span>
                    <span className="font-medium text-txt-primary tabular">{billingEnd}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-txt-secondary">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="font-medium" style={{ color: 'var(--accent-success)' }}>Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next billing</span>
                    <span className="font-medium text-txt-primary tabular">{billingEnd}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount</span>
                    <span className="font-medium text-txt-primary tabular">{PREMIUM_PRICE}</span>
                  </div>
                </div>
              )}
              {!subscription?._devGranted && (
                <Button variant="outline" className="w-full mt-3" onClick={handleManageSubscription}>
                  Manage Subscription
                </Button>
              )}
            </div>
          ) : (
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--surface-4)' }}>
              {PAYWALL_ENABLED ? (
                <>
                  <Button
                    variant="primary"
                    className="w-full"
                    disabled={upgrading}
                    onClick={async () => {
                      setUpgrading(true)
                      try {
                        await upgradeToPremium()
                      } catch (error) {
                        console.error('Upgrade error:', error)
                        toast.error(error.message || 'Failed to start checkout. Please try again.')
                      } finally {
                        setUpgrading(false)
                      }
                    }}
                  >
                    {upgrading ? 'Loading…' : `Enable cloud saves for ${PREMIUM_PRICE_PER_MO}`}
                  </Button>
                  <p className="text-center text-txt-tertiary text-xs mt-3">
                    Cancel anytime. Secure checkout via Stripe.
                  </p>
                </>
              ) : (
                /* Fallback shown only if the paywall is ever disabled. */
                <>
                  <Link to="/contact" className="block">
                    <Button variant="primary" className="w-full">
                      Contact me for access
                    </Button>
                  </Link>
                  <p className="text-center text-txt-tertiary text-xs mt-3">
                    Message me from the Contact page with the email you sign in with.
                  </p>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Free access — self-serve grant/revoke for the permanent free
            accounts (lifetime grants; see api/_handlers/admin/grant-premium.js). */}
        {canBetaGrant && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="label-sm text-txt-primary">Free Access</h2>
              <span className="label-xs text-txt-tertiary">{subscription?.subscriptionStatus || 'none'}</span>
            </div>
            <p className="text-sm text-txt-secondary mb-4">
              {isPremium
                ? 'Your free premium access is active.'
                : 'This account has permanent free premium. Grant yourself access — you will never be charged.'}
            </p>
            {!isPremium ? (
              <Button variant="primary" className="w-full" onClick={handleGrantPremium} disabled={devStatus === 'granting'}>
                {devStatus === 'granting' ? 'Granting...' : 'Activate free premium'}
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleRevokePremium} disabled={devStatus === 'revoking'}>
                {devStatus === 'revoking' ? 'Revoking...' : 'Revoke my access'}
              </Button>
            )}
            {devStatus === 'granted' && (
              <p className="text-sm text-center mt-3" style={{ color: 'var(--accent-success)' }}>
                Granted. Refresh to see it everywhere.
              </p>
            )}
            {devStatus === 'revoked' && (
              <p className="text-sm text-center mt-3 text-txt-secondary">Revoked. Refresh to see it everywhere.</p>
            )}
            {devStatus === 'error' && (
              <p className="text-sm text-center mt-3 text-red-400">
                Action failed. Make sure your signed-in email matches the allowlist.
              </p>
            )}
          </Card>
        )}

        {/* Dev Tools — admin allowlist only. Non-admins don't even see the
            section header. The server enforces the same gate, so even if a
            non-admin re-enables this client-side, the API will 403. */}
        {isAdmin && (
          <Card padding="none">
            <button
              onClick={() => setShowDevTools(!showDevTools)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm text-txt-tertiary hover:text-txt-primary transition-colors"
            >
              <span>Dev Tools</span>
              <span className="label-xs">{showDevTools ? 'Hide' : 'Show'}</span>
            </button>

            {showDevTools && (
              <div className="px-4 pb-4 space-y-4">
                <div className="p-3 rounded-lg text-xs space-y-1" style={{ backgroundColor: 'var(--surface-3)' }}>
                  <div className="flex justify-between">
                    <span className="text-txt-tertiary">User ID</span>
                    <span className="font-mono text-txt-primary truncate ml-2">{user.uid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-txt-tertiary">Tier</span>
                    <span className={isPremium ? '' : 'text-txt-primary'} style={isPremium ? { color: 'var(--accent-warning)' } : undefined}>
                      {subscription?.tier || 'free'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-txt-tertiary">Status</span>
                    <span className="text-txt-primary">{subscription?.subscriptionStatus || 'none'}</span>
                  </div>
                  {subscription?.currentPeriodEnd && (
                    <div className="flex justify-between">
                      <span className="text-txt-tertiary">Expires</span>
                      <span className="text-txt-primary tabular">
                        {subscription.currentPeriodEnd.toDate?.()?.toLocaleDateString() ||
                          new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {subscription?._devGranted && (
                    <div className="text-center mt-2" style={{ color: 'var(--accent-warning)' }}>Dev-granted premium</div>
                  )}
                </div>

                {/* Grant / revoke buttons live in the "Beta Premium
                    Access" card above (visible to admins and beta users
                    alike), so we no longer duplicate them here. Dev Tools
                    is now admin-only stuff: user-info display + orphan
                    subcollection recovery below. */}

                {/* Orphan subcollection recovery — pulls players + games
                    from a pre-bug-fix cloud dynasty (whose main doc was
                    deleted but whose subcollections survived) and writes
                    them into a chosen target dynasty here. Server route
                    uses admin SDK to bypass Firestore rules. */}
                <div className="pt-4 border-t border-surface-4 space-y-2">
                  <div className="text-xs font-semibold text-txt-secondary">Recover orphan subcollections</div>
                  <p className="text-[11px] text-txt-tertiary leading-snug">
                    Pulls players + games from a deleted cloud dynasty's surviving subcollections and writes them into the target dynasty (local or cloud). Used after a migrate-to-local that lost data.
                  </p>
                  <div>
                    <label className="block text-[11px] text-txt-tertiary mb-1">Orphan dynasty ID (old cloud)</label>
                    <Input
                      type="text"
                      value={recoverOldId}
                      onChange={(e) => setRecoverOldId(e.target.value)}
                      placeholder="pX7tm2OUceJRo8LY7HtR"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-txt-tertiary mb-1">Target dynasty</label>
                    <select
                      value={recoverTargetId}
                      onChange={(e) => setRecoverTargetId(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded border bg-surface-2 text-txt-primary"
                      style={{ borderColor: 'var(--surface-5)' }}
                    >
                      <option value="">Select a dynasty</option>
                      {(dynasties || []).map(d => (
                        <option key={d.id} value={d.id}>
                          {(d.dynastyName || d.teamName || d.id)} {d.storageType} {d.id.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleRecoverOrphan}
                    disabled={recovering || !recoverOldId.trim() || !recoverTargetId.trim()}
                  >
                    {recovering ? 'Recovering…' : 'Recover orphan'}
                  </Button>
                </div>

                {/* Re-sync local -> cloud — repair an incomplete migration.
                    Pushes every field from a complete local dynasty into an
                    existing cloud dynasty (schedules, team NIL, roster, etc.)
                    without deleting the local copy. */}
                <div className="pt-4 border-t border-surface-4 space-y-2">
                  <div className="text-xs font-semibold text-txt-secondary">Re-sync local → cloud</div>
                  <p className="text-[11px] text-txt-tertiary leading-snug">
                    Re-uploads a complete local dynasty into an existing cloud dynasty. Fixes an incomplete migration where schedules or team NIL didn't carry over. The local copy is kept.
                  </p>
                  <div>
                    <label className="block text-[11px] text-txt-tertiary mb-1">Source (local, complete)</label>
                    <select
                      value={resyncLocalId}
                      onChange={(e) => setResyncLocalId(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded border bg-surface-2 text-txt-primary"
                      style={{ borderColor: 'var(--surface-5)' }}
                    >
                      <option value="">Select a local dynasty</option>
                      {(dynasties || []).filter(d => (d.storageType || 'local') === 'local').map(d => (
                        <option key={d.id} value={d.id}>
                          {(d.dynastyName || d.teamName || d.id)} {d.id.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-txt-tertiary mb-1">Target (existing cloud)</label>
                    <select
                      value={resyncCloudId}
                      onChange={(e) => setResyncCloudId(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded border bg-surface-2 text-txt-primary"
                      style={{ borderColor: 'var(--surface-5)' }}
                    >
                      <option value="">Select a cloud dynasty</option>
                      {(dynasties || []).filter(d => d.storageType === 'cloud').map(d => (
                        <option key={d.id} value={d.id}>
                          {(d.dynastyName || d.teamName || d.id)} {d.id.slice(0, 8)}…
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleResync}
                    disabled={resyncing || !resyncLocalId || !resyncCloudId}
                  >
                    {resyncing ? 'Re-syncing…' : 'Re-sync to cloud'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Danger Zone — account deletion. Always shown so we honor the
            promise made in the privacy policy / terms. */}
        <Card>
          <h3 className="label-sm text-txt-primary mb-2">Danger Zone</h3>
          <p className="text-sm text-txt-tertiary mb-4">
            Delete your account permanently. This cancels any active subscription, removes your
            cloud dynasties, and signs you out. Local dynasties on this device are not affected.
          </p>
          <Button
            variant="danger"
            className="w-full"
            onClick={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Account'}
          </Button>
        </Card>

        <Link
          to="/"
          className="flex items-center justify-center gap-2 mt-6 text-sm text-txt-tertiary hover:text-txt-primary transition-colors"
        >
          Back to Dynasties
        </Link>
      </div>
    </div>
  )
}
