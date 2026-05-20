import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  deleteField,
  waitForPendingWrites
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { indexedDBStorage } from './storage'
import {
  getSeasonsSubcollection,
  PER_YEAR_FIELDS,
  PER_TEAM_YEAR_FIELDS,
} from './seasonSubcollection'

const DYNASTIES_COLLECTION = 'dynasties'
const PLAYERS_SUBCOLLECTION = 'players'
const GAMES_SUBCOLLECTION = 'games'
const INVITES_SUBCOLLECTION = 'invites'
const WEEK_RECAPS_SUBCOLLECTION = 'weekRecaps'
// Mirrored from seasonSubcollection.js — kept local so the dynasty
// teardown path (deleteDynastyWithSubcollections) can wipe the
// seasons docs without crossing module boundaries.
const SEASONS_SUBCOLLECTION = 'seasons'

// Batch size limit for Firestore (max 500 per batch)
const BATCH_SIZE = 450

/**
 * Recursively sanitize an object for Firestore
 * - Removes empty string keys (Firestore doesn't allow them)
 * - Removes undefined values (Firestore doesn't allow them)
 * - Converts undefined to null in arrays to preserve indices
 * @param {any} obj - The object to sanitize
 * @returns {any} - The sanitized object
 */
function sanitizeForFirestore(obj) {
  if (obj === null) return null
  if (obj === undefined) return null // Convert undefined to null at top level
  if (Array.isArray(obj)) {
    // For arrays, convert undefined to null to preserve indices
    return obj.map(item => item === undefined ? null : sanitizeForFirestore(item))
  }
  if (typeof obj === 'object') {
    // Handle Date objects
    if (obj instanceof Date) return obj
    // Handle Firestore Timestamp objects
    if (obj.toDate && typeof obj.toDate === 'function') return obj

    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip empty string keys
      if (key === '') continue
      // Skip undefined values entirely (don't include in result)
      if (value === undefined) continue
      result[key] = sanitizeForFirestore(value)
    }
    return result
  }
  return obj
}

// Get all dynasties for a specific user
export async function getUserDynasties(userId) {
  try {
    const q = query(
      collection(db, DYNASTIES_COLLECTION),
      where('userId', '==', userId)
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => {
      const data = doc.data()
      // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
      const { id: _, ...cleanData } = data
      return {
        id: doc.id,  // Always use Firestore document ID
        ...cleanData
      }
    })
  } catch (error) {
    console.error('Error fetching dynasties:', error)
    throw error
  }
}

// Subscribe to real-time updates for user's dynasties
export function subscribeToDynasties(userId, callback) {
  const q = query(
    collection(db, DYNASTIES_COLLECTION),
    where('userId', '==', userId)
  )

  return onSnapshot(q, (snapshot) => {
    const dynasties = snapshot.docs.map(doc => {
      const data = doc.data()
      // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
      const { id: _, ...cleanData } = data
      return {
        id: doc.id,  // Always use Firestore document ID
        ...cleanData
      }
    })
    callback(dynasties)
  }, (error) => {
    console.error('Error in dynasty subscription:', error)
  })
}

/**
 * Subscribe to dynasties the user has been granted edit access to but
 * doesn't own. Owner-side dynasties arrive via subscribeToDynasties;
 * this fills in the rest. Callers should dedupe by id since `editors`
 * may include the owner's uid (some dynasties auto-include the owner
 * for rule simplicity).
 */
export function subscribeToSharedDynasties(userId, callback) {
  if (!userId) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, DYNASTIES_COLLECTION),
    where('editors', 'array-contains', userId)
  )
  return onSnapshot(q, (snapshot) => {
    const dynasties = snapshot.docs.map(doc => {
      const data = doc.data()
      const { id: _, ...cleanData } = data
      return { id: doc.id, ...cleanData }
    })
    callback(dynasties)
  }, (error) => {
    console.error('Error in shared-dynasties subscription:', error)
  })
}

// Create a new dynasty
export async function createDynasty(userId, dynastyData) {
  try {
    // Sanitize data to remove undefined values (Firestore doesn't allow them)
    const sanitizedData = sanitizeForFirestore(dynastyData)

    const docRef = await addDoc(collection(db, DYNASTIES_COLLECTION), {
      ...sanitizedData,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    return {
      id: docRef.id,
      ...sanitizedData,
      userId
    }
  } catch (error) {
    console.error('Error creating dynasty:', error)
    throw error
  }
}

// Update an existing dynasty
export async function updateDynasty(dynastyId, updates) {
  try {
    const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)

    // Sanitize data to remove undefined values (Firestore doesn't allow them)
    const sanitizedUpdates = sanitizeForFirestore(updates)

    await updateDoc(docRef, {
      ...sanitizedUpdates,
      updatedAt: serverTimestamp()
    })
  } catch (error) {
    console.error('Error updating dynasty:', error)
    throw error
  }
}

// ─── Invite tokens ───────────────────────────────────────────────
// Stored as token-keyed docs in dynasties/{id}/invites/{token}.
// Firestore rules:
//   - get  : any signed-in user (URL-shared)
//   - list : denied (no enumeration)
//   - create/delete : editors only
//   - update : redemption only (any signed-in user can mark themselves
//              redeemed once on an unredeemed unexpired invite)
//
// See firestore.rules for the gory details.

/**
 * Create an invite doc. `invite.token` is the doc ID.
 *   { token, role, createdBy, createdAt, expiresAt?, label?,
 *     redeemedBy: null, redeemedAt: null }
 */
export async function createInviteDoc(dynastyId, invite) {
  if (!invite?.token) throw new Error('createInviteDoc: missing token')
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, invite.token)
  const payload = sanitizeForFirestore({
    role: invite.role || 'member',
    createdBy: invite.createdBy || null,
    createdAt: serverTimestamp(),
    expiresAt: invite.expiresAt ?? null,
    label: invite.label ?? null,
    redeemedBy: null,
    redeemedAt: null,
  })
  await setDoc(ref, payload)
  return invite.token
}

/** Read one invite by token. Returns null if not found. */
export async function getInviteDoc(dynastyId, token) {
  if (!token) return null
  const snap = await getDoc(doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, token))
  if (!snap.exists()) return null
  return { token: snap.id, ...snap.data() }
}

/** List ALL invite docs for a dynasty (editors only — server rule denies list). */
export async function listInviteDocs(dynastyId) {
  const colRef = collection(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION)
  const snap = await getDocs(colRef)
  return snap.docs.map(d => ({ token: d.id, ...d.data() }))
}

/**
 * Subscribe to invites changes. Used by the Members page so the
 * pending-invites list updates when the commish revokes one or a new
 * one is generated.
 */
export function subscribeToInvites(dynastyId, callback) {
  if (!dynastyId) return () => {}
  const colRef = collection(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION)
  return onSnapshot(
    colRef,
    (snap) => callback(snap.docs.map(d => ({ token: d.id, ...d.data() }))),
    (err) => {
      console.error('[subscribeToInvites] failed:', err)
      callback([])
    },
  )
}

