import { useState } from 'react'
import { Link } from 'react-router-dom'

// Sign up at https://web3forms.com, paste your access key here. The key is
// safe to ship to the browser — it only identifies the destination inbox
// and rate-limits submissions, not a secret.
const WEB3FORMS_ACCESS_KEY = 'a5d241b9-874d-4a92-b066-7dbffacb5d70'
const REDDIT_URL = 'https://www.reddit.com/user/achum5/'
const DISCORD_INVITE_URL = 'https://discord.gg/ccz5cpbX'
const DISCORD_SERVER_NAME = 'Dynasty Tracker'

export default function Contact() {
  const [status, setStatus] = useState('idle') // 'idle' | 'sending' | 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    const form = e.currentTarget
    const formData = new FormData(form)
    formData.append('access_key', WEB3FORMS_ACCESS_KEY)
    formData.append('subject', 'CFB Dynasty Tracker — contact form')
    formData.append('from_name', 'Dynasty Tracker Contact Form')

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        setStatus('sent')
        form.reset()
      } else {
        setStatus('error')
        setErrorMsg(data.message || 'Something went wrong. Try again in a minute.')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err?.message || 'Network error. Try again in a minute.')
    }
  }

  return (
    <div className="min-h-dvh bg-surface-1 text-txt-primary p-8">
      <div className="max-w-xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 mb-6"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Contact</h1>
        <p className="text-txt-tertiary mb-8">
          Questions, bugs, or feature requests — pick whatever channel you like.
        </p>

        {/* Discord server — the headline CTA. One click, no friend-request dance. */}
        <section className="mb-8">
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #5865F2 0%, #404EED 100%)',
              boxShadow: '0 4px 20px rgba(88, 101, 242, 0.3)',
            }}
          >
            <div className="flex items-center gap-4 p-5 sm:p-6">
              <img
                src="/logo.png"
                alt=""
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white/10 p-1.5 flex-shrink-0 ring-1 ring-white/20"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-white/80 text-xs font-bold uppercase tracking-widest mb-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  Join the Discord
                </div>
                <div className="text-white text-lg sm:text-xl font-bold leading-tight">
                  {DISCORD_SERVER_NAME}
                </div>
                <div className="text-white/80 text-xs sm:text-sm mt-1">
                  Questions · feature requests · bug reports
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-white/90 font-semibold text-sm flex-shrink-0 px-3 py-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors">
                Join
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </div>
            </div>
          </a>
        </section>

        {/* Other ways to reach out */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Other ways</h2>
          <a
            href={REDDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-2 border border-surface-4 hover:border-surface-5 hover:bg-surface-3 transition-colors"
          >
            <span>
              <span className="block text-sm text-txt-tertiary">Reddit</span>
              <span className="block font-medium">u/achum5</span>
            </span>
            <span className="text-txt-tertiary text-sm">Open →</span>
          </a>
        </section>

        {/* Contact form */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Send a message</h2>

          {status === 'sent' ? (
            <div className="px-4 py-6 rounded-lg bg-surface-2 border border-green-500/40 text-center">
              <p className="font-semibold mb-1">Thanks — message received.</p>
              <p className="text-sm text-txt-secondary">I'll reply to the email you provided.</p>
              <button
                type="button"
                onClick={() => setStatus('idle')}
                className="mt-3 text-sm text-orange-400 hover:text-orange-300"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {/* Honeypot — bots fill hidden fields, humans don't. Web3Forms silently drops submissions where this field is filled. */}
              <input type="checkbox" name="botcheck" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

              <label className="flex flex-col gap-1">
                <span className="text-sm text-txt-secondary">Your name</span>
                <input
                  type="text"
                  name="name"
                  required
                  className="px-3 py-2 rounded-md bg-surface-2 border border-surface-4 focus:border-surface-5 focus:outline-none text-txt-primary"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-txt-secondary">Your email</span>
                <input
                  type="email"
                  name="email"
                  required
                  className="px-3 py-2 rounded-md bg-surface-2 border border-surface-4 focus:border-surface-5 focus:outline-none text-txt-primary"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-txt-secondary">Message</span>
                <textarea
                  name="message"
                  rows={6}
                  required
                  className="px-3 py-2 rounded-md bg-surface-2 border border-surface-4 focus:border-surface-5 focus:outline-none text-txt-primary resize-y"
                />
              </label>

              {status === 'error' && (
                <p className="text-sm text-red-400">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="mt-2 px-4 py-2 rounded-md font-semibold bg-surface-5 text-txt-primary hover:opacity-90 disabled:opacity-60 transition-opacity self-start"
              >
                {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
