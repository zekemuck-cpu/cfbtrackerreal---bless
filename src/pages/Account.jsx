import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDynasty } from '../context/DynastyContext'
import { storageService } from '../services/storage'
import BouncingLogos from '../components/BouncingLogos'
import { PageHero, Card, Button, Badge, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import {
  adminGrantPremium,
  adminRevokePremium,
  adminRecoverOrphan,
  deleteAccount,
} from '../services/subscriptionService'

const PLAN_FEATURES = [
  { name: 'Dynasty Tracking', free: true, premium: true },
  { name: 'Player Stats & Records', free: true, premium: true },
  { name: 'Google Sheets Import', free: true, premium: true },
  { name: 'Storage Location', free: 'Device Only', premium: 'Cloud' },
  { name: 'Multi-Device Sync', free: false, premium: true },
  { name: 'Automatic Backups', free: false, premium: true },
  { name: 'Share Dynasties', free: false, premium: true },
]

// Hard-coded admin allowlist for the dev tools panel. The server enforces
// the same allowlist on /api/admin/* endpoints, so this is just a UI
// nicety — the panel's buttons are inert for non-admins.
const ADMIN_EMAILS = new Set(['alex.guess1999@gmail.com'])

// Emails permitted to self-grant a free beta premium pass while Stripe
// checkout is disabled. Must mirror BETA_GRANT_EMAILS in
// api/_verifyAuth.js — the server is the actual gate; this client list
// only controls whether the "Beta Access" card is shown. Keep in sync.
const BETA_GRANT_EMAILS = new Set([
  'alabamaprince@gmail.com',
  'skater1932@gmail.com',
  'zekemuck@gmail.com',
  'couchcoach16@gmail.com',
])

function PlanCell({ value }) {
  if (value === true) {
    return <span className="tabular" style={{ color: 'var(--accent-success)' }}>Yes</span>
  }
  if (value === false) {
    return <span className="text-txt-tertiary">–</span>
  }
  return <span className="text-txt-secondary">{value}</span>
}

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
        ? 'No Stripe subscription on this account — nothing to manage.'
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

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6 space-y-4">
        <PageHero title="Account" />

        {/* Profile Card */}
        <Card>
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold"
                style={{
                  backgroundColor: 'var(--surface-3)',
                  color: 'var(--text-primary)',
                }}
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
              {isPremium ? 'Premium' : 'Free'}
            </Badge>
          </div>
        </Card>

        {/* Your User ID — used to be granted access to a friend's
            shared dynasty. */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="label-sm text-txt-primary">Your User ID</div>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-md border border-surface-4 text-txt-secondary hover:bg-surface-3 transition-colors"
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
            Share this ID with a dynasty owner to be granted edit access to their dynasty.
          </p>
        </Card>

        {/* Premium Member Card. Two variants:
            - Real Stripe subscribers (have stripeCustomerId): show billing
              date + amount and a working "Manage Subscription" button that
              opens the Stripe portal.
            - Dev/beta-granted users (no stripeCustomerId): show grant
              expiry only. No portal button — there's no Stripe customer
              to manage, and the previous build's button failed silently. */}
        {isPremium && (
          <Card accent="top">
            <div className="flex items-center justify-between mb-3">
              <div className="label-sm text-txt-primary">Premium Member</div>
              {subscription?.cancelAtPeriodEnd ? (
                <span className="label-xs" style={{ color: 'var(--accent-warning)' }}>Canceling</span>
              ) : subscription?._devGranted ? (
                <span className="label-xs" style={{ color: 'var(--accent-warning)' }}>Beta access</span>
              ) : (
                <span className="label-xs text-txt-tertiary">Thanks for your support</span>
              )}
            </div>

            <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--surface-3)' }}>
              {subscription?.cancelAtPeriodEnd ? (
                <div style={{ color: 'var(--accent-warning)' }}>
                  <div className="font-medium mb-1">Subscription ending</div>
                  <div>
                    Your premium access expires on{' '}
                    <span className="font-semibold tabular">{billingEnd}</span>
                  </div>
                  <div className="text-xs mt-1 opacity-80">
                    When premium ends, your cloud dynasties will be auto-copied to local storage.
                  </div>
                </div>
              ) : subscription?._devGranted ? (
                <div className="text-txt-secondary space-y-1">
                  <div className="flex justify-between">
                    <span>Access type</span>
                    <span className="font-medium text-txt-primary">Beta (free)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expires</span>
                    <span className="font-medium text-txt-primary tabular">{billingEnd}</span>
                  </div>
                </div>
              ) : (
                <div className="text-txt-secondary space-y-1">
                  <div className="flex justify-between">
                    <span>Next billing date</span>
                    <span className="font-medium text-txt-primary tabular">{billingEnd}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Amount</span>
                    <span className="font-medium text-txt-primary tabular">$4.99</span>
                  </div>
                </div>
              )}
            </div>

            {!subscription?._devGranted && (
              <Button variant="outline" className="w-full" onClick={handleManageSubscription}>
                Manage Subscription
              </Button>
            )}
          </Card>
        )}

        {/* Feature Comparison & Upgrade Card */}
        <Card>
          <h2 className="label-sm text-txt-primary mb-4 text-center">
            {isPremium ? 'Your Plan' : 'Compare Plans'}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-4)' }}>
                  <th className="text-left py-2 pr-4 label-xs text-txt-tertiary">Feature</th>
                  <th className="text-center py-2 px-3 label-xs text-txt-tertiary">Free</th>
                  <th className="text-center py-2 px-3 label-xs text-txt-tertiary">Premium</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map((feature, idx) => (
                  <tr
                    key={feature.name}
                    style={{ borderBottom: idx < PLAN_FEATURES.length - 1 ? '1px solid var(--surface-4)' : 'none' }}
                  >
                    <td className="py-2.5 pr-4 text-txt-secondary">{feature.name}</td>
                    <td className="text-center py-2.5 px-3"><PlanCell value={feature.free} /></td>
                    <td className="text-center py-2.5 px-3"><PlanCell value={feature.premium} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isPremium && (
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--surface-4)' }}>
              <div className="mb-4">
                <span className="label-sm text-txt-primary">Premium Access</span>
              </div>
              {/* Stripe checkout is disabled while the app is in beta.
                  Users email the dev to be added to the allowlist; once
                  added, the "Beta Premium Access" card below appears for
                  them and they self-grant. */}
              <div className="rounded-lg p-4 mb-3" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
                <p className="text-sm text-txt-primary mb-2">
                  <span className="font-semibold">Beta is free.</span>
                </p>
                <p className="text-sm text-txt-secondary">
                  While the app is in beta, premium is on me. Reach out from the Contact page with the
                  email you sign in with and I&apos;ll get you access.
                </p>
              </div>
              <Link to="/contact" className="block">
                <Button variant="primary" className="w-full">
                  Contact Me for Free Premium
                </Button>
              </Link>
              <p className="text-center text-txt-tertiary text-xs mt-3">
                No payment required during beta.
              </p>
            </div>
          )}
        </Card>

        {/* Beta Premium Access card — visible to anyone allowed to
            self-grant (BETA_GRANT_EMAILS + admins). Single source of
            truth for granting / revoking the 30-day beta pass; the Dev
            Tools panel below no longer duplicates these buttons. */}
        {canBetaGrant && (
          <Card>
            <h2 className="label-sm text-txt-primary mb-2">Beta Premium Access</h2>
            <p className="text-sm text-txt-secondary mb-4">
              {isPremium
                ? 'Your beta pass is active. When it expires, come back here and grant yourself another 30 days — no charge during beta.'
                : "You're on the beta allowlist. Click below to grant yourself 30 days of premium. After it expires, just come back and grant again."}
            </p>
            <div className="p-3 rounded-lg text-xs space-y-1 mb-4" style={{ backgroundColor: 'var(--surface-3)' }}>
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
            </div>
            {!isPremium ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={handleGrantPremium}
                disabled={devStatus === 'granting'}
              >
                {devStatus === 'granting' ? 'Granting...' : 'Grant Myself 30 Days Premium'}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleRevokePremium}
                disabled={devStatus === 'revoking'}
              >
                {devStatus === 'revoking' ? 'Revoking...' : 'Revoke My Beta Pass'}
              </Button>
            )}
            {devStatus === 'granted' && (
              <p className="text-sm text-center mt-3" style={{ color: 'var(--accent-success)' }}>
                Premium granted for 30 days. Refresh the page to see it everywhere.
              </p>
            )}
            {devStatus === 'revoked' && (
              <p className="text-sm text-center mt-3 text-txt-secondary">
                Beta pass revoked. Refresh to see it everywhere.
              </p>
            )}
            {devStatus === 'error' && (
              <p className="text-sm text-center mt-3 text-red-400">
                Action failed. Make sure the email you signed in with matches the allowlist.
              </p>
            )}
          </Card>
        )}

        {/* Transparency Note */}
        <Card>
          <p className="text-sm text-txt-secondary text-center">
            <span className="font-medium text-txt-primary">Why charge for Premium?</span>
            <br />
            This app is a passion project, not a money-maker. Cloud storage costs real money to maintain,
            so Premium simply covers those server costs. All core features remain free forever.
          </p>
        </Card>

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
                      <option value="">— pick a dynasty —</option>
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