/** Revoke an invite — editors only. */
export async function deleteInviteDoc(dynastyId, token) {
  if (!token) return
  await deleteDoc(doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, token))
}

/**
 * Mark an invite redeemed by `uid`. Step 1 of the two-phase join. The
 * follow-up call (claimEditorSlot) appends uid to the dynasty's
 * editors[]. The Firestore rule on the invite doc enforces:
 *   - was unredeemed
 *   - was unexpired
 *   - the new redeemedBy MUST equal request.auth.uid
 *   - only redeemedBy/redeemedAt are changing
 */
export async function redeemInviteDoc(dynastyId, token, uid) {
  if (!token || !uid) throw new Error('redeemInviteDoc: missing token or uid')
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, token)
  await updateDoc(ref, {
    redeemedBy: uid,
    redeemedAt: serverTimestamp(),
  })
}

// Delete a dynasty
export async function deleteDynasty(dynastyId) {
  try {
    await deleteDoc(doc(db, DYNASTIES_COLLECTION, dynastyId))
  } catch (error) {
    console.error('Error deleting dynasty:', error)
    throw error
  }
}

// Get a single dynasty by ID
export async function getDynasty(dynastyId) {
  try {
    const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
      const { id: _, ...cleanData } = data
      return {
        id: docSnap.id,  // Always use Firestore document ID
        ...cleanData
      }
    }
    return null
  } catch (error) {
    console.error('Error fetching dynasty:', error)
    throw error
  }
}

// Get a public dynasty by share code (no authentication required)
export async function getPublicDynastyByShareCode(shareCode) {
  try {
    const q = query(
      collection(db, DYNASTIES_COLLECTION),
      where('shareCode', '==', shareCode),
      where('isPublic', '==', true)
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return null
    }

    const docSnap = snapshot.docs[0]
    const data = docSnap.data()
    // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
    const { id: _, ...cleanData } = data
    return {
      id: docSnap.id,
      ...cleanData
    }
  } catch (error) {
    console.error('Error fetching public dynasty:', error)
    throw error
  }
}

// Generate a unique share code
export function generateShareCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// Migrate local data (localStorage and IndexedDB) to Firestore for a user
export async function migrateLocalStorageData(userId) {
  try {
    // Check both localStorage (legacy) and IndexedDB (new) for data to migrate
    const localStorageData = localStorage.getItem('cfb-dynasties')
    const indexedDBData = await indexedDBStorage.getDynasties()

    // Combine data sources, preferring IndexedDB if both exist
    let dynasties = []
    if (indexedDBData && indexedDBData.length > 0) {
      dynasties = indexedDBData
    } else if (localStorageData) {
      dynasties = JSON.parse(localStorageData)
    }

    if (dynasties.length === 0) return []

    const migratedDynasties = []

    for (const dynasty of dynasties) {
      // Remove the old ID and let Firestore generate new ones
      const { id, ...dynastyData } = dynasty
      const newDynasty = await createDynasty(userId, dynastyData)
      migratedDynasties.push(newDynasty)
    }

    // Clear local storage after successful migration
    localStorage.removeItem('cfb-dynasties')
    await indexedDBStorage.clearAll()

    return migratedDynasties
  } catch (error) {
    console.error('Error migrating local data:', error)
    throw error
  }
}

// ============================================================================
// SUBCOLLECTION FUNCTIONS - Players and Games stored in separate collections
// ============================================================================

/**
 * Get all players from the players subcollection.
 *
 * Uses `getDocs()` so the SDK can serve from its local cache when the
 * cached version matches the server, and only round-trips when fresh
 * data is genuinely needed. The previous version used
 * `getDocsFromServer()` to defeat a stale-cache bug seen during the
 * one-time subcollection migration; that migration is long done, but
 * the forced server fetch was still firing on every dynasty open and
 * adding 5–30s of cold-start latency on mobile (where Firestore
 * deserialization is slower and the payload can be multiple MB).
 *
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Array>} Array of player objects
 */
export async function getPlayersSubcollection(dynastyId, options = {}) {
  const { onFresh = null } = options
  const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)

  // Cache-first read: try the local IndexedDB cache before going to the
  // network. Default getDocs() is server-priority and blocks on slow
  // connections — that's what made clicking into a dynasty hang for
  // minutes on mobile despite persistentLocalCache being enabled
  // (onSnapshot serves from cache, but getDocs does not by default).
  //
  // Cross-device staleness fix: when the cache hits, ALSO fire a
  // background server fetch and propagate the fresh result via
  // onFresh(). Without that callback the previous code dropped the
  // server result on the floor — meaning a save made on Device A
  // never reached Device B until something else evicted the cache.
  // Caller updates React state in onFresh so the UI catches up the
  // moment the network returns.
  try {
    const cachedSnap = await getDocsFromCache(playersRef)
    if (!cachedSnap.empty) {
      const cached = cachedSnap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
      getDocsFromServer(playersRef).then(snap => {
        if (!onFresh) return
        const fresh = snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
        try { onFresh(fresh) } catch (e) { console.error('onFresh callback threw:', e) }
      }).catch(() => {})
      return cached
    }
  } catch (_) {
    // Cache unavailable (Safari private mode, IndexedDB blocked, first
    // open before cache seeded) — fall through to the network.
  }

  try {
    const snapshot = await getDocs(playersRef)
    return snapshot.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
  } catch (error) {
    console.error('Error fetching players subcollection:', error)
    throw error
  }
}

/**
 * Get all games from the games subcollection
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Array>} Array of game objects
 */
export async function getGamesSubcollection(dynastyId, options = {}) {
  const { onFresh = null } = options
  const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)

  // Cache-first — see comment in getPlayersSubcollection. The onFresh
  // callback is how cross-device updates (recap saved on Device A,
  // viewed on Device B) propagate: the cached read returns instantly
  // for the fast initial paint, and the background server fetch
  // pushes any newer data into React state once it returns.
  try {
    const cachedSnap = await getDocsFromCache(gamesRef)
    if (!cachedSnap.empty) {
      const cached = cachedSnap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
      getDocsFromServer(gamesRef).then(snap => {
        if (!onFresh) return
        const fresh = snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
        try { onFresh(fresh) } catch (e) { console.error('onFresh callback threw:', e) }
      }).catch(() => {})
      return cached
    }
  } catch (_) {
    // Fall through to network.
  }

  try {
    const snapshot = await getDocs(gamesRef)
    return snapshot.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
  } catch (error) {
    console.error('Error fetching games subcollection:', error)
    throw error
  }
}

/**
 * Bump the dynasty main doc's `lastModified` field in the same writeBatch
 * as a subcollection write. This is the cross-device-sync trigger:
 * subscribeToDynasties listens to the MAIN doc; subcollection writes
 * alone don't fire it, so without this bump Device B never learns
 * about a save Device A made to the games / players / weekRecaps
 * subcollections. Adding the update to the batch keeps the whole
 * thing atomic — either everything lands or nothing does — and adds
 * zero round-trips because batches are one network call.
 */
