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
  const [result, setResult] = useState(null)

  const isCfb27Dynasty = currentDynasty?.gameEdition === 'cfb27'

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setStatus('uploading')
    try {
      const parsed = await uploadAndParseCfb27Save(file, {
        onProgress: (stage) => setStatus(stage),
      })
      setStatus('syncing')
      const syncResult = await syncDynastyFromCFB27Save(currentDynasty.id, parsed)
      setResult(syncResult)
      setStatus('done')
    } catch (err) {
      console.error('CFB27 sync failed:', err)
      setError(err.message || 'Sync failed')
      setStatus('error')
    } finally {
      e.target.value = ''
    }
  }

  const handleClose = () => {
    setStatus(null)
    setError('')
    setResult(null)
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

      {busy && (
        <div className="py-6 text-center text-txt-secondary">
          {statusLabel}
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-sm text-danger mb-4">{error}</p>
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
              Advanced through the end of the season — offseason needs your input (player class decisions), so
              advance the rest manually from here.
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
