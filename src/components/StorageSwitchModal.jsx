import { useState } from 'react'

/**
 * Modal for switching a dynasty between local and cloud storage
 * Shows upgrade prompt if user tries to switch to cloud without premium
 */
export default function StorageSwitchModal({
  isOpen,
  onClose,
  dynasty,
  isPremium,
  onMigrate,
  onUpgrade
}) {
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState(null)

  if (!isOpen || !dynasty) return null

  const currentStorage = dynasty.storageType || 'local'
  const targetStorage = currentStorage === 'local' ? 'cloud' : 'local'
  const isUpgradeRequired = targetStorage === 'cloud' && !isPremium
  // Cloud dynasty without premium = read-only, show export/import instructions
  const isCloudReadOnly = currentStorage === 'cloud' && !isPremium

  const handleMigrate = async () => {
    if (isUpgradeRequired) {
      onUpgrade?.()
      return
    }

    setMigrating(true)
    setError(null)

    try {
      const result = await onMigrate(dynasty.id, targetStorage)
      if (result.success) {
        onClose()
      } else {
        setError(result.error || 'Migration failed')
      }
    } catch (err) {
      setError(err.message || 'Migration failed')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">
          Change Storage Location
        </h2>

        <div className="mb-6">
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Current storage */}
            <div className={`flex flex-col items-center p-4 rounded-lg border-2 ${
              currentStorage === 'local' ? 'border-blue-500 bg-blue-500/10' : 'border-purple-500 bg-purple-500/10'
            }`}>
              {currentStorage === 'local' ? (
                <svg className="w-8 h-8 text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-purple-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              )}
              <span className="text-sm font-medium text-gray-300">
                {currentStorage === 'local' ? 'Local' : 'Cloud'}
              </span>
              <span className="text-xs text-gray-500">Current</span>
            </div>

            {/* Arrow */}
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>

            {/* Target storage */}
            <div className={`flex flex-col items-center p-4 rounded-lg border-2 border-dashed ${
              targetStorage === 'local' ? 'border-blue-500/50' : 'border-purple-500/50'
            }`}>
              {targetStorage === 'local' ? (
                <svg className="w-8 h-8 text-blue-400/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-purple-400/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              )}
              <span className="text-sm font-medium text-gray-400">
                {targetStorage === 'local' ? 'Local' : 'Cloud'}
              </span>
              <span className="text-xs text-gray-500">Target</span>
            </div>
          </div>

          {/* Description */}
          {targetStorage === 'cloud' ? (
            <div className="text-sm text-gray-400 space-y-2">
              <p><strong className="text-purple-400">Cloud storage</strong> enables:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Access from any device</li>
                <li>Automatic backups</li>
                <li>Real-time sync</li>
                <li>Share with others</li>
              </ul>
            </div>
          ) : (
            <div className="text-sm text-gray-400 space-y-2">
              <p><strong className="text-blue-400">Local storage</strong> means:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Data stays on this device only</li>
                <li>Works offline</li>
                <li>No sync across devices</li>
                <li>You control your data</li>
              </ul>
            </div>
          )}
        </div>

        {/* Cloud read-only message for non-premium users */}
        {isCloudReadOnly && (
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <h3 className="text-sm font-semibold text-amber-400 mb-2">
              This dynasty is read-only
            </h3>
            <p className="text-sm text-amber-300/80 mb-3">
              Without Premium, you can view this cloud dynasty but not edit it. To continue editing:
            </p>
            <ol className="text-sm text-amber-300/80 list-decimal list-inside space-y-1 mb-3">
              <li>Download a backup using the download button on the Home page</li>
              <li>Use "Import" to upload the backup as a new local dynasty</li>
              <li>Delete this cloud version when ready</li>
            </ol>
            <p className="text-xs text-amber-300/60">
              Or upgrade to Premium to edit cloud dynasties directly.
            </p>
          </div>
        )}

        {/* Upgrade required message */}
        {isUpgradeRequired && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-yellow-400">
              <strong>Premium Required</strong> - Cloud storage is a premium feature.
              Upgrade to sync your dynasty across devices.
            </p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={migrating}
            className={`${isCloudReadOnly ? 'w-full' : 'flex-1'} px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50`}
          >
            {isCloudReadOnly ? 'Close' : 'Cancel'}
          </button>
          {!isCloudReadOnly && (
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                isUpgradeRequired
                  ? 'bg-yellow-600 hover:bg-yellow-500'
                  : targetStorage === 'cloud'
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {migrating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Migrating...
                </span>
              ) : isUpgradeRequired ? (
                'Upgrade to Premium'
              ) : (
                `Move to ${targetStorage === 'cloud' ? 'Cloud' : 'Local'}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