function bumpDynastyLastModifiedInBatch(batch, dynastyId) {
  const mainDocRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  batch.update(mainDocRef, { lastModified: Date.now() })
}

/**
 * Save a single player to the players subcollection
 * Uses player.pid as document ID for consistent updates
 * This is the EFFICIENT method for single-player updates (1 write instead of N)
 * @param {string} dynastyId - The dynasty document ID
 * @param {Object} player - The player object (must have pid)
 */
export async function savePlayerToSubcollection(dynastyId, player) {
  try {
    if (!player.pid) {
      throw new Error('Player must have a pid')
    }
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    // Remove _firestoreId before saving and sanitize
    const { _firestoreId, ...rawPlayerData } = player
    const playerData = sanitizeForFirestore(rawPlayerData)

    // CRITICAL: full set() (NOT merge) so deleted nested keys actually get
    // removed in Firestore. merge: true preserved keys the caller omitted —
    // including keys the user explicitly deleted in the editor (e.g. removing
    // teamsByYear[2034] from a player's career tab). That caused "player
    // reappears on the roster after reload" because the old year key survived
    // the write. Callers (updatePlayer) always pass the full player object,
    // so a full replace is safe and correct.
    console.log(`[savePlayerToSubcollection] WRITING ${player.pid} (${player.name}) — teamsByYear:`, JSON.stringify(playerData.teamsByYear))
    // writeBatch combines the player write + main-doc lastModified
    // bump into one atomic network call. Without the bump the
    // dynasty listener on other devices doesn't fire — see
    // bumpDynastyLastModifiedInBatch comment.
    const batch = writeBatch(db)
    batch.set(playerRef, playerData)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[savePlayerToSubcollection] COMMITTED ${player.pid} (${player.name}) to server`)
  } catch (error) {
    console.error('Error saving player to subcollection:', error)
    throw error
  }
}

/**
 * Save multiple players to the players subcollection using batch writes
 * IMPORTANT: Only deletes orphans if explicitly requested - partial updates are safe by default
 * @param {string} dynastyId - The dynasty document ID
 * @param {Array} players - Array of player objects
 * @param {Object} options - Optional settings
 * @param {boolean} options.deleteOrphans - If true, deletes players not in the array (use for full sync like merging duplicates)
 * @param {boolean} options.forceOverwrite - If true, skips safety checks (for explicit user actions like migration)
 */
export async function savePlayersToSubcollection(dynastyId, players, options = {}) {
  const { deleteOrphans = false, forceOverwrite = false } = options

  try {
    // Handle empty array case - do nothing, don't delete existing players
    const playersToSave = players || []

    // SAFETY: Never save an empty array unless forceOverwrite is true
    // Empty array usually indicates a bug, not intentional deletion
    if (playersToSave.length === 0 && !forceOverwrite) {
      console.warn('[savePlayersToSubcollection] Received empty players array - skipping to prevent data loss. Use forceOverwrite=true to override.')
      return
    }

    console.log(`[savePlayersToSubcollection] Saving ${playersToSave.length} players to dynasty ${dynastyId}`)

    // Handle orphan cleanup if requested
    if (deleteOrphans) {
      const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)
      const snapshot = await getDocs(playersRef)
      const existingIds = new Set(snapshot.docs.map(doc => doc.id))
      const existingCount = existingIds.size
      const newIds = new Set(playersToSave.filter(p => p.pid).map(p => String(p.pid)))
      const orphanedIds = [...existingIds].filter(id => !newIds.has(id))

      // CRITICAL SAFETY CHECK: Prevent accidental mass deletion
      // If we're about to delete more than 50% of existing players, refuse unless forced
      if (orphanedIds.length > 0 && existingCount > 50) {
        const deletionPercentage = (orphanedIds.length / existingCount) * 100
        if (deletionPercentage > 50 && !forceOverwrite) {
          console.error(`[savePlayersToSubcollection] SAFETY CHECK BLOCKED: Would delete ${orphanedIds.length} of ${existingCount} players (${deletionPercentage.toFixed(1)}%). This looks like a bug. Saving ${playersToSave.length} players WITHOUT orphan cleanup.`)
          console.error(`[savePlayersToSubcollection] To force deletion, use forceOverwrite: true`)
          // Continue WITHOUT deleting orphans - just save the new players
        } else {
          // Safe to delete
          console.log(`[savePlayersToSubcollection] Deleting ${orphanedIds.length} orphaned players (${deletionPercentage.toFixed(1)}% of ${existingCount})`)
          for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
            const batch = writeBatch(db)
            orphanedIds.slice(i, i + BATCH_SIZE).forEach(id => {
              batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, id))
            })
            await batch.commit()
          }
          await waitForPendingWrites(db)
        }
      } else if (orphanedIds.length > 0) {
        // Small deletion - safe to proceed
        console.log(`[savePlayersToSubcollection] Deleting ${orphanedIds.length} orphaned players`)
        for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
          const batch = writeBatch(db)
          orphanedIds.slice(i, i + BATCH_SIZE).forEach(id => {
            batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, id))
          })
          await batch.commit()
        }
        await waitForPendingWrites(db)
      }
    }

    // Process in batches of BATCH_SIZE
    const totalBatches = Math.ceil(playersToSave.length / BATCH_SIZE)
    for (let i = 0; i < playersToSave.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const batch = writeBatch(db)
      const batchPlayers = playersToSave.slice(i, i + BATCH_SIZE)

      for (const player of batchPlayers) {
        if (!player.pid) {
          console.warn('Skipping player without pid:', player.name)
          continue
        }
        const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
        // Remove _firestoreId before saving and sanitize to remove empty keys
        const { _firestoreId, ...rawPlayerData } = player
        const playerData = sanitizeForFirestore(rawPlayerData)

        // ALWAYS full replace (not merge). Firestore's merge mode recursively
        // merges nested objects, which means keys the caller INTENTIONALLY
        // removed (e.g. teamsByYear[2034] deleted from a player's career tab,
        // or stale keys trimmed by a migration) silently survive the write.
        // Callers always build a complete player object from the current
        // in-memory state, so a full replace is both safe and correct.
        // The `forceOverwrite` option is kept on this function for the
        // orphan-cleanup behavior above; individual player docs no longer
        // branch on it. See the matching comment in savePlayerToSubcollection.
        batch.set(playerRef, playerData)
      }

      await batch.commit()
      console.log(`[savePlayersToSubcollection] Batch ${batchNum}/${totalBatches} committed locally (${batchPlayers.length} players)`)

      // Add delay between batches to prevent "Write stream exhausted" error
      // Scale delay based on number of batches for large datasets
      if (i + BATCH_SIZE < playersToSave.length) {
        const delayMs = totalBatches > 3 ? 300 : 200
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    console.log(`[savePlayersToSubcollection] All batches committed locally - waiting for server sync...`)

    // CRITICAL: Wait for pending writes to actually reach the server
    // batch.commit() only commits to local cache with offline persistence enabled
    // waitForPendingWrites ensures data is actually sent to Firestore server
    try {
      await waitForPendingWrites(db)
      console.log(`[savePlayersToSubcollection] ✓ Server sync confirmed - all writes acknowledged`)
    } catch (syncError) {
      console.error(`[savePlayersToSubcollection] ERROR: Server sync failed!`, syncError)
      throw new Error(`Failed to sync writes to server: ${syncError.message}`)
    }

    console.log(`[savePlayersToSubcollection] Successfully saved ${playersToSave.length} players to SERVER`)
  } catch (error) {
    console.error('Error saving players to subcollection:', error)
    throw error
  }
}

/**
 * Delete a player from the players subcollection
 * This is the EFFICIENT method for single-player deletes (1 delete instead of N writes)
 * @param {string} dynastyId - The dynasty document ID
 * @param {number|string} playerId - The player's pid
 */
export async function deletePlayerFromSubcollection(dynastyId, playerId) {
  try {
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(playerId))
    // Atomic delete + main-doc bump so other devices' listener fires.
    const batch = writeBatch(db)
    batch.delete(playerRef)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[deletePlayerFromSubcollection] Deleted player ${playerId} from server`)
  } catch (error) {
    console.error('Error deleting player from subcollection:', error)
    throw error
  }
}

