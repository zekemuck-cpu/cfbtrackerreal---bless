import { Link } from 'react-router-dom'

export default function Privacy() {
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
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-txt-tertiary mb-8">Last updated: January 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Overview</h2>
          <p className="text-txt-secondary leading-relaxed">
            CFB Dynasty Tracker ("we", "our", or "the app") is a personal tool for tracking College Football video game dynasty mode progress. We are committed to protecting your privacy.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Information We Collect</h2>
          <ul className="text-txt-secondary space-y-2 list-disc list-inside">
            <li><strong>Google Account Info:</strong> When you sign in with Google, we receive your email address, name, and profile picture to identify your account.</li>
            <li><strong>Dynasty Data:</strong> Game data you enter (schedules, rosters, stats) is stored in Firebase Firestore associated with your account.</li>
            <li><strong>Google Sheets Access:</strong> We request permission to read/write Google Sheets spreadsheets you connect to the app for data entry purposes.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">How We Use Your Information</h2>
          <ul className="text-txt-secondary space-y-2 list-disc list-inside">
            <li>To authenticate your account and save your dynasty data</li>
            <li>To import data from Google Sheets for schedule, roster, and stats entry</li>
            <li>We do NOT sell, share, or use your data for advertising</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Google Sheets Integration</h2>
          <p className="text-txt-secondary leading-relaxed">
            Google Sheets is the primary method for entering data into the app. The app can only access spreadsheets you explicitly connect. We use the <code className="bg-surface-3 px-1 rounded">drive.file</code> scope, which limits access to files you create or open with the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Data Storage & Security</h2>
          <p className="text-txt-secondary leading-relaxed">
            Your data is stored securely in Google Firebase. We use industry-standard security practices. You can delete your account and all associated data at any time.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Your Rights</h2>
          <ul className="text-txt-secondary space-y-2 list-disc list-inside">
            <li>Access your data at any time through the app</li>
            <li>Delete your dynasties and account data</li>
            <li>Revoke Google permissions via your Google Account settings</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Contact</h2>
          <p className="text-txt-secondary leading-relaxed">
            For privacy questions or data deletion requests, contact: alex.guess1999@gmail.com
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Changes to This Policy</h2>
          <p className="text-txt-secondary leading-relaxed">
            We may update this policy occasionally. Continued use of the app after changes constitutes acceptance.
          </p>
        </section>
      </div>
    </div>
  )
}
