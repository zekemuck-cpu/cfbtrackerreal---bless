import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthErrorModal({ isOpen, onClose, onRefresh }) {
  const { refreshSession } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  if (!isOpen) return null

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const success = await refreshSession()
      if (success && onRefresh) {
        await onRefresh()
      }
      onClose()
    } catch (error) {
      console.error('Failed to refresh session:', error)
    } finally {
      setRefreshing(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="modal-panel-in relative w-full max-w-md overflow-hidden rounded-xl"
        style={{
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--rule-soft)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset'
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Team-accent top rule */}
        <div
          aria-hidden="true"
          className="h-[3px] w-full"
          style={{
            background: 'linear-gradient(90deg, var(--team-primary) 0%, color-mix(in srgb, var(--team-primary) 60%, transparent) 55%, transparent 100%)'
          }}
        />

        <div className="px-6 pt-6 pb-5">
          {/* Eyebrow */}
          <div
            className="text-[10px] font-bold uppercase text-txt-tertiary"
            style={{ letterSpacing: '2.5px' }}
          >
            Authentication
          </div>

          {/* Title */}
          <h2
            className="font-black leading-none mt-1 text-txt-primary"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '2rem',
              letterSpacing: '1.5px'
            }}
          >
            Session Expired
          </h2>

          {/* Message */}
          <p className="text-sm text-txt-secondary mt-3 leading-relaxed">
            Your Google sign-in has expired. Refresh your session to continue editing.
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-2 mt-6">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full py-3 rounded-lg font-bold uppercase tracking-wider text-xs transition-all hover:opacity-90 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: 'var(--team-primary)',
                color: 'var(--team-primary-text, #ffffff)',
                letterSpacing: '2px'
              }}
            >
              {refreshing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Refreshing
                </>
              ) : (
                'Refresh Session'
              )}
            </button>

            <button
              onClick={onClose}
              disabled={refreshing}
              className="w-full py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-surface-3 border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-colors disabled:opacity-40"
              style={{ letterSpacing: '2px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
