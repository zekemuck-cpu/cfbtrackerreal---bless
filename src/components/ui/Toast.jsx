import { createContext, useContext, useCallback, useEffect, useState } from 'react'

/**
 * Toast / notification system.
 *
 * Replaces native alert() for informational/success/error feedback.
 *
 * Usage:
 *   <ToastProvider>{app}</ToastProvider>
 *   const { toast } = useToast()
 *   toast.info('Saved')
 *   toast.success('Game recorded')
 *   toast.error('Failed to load roster')
 *   toast.warning('No games entered this week')
 *
 * Toasts auto-dismiss after `duration` ms (default 4000).
 */

const ToastContext = createContext(null)

const VARIANT_STYLES = {
  info: { borderColor: 'var(--accent-info)', label: 'Info' },
  success: { borderColor: 'var(--accent-success)', label: 'Success' },
  warning: { borderColor: 'var(--accent-warning)', label: 'Warning' },
  error: { borderColor: 'var(--accent-error)', label: 'Error' },
}

export function ToastProvider({ children, defaultDuration = 4000 }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (variant, message, { duration = defaultDuration } = {}) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, variant, message }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [defaultDuration, dismiss],
  )

  const api = {
    info: (msg, opts) => show('info', msg, opts),
    success: (msg, opts) => show('success', msg, opts),
    warning: (msg, opts) => show('warning', msg, opts),
    error: (msg, opts) => show('error', msg, opts),
    dismiss,
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div
      className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ variant, message, onDismiss }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const { borderColor, label } = VARIANT_STYLES[variant] || VARIANT_STYLES.info

  return (
    <div
      role="status"
      className={`card-elevated flex items-start gap-3 px-4 py-3 transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="label-xs mb-0.5" style={{ color: borderColor }}>
          {label}
        </div>
        <div className="text-sm text-txt-primary break-words">{message}</div>
      </div>
      <button
        onClick={onDismiss}
        className="text-txt-tertiary hover:text-txt-primary transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Soft fallback so code paths that call toast before the provider mounts
    // don't crash; they fall back to console.
    return {
      toast: {
        info: (m) => console.info('[toast:info]', m),
        success: (m) => console.info('[toast:success]', m),
        warning: (m) => console.warn('[toast:warning]', m),
        error: (m) => console.error('[toast:error]', m),
        dismiss: () => {},
      },
    }
  }
  return { toast: ctx }
}
