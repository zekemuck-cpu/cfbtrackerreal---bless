import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { useEffect } from 'react'
import logo from '../assets/logo.png'
import BouncingLogos from '../components/BouncingLogos'

export default function Login() {
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogle()
      if (result) {
        navigate('/')
      }
    } catch (error) {
      console.error('Sign in failed:', error)
      alert(error.message || 'Failed to sign in. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col overflow-hidden relative">
      {/* Bouncing Logos Background - all 140 teams (136 FBS + 4 FCS) */}
      <BouncingLogos />

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-sm">
          {/* Logo with glow */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full scale-150 animate-pulse-slow" />
              <img
                src={logo}
                alt="CFB Dynasty Tracker"
                className="relative w-28 h-28 md:w-32 md:h-32 object-contain drop-shadow-2xl"
              />
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Dynasty Tracker
            </h1>
          </div>

          {/* Sign In Card */}
          <div className="bg-gray-800/70 backdrop-blur-lg rounded-xl p-6 border border-gray-700/50 shadow-2xl">
            <button
              onClick={handleGoogleSignIn}
              className="group w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 rounded-lg px-5 py-4 font-semibold text-gray-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Sign in with Google</span>
              <svg className="w-4 h-4 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            <p className="text-xs text-gray-500 text-center mt-4">
              Syncs across all your devices
            </p>
          </div>

          <p className="text-xs text-gray-500 text-center mt-6">
            Completely free!
          </p>

          <div className="flex items-center justify-center gap-3 mt-4 text-xs text-gray-500">
            <Link to="/privacy" className="hover:text-gray-300 transition-colors">
              Privacy Policy
            </Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-gray-300 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
