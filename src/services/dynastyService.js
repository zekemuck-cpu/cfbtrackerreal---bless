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

const DYNASTIES_COLLECTION = 'dynasties'
const PLAYERS_SUBCOLLECTION = 'players'
const GAMES_SUBCOLLECTION = 'games'
const INVITES_SUBCOLLECTION = 'invites'

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
export async function getPlayersSubcollection(dynastyId) {
  const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)

  // Cache-first read: try the local IndexedDB cache before going to the
  // network. Default getDocs() is server-priority and blocks on slow
  // connections — that's what made clicking into a dynasty hang for
  // minutes on mobile despite persistentLocalCache being enabled
  // (onSnapshot serves from cache, but getDocs does not by default).
  try {
    const cachedSnap = await getDocsFromCache(playersRef)
    if (!cachedSnap.empty) {
      // Cache hit — kick off a background server refresh so the cache
      // stays warm for next time, but don't make the user wait on it.
      getDocsFromServer(playersRef).catch(() => {})
      return cachedSnap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
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
export async function getGamesSubcollection(dynastyId) {
  const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)

  // Cache-first — see comment in getPlayersSubcollection.
  try {
    const cachedSnap = await getDocsFromCache(gamesRef)
    if (!cachedSnap.empty) {
      getDocsFromServer(gamesRef).catch(() => {})
      return cachedSnap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
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
    await setDoc(playerRef, playerData)

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

    // Wait a bit for Firestore to fully propagate the writes
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verify the data was actually written by reading back FROM SERVER (not cache)
    const verifyRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)
    const verifySnapshot = await getDocsFromServer(verifyRef)
    const verifyPlayers = verifySnapshot.docs.map(doc => doc.data())
    console.log(`[savePlayersToSubcollection] VERIFY (SERVER): Read back ${verifyPlayers.length} players`)
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
    await deleteDoc(playerRef)

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
export async function saveGameToSubcollection(dynastyId, game) {
  try {
    if (!game.id) {
      throw new Error('Game must have an id')
    }
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
    // Remove _firestoreId before saving and sanitize
    const { _firestoreId, ...rawGameData } = game
    const gameData = sanitizeForFirestore(rawGameData)

    await setDoc(gameRef, gameData)

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[saveGameToSubcollection] Saved game ${game.id} to server`)
  } catch (error) {
    console.error('Error saving game to subcollection:', error)
    throw error
  }
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
    await deleteDoc(gameRef)

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[deleteGameFromSubcollection] Deleted game ${gameId} from server`)
  } catch (error) {
    console.error('Error deleting game from subcollection:', error)
    throw error
  }
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

    // Then fetch subcollections
    const [players, games] = await Promise.all([
      getPlayersSubcollection(mainDoc.id),
      getGamesSubcollection(mainDoc.id)
    ])

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

    // Delete in batches with delay to prevent Firestore overload
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      const batchDocs = snapshot.docs.slice(i, i + BATCH_SIZE)

      for (const docSnap of batchDocs) {
        batch.delete(docSnap.ref)
      }

      await batch.commit()

      // Add delay between batches to prevent "Write stream exhausted" error
      if (i + BATCH_SIZE < snapshot.docs.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  } catch (error) {
    console.error(`Error deleting ${subcollectionName} subcollection:`, error)
    throw error
  }
}

/**
 * Delete a dynasty and all its subcollections
 * @param {string} dynastyId - The dynasty document ID
 */
export async function deleteDynastyWithSubcollections(dynastyId) {
  try {
    // Delete subcollections first (Firestore doesn't auto-delete them)
    // Do this sequentially to avoid overwhelming Firestore write stream
    await deleteSubcollection(dynastyId, PLAYERS_SUBCOLLECTION)
    await deleteSubcollection(dynastyId, GAMES_SUBCOLLECTION)

    // Then delete the main document
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
