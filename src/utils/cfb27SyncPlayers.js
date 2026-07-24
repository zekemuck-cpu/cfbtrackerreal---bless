// Calls api/cfb27-save-sync-players.js to bulk-write a CFB 27 existing-dynasty
// sync's players-subcollection delta (new arrivals + patches to existing
// docs) via the Admin SDK's BulkWriter — sibling to cfb27BulkSeed.js, same
// reasoning (client SDK's offline-write-queue cap), but for merges into an
// already-populated subcollection rather than a from-scratch seed.
import { auth } from '../config/firebase'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * @param {string} dynastyId
 * @param {object[]} creates - fully-mapped new player objects (arrivals)
 * @param {Array<{pid:number, patch:object}>} patches - merge-patches for existing docs
 * @returns {Promise<{ written: number, failed: number }>}
 */
export async function syncPlayersToSubcollection(dynastyId, creates, patches) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to sync a save file')
  const token = await user.getIdToken()

  const res = await fetch(`${API_BASE}/api/cfb27-save-sync-players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dynastyId, creates, patches }),
  })
  if (!res.ok) {
    const info = await res.json().catch(() => ({}))
    throw new Error(info?.error || `Player sync failed (${res.status})`)
  }
  return res.json()
}
