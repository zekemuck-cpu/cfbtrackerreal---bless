/**
 * Self-calibrating phase timing for the "Sync from Save" progress bar.
 *
 * The old progress system assigned each sync phase a FIXED, guessed
 * percentage (5%, 45%, 65%...) with no relationship to how long that phase
 * actually takes. Because the early phases (network reads, buildSyncPlan)
 * are consistently fast while the later write phases are consistently the
 * slowest part — especially after batch-commit concurrency limiting was
 * added to fix Firestore write-stream exhaustion — the ETA's linear
 * extrapolation from "elapsed so far / pct so far" was badly miscalibrated:
 * it looked nearly done at 65-90% and then kept running for many more
 * seconds.
 *
 * Instead, this records how long each phase ACTUALLY took on the user's
 * last few syncs (persisted in localStorage, per dynasty) and uses that
 * real history — not a guess — as the weight for each phase on the NEXT
 * sync. First sync ever has no history and falls back to a rough default;
 * every completed sync after that makes the estimate for THIS dynasty, on
 * THIS device/connection, measurably more accurate.
 */

const STORAGE_KEY = 'cfb27SyncPhaseDurationsMs'

// Rough initial guesses (ms), used only until real history exists for a
// dynasty. Order matters elsewhere (phaseStartOffsets) but not here.
const DEFAULT_DURATIONS_MS = {
  loadRosterGames: 1500,
  buildPlan: 1500,
  mergeGames: 800,
  recalcStats: 1200,
  saveRoster: 4000,
  saveFinal: 3000,
}

export const SYNC_PHASES = Object.keys(DEFAULT_DURATIONS_MS)

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(durations) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(durations))
  } catch {
    // Storage unavailable (private mode, quota) — estimates just stay on defaults.
  }
}

// Per-dynasty stored phase durations, falling back to the defaults for any
// phase this dynasty has no recorded history for yet.
export function getPhaseDurations(dynastyId) {
  const all = readAll()
  const stored = all[dynastyId] || {}
  return { ...DEFAULT_DURATIONS_MS, ...stored }
}

// Exponential moving average (recent syncs matter more than old ones — a
// roster that's grown, or a connection that's gotten slower/faster, should
// shift the estimate within a couple of syncs, not get diluted forever).
const EMA_ALPHA = 0.35

export function recordPhaseDuration(dynastyId, phase, actualMs) {
  if (!dynastyId || !Number.isFinite(actualMs) || actualMs < 0) return
  const all = readAll()
  const forDynasty = all[dynastyId] || {}
  const prev = forDynasty[phase]
  const next = prev == null ? actualMs : Math.round(prev + EMA_ALPHA * (actualMs - prev))
  all[dynastyId] = { ...forDynasty, [phase]: next }
  writeAll(all)
}
