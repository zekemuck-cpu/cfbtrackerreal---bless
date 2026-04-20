import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="min-h-screen bg-surface-1 text-txt-primary p-8">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
        <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
        <p className="text-txt-tertiary mb-8">Last updated: January 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Acceptance of Terms</h2>
          <p className="text-txt-secondary leading-relaxed">
            By using CFB Dynasty Tracker ("the app"), you agree to these terms. If you don't agree, please don't use the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Description of Service</h2>
          <p className="text-txt-secondary leading-relaxed">
            CFB Dynasty Tracker is a free tool for tracking College Football video game dynasty mode progress. It allows you to record schedules, rosters, game results, and statistics.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">User Accounts</h2>
          <ul className="text-txt-secondary space-y-2 list-disc list-inside">
            <li>You must sign in with a valid Google account</li>
            <li>You are responsible for your account activity</li>
            <li>You may delete your account at any time</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Acceptable Use</h2>
          <p className="text-txt-secondary leading-relaxed mb-3">You agree not to:</p>
          <ul className="text-txt-secondary space-y-2 list-disc list-inside">
            <li>Use the app for any illegal purpose</li>
            <li>Attempt to gain unauthorized access to the app or its systems</li>
            <li>Interfere with other users' enjoyment of the app</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Intellectual Property</h2>
          <p className="text-txt-secondary leading-relaxed">
            Team logos, names, and related content are property of their respective owners. This app is a fan-made tool and is not affiliated with EA Sports, NCAA, or any college football program.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Disclaimer of Warranties</h2>
          <p className="text-txt-secondary leading-relaxed">
            The app is provided "as is" without warranties of any kind. We don't guarantee the app will be error-free or always available.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Limitation of Liability</h2>
          <p className="text-txt-secondary leading-relaxed">
            We are not liable for any damages arising from your use of the app, including loss of data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Changes to Terms</h2>
          <p className="text-txt-secondary leading-relaxed">
            We may update these terms occasionally. Continued use after changes constitutes acceptance.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Contact</h2>
          <p className="text-txt-secondary leading-relaxed">
            Questions? Contact: alex.guess1999@gmail.com
          </p>
        </section>
      </div>
    </div>
  )
}
