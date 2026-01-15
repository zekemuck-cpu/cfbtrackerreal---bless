import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import logo from '../assets/logo.png'
import BouncingLogos from '../components/BouncingLogos'

const SCREENSHOTS = [
  { url: 'https://i.imgur.com/RflYzae.png', caption: 'Dashboard' },
  { url: 'https://i.imgur.com/QBgvS3M.png', caption: 'Team Stats' },
  { url: 'https://i.imgur.com/FNpdolf.png', caption: 'Player Profile' },
  { url: 'https://i.imgur.com/D9eQz1c.png', caption: 'Roster Management' },
  { url: 'https://i.imgur.com/jslB1bq.png', caption: 'CFP Bracket' },
  { url: 'https://i.imgur.com/EGStRRA.png', caption: 'Bowl History' },
]

export default function Login() {
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  // Auto-rotate carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SCREENSHOTS.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

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
      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-5xl flex flex-col items-center lg:flex-row lg:items-center lg:justify-center gap-6 lg:gap-12">

          {/* Left Column on Desktop - contains header + features on desktop, only header on mobile */}
          <div className="w-full max-w-sm flex-shrink-0 lg:order-1 order-1 mx-auto lg:mx-0">
            {/* Logo with glow */}
            <div className="flex justify-center mb-4 lg:mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full scale-150 animate-pulse-slow" />
                <img
                  src={logo}
                  alt="CFB Dynasty Tracker"
                  className="relative w-20 h-20 lg:w-28 lg:h-28 object-contain drop-shadow-2xl"
                />
              </div>
            </div>

            {/* Title & Description */}
            <div className="text-center mb-6 lg:mb-8">
              <h1 className="text-2xl lg:text-4xl font-bold text-white tracking-tight">
                Dynasty Tracker
              </h1>
              <p className="text-gray-400 mt-1 lg:mt-2 text-sm">
                Track your EA CFB Dynasty
              </p>
            </div>

            {/* Features & Sign-in - hidden on mobile, shown on desktop */}
            <div className="hidden lg:block">
            {/* Features */}
            <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700/30">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Features</h2>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Cloud saves that sync across all devices
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Guided to-do list for every phase of the season
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Manage schedules, rosters, and recruiting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Track stats, awards, and team records
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  AI-powered game reports and analysis
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Import game data from Google Sheets
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  View CFP brackets and bowl history
                </li>
              </ul>
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

            {/* Data Usage Note */}
            <p className="text-xs text-gray-500 text-center mt-4 px-2">
              We use Google Sign-In for authentication and optionally connect to Google Sheets to import your game data. We never access any other Google data.
            </p>

            <p className="text-xs text-gray-500 text-center mt-4">
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

          {/* Screenshot Carousel - order-2 on mobile (shows between header and features) */}
          <div className="w-full max-w-sm lg:max-w-xl flex-1 order-2 lg:order-2 mx-auto lg:mx-0">
            <div className="relative">
              {/* Phone/Browser Frame */}
              <div className="bg-gray-800 rounded-2xl p-2 shadow-2xl border border-gray-700">
                {/* Browser Top Bar */}
                <div className="bg-gray-700 rounded-t-xl px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-600 rounded-md px-3 py-1 text-xs text-gray-400 text-center">
                      dynastytracker.vercel.app
                    </div>
                  </div>
                </div>

                {/* Screenshot Container */}
                <div className="relative overflow-hidden rounded-b-xl bg-gray-900" style={{ aspectRatio: '16/9' }}>
                  {SCREENSHOTS.map((screenshot, index) => (
                    <div
                      key={index}
                      className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                        index === currentSlide ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <img
                        src={screenshot.url}
                        alt={`App screenshot ${index + 1}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Dot Indicators */}
              <div className="flex justify-center gap-2 mt-3">
                {SCREENSHOTS.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      index === currentSlide
                        ? 'bg-orange-500 w-6'
                        : 'bg-gray-600 hover:bg-gray-500'
                    }`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Mobile-only Features & Sign-in Section - order-3 (shows after carousel) */}
          <div className="w-full max-w-sm flex-shrink-0 order-3 lg:hidden mx-auto">
            {/* Features */}
            <div className="bg-gray-800/50 rounded-lg p-4 mb-6 border border-gray-700/30">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Features</h2>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Cloud saves that sync across all devices
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Guided to-do list for every phase of the season
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Manage schedules, rosters, and recruiting
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Track stats, awards, and team records
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  AI-powered game reports and analysis
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  Import game data from Google Sheets
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-500">•</span>
                  View CFP brackets and bowl history
                </li>
              </ul>
            </div>

            {/* Sign In Card */}
            <div className="bg-gray-800/70 backdrop-blur-lg rounded-xl p-6 border border-gray-700/50 shadow-2xl">
              <button
                onClick={handleGoogleSignIn}
                className="group w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 rounded-lg px-5 py-4 font-semibold text-gray-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Sign in with Google</span>
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Syncs across all your devices
              </p>
            </div>

            {/* Data Usage Note */}
            <p className="text-xs text-gray-500 text-center mt-4 px-2">
              We use Google Sign-In for authentication and optionally connect to Google Sheets to import your game data.
            </p>

            <p className="text-xs text-gray-500 text-center mt-4">
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
