import { useState } from 'react'
import { Link } from 'react-router-dom'

// Sign up at https://web3forms.com, paste your access key here. The key is
// safe to ship to the browser — it only identifies the destination inbox
// and rate-limits submissions, not a secret.
const WEB3FORMS_ACCESS_KEY = 'a5d241b9-874d-4a92-b066-7dbffacb5d70'
const REDDIT_URL = 'https://www.reddit.com/user/achum5/'
const DISCORD_USERNAME = 'fatchum'

export default function Contact() {
  const [status, setStatus] = useState('idle') // 'idle' | 'sending' | 'sent' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)

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

  const handleCopyDiscord = async () => {
    try {
      await navigator.clipboard.writeText(DISCORD_USERNAME)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
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

        {/* Direct-reach links */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">Reach me directly</h2>
          <div className="flex flex-col gap-2">
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

            <button
              type="button"
              onClick={handleCopyDiscord}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-2 border border-surface-4 hover:border-surface-5 hover:bg-surface-3 transition-colors text-left"
              title="Copy Discord username"
            >
              <span>
                <span className="block text-sm text-txt-tertiary">Discord</span>
                <span className="block font-medium">{DISCORD_USERNAME}</span>
              </span>
              <span className="text-txt-tertiary text-sm">
                {copied ? 'Copied!' : 'Copy username'}
              </span>
            </button>
          </div>
          <p className="text-xs text-txt-tertiary mt-2">
            Search for <span className="font-mono">{DISCORD_USERNAME}</span> in Discord to send a friend request or DM.
          </p>
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
