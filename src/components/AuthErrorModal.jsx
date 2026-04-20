import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { getModalColors, getContrastTextColor } from '../utils/colorUtils'

export default function AuthErrorModal({ isOpen, onClose, onRefresh, teamColors }) {
  const { refreshSession } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  if (!isOpen) return null

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const success = await refreshSession()
      // Call onRefresh callback if provided (allows parent to retry operations)
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center py-8 px-4 sm:p-4" style={{ margin: 0 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onMouseDown={onClose}
      />

      {/* Modal */}
      <div
        className="relative rounded-xl shadow-2xl max-w-md w-full max-h-[calc(100dvh-4rem)] sm:max-h-[90dvh] overflow-y-auto p-4 sm:p-6 border"
        style={{
          backgroundColor: modalColors.background,
          borderColor: modalColors.border
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${modalColors.accent}20` }}
          >
            <svg className="w-8 h-8" style={{ color: '#fbbf24' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h3
          className="text-xl font-bold text-center mb-2"
          style={{ color: modalColors.text }}
        >
          Session Expired
        </h3>

        {/* Message */}
        <p
          className="text-center mb-6"
          style={{ color: modalColors.textMuted }}
        >
          Your Google authentication has expired. Click below to refresh your session.
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-full py-3 rounded-lg font-semibold hover:opacity-90 transition-colors flex items-center justify-center gap-2"
            style={{
              backgroundColor: modalColors.accent,
              color: getContrastTextColor(modalColors.accent)
            }}
          >
            {refreshing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Session
              </>
            )}
          </button>

          <button
            onClick={onClose}
            disabled={refreshing}
            className="w-full py-2 text-sm font-medium hover:opacity-70 transition-opacity"
            style={{ color: modalColors.textMuted }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
