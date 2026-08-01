// Calls api/cfb27-save-sync-players.js to bulk-write a CFB 27 existing-dynasty
// sync's players-subcollection delta (new arrivals + patches to existing
// docs) via the Admin SDK's BulkWriter — sibling to cfb27BulkSeed.js, same
// reasoning (client SDK's offline-write-queue cap), but for merges into an
// already-populated subcollection rather than a from-scratch seed.
//
// Batched by serialized size for the same reason as the seed path: a large
// delta blows past Vercel's ~4.5 MB request-body cap and the request is
// rejected with a bare 413 before the handler runs. Writes are keyed by pid
// (set/merge), so splitting into several requests is idempotent.
import { auth } from '../config/firebase'
import { chunkPairByBytes } from './cfb27RequestChunk'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * @param {string} dynastyId
 * @param {object[]} creates - fully-mapped new player objects (arrivals)
 * @param {Array<{pid:number, patch:object}>} patches - merge-patches for existing docs
 * @param {object} [opts]
 * @param {(done:number,total:number)=>void} [opts.onProgress] - records sent so far
 * @returns {Promise<{ written: number, failed: number }>} totals across every batch
 */
export async function syncPlayersToSubcollection(dynastyId, creates, patches, { onProgress } = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to sync a save file')
  const token = await user.getIdToken()

  const batches = chunkPairByBytes(creates, patches)
  const total = (creates?.length || 0) + (patches?.length || 0)
  if (batches.length === 0) return { written: 0, failed: 0 }

  let written = 0
  let failed = 0
  let sent = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const res = await fetch(`${API_BASE}/api/cfb27-save-sync-players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dynastyId, creates: batch.creates, patches: batch.patches }),
    })
    if (!res.ok) {
      const info = await res.json().catch(() => ({}))
      const detail = info?.error || `HTTP ${res.status}`
      throw new Error(
        `Player sync failed on batch ${i + 1}/${batches.length} ` +
        `(${sent}/${total} records written): ${detail}`
      )
    }
    const out = await res.json().catch(() => ({}))
    written += Number(out?.written) || 0
    failed += Number(out?.failed) || 0
    sent += batch.creates.length + batch.patches.length
    onProgress?.(sent, total)
  }

  return { written, failed }
}
