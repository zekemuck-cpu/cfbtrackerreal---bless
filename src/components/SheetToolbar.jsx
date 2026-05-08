import { useState, useEffect, useRef } from 'react'

/**
 * SheetToolbar — toolbar for an embedded Google Sheets iframe with a
 * reload button and an "open in new tab" escape hatch.
 *
 * Cross-origin iframe restrictions block reliable session-error
 * detection (the iframe's onerror event almost never fires for valid
 * cross-origin documents), so the toolbar deliberately does NOT try to
 * surface session errors itself. Auth errors instead surface from the
 * SHEET API CALLS the parent modal makes (createSheet, syncFromSheet,
 * etc.) — those throw OAuthError, which auth.handleError() routes to
 * the standard AuthErrorModal popup. A previous `onSessionError` prop
 * was kept around for years but never fired; removed during the reauth
 * audit cleanup.
 */
export default function SheetToolbar({
  sheetId,
  embedUrl,
  teamColors,
  title = 'Google Sheet',
}) {
  const [iframeKey, setIframeKey] = useState(0)
  const [isReloading, setIsReloading] = useState(false)
  const iframeRef = useRef(null)

  // Reset key when sheetId changes so the iframe re-mounts cleanly.
  useEffect(() => {
    setIframeKey(0)
  }, [sheetId])

  const handleReload = () => {
    setIsReloading(true)
    setIframeKey(k => k + 1)
    // Brief loading state for user feedback.
    setTimeout(() => setIsReloading(false), 1000)
  }

  const handleOpenInNewTab = () => {
    window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank')
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Reload Button */}
          <button
            onClick={handleReload}
            disabled={isReloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--surface-3)',
              color: 'var(--text-primary)',
              border: '1px solid var(--surface-5)'
            }}
            title="Reload sheet"
          >
            <svg
              className={`w-4 h-4 ${isReloading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {isReloading ? 'Reloading...' : 'Reload'}
          </button>

          {/* Open in New Tab Button */}
          <button
            onClick={handleOpenInNewTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: 'var(--surface-3)',
              color: 'var(--text-primary)',
              border: '1px solid var(--surface-5)'
            }}
            title="Open in new tab"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Open in New Tab
          </button>
        </div>
      </div>

      {/* Iframe container */}
      <div
        className="flex-1 min-h-0 border rounded-lg overflow-hidden relative"
        style={{ borderColor: 'var(--surface-5)' }}
      >
        {isReloading && (
          <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center z-10">
            <div
              className="animate-spin w-8 h-8 border-4 rounded-full"
              style={{
                borderColor: 'var(--text-primary)',
                borderTopColor: 'transparent'
              }}
            />
          </div>
        )}
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={embedUrl}
          className="w-full h-full"
          frameBorder="0"
          title={title}
        />
      </div>
    </div>
  )
}
