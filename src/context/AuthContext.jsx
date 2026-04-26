import { createContext, useContext, useState, useEffect, useRef } from 'react'
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth'
import { auth, googleProvider } from '../config/firebase'
import {
  subscribeToUserSubscription,
  isPremiumSubscription,
  redirectToCheckout,
  redirectToPortal,
  adminGrantPremium as svcAdminGrant,
  adminRevokePremium as svcAdminRevoke,
  deleteAccount as svcDeleteAccount
} from '../services/subscriptionService'

// The single Google account permitted to use the in-app dev/admin panel.
// Server enforces this same allowlist on /api/admin/* endpoints — this
// client-side check just hides the UI; spoofing it gains nothing.
const ADMIN_EMAILS = new Set(['alex.guess1999@gmail.com'])

const AuthContext = createContext()

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tokenExpiringSoon, setTokenExpiringSoon] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [isPremium, setIsPremium] = useState(false)
  const refreshTimerRef = useRef(null)
  const subscriptionUnsubRef = useRef(null)

  // Set up a timer to warn when token is about to expire
  const setupTokenRefreshTimer = (expiryTime) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }

    const timeUntilExpiry = expiryTime - Date.now()
    // Warn 5 minutes before expiry
    const warnTime = timeUntilExpiry - (5 * 60 * 1000)

    if (warnTime > 0) {
      refreshTimerRef.current = setTimeout(() => {
        setTokenExpiringSoon(true)
      }, warnTime)
    } else if (timeUntilExpiry <= 0) {
      // Already expired
      setTokenExpiringSoon(true)
    }
  }

  useEffect(() => {
    // Set up auth state listener
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)

      // Restore access token from localStorage if available
      if (user) {
        const storedToken = localStorage.getItem('google_access_token')
        const tokenExpiry = localStorage.getItem('google_token_expiry')

        if (storedToken && tokenExpiry) {
          const expiryTime = parseInt(tokenExpiry)
          if (Date.now() < expiryTime) {
            setAccessToken(storedToken)
            user.accessToken = storedToken
            setTokenExpiringSoon(false)
            setupTokenRefreshTimer(expiryTime)
          } else {
            // Token expired, clear it
            localStorage.removeItem('google_access_token')
            localStorage.removeItem('google_token_expiry')
            setTokenExpiringSoon(true)
          }
        }
      } else {
        // User logged out, clear timer
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current)
        }
        setTokenExpiringSoon(false)
        // Clear subscription state
        setSubscription(null)
        setIsPremium(false)
      }
    })

    return () => {
      unsubscribe()
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  // Subscribe to user subscription updates
  useEffect(() => {
    if (!user) {
      // Clean up subscription listener
      if (subscriptionUnsubRef.current) {
        subscriptionUnsubRef.current()
        subscriptionUnsubRef.current = null
      }
      return
    }

    // Subscribe to real-time subscription updates
    subscriptionUnsubRef.current = subscribeToUserSubscription(user.uid, (subData) => {
      setSubscription(subData)
      setIsPremium(isPremiumSubscription(subData))
    })

    return () => {
      if (subscriptionUnsubRef.current) {
        subscriptionUnsubRef.current()
        subscriptionUnsubRef.current = null
      }
    }
  }, [user])

  const signInWithGoogle = async () => {
    try {
      // Always use popup flow - it works on both desktop and mobile
      // signInWithRedirect is broken on Safari 16.1+, Firefox 109+, Chrome 115+
      // due to third-party storage blocking
      const result = await signInWithPopup(auth, googleProvider)

      // Get the OAuth access token
      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken)
        // Store in user object for easy access
        result.user.accessToken = credential.accessToken

        // Store token in localStorage with 1 hour expiry
        const expiryTime = Date.now() + 3600000 // 1 hour
        localStorage.setItem('google_access_token', credential.accessToken)
        localStorage.setItem('google_token_expiry', expiryTime.toString())

        // Reset expiring flag and setup refresh timer
        setTokenExpiringSoon(false)
        setupTokenRefreshTimer(expiryTime)

      }

      return result.user
    } catch (error) {
      // Handle popup blocked error with a helpful message
      if (error.code === 'auth/popup-blocked') {
        console.error('❌ Popup was blocked. Please allow popups for this site.')
        throw new Error('Sign-in popup was blocked. Please allow popups for this site and try again.')
      }
      if (error.code === 'auth/popup-closed-by-user') {
        return null // User cancelled, don't throw
      }
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  // Refresh the session to get a new access token without full sign-out
  // Tries silent refresh first, falls back to popup if needed
  const refreshSession = async (silent = false) => {
    try {
      const freshProvider = new GoogleAuthProvider()
      freshProvider.addScope('https://www.googleapis.com/auth/drive.file')

      if (silent) {
        // Try silent refresh - works if user's Google session is still active
        freshProvider.setCustomParameters({
          prompt: 'none'
        })
      } else {
        // Regular refresh - just account selection, not full consent
        freshProvider.setCustomParameters({
          prompt: 'select_account'
        })
      }

      const result = await signInWithPopup(auth, freshProvider)

      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken)
        if (result.user) {
          result.user.accessToken = credential.accessToken
        }

        const expiryTime = Date.now() + 3600000 // 1 hour
        localStorage.setItem('google_access_token', credential.accessToken)
        localStorage.setItem('google_token_expiry', expiryTime.toString())

        setTokenExpiringSoon(false)
        setupTokenRefreshTimer(expiryTime)

        return true
      }
      return false
    } catch (error) {
      // If silent refresh fails, caller can retry with popup
      if (silent && (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request')) {
        return false
      }
      if (error.code === 'auth/popup-closed-by-user') {
        return false
      }
      console.error('Error refreshing session:', error)
      throw error
    }
  }

  // Auto-refresh: tries silent first, falls back to popup if needed
  const autoRefreshToken = async () => {
    // First, try silent refresh (no UI if Google session is active)
    try {
      const silentSuccess = await refreshSession(true)
      if (silentSuccess) {
        return true
      }
    } catch (e) {
      // Silent refresh failed, will try popup below
    }

    // Silent failed, try with popup (just account selection, not full consent)
    return await refreshSession(false)
  }

  const signOut = async () => {
    try {
      await firebaseSignOut(auth)
      // Clear stored tokens
      localStorage.removeItem('google_access_token')
      localStorage.removeItem('google_token_expiry')
      setAccessToken(null)
      setSubscription(null)
      setIsPremium(false)
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  // Upgrade to premium subscription. The API now derives uid from the
  // verified ID token, not from the request body, so no args are needed
  // (and supplying them wouldn't change anything).
  const upgradeToPremium = async () => {
    if (!user) {
      throw new Error('Must be signed in to upgrade')
    }
    await redirectToCheckout()
  }

  // Open subscription management portal
  const manageSubscription = async () => {
    if (!user) {
      throw new Error('Must be signed in to manage subscription')
    }
    await redirectToPortal()
  }

  const isAdmin = !!user?.email && ADMIN_EMAILS.has(user.email.toLowerCase())

  // Admin-only premium grant/revoke (server enforces email allowlist).
  const adminGrantPremium = async () => {
    if (!isAdmin) throw new Error('Not authorized')
    return svcAdminGrant()
  }
  const adminRevokePremium = async () => {
    if (!isAdmin) throw new Error('Not authorized')
    return svcAdminRevoke()
  }

  // Account deletion: cancels Stripe sub, deletes Firestore data, deletes Auth.
  // Caller must pass current user email as confirmEmail (server re-checks).
  const deleteAccount = async (confirmEmail) => {
    if (!user) throw new Error('Must be signed in to delete account')
    return svcDeleteAccount(confirmEmail)
  }

  // Auto-refresh when token is about to expire
  // This runs silently in the background - if it works, user never sees the warning
  const autoRefreshAttemptedRef = useRef(false)
  useEffect(() => {
    if (tokenExpiringSoon && user && !autoRefreshAttemptedRef.current) {
      autoRefreshAttemptedRef.current = true
      // Try silent refresh in the background
      refreshSession(true)
        .then((success) => {
          if (success) {
            // Silent refresh worked, user doesn't need to do anything
            autoRefreshAttemptedRef.current = false
          }
          // If failed, tokenExpiringSoon stays true and user will see the warning
        })
        .catch(() => {
          // Silent refresh failed, user will see the warning
        })
    }
    // Reset the flag when token is no longer expiring (after successful refresh)
    if (!tokenExpiringSoon) {
      autoRefreshAttemptedRef.current = false
    }
  }, [tokenExpiringSoon, user])

  const value = {
    user,
    accessToken,
    loading,
    tokenExpiringSoon,
    subscription,
    isPremium,
    signInWithGoogle,
    signOut,
    refreshSession,
    autoRefreshToken,
    upgradeToPremium,
    manageSubscription,
    isAdmin,
    adminGrantPremium,
    adminRevokePremium,
    deleteAccount
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
