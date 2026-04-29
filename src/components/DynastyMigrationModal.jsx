import { useState } from 'react'
import Modal from './ui/Modal'
import { Button } from './ui'
import { migrateDynastyToV2 } from '../data/migrateDynastyV2'

export default function DynastyMigrationModal({ dynasty, isOpen, onMigrate, onDismiss }) {
  const [working, setWorking] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  if (!dynasty) return null

  const handleBackup = async () => {
    try {
      const json = JSON.stringify(dynasty, null, 2)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const safeName = (dynasty.name || dynasty.teamName || 'dynasty').replace(/[^\w]+/g, '_')
      const filename = `${safeName}_backup_pre_v2_${stamp}.json`

      // Prefer Save As dialog when supported.
      if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Dynasty backup (JSON)',
              accept: { 'application/json': ['.json'] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(json)
          await writable.close()
          return
        } catch (err) {
          if (err?.name === 'AbortError') return
          console.warn('showSaveFilePicker failed, falling back to direct download:', err)
        }
      }

      // Legacy fallback
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('Backup failed: ' + e.message)
    }
  }

  const handleMigrate = async () => {
    setWorking(true)
    setError(null)
    try {
      const { dynasty: migrated, report: r } = migrateDynastyToV2(dynasty)
      setReport(r)
      await onMigrate(migrated)
    } catch (e) {
      setError('Migration failed: ' + e.message)
      setWorking(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onDismiss}
      title="Roster data update required"
      size="md"
      closeOnBackdrop={false}
      closeOnEscape={false}
      hideClose={working}
    >
      {!report && (
        <div className="space-y-4 text-sm text-txt-primary">
          <p>
            Hi! I've updated roster management on the back end to make it more reliable.
            Your dynasty was created before this change, so it needs a one-time cleanup
            to bring it onto the new system.
          </p>
          <p className="text-txt-secondary">
            <span className="text-amber-400 font-semibold">Heads up:</span> this will touch
            player records — consolidating duplicate movement data, removing a few
            stale ghost entries from old award imports, and cleaning empty team
            references. Nothing you care about gets deleted, but be safe:
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-txt-secondary">
            <li><span className="text-txt-primary font-semibold">Download a backup first</span> (button below).</li>
            <li>Then click <span className="text-txt-primary font-semibold">Migrate</span> to run the cleanup.</li>
            <li>If anything looks off afterward, you can restore from the backup.</li>
          </ol>

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button variant="secondary" onClick={handleBackup} disabled={working}>
              Download backup (.json)
            </Button>
            <Button variant="primary" onClick={handleMigrate} disabled={working}>
              {working ? 'Migrating…' : 'Migrate this dynasty'}
            </Button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={working}
              className="text-xs text-txt-muted hover:text-txt-secondary mt-1 self-center"
            >
              Remind me later
            </button>
          </div>
        </div>
      )}

      {report && (
        <div className="space-y-3 text-sm text-txt-primary">
          <p className="text-green-400 font-semibold">Migration complete.</p>
          <ul className="text-xs text-txt-secondary space-y-1 font-mono">
            <li>Players kept: {report.playersMigrated}</li>
            <li>Ghost records removed: {report.honorOnlyGhostsDropped}</li>
            <li>Empty team refs cleaned: {report.emptyTeamsByYearEntriesRemoved}</li>
            <li>Stale post-departure entries trimmed: {report.staleTeamsByYearTrimmed}</li>
            <li>Movement collisions resolved: {report.collisionsResolved}</li>
            {report.unknownMovementTypes.length > 0 && (
              <li className="text-amber-300">
                Unknown movement types encountered: {report.unknownMovementTypes.join(', ')}
              </li>
            )}
          </ul>
          <Button variant="primary" onClick={onDismiss} className="w-full mt-2">
            Continue
          </Button>
        </div>
      )}
    </Modal>
  )
}