/**
 * Save a single game to the games subcollection
 * Uses game.id as document ID for consistent updates
 * This is the EFFICIENT method for single-game updates (1 write instead of N)
 * @param {string} dynastyId - The dynasty document ID
 * @param {Object} game - The game object (must have id)
 */
// Strip stash fields and other underscore-prefixed transient fields
// before persisting a game record. The weekly-scores rank pass uses
// `_team1CurrentWeekRank` / `_team2CurrentWeekRank` to carry the
// user's entered rank from one step to the next, and they're meant
// to be deleted before the game is saved. Doing the strip at the
// service boundary too is defense-in-depth — any future caller path
// that bypasses the strip in saveWeeklyScores can't accidentally
// persist these fields.
function stripTransientGameFields(game) {
  if (!game || typeof game !== 'object') return game
  const cleaned = {}
  for (const [k, v] of Object.entries(game)) {
    if (k === '_firestoreId') continue
    if (k.startsWith('_team1CurrentWeekRank')) continue
    if (k.startsWith('_team2CurrentWeekRank')) continue
    cleaned[k] = v
  }
  return cleaned
}

export async function saveGameToSubcollection(dynastyId, game) {
  try {
    if (!game.id) {
      throw new Error('Game must have an id')
    }
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
    const rawGameData = stripTransientGameFields(game)
    const gameData = sanitizeForFirestore(rawGameData)

    // Atomic: game write + main-doc lastModified bump in one batch.
    // Without the bump, the dynasty listener on other devices never
    // fires for subcollection-only writes — that's the recap-saved-
    // on-laptop-but-missing-on-phone bug.
    const batch = writeBatch(db)
    batch.set(gameRef, gameData)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[saveGameToSubcollection] Saved game ${game.id} to server`)
  } catch (error) {
    console.error('Error saving game to subcollection:', error)
    throw error
  }
}

/**
 * Weekly-scores fast path: persist a small set of games that just got
 * inserted/replaced (the ~60-130 games for ONE week) plus optional
 * deletions, all in a single writeBatch.
 *
 * Why this exists: saveWeeklyScores was passing the FULL dynasty.games
 * array to updateDynasty, which routes through saveGamesToSubcollection
 * with deleteOrphans=true — a full-rewrite of every game in the
 * subcollection. On a multi-year dynasty (1000+ games) that produces
 * 1000+ setDoc calls, blowing past Firestore's offline-queue limit
 * and triggering the "Write stream exhausted maximum allowed queued
 * writes" error the user reported. The fix: only persist the games
 * that ACTUALLY changed in this save.
 *
 * Caller invariant: pass the games this save just produced (insert
 * or replace) AND the IDs of any games this save is removing
 * (typically: previously-stored weekly-scores rows for the same
 * week+team-pair that got rebuilt with fresh data). Don't pass the
 * full dynasty roster — this helper is for incremental writes.
 */
/**
 * Roster-history-style fast path: persist a small set of player docs
 * that just had targeted field updates (e.g. teamsByYear merges from
 * a Roster History Sheet sync). No orphan cleanup, no full rewrite.
 *
 * Pair this with a reference-diff in the caller (the .map() in
 * RosterHistoryModal returns the SAME ref for unchanged players, so
 * `updatedPlayers.filter((p, i) => p !== originalPlayers[i])` gives
 * you the exact set to persist).
 *
 * Single writeBatch for up to 500 players — covers any realistic
 * partial-roster-update flow without touching the rest of the
 * subcollection. Was previously routed through
 * savePlayersToSubcollection's full-rewrite path which fired
 * thousands of setDocs for a few-hundred-player change.
 */
export async function saveChangedPlayers(dynastyId, changedPlayers = []) {
  if (!Array.isArray(changedPlayers) || changedPlayers.length === 0) return

  // Defense-in-depth: clamp at 500 docs per batch (Firestore's hard
  // cap). Extremely unlikely to hit on partial roster updates, but a
  // pathological input shouldn't silently truncate.
  if (changedPlayers.length > 500) {
    throw new Error(`saveChangedPlayers: too many players (${changedPlayers.length}), cap is 500. Use savePlayersToSubcollection for full-roster writes.`)
  }

  const batch = writeBatch(db)
  let count = 0
  for (const player of changedPlayers) {
    if (!player?.pid) continue
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    const { _firestoreId: _fid, ...rawPlayer } = player
    batch.set(playerRef, sanitizeForFirestore(rawPlayer))
    count++
  }

  if (count === 0) return
  // Cross-device sync trigger — see bumpDynastyLastModifiedInBatch.
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
  await waitForPendingWrites(db)
  console.log(`[saveChangedPlayers] Wrote ${count} changed players in 1 batch`)
}

export async function saveWeeklyGamesChanges(dynastyId, gamesToSet = [], gameIdsToDelete = []) {
  const totalOps = (gamesToSet?.length || 0) + (gameIdsToDelete?.length || 0)
  if (totalOps === 0) return

  // CRITICAL: when an ID appears in BOTH gamesToSet and gameIdsToDelete,
  // we must NOT issue a delete for it — Firestore writeBatch executes
  // ops in submission order, and a later delete will wipe out a game
  // we just set in the same batch. saveWeeklyScores's existing-id-reuse
  // pattern (`id: existing?.id || idForGame(...)`) puts the same ID in
  // both arrays for any matchup that existed before AND exists now;
  // without this filter the new write got reverted by the trailing
  // delete, leaving only brand-new matchups in the subcollection. That
  // was the "games are gone" bug — Alabama Prince's Wk 4 re-save
  // tracked 62 games but only 3 actually persisted (the 2 new
  // matchups + the user-team game that uses a non-weekly id).
  const setIdSet = new Set()
  for (const game of gamesToSet || []) {
    if (game?.id) setIdSet.add(String(game.id))
  }
  const safeDeletes = (gameIdsToDelete || []).filter(id => id != null && !setIdSet.has(String(id)))

  // Firestore caps writeBatch at 500 ops. ~60-130 game inserts plus a
  // handful of deletions stays comfortably under that on every realistic
  // weekly slate; if that ever grows, split into multiple batches.
  const batch = writeBatch(db)

  for (const game of gamesToSet || []) {
    if (!game?.id) continue
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
    const rawGame = stripTransientGameFields(game)
    batch.set(gameRef, sanitizeForFirestore(rawGame))
  }

  for (const gameId of safeDeletes) {
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(gameId))
    batch.delete(gameRef)
  }

  // Cross-device sync trigger — see bumpDynastyLastModifiedInBatch.
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
  await waitForPendingWrites(db)
  console.log(`[saveWeeklyGamesChanges] Committed ${gamesToSet?.length || 0} sets + ${safeDeletes.length} deletes (${(gameIdsToDelete?.length || 0) - safeDeletes.length} delete-then-set duplicates filtered) in 1 batch`)
}

/**
 * Box-score-save fast path: persist exactly one game and a small set
 * of players (the ones whose stats actually changed because of the
 * incoming box score) in a single batched write.
 *
 * Why this exists: when the user saves a Sheet-driven box score
 * (player stats / scoring summary / team stats), addGame's downstream
 * `updateDynasty` was routing through `savePlayersToSubcollection` and
 * `saveGamesToSubcollection`. Those rewrite EVERY player and EVERY
 * game in the dynasty, with multi-batch delays + a `getDocsFromServer`
 * verify-read at the end. On a 5000-player / 1000-game dynasty that
 * was 30+ seconds per save even though only ~20-30 players actually
 * had any new stats. This helper writes just the affected docs and
 * skips the verify-read entirely; cost is O(changed players) instead
 * of O(all players).
 *
 * Single 30-doc writeBatch costs one round-trip total — cheaper than
 * Promise.all([savePlayer, savePlayer, ...]) which fires N setDocs in
 * parallel (each its own roundtrip).
 *
 * Caller invariant: changedPlayers must be a SUBSET of the dynasty's
 * roster — pass only entries whose reference moved between the
 * pre-processBoxScoreSave and post-processBoxScoreSave players arrays.
 * Don't use this for full-roster saves; orphan cleanup is intentionally
 * skipped.
 */
export async function saveChangedPlayersAndGame(dynastyId, changedPlayers, game) {
  if (!game?.id) {
    throw new Error('Game must have an id')
  }

  const batch = writeBatch(db)

  // The single game doc.
  const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
  const { _firestoreId: _gFid, ...rawGame } = game
  batch.set(gameRef, sanitizeForFirestore(rawGame))

  // Each changed player. Skip entries without a pid (defensive — same
  // guard savePlayersToSubcollection has).
  let playerCount = 0
  for (const player of changedPlayers || []) {
    if (!player?.pid) continue
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    const { _firestoreId: _pFid, ...rawPlayer } = player
    batch.set(playerRef, sanitizeForFirestore(rawPlayer))
    playerCount++
  }

  // Cross-device sync trigger — see bumpDynastyLastModifiedInBatch.
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
  // Single waitForPendingWrites covers the whole batch.
  await waitForPendingWrites(db)
  console.log(`[saveChangedPlayersAndGame] Wrote 1 game + ${playerCount} changed players in one batch`)
}

/**
 * Save multiple games to the games subcollection using batch writes
 * IMPORTANT: Only deletes orphans if explicitly requested - partial updates are safe by default
 * @param {string} dynastyId - The dynasty document ID
 * @param {Array} games - Array of game objects
 * @param {Object} options - Optional settings
 * @param {boolean} options.deleteOrphans - If true, deletes games not in the array (DANGEROUS - only use for full sync)
 * @param {boolean} options.forceDeleteOrphans - If true, bypasses safety check (EXTREMELY DANGEROUS - only for explicit user actions)
 */
export async function saveGamesToSubcollection(dynastyId, games, options = {}) {
  const { deleteOrphans = false, forceDeleteOrphans = false } = options

  try {
    // Handle empty array case
    const gamesToSave = games || []

    // Only check for orphans if explicitly requested (full sync operations only)
    if (deleteOrphans) {
      // Get current IDs in subcollection to find orphans
      const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)
      const snapshot = await getDocs(gamesRef)
      const existingIds = new Set(snapshot.docs.map(doc => doc.id))
      const existingCount = existingIds.size

      // Get IDs we're about to save
      const newIds = new Set(gamesToSave.filter(g => g.id).map(g => String(g.id)))

      // Find orphaned IDs (exist in subcollection but not in our save list)
      const orphanedIds = [...existingIds].filter(id => !newIds.has(id))

      // CRITICAL SAFETY CHECK: Prevent accidental mass deletion
      // If we're about to delete more than 50% of existing games, refuse unless forced
      if (orphanedIds.length > 0 && existingCount > 20) {
        const deletionPercentage = (orphanedIds.length / existingCount) * 100
        if (deletionPercentage > 50 && !forceDeleteOrphans) {
          console.error(`[saveGamesToSubcollection] SAFETY CHECK BLOCKED: Would delete ${orphanedIds.length} of ${existingCount} games (${deletionPercentage.toFixed(1)}%). This looks like a bug. Saving ${gamesToSave.length} games WITHOUT orphan cleanup.`)
          console.error(`[saveGamesToSubcollection] To force deletion, use forceDeleteOrphans: true`)
          // Continue WITHOUT deleting orphans - just save the new games
        } else {
          // Safe to delete - either low percentage or explicitly forced
          console.log(`[saveGamesToSubcollection] Deleting ${orphanedIds.length} orphaned game documents (deleteOrphans=true, ${deletionPercentage.toFixed(1)}% of ${existingCount})`)
          for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
            const batch = writeBatch(db)
            const batchIds = orphanedIds.slice(i, i + BATCH_SIZE)

            for (const id of batchIds) {
              const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, id)
              batch.delete(gameRef)
            }

            await batch.commit()
          }
        }
      } else if (orphanedIds.length > 0) {
        // Small number of existing games or small deletion - safe to proceed
        console.log(`[saveGamesToSubcollection] Deleting ${orphanedIds.length} orphaned game documents (deleteOrphans=true)`)
        for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
          const batch = writeBatch(db)
          const batchIds = orphanedIds.slice(i, i + BATCH_SIZE)

          for (const id of batchIds) {
            const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, id)
            batch.delete(gameRef)
          }

          await batch.commit()
        }
      }
    }

    // Save games (skip if empty)
    if (gamesToSave.length === 0) return

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < gamesToSave.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const batchGames = gamesToSave.slice(i, i + BATCH_SIZE)

      for (const game of batchGames) {
        if (!game.id) {
          console.warn('Skipping game without id:', game)
          continue
        }
        const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
        // Remove _firestoreId before saving and sanitize to remove empty keys
        const { _firestoreId, ...rawGameData } = game
        const gameData = sanitizeForFirestore(rawGameData)
        batch.set(gameRef, gameData)
      }

      await batch.commit()
    }
  } catch (error) {
    console.error('Error saving games to subcollection:', error)
    throw error
  }
}

/**
 * Delete a game from the games subcollection
 * This is the EFFICIENT method for single-game deletes (1 delete instead of N writes)
 * @param {string} dynastyId - The dynasty document ID
 * @param {string} gameId - The game's id
 */
export async function deleteGameFromSubcollection(dynastyId, gameId) {
  try {
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(gameId))
    // Atomic delete + main-doc bump so other devices' listener fires.
    const batch = writeBatch(db)
    batch.delete(gameRef)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[deleteGameFromSubcollection] Deleted game ${gameId} from server`)
  } catch (error) {
    console.error('Error deleting game from subcollection:', error)
    throw error
  }
}

