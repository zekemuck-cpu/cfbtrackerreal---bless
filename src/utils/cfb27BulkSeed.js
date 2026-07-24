// Calls api/cfb27-bulk-seed-players.js to bulk-write a CFB 27 save import's
// full player roster into a dynasty's Firestore players subcollection via
// the Admin SDK's BulkWriter — see that file's header comment for why this
// exists instead of the normal client-side savePlayersToSubcollection path
// (Firestore's client offline-write-queue cap makes a ~16k-doc import there
// take minutes; BulkWriter has no such cap).
import { auth } from '../config/firebase'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * @param {string} dynastyId
 * @param {object[]} players - fully-mapped app-schema player objects
 * @returns {Promise<{ written: number, failed: number }>}
 */
export async function bulkSeedPlayers(dynastyId, players) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to import a save file')
  const token = await user.getIdToken()

  const res = await fetch(`${API_BASE}/api/cfb27-bulk-seed-players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dynastyId, players }),
  })
  if (!res.ok) {
    const info = await res.json().catch(() => ({}))
    throw new Error(info?.error || `Bulk player import failed (${res.status})`)
  }
  return res.json()
}
