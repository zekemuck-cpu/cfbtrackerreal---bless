import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import logo from '../assets/logo.png'
import BouncingLogos from '../components/BouncingLogos'
import { Card, ContactCTA } from '../components/ui'
import { useToast } from '../components/ui/Toast'

const SCREENSHOTS = [
  { url: 'https://i.imgur.com/RflYzae.png', caption: 'Dashboard' },
  { url: 'https://i.imgur.com/QBgvS3M.png', caption: 'Team Stats' },
  { url: 'https://i.imgur.com/FNpdolf.png', caption: 'Player Profile' },
  { url: 'https://i.imgur.com/T152n1f.png', caption: 'Schedule' },
  { url: 'https://i.imgur.com/D9eQz1c.png', caption: 'Roster Management' },
  { url: 'https://i.imgur.com/jslB1bq.png', caption: 'CFP Bracket' },
  { url: 'https://i.imgur.com/EGStRRA.png', caption: 'Bowl History' },
]

const FEATURES = [
  'Cloud saves that sync across all devices',
  'Guided to-do list for every phase of the season',
  'Manage schedules, rosters, and recruiting',
  'Track stats, awards, and team records',
  'AI-powered game reports and analysis',
  'Import game data from Google Sheets',
  'View CFP brackets and bowl history',
]

function FeaturesAndSignin({ onSignIn }) {
  return (
    <>
      <Card padding="md" className="mb-6">
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

      <p className="text-xs text-txt-tertiary text-center mt-4 px-2">
        We use Google Sign-In for authentication and optionally connect to Google Sheets to import your game data. We never access any other Google data.
      </p>

      <p className="text-xs text-txt-tertiary text-center mt-4">
        Completely free
      </p>

      <div className="mt-6">
        <ContactCTA />
      </div>

      <div className="flex items-center justify-center gap-3 mt-4 text-xs text-txt-tertiary">
        <Link to="/privacy" className="hover:text-txt-secondary transition-colors">
          Privacy Policy
        </Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-txt-secondary transition-colors">
          Terms of Service
        </Link>
        <span>·</span>
        <Link to="/contact" className="hover:text-txt-secondary transition-colors">
          Contact
        </Link>
      </div>
    </>
  )
}

export default function Login() {
  const { user, signInWithGoogle } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    if (user) {
      navigate('/')
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
        navigate('/')
      }
    } catch (error) {
      console.error('Sign in failed:', error)
      toast.error(error.message || 'Failed to sign in. Please try again.')
    }
  }

  return (
    <div className="min-h-dvh bg-surface-1 flex flex-col overflow-hidden relative">
      <BouncingLogos />

      <div className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-5xl flex flex-col items-center lg:flex-row lg:items-center lg:justify-center gap-6 lg:gap-12">

          <div className="w-full max-w-sm flex-shrink-0 lg:order-1 order-1 mx-auto lg:mx-0">
            <div className="flex justify-center mb-4 lg:mb-6">
              <img
                src={logo}
                alt="CFB Dynasty Tracker"
                className="w-20 h-20 lg:w-28 lg:h-28 object-contain"
              />
            </div>

            <div className="text-center mb-6 lg:mb-8">
              <h1 className="display-md lg:display-lg text-txt-primary">
                Dynasty Tracker
              </h1>
              <p className="label-xs text-txt-tertiary mt-2">
                Track your EA CFB Dynasty
              </p>
            </div>

            <div className="hidden lg:block">
              <FeaturesAndSignin onSignIn={handleGoogleSignIn} />
            </div>
          </div>

          <div className="w-full max-w-sm lg:max-w-xl flex-1 order-2 lg:order-2 mx-auto lg:mx-0">
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
                      backgroundColor: index === currentSlide ? 'var(--team-primary)' : 'var(--surface-5)',
                    }}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm flex-shrink-0 order-3 lg:hidden mx-auto">
            <FeaturesAndSignin onSignIn={handleGoogleSignIn} />
          </div>
        </div>
      </div>
    </div>
  )
}
