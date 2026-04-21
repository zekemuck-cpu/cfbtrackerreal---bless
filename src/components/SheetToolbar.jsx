import { useState, useEffect, useRef } from 'react'

/**
 * SheetToolbar - Toolbar for embedded Google Sheets with reload, open in new tab,
 * and automatic session error detection.
 */
export default function SheetToolbar({
  sheetId,
  embedUrl,
  teamColors,
  title = 'Google Sheet',
  onSessionError
}) {
  const [iframeKey, setIframeKey] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const iframeRef = useRef(null)

  // Reset error state when sheetId changes
  useEffect(() => {
    setHasError(false)
    setIframeKey(0)
  }, [sheetId])

  const handleReload = () => {
    setIsReloading(true)
    setHasError(false)
    setIframeKey(k => k + 1)
    // Brief loading state for user feedback
    setTimeout(() => setIsReloading(false), 1000)
  }

  const handleOpenInNewTab = () => {
    window.open(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`, '_blank')
  }

  // Detect iframe load errors (session mismatch, etc.)
  // Note: Cross-origin restrictions severely limit what we can detect.
  // The onError event rarely fires for cross-origin iframes, so we
  // DON'T trigger onSessionError here to avoid false positives.
  // Users can manually click "Reload" or "Open in New Tab" if needed.
  const handleIframeError = () => {
    setHasError(true)
    // Don't call onSessionError - it causes false positives
    // onSessionError?.()
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

        {/* Session warning */}
        {hasError && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              border: '1px solid #F59E0B'
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Session issue? Try reload or open in new tab
          </div>
        )}
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
          onError={handleIframeError}
        />
      </div>
    </div>
  )
}

/**
 * SheetErrorBanner - A banner component to show when there are auth/session issues
 * Can be used standalone when more control is needed
 */
export function SheetErrorBanner({ teamColors, onReload, onOpenNewTab, onRefreshSession }) {
  return (
    <div
      className="p-4 rounded-lg mb-3"
      style={{
        backgroundColor: '#FEF3C7',
        border: '1px solid #F59E0B'
      }}
    >
      <div className="flex items-start gap-3">
        <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <h4 className="font-semibold text-amber-800 mb-1">Session Issue Detected</h4>
          <p className="text-sm text-amber-700 mb-3">
            Google detected a session mismatch. This usually happens when you've signed into a different Google account in another tab.
          </p>
          {onRefreshSession && (
            <button
              onClick={onRefreshSession}
              className="px-4 py-2 bg-amber-600 text-white rounded text-sm font-semibold hover:bg-amber-700 transition-colors"
            >
              Refresh Session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