// ─── Week Recaps subcollection ──────────────────────────────────────
// Recaps are AI-generated narrative text, often several KB each. Long-
// running dynasties were pushing the parent dynasty document past the
// 1 MB Firestore size cap (one beta doc was 1,051,303 bytes), at which
// point ALL writes to the dynasty document fail with INVALID_ARGUMENT
// — including totally unrelated saves like preseason setup. Storing
// each recap as its own doc keyed by `${year}-${week}` keeps the parent
// doc lean and lets recap volume scale freely.

const recapDocId = (year, week) => `${Number(year)}-${Number(week)}`

/**
 * Save a single week recap as its own subcollection doc.
 *
 * Three-step durability guarantee — beta users were reporting recaps
 * disappearing after closing and reopening the site, and the failure
 * mode for that is `setDoc` resolving as soon as the LOCAL cache is
 * updated while the server-side write fails (rules denial, expired
 * auth, network drop) and gets silently dropped:
 *   1. setDoc — write to local cache + queue server sync
 *   2. waitForPendingWrites — block until the SDK acks every pending
 *      write from the server
 *   3. read-back verify — fetch the doc fresh from the server (no
 *      cache) and confirm the `text` field is what we just wrote
 *
 * If verify fails, throw — WeekRecapModal's catch surfaces the actual
 * error code in the toast so the user knows the save didn't stick
 * (instead of seeing a fake success toast and losing the recap on
 * the next reload).
 */
