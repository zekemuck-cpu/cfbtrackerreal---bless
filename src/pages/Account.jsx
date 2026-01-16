import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import BouncingLogos from '../components/BouncingLogos'

export default function Account() {
  const { user, isPremium, upgradeToPremium, manageSubscription } = useAuth()
  const [upgrading, setUpgrading] = useState(false)

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
        <div className="bg-gray-800/90 backdrop-blur rounded-xl p-4 sm:p-5 border border-gray-700 mb-4">
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
              <div className="font-semibold text-white truncate">
                {user.displayName || 'User'}
              </div>
              <div className="text-sm text-gray-400 truncate">{user.email}</div>
            </div>
            {isPremium ? (
              <span className="px-2.5 py-1 text-xs font-semibold bg-purple-600 text-white rounded-full">
                Premium
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-semibold bg-gray-600 text-gray-200 rounded-full">
                Free
              </span>
            )}
          </div>
        </div>

        {/* Subscription Card */}
        {isPremium ? (
          <div className="bg-gray-800/90 backdrop-blur rounded-xl p-4 sm:p-5 border border-purple-500/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-white">Premium Member</div>
                <div className="text-sm text-purple-300">Thanks for your support!</div>
              </div>
            </div>
            <button
              onClick={() => manageSubscription?.()}
              className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Manage Subscription
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/90 backdrop-blur rounded-xl p-4 sm:p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="font-semibold text-white">Upgrade to Premium</span>
              </div>
              <span className="text-purple-400 font-bold">$4.99/mo</span>
            </div>

            <ul className="text-sm text-gray-300 space-y-2.5 mb-5">
              <li className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                <span><strong className="text-white">Cloud Sync</strong> - Access your dynasties from any device</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span><strong className="text-white">Automatic Backups</strong> - Never lose your progress</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span><strong className="text-white">Share Dynasties</strong> - Show off your achievements</span>
              </li>
            </ul>

            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {upgrading ? 'Processing...' : 'Upgrade to Premium'}
            </button>
            <p className="text-center text-gray-500 text-xs mt-3">Cancel anytime. Secure payment via Stripe.</p>
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
