// Calls api/_handlers/cfb27/bulk-seed-players.js to bulk-write a CFB 27 save import's
// full player roster into a dynasty's Firestore players subcollection via
// the Admin SDK's BulkWriter — see that file's header comment for why this
// exists instead of the normal client-side savePlayersToSubcollection path
// (Firestore's client offline-write-queue cap makes a ~16k-doc import there
// take minutes; BulkWriter has no such cap).
//
// Sent in size-bounded batches: a full league import is ~16,000 players, which
// serializes to well over Vercel's ~4.5 MB request-body cap, so the whole thing
// used to bounce with a bare 413 ("Bulk player import failed (413)") before the
// handler ran. The handler writes with bulkWriter.set() keyed by pid, so it is
// idempotent and additive — splitting one call into several is safe, and a
// retried batch overwrites rather than duplicates.
import { auth } from '../config/firebase'
import { chunkByBytes } from './cfb27RequestChunk'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * @param {string} dynastyId
 * @param {object[]} players - fully-mapped app-schema player objects
 * @param {object} [opts]
 * @param {(done:number,total:number)=>void} [opts.onProgress] - players written so far
 * @returns {Promise<{ written: number, failed: number }>} totals across every batch
 */
export async function bulkSeedPlayers(dynastyId, players, { onProgress } = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to import a save file')
  const token = await user.getIdToken()

  const batches = chunkByBytes(players)
  const total = Array.isArray(players) ? players.length : 0
  let written = 0
  let failed = 0
  let sent = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const res = await fetch(`${API_BASE}/api/cfb27/bulk-seed-players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dynastyId, players: batch }),
    })
    if (!res.ok) {
      const info = await res.json().catch(() => ({}))
      // Name the batch: with several requests in flight "it failed" isn't
      // enough to tell a size problem from a mid-import server error.
      const detail = info?.error || `HTTP ${res.status}`
      throw new Error(
        `Bulk player import failed on batch ${i + 1}/${batches.length} ` +
        `(${sent}/${total} players written): ${detail}`
      )
    }
    const out = await res.json().catch(() => ({}))
    written += Number(out?.written) || 0
    failed += Number(out?.failed) || 0
    sent += batch.length
    onProgress?.(sent, total)
  }

  return { written, failed }
}
