import { useRef, useState } from 'react'
import { useDynasty } from '../context/DynastyContext'
import { uploadAndParseCfb27Save } from '../utils/cfb27SaveUpload'
import Modal from './ui/Modal'
import Button from './ui/Button'

/**
 * "Sync from Save" — re-uploads a newer CFB27 save against the CURRENT
 * (already-tracked) dynasty and reconciles it: new arrivals, departures,
 * transfers, rating/ranking/coaching-staff updates, schedule scores, and
 * recruiting board changes. Counterpart to the CFB27 import flow in
 * CreateDynasty.jsx, which only ever creates a brand-new dynasty.
 */
export default function CFB27SyncModal({ isOpen, onClose }) {
  const { currentDynasty, syncDynastyFromCFB27Save } = useDynasty()
  const fileInputRef = useRef(null)

  const [status, setStatus] = useState(null) // null | 'uploading' | 'parsing' | 'syncing' | 'done' | 'error'
  const [error, setError] = useState('')
  const [errorParts, setErrorParts] = useState(null) // { completed: string[], failed: string[] } | null
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(null) // { message, pct, etaSeconds } | null

  const isCfb27Dynasty = currentDynasty?.gameEdition === 'cfb27'

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setErrorParts(null)
    setResult(null)
    setProgress(null)
    setStatus('uploading')
    try {
      const parsed = await uploadAndParseCfb27Save(file, {
        onProgress: (stage) => setStatus(stage),
      })
      setStatus('syncing')
      const syncResult = await syncDynastyFromCFB27Save(currentDynasty.id, parsed, {
        // Upload+parse already covered roughly 0-10%; rescale the sync's own
        // 0-100 into the remaining 10-100 so the whole click-to-done flow
        // reads as one continuous bar instead of resetting partway through.
        onProgress: (p) => setProgress({ ...p, pct: 10 + Math.round((p.pct / 100) * 90) }),
      })
      setResult(syncResult)
      setStatus('done')
    } catch (err) {
      console.error('CFB27 sync failed:', err)
      setError(err.message || 'Sync failed')
      if (err.completedParts || err.failedParts) {
        setErrorParts({ completed: err.completedParts || [], failed: err.failedParts || [] })
      }
      setStatus('error')
    } finally {
      e.target.value = ''
    }
  }

  const handleClose = () => {
    setStatus(null)
    setError('')
    setErrorParts(null)
    setResult(null)
    setProgress(null)
    onClose()
  }

  const busy = status === 'uploading' || status === 'parsing' || status === 'syncing'
  const statusLabel = {
    uploading: 'Uploading save...',
    parsing: 'Reading save...',
    syncing: 'Comparing against your dynasty...',
  }[status]

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Sync from Save"
      size="sm"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      hideClose={busy}
    >
      {!isCfb27Dynasty && (
        <p className="text-sm text-txt-secondary">
          This dynasty wasn't created from a CFB27 save, so there's nothing to match a new save against yet.
        </p>
      )}

      {isCfb27Dynasty && status === null && (
        <>
          <p className="text-sm text-txt-secondary mb-4">
            Upload a newer save from this same dynasty. The save always wins — anything it tracks (roster, ratings,
            rankings, coaching staff, schedule scores, recruiting board) overwrites what's here now.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="primary" className="w-full" onClick={() => fileInputRef.current?.click()}>
            Choose Save File
          </Button>
        </>
      )}

      {(status === 'uploading' || status === 'parsing') && (
        <div className="py-6 text-center text-txt-secondary">
          {statusLabel}
        </div>
      )}

      {status === 'syncing' && (
        <div className="py-2 space-y-2" aria-live="polite">
          <div className="flex items-center justify-between text-sm text-txt-secondary">
            <span>{progress?.message || 'Syncing…'}</span>
            <span className="tabular">{progress?.pct != null ? `${Math.min(100, Math.round(progress.pct))}%` : ''}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full bg-txt-primary transition-all duration-300 ease-out"
              style={{ width: `${Math.max(2, Math.min(100, progress?.pct ?? 2))}%` }}
            />
          </div>
          {progress?.etaSeconds != null && progress.etaSeconds > 1 && (
            <p className="text-xs text-txt-secondary">~{progress.etaSeconds}s remaining</p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-sm text-danger mb-4">{error}</p>
          {errorParts && (
            <div className="text-xs text-txt-secondary mb-4 space-y-1">
              {errorParts.completed.length > 0 && <p>Synced: {errorParts.completed.join(', ')}.</p>}
              {errorParts.failed.length > 0 && <p>Not synced (safe to re-run the sync): {errorParts.failed.join(', ')}.</p>}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => setStatus(null)}>
            Try Again
          </Button>
        </div>
      )}

      {status === 'done' && result && (
        <div>
          <p className="text-sm font-semibold text-txt-primary mb-3">Sync complete.</p>
          <ul className="text-sm text-txt-secondary space-y-1 mb-4">
            <li>{result.summary.playersUpdated} players updated</li>
            <li>{result.summary.arrivals} new arrivals</li>
            <li>{result.summary.transfers} transfers</li>
            <li>{result.summary.departures} departures</li>
            <li>{result.summary.teamsRatingsUpdated} teams' ratings updated</li>
            <li>{result.summary.teamsCoachingUpdated} teams' coaching staff updated</li>
            <li>{result.summary.rankingsUpdated} teams' rankings updated</li>
            <li>{result.summary.recruitingTargets} recruiting board changes</li>
            <li>{result.summary.cpuGamesUpdated} other teams' games updated</li>
            <li>{result.summary.boxScoresAdded} box scores added</li>
          </ul>
          {result.reachedTargetSeason && (
            <p className="text-xs text-txt-secondary mb-4">
              Week and phase advanced to match your save.
            </p>
          )}
          {result.stoppedAtOffseason && (
            <p className="text-xs text-txt-secondary mb-4">
              Advanced through the end of the season. Keep clicking Advance here in the tracker through the
              offseason — since your roster and stats are already synced from the save, it normally won't ask
              you anything (a class-progression prompt only appears for a player whose games-played this
              season is unknown). The year itself only flips once you Advance into the new season, so play
              on in-game and sync again whenever you want the newest data.
            </p>
          )}
          {result.unresolvedTeamNames?.length > 0 && (
            <p className="text-xs text-txt-secondary mb-4">
              Not recognized and skipped: {result.unresolvedTeamNames.join(', ')}
            </p>
          )}
          <Button variant="primary" className="w-full" onClick={handleClose}>
            Done
          </Button>
        </div>
      )}
    </Modal>
  )
}
