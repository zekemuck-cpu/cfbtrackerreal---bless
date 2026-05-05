import { useState } from 'react'
import { Link } from 'react-router-dom'

// Sign up at https://web3forms.com, paste your access key here. The key is
// safe to ship to the browser — it only identifies the destination inbox
// and rate-limits submissions, not a secret.
const WEB3FORMS_ACCESS_KEY = 'a5d241b9-874d-4a92-b066-7dbffacb5d70'
const REDDIT_URL = 'https://www.reddit.com/user/achum5/'
const DISCORD_INVITE_URL = 'https://discord.gg/kmrRtVFbh'
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
    <div className="relative min-h-dvh bg-surface-1 text-txt-primary overflow-hidden">
      {/* Ambient glow backdrop — subtle brand colors bleeding in from the corners. */}
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
        {/* Back link — understated, top-left */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-txt-tertiary hover:text-txt-primary transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>

        {/* Hero */}
        <header className="mb-10">
          <div className="label-xs text-txt-tertiary mb-2">Dynasty Tracker</div>
          <h1
            className="font-display font-black uppercase leading-none text-txt-primary"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', letterSpacing: '-0.02em' }}
          >
            Get in touch
          </h1>
        </header>

        {/* Discord server — the headline CTA */}
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-2xl mb-4 transition-all duration-300 hover:-translate-y-1"
          style={{
            background: 'linear-gradient(135deg, #5865F2 0%, #404EED 50%, #2F3BD6 100%)',
            boxShadow: '0 10px 40px -8px rgba(88, 101, 242, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06) inset',
          }}
        >
          {/* Soft diagonal shine that shifts on hover */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
            }}
          />

          <div className="relative flex items-center gap-4 p-5 sm:p-7">
            <div className="relative flex-shrink-0">
              <img
                src="/logo.png"
                alt=""
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 p-2 ring-1 ring-white/25 transition-transform duration-300 group-hover:scale-105"
              />
              {/* Discord badge chip on the logo */}
              <div
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center ring-2 ring-[#404EED]"
                aria-hidden="true"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="#5865F2">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-white/75 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-1.5">
                Primary · Community
              </div>
              <div className="text-white text-xl sm:text-2xl font-black tracking-tight leading-none">
                {DISCORD_SERVER_NAME}
              </div>
              <div className="text-white/75 text-xs sm:text-sm mt-2">
                Questions · feature requests · bug reports
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-white font-semibold text-sm flex-shrink-0 px-4 py-2.5 rounded-xl bg-white/15 group-hover:bg-white/25 transition-all group-hover:gap-3">
              Join
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>
        </a>

        {/* Reddit — secondary, with reddit-orange accent */}
        <a
          href={REDDIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-2xl mb-10 transition-all duration-300 hover:-translate-y-0.5"
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--rule-soft)',
          }}
        >
          <div className="flex items-center gap-4 p-5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ring-1 ring-[#FF4500]/20"
              style={{ backgroundColor: 'rgba(255, 69, 0, 0.1)' }}
              aria-hidden="true"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#FF4500">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-txt-tertiary mb-0.5">
                Reddit DM
              </div>
              <div className="text-base font-bold text-txt-primary">u/achum5</div>
            </div>
            <div className="flex items-center gap-1 text-sm font-medium text-txt-tertiary group-hover:text-txt-primary transition-colors flex-shrink-0">
              Open
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
          </div>
        </a>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-8" aria-hidden="true">
          <div className="h-px flex-1 bg-surface-4" />
          <span className="label-xs text-txt-tertiary">or send a message</span>
          <div className="h-px flex-1 bg-surface-4" />
        </div>

        {/* Contact form card */}
        <section
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--rule-soft)',
          }}
        >
          {status === 'sent' ? (
            <div className="p-8 sm:p-10 text-center">
              <div
                className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(34, 197, 94, 0.12)' }}
                aria-hidden="true"
              >
                <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-txt-primary mb-1">Message received</h2>
              <p className="text-sm text-txt-secondary mb-5">I'll reply to the email you provided.</p>
              <button
                type="button"
                onClick={() => setStatus('idle')}
                className="text-sm font-semibold text-txt-primary hover:opacity-70 transition-opacity underline underline-offset-4 decoration-surface-5"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-5 sm:p-7 flex flex-col gap-4">
              {/* Honeypot — bots fill hidden fields, humans don't. */}
              <input type="checkbox" name="botcheck" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="label-xs text-txt-tertiary">Your name</span>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Jane Doe"
                    className="px-3.5 py-2.5 rounded-lg bg-surface-1 border border-surface-4 focus:border-txt-secondary focus:outline-none focus:ring-2 focus:ring-surface-5 text-txt-primary placeholder:text-txt-muted transition-colors"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="label-xs text-txt-tertiary">Your email</span>
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="you@example.com"
                    className="px-3.5 py-2.5 rounded-lg bg-surface-1 border border-surface-4 focus:border-txt-secondary focus:outline-none focus:ring-2 focus:ring-surface-5 text-txt-primary placeholder:text-txt-muted transition-colors"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="label-xs text-txt-tertiary">Message</span>
                <textarea
                  name="message"
                  rows={6}
                  required
                  placeholder="What's on your mind?"
                  className="px-3.5 py-2.5 rounded-lg bg-surface-1 border border-surface-4 focus:border-txt-secondary focus:outline-none focus:ring-2 focus:ring-surface-5 text-txt-primary placeholder:text-txt-muted resize-y transition-colors"
                />
              </label>

              {status === 'error' && (
                <div
                  className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                >
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-red-300">{errorMsg}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-1">
                <p className="text-xs text-txt-tertiary">
                  Takes &lt; 10 seconds. No signup.
                </p>
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60 active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--text-primary)',
                    color: 'var(--surface-1)',
                  }}
                >
                  {status === 'sending' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Sending…
                    </>
                  ) : (
                    <>
                      Send message
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Footnote */}
        <p className="text-center text-xs text-txt-tertiary mt-8">
          Usually replies within a day or two.
        </p>
      </div>
    </div>
  )
}
