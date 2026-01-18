import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import BouncingLogos from '../components/BouncingLogos'
import { doc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '../config/firebase'

export default function Account() {
  const { user, isPremium, upgradeToPremium, manageSubscription, subscription } = useAuth()
  const [upgrading, setUpgrading] = useState(false)
  const [devStatus, setDevStatus] = useState(null)
  const [showDevTools, setShowDevTools] = useState(false)

  // Dev tool: manually grant premium status
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
        // Mark as dev-granted so we know it's not from Stripe
        _devGranted: true
      }, { merge: true })

      setDevStatus('granted')
    } catch (error) {
      console.error('Failed to grant premium:', error)
      setDevStatus('error')
    }
  }

  // Dev tool: remove premium status
  const handleRevokePremium = async () => {
    if (!user) return
    setDevStatus('revoking')
    try {
      await setDoc(doc(db, 'users', user.uid), {
        tier: 'free',
        subscriptionStatus: null,
        currentPeriodEnd: null,
        updatedAt: Timestamp.now(),
        _devGranted: false
      }, { merge: true })

      setDevStatus('revoked')
    } catch (error) {
      console.error('Failed to revoke premium:', error)
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
      alert('Failed to start upgrade. Please try again.')
    } finally {
      setUpgrading(false)
    }
  }

  if (!user) {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
        <BouncingLogos />
        <div className="relative z-10 flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-gray-400 mb-4">Sign in to view your account</p>
            <Link
              to="/login"
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      <BouncingLogos />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-6">Account</h1>

        {/* Profile Card */}
        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-lg mb-4">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-white text-lg font-bold">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {user.displayName || 'User'}
              </div>
              <div className="text-sm text-gray-500 truncate">{user.email}</div>
            </div>
            {isPremium ? (
              <span className="px-2.5 py-1 text-xs font-semibold bg-amber-500 text-white rounded-full">
                Premium
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-semibold bg-gray-200 text-gray-700 rounded-full">
                Free
              </span>
            )}
          </div>
        </div>

        {/* Premium Member Card (for premium users) */}
        {isPremium && (
          <div className={`bg-white rounded-xl p-4 sm:p-5 shadow-lg mb-4 ${subscription?.cancelAtPeriodEnd ? 'border-2 border-orange-300' : 'border-2 border-amber-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">Premium Member</div>
              {subscription?.cancelAtPeriodEnd ? (
                <span className="text-sm text-orange-600">Canceling</span>
              ) : (
                <span className="text-sm text-amber-600">Thanks for your support!</span>
              )}
            </div>

            {/* Billing Info */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
              {subscription?.cancelAtPeriodEnd ? (
                <div className="text-orange-700">
                  <div className="font-medium mb-1">Subscription ending</div>
                  <div className="text-orange-600">
                    Your premium access expires on{' '}
                    <span className="font-semibold">
                      {subscription?.currentPeriodEnd?.toDate?.()?.toLocaleDateString() ||
                        (subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd).toLocaleDateString()) ||
                        'N/A'}
                    </span>
                  </div>
                  <div className="text-xs text-orange-500 mt-1">
                    Your dynasties will be migrated to local storage when premium ends.
                  </div>
                </div>
              ) : (
                <div className="text-gray-600">
                  <div className="flex justify-between">
                    <span>Next billing date:</span>
                    <span className="font-medium text-gray-900">
                      {subscription?.currentPeriodEnd?.toDate?.()?.toLocaleDateString() ||
                        (subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd).toLocaleDateString()) ||
                        'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Amount:</span>
                    <span className="font-medium text-gray-900">$4.99</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => manageSubscription?.()}
              className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Manage Subscription
            </button>
          </div>
        )}

        {/* Feature Comparison & Upgrade Card */}
        <div className="bg-white rounded-xl p-4 sm:p-5 shadow-lg mb-4">
          <h2 className="font-semibold text-gray-900 mb-4 text-center">
            {isPremium ? 'Your Plan' : 'Compare Plans'}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-medium text-gray-600">Feature</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Free</th>
                  <th className="text-center py-2 px-3 font-medium text-amber-600">Premium</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Dynasty Tracking</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Player Stats & Records</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Google Sheets Import</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Storage Location</td>
                  <td className="text-center py-2.5 px-3 text-gray-500">Device Only</td>
                  <td className="text-center py-2.5 px-3 text-amber-600">Cloud</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Multi-Device Sync</td>
                  <td className="text-center py-2.5 px-3 text-gray-400">—</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4">Automatic Backups</td>
                  <td className="text-center py-2.5 px-3 text-gray-400">—</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4">Share Dynasties</td>
                  <td className="text-center py-2.5 px-3 text-gray-400">—</td>
                  <td className="text-center py-2.5 px-3 text-green-600">✓</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Upgrade Section (only for non-premium users) */}
          {!isPremium && (
            <div className="mt-5 pt-5 border-t border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-gray-900">Upgrade to Premium</span>
                <span className="text-amber-600 font-bold">$4.99/mo</span>
              </div>
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full px-4 py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {upgrading ? 'Processing...' : 'Upgrade to Premium'}
              </button>
              <p className="text-center text-gray-400 text-xs mt-3">Cancel anytime. Secure payment via Stripe.</p>
            </div>
          )}
        </div>

        {/* Transparency Note */}
        <div className="bg-gray-800/80 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-300">
            <span className="font-medium text-gray-200">Why charge for Premium?</span>
            <br />
            This app is a passion project, not a money-maker. Cloud storage costs real money to maintain,
            so Premium simply covers those server costs. All core features remain free forever.
          </p>
        </div>

        {/* Dev Tools (hidden by default) */}
        {user && (
          <div className="bg-gray-900/90 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowDevTools(!showDevTools)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span>Dev Tools</span>
              <svg
                className={`w-4 h-4 transition-transform ${showDevTools ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showDevTools && (
              <div className="px-4 pb-4 space-y-4">
                {/* Current Status */}
                <div className="p-3 bg-gray-800 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">User ID:</span>
                    <span className="font-mono text-gray-200">{user.uid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tier:</span>
                    <span className={isPremium ? 'text-amber-400' : 'text-gray-200'}>
                      {subscription?.tier || 'free'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Status:</span>
                    <span className="text-gray-200">{subscription?.subscriptionStatus || 'none'}</span>
                  </div>
                  {subscription?.currentPeriodEnd && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Expires:</span>
                      <span className="text-gray-200">
                        {subscription.currentPeriodEnd.toDate?.()?.toLocaleDateString() ||
                          new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {subscription?._devGranted && (
                    <div className="text-amber-500 text-center mt-2">Dev-granted premium</div>
                  )}
                </div>

                {/* Grant/Revoke Buttons */}
                <div className="flex gap-2">
                  {!isPremium ? (
                    <button
                      onClick={handleGrantPremium}
                      disabled={devStatus === 'granting'}
                      className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      {devStatus === 'granting' ? 'Granting...' : 'Grant Premium (Dev)'}
                    </button>
                  ) : (
                    <button
                      onClick={handleRevokePremium}
                      disabled={devStatus === 'revoking'}
                      className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                      {devStatus === 'revoking' ? 'Revoking...' : 'Revoke Premium (Dev)'}
                    </button>
                  )}
                </div>

                {/* Status Messages */}
                {devStatus === 'granted' && (
                  <p className="text-green-400 text-sm text-center">Premium granted for 30 days!</p>
                )}
                {devStatus === 'revoked' && (
                  <p className="text-gray-400 text-sm text-center">Premium revoked, back to free tier.</p>
                )}
                {devStatus === 'error' && (
                  <p className="text-red-400 text-sm text-center">Error - check console for details.</p>
                )}

                {/* Warning */}
                <p className="text-xs text-gray-500 text-center">
                  This bypasses Stripe for testing. In production, use real payment flow.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Back Link */}
        <Link
          to="/"
          className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dynasties
        </Link>
      </div>
    </div>
  )
}
