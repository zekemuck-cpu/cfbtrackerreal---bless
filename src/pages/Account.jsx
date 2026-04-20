import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import BouncingLogos from '../components/BouncingLogos'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { PageHero, Card, Button, Badge } from '../components/ui'
import { useToast } from '../components/ui/Toast'

const PLAN_FEATURES = [
  { name: 'Dynasty Tracking', free: true, premium: true },
  { name: 'Player Stats & Records', free: true, premium: true },
  { name: 'Google Sheets Import', free: true, premium: true },
  { name: 'Storage Location', free: 'Device Only', premium: 'Cloud' },
  { name: 'Multi-Device Sync', free: false, premium: true },
  { name: 'Automatic Backups', free: false, premium: true },
  { name: 'Share Dynasties', free: false, premium: true },
]

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
  const { user, isPremium, upgradeToPremium, manageSubscription, subscription } = useAuth()
  const { toast } = useToast()
  const [upgrading, setUpgrading] = useState(false)
  const [devStatus, setDevStatus] = useState(null)
  const [showDevTools, setShowDevTools] = useState(false)

  const handleGrantPremium = async () => {
    if (!user) return
    setDevStatus('granting')
    try {
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

      await setDoc(doc(db, 'users', user.uid), {
        tier: 'premium',
        subscriptionStatus: 'active',
        currentPeriodEnd: Timestamp.fromDate(thirtyDaysFromNow),
        updatedAt: Timestamp.now(),
        _devGranted: true
      }, { merge: true })

      setDevStatus('granted')
    } catch (error) {
      console.error('Failed to grant premium:', error)
      setDevStatus('error')
    }
  }

  const handleRevokePremium = async () => {
    if (!user) return
    setDevStatus('revoking')
    try {
      await setDoc(doc(db, 'users', user.uid), {
        tier: 'free',
        subscriptionStatus: null,
        currentPeriodEnd: null,
        updatedAt: Timestamp.now(),
        _devGranted: false,
        pendingDowngrade: true
      }, { merge: true })

      setDevStatus('revoked')
    } catch (error) {
      console.error('Failed to revoke premium:', error)
      setDevStatus('error')
    }
  }

  const handleTriggerMigration = async () => {
    if (!user) return
    setDevStatus('migrating')
    try {
      await setDoc(doc(db, 'users', user.uid), {
        pendingDowngrade: true,
        updatedAt: Timestamp.now()
      }, { merge: true })
      setDevStatus('migration_triggered')
    } catch (error) {
      console.error('Failed to trigger migration:', error)
      setDevStatus('error')
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
                  backgroundColor: 'var(--team-primary-faded)',
                  color: 'var(--team-primary)',
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

        {/* Premium Member Card */}
        {isPremium && (
          <Card accent="top">
            <div className="flex items-center justify-between mb-3">
              <div className="label-sm text-txt-primary">Premium Member</div>
              {subscription?.cancelAtPeriodEnd ? (
                <span className="label-xs" style={{ color: 'var(--accent-warning)' }}>Canceling</span>
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
                    Your dynasties will be migrated to local storage when premium ends.
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

            <Button variant="outline" className="w-full" onClick={() => manageSubscription?.()}>
              Manage Subscription
            </Button>
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
              <div className="flex items-center justify-between mb-4">
                <span className="label-sm text-txt-primary">Upgrade to Premium</span>
                <span className="stat-md tabular text-txt-primary">$4.99<span className="text-xs text-txt-tertiary">/mo</span></span>
              </div>
              <Button
                variant="primary"
                className="w-full"
                onClick={handleUpgrade}
                disabled={upgrading}
              >
                {upgrading ? 'Processing...' : 'Upgrade to Premium'}
              </Button>
              <p className="text-center text-txt-tertiary text-xs mt-3">Cancel anytime. Secure payment via Stripe.</p>
            </div>
          )}
        </Card>

        {/* Transparency Note */}
        <Card>
          <p className="text-sm text-txt-secondary text-center">
            <span className="font-medium text-txt-primary">Why charge for Premium?</span>
            <br />
            This app is a passion project, not a money-maker. Cloud storage costs real money to maintain,
            so Premium simply covers those server costs. All core features remain free forever.
          </p>
        </Card>

        {/* Dev Tools */}
        {user && (
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

                <div className="flex gap-2">
                  {!isPremium ? (
                    <Button
                      variant="primary"
                      className="flex-1"
                      onClick={handleGrantPremium}
                      disabled={devStatus === 'granting'}
                    >
                      {devStatus === 'granting' ? 'Granting...' : 'Grant Premium (Dev)'}
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={handleRevokePremium}
                      disabled={devStatus === 'revoking'}
                    >
                      {devStatus === 'revoking' ? 'Revoking...' : 'Revoke Premium (Dev)'}
                    </Button>
                  )}
                </div>

                {!isPremium && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleTriggerMigration}
                    disabled={devStatus === 'migrating'}
                  >
                    {devStatus === 'migrating' ? 'Triggering...' : 'Migrate Cloud → Local (Dev)'}
                  </Button>
                )}

                {devStatus === 'granted' && (
                  <p className="text-sm text-center" style={{ color: 'var(--accent-success)' }}>Premium granted for 30 days.</p>
                )}
                {devStatus === 'migration_triggered' && (
                  <p className="text-sm text-center" style={{ color: 'var(--accent-info)' }}>Migration triggered — refresh the page.</p>
                )}
                {devStatus === 'revoked' && (
                  <p className="text-sm text-center text-txt-tertiary">Premium revoked, back to free tier.</p>
                )}
                {devStatus === 'error' && (
                  <p className="text-sm text-center" style={{ color: 'var(--accent-error)' }}>Error — check console for details.</p>
                )}

                <p className="text-xs text-txt-tertiary text-center">
                  This bypasses Stripe for testing. In production, use real payment flow.
                </p>
              </div>
            )}
          </Card>
        )}

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
