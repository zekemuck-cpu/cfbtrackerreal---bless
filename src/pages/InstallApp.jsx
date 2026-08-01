import { useState } from 'react'
import { Link } from 'react-router-dom'

// Screenshots (hosted on imgur) walking through the iOS "Add to Home Screen" flow.
const IOS_STEPS = [
  {
    img: 'https://i.imgur.com/GqjgN9R.jpeg',
    text: 'Open dynastytracker.app in Safari, then tap the Share button (the square with an arrow) in the toolbar.',
  },
  {
    img: 'https://i.imgur.com/1XSiMBp.jpeg',
    text: 'Scroll down the share sheet and tap "Add to Home Screen".',
  },
  {
    img: 'https://i.imgur.com/DCQ1AeI.jpeg',
    text: 'Make sure "Open as Web App" is turned on, then tap "Add". The app icon lands on your home screen.',
  },
]

export default function InstallApp() {
  const [tab, setTab] = useState('ios') // 'ios' | 'android'

  const tabClass = (t) =>
    `flex-1 px-4 py-2.5 text-sm font-semibold rounded-md transition-colors ${
      tab === t ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
    }`
  const tabStyle = (t) => (tab === t
    ? { backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-5)' }
    : { backgroundColor: 'transparent', border: '1px solid transparent' })

  return (
    <div className="relative min-h-dvh bg-surface-1 text-txt-primary overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(60rem 40rem at 15% -10%, rgba(88, 101, 242, 0.12), transparent 60%),
            radial-gradient(50rem 35rem at 95% 110%, rgba(255, 69, 0, 0.08), transparent 60%)
          `,
        }}
      />

      <div className="relative max-w-2xl mx-auto px-5 sm:px-8 pt-8 pb-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-txt-tertiary hover:text-txt-primary transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-2">Install Mobile App</h1>
        <p className="text-sm text-txt-secondary mb-6 leading-relaxed">
          There's no app store download — Dynasty Tracker installs straight from your browser and runs
          full-screen like a native app, with its own home-screen icon.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg mb-6" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}>
          <button type="button" className={tabClass('ios')} style={tabStyle('ios')} onClick={() => setTab('ios')}>iOS</button>
          <button type="button" className={tabClass('android')} style={tabStyle('android')} onClick={() => setTab('android')}>Android</button>
        </div>

        {tab === 'ios' ? (
          <ol className="space-y-6">
            {IOS_STEPS.map((step, i) => (
              <li key={i} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-2)' }}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm text-txt-secondary leading-relaxed">{step.text}</p>
                </div>
                <img
                  src={step.img}
                  alt={`Step ${i + 1}`}
                  loading="lazy"
                  className="w-full max-w-xs mx-auto block pb-4"
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-lg px-5 py-6" style={{ border: '1px solid var(--surface-4)', backgroundColor: 'var(--surface-2)' }}>
            <p className="text-sm text-txt-secondary leading-relaxed">
              I don't have an Android device, so no screenshots yet. But here's the gist: open
              <span className="font-semibold text-txt-primary"> dynastytracker.app</span> in Google
              Chrome, tap the three-dot menu in the top-right corner, then choose
              <span className="font-semibold text-txt-primary"> Add to Home screen</span>. Chrome
              installs the app for you automatically.
            </p>
            <Link
              to="/contact"
              className="btn-refined inline-flex mt-5"
            >
              Send screenshots
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
