import { useEffect, useState } from 'react'

/**
 * Inline hint shown beneath a spinning "Creating sheet..." loader once
 * the operation has been running longer than `delayMs` (default 60s).
 *
 * Most long loads on this feature are caused by the user's Google Drive
 * being full — the Drive API silently fails to create a file, so we sit
 * there spinning forever. Pointing the user at their storage page usually
 * solves it faster than any retry.
 *
 * Why 60s: shorter delays produced false positives — sheet creation
 * frequently takes 15-30s on slow connections without any storage issue,
 * so the warning was popping up nearly every time.
 */
export default function SheetLoadingHint({ active, delayMs = 60000 }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!active) {
      setShow(false)
      return
    }
    const timer = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  if (!show) return null

  return (
    <div
      className="mt-6 mx-auto max-w-md px-4 py-3 rounded-lg text-left"
      style={{
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
      }}
    >
      <div className="flex items-start gap-2">
        <svg
          className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="text-xs sm:text-sm">
          <div className="font-semibold text-amber-200 mb-0.5">
            Taking longer than expected?
          </div>
          <div className="text-amber-100/80 leading-relaxed">
            Google Drive storage may be full — sheets can't be created when it is.
            Check at{' '}
            <a
              href="https://one.google.com/storage"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              one.google.com/storage
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  )
}