export async function saveWeekRecapToSubcollection(dynastyId, year, week, recap) {
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION, recapDocId(year, week))
  const payload = sanitizeForFirestore({
    year: Number(year),
    week: Number(week),
    generatedAt: recap?.generatedAt ?? Date.now(),
    text: recap?.text || '',
  })

  // Atomic: recap write + main-doc lastModified bump in one batch
  // so subscribeToDynasties on Device B fires (subcollection-only
  // writes don't reach a main-doc listener). See
  // bumpDynastyLastModifiedInBatch.
  const batch = writeBatch(db)
  batch.set(ref, payload)
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()

  // Step 2 — block until the SDK confirms every pending write was
  // acked by the server. Without this, setDoc resolves on cache write
  // and a flaky network can silently drop the server-side write.
  try {
    await waitForPendingWrites(db)
  } catch (err) {
    // waitForPendingWrites failure means we don't know the server
    // status. Throw so the caller can surface the failure rather
    // than show a misleading success toast.
    throw new Error(`Recap save couldn't be confirmed: ${err?.code || err?.message || 'sync timeout'}`)
  }

  // Step 3 — read-back verify the persisted text from the server. The
  // text we just wrote should round-trip exactly. If the server doc
  // is missing or the text differs, throw.
  try {
    const verifySnap = await getDocFromServer(ref)
    if (!verifySnap.exists()) {
      throw new Error('Recap save verification failed: server doc not found after write')
    }
    const verifyData = verifySnap.data() || {}
    if (verifyData.text !== payload.text) {
      throw new Error('Recap save verification failed: server text does not match the written value')
    }
  } catch (err) {
    if (err?.message?.startsWith('Recap save verification failed')) throw err
    throw new Error(`Recap save verification failed: ${err?.code || err?.message || 'unknown'}`)
  }
}

export async function deleteWeekRecapFromSubcollection(dynastyId, year, week) {
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION, recapDocId(year, week))
  // Atomic delete + main-doc bump so other devices' listener fires.
  const batch = writeBatch(db)
  batch.delete(ref)
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
}

/**
 * Load all week recaps and rebuild the legacy `{ [year]: { [week]: {...} } }`
 * shape that consumers (Dashboard, WeeklyScores, WeekRecapModal) already
 * expect. Cache-first like other subcollection reads.
 */
export async function getWeekRecapsSubcollection(dynastyId, options = {}) {
  const { onFresh = null } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION)
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      getDocsFromServer(ref).then(snap => {
        if (!onFresh) return
        try { onFresh(buildRecapsMap(snap.docs)) } catch (e) { console.error('onFresh callback threw:', e) }
      }).catch(() => {})
      return buildRecapsMap(cached.docs)
    }
  } catch (_) { /* fall through to network */ }
  try {
    const snap = await getDocs(ref)
    return buildRecapsMap(snap.docs)
  } catch (error) {
    console.error('Error fetching weekRecaps subcollection:', error)
    return {}
  }
}

function buildRecapsMap(docs) {
  const out = {}
  for (const d of docs) {
    const data = d.data()
    const y = Number(data.year)
    const w = Number(data.week)
    if (!Number.isFinite(y) || !Number.isFinite(w)) continue
    if (!out[y]) out[y] = {}
    out[y][w] = { generatedAt: data.generatedAt, text: data.text || '' }
  }
  return out
}

/**
 * One-shot migration for dynasties that still have the legacy
 * `weekRecapsByYear` map embedded on the main document. Writes each
 * year/week to the subcollection, then clears the field via deleteField
 * — that removal SHRINKS the parent doc, which is the only path back
 * under the 1 MB cap once the doc has gone over.
 *
 * SUBCOLLECTION-WINS: before writing each legacy cell, fetches the
 * existing subcollection state directly from the server and skips
 * cells that already exist there. Without this guard, the migration
 * would overwrite freshly-saved subcollection data with stale legacy
 * data from in-memory state — the exact failure mode that caused
 * recaps to disappear after close+reopen. The legacy field on the
 * main doc is, by definition, NEVER fresher than the subcollection
 * once any save has happened (every saveWeekRecap writes to the
 * subcollection first), so "subcollection wins per-cell" is the
 * correct conflict resolution.
 *
 * Idempotent: setDoc replaces, deleteField on an absent field is a no-op.
 */
