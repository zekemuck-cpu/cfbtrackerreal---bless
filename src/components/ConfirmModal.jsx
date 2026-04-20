import { useMemo } from 'react'
import { getModalColors } from '../utils/colorUtils'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmButtonColor = "#ef4444",
  confirmButtonTextColor = "#ffffff",
  loading = false,
  teamColors = null
}) {
  const modalColors = useMemo(() => {
    if (teamColors) {
      return getModalColors(teamColors)
    }
    // Default dark theme when no team colors provided
    return {
      background: '#1f2937',
      text: '#ffffff',
      textMuted: '#9ca3af',
      border: '#374151'
    }
  }, [teamColors])

  if (!isOpen) return null

  const handleConfirm = () => {
    onConfirm()
    // Don't auto-close - let parent handle closing via onConfirm if needed
    // This allows multi-step confirmations (e.g., favorited dynasty delete)
  }

  return (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center py-8 px-4 sm:p-4" style={{ margin: 0 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60"
        onMouseDown={loading ? undefined : onClose}
      />

      {/* Modal */}
      <div
        className="relative rounded-xl shadow-xl max-w-md w-full max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 border"
        style={{
          backgroundColor: modalColors.background,
          borderColor: modalColors.border
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          className="text-xl font-bold mb-3"
          style={{ color: modalColors.text }}
        >
          {title}
        </h2>

        <p
          className="mb-6"
          style={{ color: modalColors.textMuted }}
        >
          {message}
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-surface-3 hover:bg-surface-4 rounded-lg font-semibold text-white transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              backgroundColor: confirmButtonColor,
              color: confirmButtonTextColor
            }}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {confirmText}...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
