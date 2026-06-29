import { useAuth } from '../context/AuthContext'
import { useDynasty } from '../context/DynastyContext'
import { useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import BouncingLogos from '../components/BouncingLogos'
import { Card, ContactCTA } from '../components/ui'
import { useToast } from '../components/ui/Toast'

// Sample dynasty (my own UK 2036 save) that anyone can load to explore the app
// without signing in. Imported into local IndexedDB; see handleTryDemo below.
const DEMO_DYNASTY_URL = 'https://www.dropbox.com/scl/fi/hk8bmx888q0u2vyop4kpe/UK_2036_Week4.json?rlkey=yf3rt22nt37nwpsj0kq8ownnl&st=tqay1bld&dl=0'

const SCREENSHOTS = [
  { url: 'https://i.imgur.com/I7wIQZL.png' },
  { url: 'https://i.imgur.com/WbBWBXP.png' },
  { url: 'https://i.imgur.com/7X9r9qt.png' },
  { url: 'https://i.imgur.com/0v1xBPd.png' },
  { url: 'https://i.imgur.com/ChyY3AO.png' },
  { url: 'https://i.imgur.com/kXZdP0o.png' },
  { url: 'https://i.imgur.com/G86FXAb.png' },
  { url: 'https://i.imgur.com/ZQkjDtp.png' },
  { url: 'https://i.imgur.com/qxZFoYz.png' },
  { url: 'https://i.imgur.com/pnVdMep.png' },
]

const FEATURES = [
  'Week-by-week to-do list for every phase of the season',
  'Nearly fully automated input. Update every game in the country in seconds',
  'Paste in screenshots and AI reads the scores, stats, and rankings',
  'AI-powered game recaps and season analysis',
  'Track schedules, rosters, recruiting, and the transfer portal',
  'Player and team stats, awards, and all-time dynasty records',
  'CFP bracket, bowl history, and conference championships',
  'AI-generated trading cards for your players',
  'Cloud saves that sync across all your devices',
]

function Features() {
  return (
    <Card padding="md">
      <h2 className="label-xs text-txt-tertiary mb-3">Features</h2>
      <ul className="space-y-2 text-sm text-txt-secondary">
        {FEATURES.map((feature) => (
          <li key={feature} className="flex gap-3">
            <span className="text-txt-tertiary tabular w-4 flex-shrink-0">–</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function SignIn({ onSignIn, onTryDemo, demoLoading }) {
  return (
    <>
      <Card padding="md">
        <button
          onClick={onSignIn}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 rounded-lg px-5 py-4 font-semibold text-gray-800 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span>Sign in with Google</span>
        </button>

        <p className="label-xs text-txt-tertiary text-center mt-4">
          Syncs across all your devices
        </p>
      </Card>

      {/* Try-it-out: load a sample dynasty into local storage, no sign-in. */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-surface-4" />
        <span className="label-xs text-txt-tertiary">or</span>
        <div className="flex-1 h-px bg-surface-4" />
      </div>

      <button
        onClick={onTryDemo}
        disabled={demoLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg px-5 py-3.5 font-semibold transition-colors bg-surface-2 hover:bg-surface-3 text-txt-primary border border-surface-4 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {demoLoading ? 'Loading sample dynasty…' : 'Try it out with a sample dynasty'}
      </button>

      <div className="mt-6">
        <ContactCTA />
      </div>

      <div className="flex items-center justify-center gap-3 mt-4 text-xs text-txt-tertiary">
        <Link to="/privacy" className="hover:text-txt-secondary transition-colors">
          Privacy Policy
        </Link>
        
        <Link to="/terms" className="hover:text-txt-secondary transition-colors">
          Terms of Service
        </Link>
        
        <Link to="/contact" className="hover:text-txt-secondary transition-colors">
          Contact
        </Link>
      </div>
    </>
  )
}

export default function Login() {
  const { user, signInWithGoogle } = useAuth()
  const { importDynastyFromUrl } = useDynasty()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [demoLoading, setDemoLoading] = useState(false)

  // Load the sample dynasty into local storage and enter the app without
  // signing in. The data layer runs fully on IndexedDB for an unauthenticated
  // visitor, so the import lands locally; the cfb_demo_mode flag lets
  // ProtectedRoute admit them. They can sign in later for cloud sync.
  const handleTryDemo = async () => {
    if (demoLoading) return
    setDemoLoading(true)
    try {
      const result = await importDynastyFromUrl(DEMO_DYNASTY_URL)
      try { localStorage.setItem('cfb_demo_mode', '1') } catch {}
      navigate(result?.id ? `/dynasty/${result.id}` : '/')
    } catch (error) {
      console.error('Failed to load demo dynasty:', error)
      toast.error(error?.message || 'Could not load the sample dynasty. Please try again.')
    } finally {
      setDemoLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      // A real sign-in ends the demo trial — drop the bypass flag so signing
      // out later returns to the normal login wall.
      try { localStorage.removeItem('cfb_demo_mode') } catch {}
      // Honor a stashed redirect (set by JoinDynasty when a signed-out user
      // hits an invite link). Single-use — clear it after consuming.
      let dest = '/'
      try {
        const stashed = sessionStorage.getItem('postLoginRedirect')
        if (stashed) {
          sessionStorage.removeItem('postLoginRedirect')
          dest = stashed
        }
      } catch {}
      navigate(dest)
    }
  }, [user, navigate])

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
        // Mirror the auto-effect above so the explicit click path also
        // honors a stashed invite redirect.
        let dest = '/'
        try {
          const stashed = sessionStorage.getItem('postLoginRedirect')
          if (stashed) {
            sessionStorage.removeItem('postLoginRedirect')
            dest = stashed
          }
        } catch {}
        navigate(dest)
      }
    } catch (error) {
      console.error('Sign in failed:', error)
      toast.error(error.message || 'Failed to sign in. Please try again.')
    }
  }

  return (
    <div className="min-h-dvh bg-surface-1 flex flex-col overflow-hidden relative">
      <BouncingLogos />

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6 lg:gap-8 relative z-10">

        {/* Logo — centered across the top */}
        <img
          src="/header-logo.png"
          alt="CFB Dynasty Tracker"
          className="w-64 lg:w-80 h-auto object-contain"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://i.imgur.com/e1iYDSZ.png' }}
        />

        {/* Features + app preview carousel */}
        <div className="w-full max-w-5xl flex flex-col lg:flex-row lg:items-start lg:justify-center gap-6 lg:gap-12">

          <div className="w-full max-w-sm flex-shrink-0 mx-auto lg:mx-0 order-2 lg:order-1">
            <Features />
          </div>

          <div className="w-full max-w-sm lg:max-w-xl flex-1 mx-auto lg:mx-0 order-1 lg:order-2">
            <div className="relative">
              <Card padding="none" variant="bordered" className="overflow-hidden">
                <div className="relative overflow-hidden bg-surface-1" style={{ aspectRatio: '16/9' }}>
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
              </Card>

              <div className="flex justify-center gap-2 mt-3">
                {SCREENSHOTS.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: index === currentSlide ? '24px' : '6px',
                      backgroundColor: index === currentSlide ? 'var(--text-primary)' : 'var(--surface-5)',
                    }}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sign in — centered below */}
        <div className="w-full max-w-sm mx-auto">
          <SignIn onSignIn={handleGoogleSignIn} onTryDemo={handleTryDemo} demoLoading={demoLoading} />
        </div>
      </div>
    </div>
  )
}