export async function migrateWeekRecapsToSubcollection(dynastyId, legacyRecapsByYear) {
  if (!legacyRecapsByYear || typeof legacyRecapsByYear !== 'object') return

  // Snapshot the existing subcollection state from the server so we
  // know which cells are already authoritative there.
  let existing = {}
  try {
    const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION)
    const snap = await getDocsFromServer(ref)
    for (const d of snap.docs) {
      const data = d.data() || {}
      const y = Number(data.year)
      const w = Number(data.week)
      if (!Number.isFinite(y) || !Number.isFinite(w)) continue
      if (!existing[y]) existing[y] = {}
      existing[y][w] = true
    }
  } catch (err) {
    // If we can't read existing state, BAIL on the destructive part of
    // the migration. Better to leave legacy data on the main doc than
    // risk overwriting fresher subcollection data with stale legacy
    // data. The deleteField step is also skipped so retry is safe.
    console.warn(`[migrateWeekRecapsToSubcollection] could not read existing subcollection — aborting to prevent data loss:`, err?.code || err?.message)
    return
  }

  const writes = []
  for (const [year, weeks] of Object.entries(legacyRecapsByYear)) {
    if (!weeks || typeof weeks !== 'object') continue
    for (const [week, recap] of Object.entries(weeks)) {
      if (!recap || typeof recap !== 'object' || !recap.text) continue
      // Skip cells the subcollection already has — they're newer.
      if (existing[Number(year)]?.[Number(week)]) continue
      writes.push(saveWeekRecapToSubcollection(dynastyId, year, week, recap))
    }
  }
  await Promise.all(writes)
  // Clear the legacy field on the main doc — atomic field deletion,
  // which shrinks the resulting doc and so isn't subject to the 1 MB
  // cap that blocks normal updates on bloated dynasties.
  const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  await updateDoc(docRef, { weekRecapsByYear: deleteField() })
}

/**
 * Get a dynasty with its subcollections (players and games)
 * Fetches main document and subcollections in parallel
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Object|null>} Dynasty object with players and games arrays
 */
export async function getDynastyWithSubcollections(dynastyId) {
  try {
    // Fetch main document and subcollections in parallel
    const [mainDoc, players, games] = await Promise.all([
      getDynasty(dynastyId),
      getPlayersSubcollection(dynastyId),
      getGamesSubcollection(dynastyId)
    ])

    if (!mainDoc) return null

    // If migrated, always use subcollection data (even if empty)
    // If not migrated, use main document data
    if (mainDoc._subcollectionsMigrated) {
      return {
        ...mainDoc,
        players: players,
        games: games
      }
    } else {
      // Not migrated - use subcollections if they have data, otherwise main doc
      return {
        ...mainDoc,
        players: players.length > 0 ? players : (mainDoc.players || []),
        games: games.length > 0 ? games : (mainDoc.games || [])
      }
    }
  } catch (error) {
    console.error('Error fetching dynasty with subcollections:', error)
    throw error
  }
}

/**
 * Get a public dynasty by share code with subcollections
 * @param {string} shareCode - The share code
 * @returns {Promise<Object|null>} Dynasty object with players and games
 */
export async function getPublicDynastyWithSubcollections(shareCode) {
  try {
    // First get the main document
    const mainDoc = await getPublicDynastyByShareCode(shareCode)
    if (!mainDoc) return null

    // Fetch every subcollection the owner-side loader pulls — without
    // weekRecaps + seasons here, the viewer sees a dynasty with NO
    // weekly recaps, NO awards, NO conference standings, etc. (the
    // owner moved that data out of the main doc into per-year + per-
    // recap subcollections to dodge Firestore's 1 MB cap). Public
    // share viewers were stuck on the pre-migration shape and
    // silently lost everything that had been migrated.
    const [players, games, weekRecaps, seasonalRehydrated] = await Promise.all([
      getPlayersSubcollection(mainDoc.id),
      getGamesSubcollection(mainDoc.id),
      getWeekRecapsSubcollection(mainDoc.id),
      getSeasonsSubcollection(mainDoc.id),
    ])

    // Merge weekRecaps: legacy main-doc `weekRecapsByYear` UNION
    // subcollection, with subcollection winning per-(year, week) on
    // overlap. Same conflict resolution the owner-side path uses —
    // a partially-migrated dynasty needs both sources to be
    // visible to the viewer.
    const legacyRecaps = mainDoc.weekRecapsByYear || {}
    const weekRecapsByYear = {}
    for (const y of Object.keys(legacyRecaps)) {
      weekRecapsByYear[y] = { ...(legacyRecaps[y] || {}) }
    }
    for (const y of Object.keys(weekRecaps || {})) {
      if (!weekRecapsByYear[y]) weekRecapsByYear[y] = {}
      Object.assign(weekRecapsByYear[y], weekRecaps[y] || {})
    }

    // Merge seasonal fields the same way. `seasonalRehydrated` is
    // already in legacy `<field>ByYear` / `<field>ByTeamYear` shape
    // thanks to getSeasonsSubcollection. Sub wins per-(field, year)
    // on overlap.
    const perYearSet = new Set(PER_YEAR_FIELDS)
    const allSeasonalFields = [...PER_YEAR_FIELDS, ...PER_TEAM_YEAR_FIELDS]
    const mergedSeasonal = {}
    for (const field of allSeasonalFields) {
      const legacy = mainDoc[field]
      const fromSub = seasonalRehydrated[field]
      const hasLegacy = legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0
      const hasSub = fromSub && typeof fromSub === 'object' && Object.keys(fromSub).length > 0
      if (!hasLegacy && !hasSub) continue
      if (perYearSet.has(field)) {
        mergedSeasonal[field] = { ...(legacy || {}), ...(fromSub || {}) }
      } else {
        const out = {}
        for (const [teamKey, yearMap] of Object.entries(legacy || {})) {
          out[teamKey] = { ...(yearMap || {}) }
        }
        for (const [teamKey, yearMap] of Object.entries(fromSub || {})) {
          out[teamKey] = { ...(out[teamKey] || {}), ...(yearMap || {}) }
        }
        mergedSeasonal[field] = out
      }
    }

    // Players / games merge: same _subcollectionsMigrated branch as
    // before — unchanged, just folded into the larger return.
    const playersOut = mainDoc._subcollectionsMigrated
      ? players
      : (players.length > 0 ? players : (mainDoc.players || []))
    const gamesOut = mainDoc._subcollectionsMigrated
      ? games
      : (games.length > 0 ? games : (mainDoc.games || []))

    return {
      ...mainDoc,
      ...mergedSeasonal,
      players: playersOut,
      games: gamesOut,
      weekRecapsByYear,
    }
  } catch (error) {
    console.error('Error fetching public dynasty with subcollections:', error)
    throw error
  }
}

/**
 * Delete all documents in a subcollection
 * @param {string} dynastyId - The dynasty document ID
 * @param {string} subcollectionName - Name of the subcollection
 */
async function deleteSubcollection(dynastyId, subcollectionName) {
  try {
    const subcollectionRef = collection(db, DYNASTIES_COLLECTION, dynastyId, subcollectionName)
    const snapshot = await getDocs(subcollectionRef)

    if (snapshot.empty) return

    // Build all batches up front, then commit them in parallel. Was
    // serial-with-100ms-delays-between-batches; on a 5000-player
    // dynasty that's 10 batches × ~500ms RTT + ~900ms of artificial
    // sleep = ~6s just for the players subcollection. Parallel
    // commits land in roughly one round-trip.
    const batches = []
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      for (const docSnap of snapshot.docs.slice(i, i + BATCH_SIZE)) {
        batch.delete(docSnap.ref)
      }
      batches.push(batch.commit())
    }
    await Promise.all(batches)
  } catch (error) {
    console.error(`Error deleting ${subcollectionName} subcollection:`, error)
    throw error
  }
}

/**
 * Delete a dynasty and all its subcollections.
 *
 * Order matters: wipe every subcollection FIRST (in parallel — they're
 * independent of each other), THEN wipe the parent dynasty doc. The
 * earlier version fired all six deletes in parallel via Promise.all
 * "because subcollections live independently of the parent doc, so
 * order doesn't matter for correctness." That comment was wrong about
 * rules:
 *
 *   match /dynasties/{id}/players/{playerId} {
 *     allow write: if isPremium() && parentDynasty().userId == request.auth.uid;
 *     ...
 *   }
 *   function parentDynasty() {
 *     return get(/databases/$(database)/documents/dynasties/$(dynastyId)).data;
 *   }
 *
 * Every subcollection's create/delete rule calls parentDynasty() to
 * check editors[] / owner identity. When the parent doc delete wins
 * the parallel race, every subcollection batch that lands after it
 * fails the rule check with "Missing or insufficient permissions" —
 * parentDynasty() can't read a deleted document.
 *
 * Serializing the parent delete after the subcollections costs ~one
 * extra Firestore round-trip (~300-500ms), which is well worth it for
 * a delete operation that already runs in the background after the
 * optimistic UI update.
 */
export async function deleteDynastyWithSubcollections(dynastyId) {
  try {
    await Promise.all([
      deleteSubcollection(dynastyId, PLAYERS_SUBCOLLECTION),
      deleteSubcollection(dynastyId, GAMES_SUBCOLLECTION),
      deleteSubcollection(dynastyId, WEEK_RECAPS_SUBCOLLECTION),
      deleteSubcollection(dynastyId, SEASONS_SUBCOLLECTION),
      deleteSubcollection(dynastyId, INVITES_SUBCOLLECTION),
    ])
    await deleteDoc(doc(db, DYNASTIES_COLLECTION, dynastyId))
  } catch (error) {
    console.error('Error deleting dynasty with subcollections:', error)
    throw error
  }
}

/**
 * Migrate a dynasty's players and games from main document to subcollections
 * This is idempotent - safe to run multiple times
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Object>} Migration result with counts
 */
export async function migrateDynastyToSubcollections(dynastyId) {
  try {
    // Get the current dynasty document
    const dynasty = await getDynasty(dynastyId)
    if (!dynasty) {
      return { success: false, message: 'Dynasty not found' }
    }

    // Check if already migrated
    if (dynasty._subcollectionsMigrated) {
      return {
        success: true,
        message: 'Already migrated',
        alreadyMigrated: true,
        playerCount: 0,
        gameCount: 0
      }
    }

    const players = dynasty.players || []
    const games = dynasty.games || []

    // Check if there's anything to migrate
    if (players.length === 0 && games.length === 0) {
      // Mark as migrated even if empty
      await updateDynasty(dynastyId, { _subcollectionsMigrated: true })
      return {
        success: true,
        message: 'No data to migrate, marked as migrated',
        playerCount: 0,
        gameCount: 0
      }
    }

    console.log(`Migrating dynasty ${dynastyId}: ${players.length} players, ${games.length} games`)

    // Write players to subcollection
    if (players.length > 0) {
      await savePlayersToSubcollection(dynastyId, players)
      console.log(`Migrated ${players.length} players to subcollection`)
    }

    // Write games to subcollection
    if (games.length > 0) {
      await saveGamesToSubcollection(dynastyId, games)
      console.log(`Migrated ${games.length} games to subcollection`)
    }

    // Mark dynasty as migrated and DELETE the arrays from main document
    // Using deleteField() to completely remove the fields and reduce document size
    // This is crucial for documents that are at or over the 1MB limit
    const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
    await updateDoc(docRef, {
      _subcollectionsMigrated: true,
      players: deleteField(), // Delete field to reduce document size
      games: deleteField(),   // Delete field to reduce document size
      updatedAt: serverTimestamp()
    })

    console.log(`Migration complete for dynasty ${dynastyId}`)

    return {
      success: true,
      message: `Migrated ${players.length} players and ${games.length} games to subcollections`,
      playerCount: players.length,
      gameCount: games.length
    }
  } catch (error) {
    console.error('Error migrating dynasty to subcollections:', error)
    return {
      success: false,
      message: error.message || 'Migration failed'
    }
  }
}

/**
 * Check if a dynasty has been migrated to subcollections
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<boolean>}
 */
export async function isDynastyMigrated(dynastyId) {
  try {
    const dynasty = await getDynasty(dynastyId)
    return dynasty?._subcollectionsMigrated === true
  } catch (error) {
    console.error('Error checking migration status:', error)
    return false
  }
}

/**
 * Subscribe to real-time updates for a dynasty's subcollections
 * Returns unsubscribe functions for both players and games
 * @param {string} dynastyId - The dynasty document ID
 * @param {Function} onPlayersUpdate - Callback for player updates
 * @param {Function} onGamesUpdate - Callback for game updates
 * @returns {Object} Object with unsubscribe functions
 */
export function subscribeToSubcollections(dynastyId, onPlayersUpdate, onGamesUpdate) {
  const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)
  const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)

  const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
    const players = snapshot.docs.map(doc => ({
      ...doc.data(),
      _firestoreId: doc.id
    }))
    onPlayersUpdate(players)
  }, (error) => {
    console.error('Error in players subscription:', error)
  })

  const unsubscribeGames = onSnapshot(gamesRef, (snapshot) => {
    const games = snapshot.docs.map(doc => ({
      ...doc.data(),
      _firestoreId: doc.id
    }))
    onGamesUpdate(games)
  }, (error) => {
    console.error('Error in games subscription:', error)
  })

  return {
    unsubscribePlayers,
    unsubscribeGames,
    unsubscribeAll: () => {
      unsubscribePlayers()
      unsubscribeGames()
    }
  }
}
