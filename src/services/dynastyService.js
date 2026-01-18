import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  deleteField
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { indexedDBStorage } from './storage'

const DYNASTIES_COLLECTION = 'dynasties'
const PLAYERS_SUBCOLLECTION = 'players'
const GAMES_SUBCOLLECTION = 'games'

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
 * Get all players from the players subcollection
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Array>} Array of player objects
 */
export async function getPlayersSubcollection(dynastyId) {
  try {
    const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)
    const snapshot = await getDocs(playersRef)
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      _firestoreId: doc.id // Keep track of Firestore doc ID for updates
    }))
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
  try {
    const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)
    const snapshot = await getDocs(gamesRef)
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      _firestoreId: doc.id // Keep track of Firestore doc ID for updates
    }))
  } catch (error) {
    console.error('Error fetching games subcollection:', error)
    throw error
  }
}

/**
 * Save a single player to the players subcollection
 * Uses player.pid as document ID for consistent updates
 * @param {string} dynastyId - The dynasty document ID
 * @param {Object} player - The player object (must have pid)
 */
export async function savePlayerToSubcollection(dynastyId, player) {
  try {
    if (!player.pid) {
      throw new Error('Player must have a pid')
    }
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    // Remove _firestoreId before saving (it's metadata, not data)
    const { _firestoreId, ...playerData } = player
    await setDoc(playerRef, playerData)
  } catch (error) {
    console.error('Error saving player to subcollection:', error)
    throw error
  }
}

/**
 * Save multiple players to the players subcollection using batch writes
 * Also deletes any orphaned player documents that are no longer in the array
 * @param {string} dynastyId - The dynasty document ID
 * @param {Array} players - Array of player objects
 */
export async function savePlayersToSubcollection(dynastyId, players) {
  try {
    // Handle empty array case - still need to potentially delete orphans
    const playersToSave = players || []

    // Get current IDs in subcollection to find orphans
    const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)
    const snapshot = await getDocs(playersRef)
    const existingIds = new Set(snapshot.docs.map(doc => doc.id))

    // Get IDs we're about to save
    const newIds = new Set(playersToSave.filter(p => p.pid).map(p => String(p.pid)))

    // Find orphaned IDs (exist in subcollection but not in our save list)
    const orphanedIds = [...existingIds].filter(id => !newIds.has(id))

    // Delete orphaned documents
    if (orphanedIds.length > 0) {
      console.log(`Deleting ${orphanedIds.length} orphaned player documents`)
      for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        const batchIds = orphanedIds.slice(i, i + BATCH_SIZE)

        for (const id of batchIds) {
          const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, id)
          batch.delete(playerRef)
        }

        await batch.commit()
      }
    }

    // Save players (skip if empty)
    if (playersToSave.length === 0) return

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < playersToSave.length; i += BATCH_SIZE) {
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
        batch.set(playerRef, playerData)
      }

      await batch.commit()
    }
  } catch (error) {
    console.error('Error saving players to subcollection:', error)
    throw error
  }
}

/**
 * Delete a player from the players subcollection
 * @param {string} dynastyId - The dynasty document ID
 * @param {number|string} playerId - The player's pid
 */
export async function deletePlayerFromSubcollection(dynastyId, playerId) {
  try {
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(playerId))
    await deleteDoc(playerRef)
  } catch (error) {
    console.error('Error deleting player from subcollection:', error)
    throw error
  }
}

/**
 * Save a single game to the games subcollection
 * Uses game.id as document ID for consistent updates
 * @param {string} dynastyId - The dynasty document ID
 * @param {Object} game - The game object (must have id)
 */
export async function saveGameToSubcollection(dynastyId, game) {
  try {
    if (!game.id) {
      throw new Error('Game must have an id')
    }
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
    // Remove _firestoreId before saving
    const { _firestoreId, ...gameData } = game
    await setDoc(gameRef, gameData)
  } catch (error) {
    console.error('Error saving game to subcollection:', error)
    throw error
  }
}

/**
 * Save multiple games to the games subcollection using batch writes
 * Also deletes any orphaned game documents that are no longer in the array
 * @param {string} dynastyId - The dynasty document ID
 * @param {Array} games - Array of game objects
 */
export async function saveGamesToSubcollection(dynastyId, games) {
  try {
    // Handle empty array case - still need to potentially delete orphans
    const gamesToSave = games || []

    // Get current IDs in subcollection to find orphans
    const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)
    const snapshot = await getDocs(gamesRef)
    const existingIds = new Set(snapshot.docs.map(doc => doc.id))

    // Get IDs we're about to save
    const newIds = new Set(gamesToSave.filter(g => g.id).map(g => String(g.id)))

    // Find orphaned IDs (exist in subcollection but not in our save list)
    const orphanedIds = [...existingIds].filter(id => !newIds.has(id))

    // Delete orphaned documents
    if (orphanedIds.length > 0) {
      console.log(`Deleting ${orphanedIds.length} orphaned game documents`)
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
 * @param {string} dynastyId - The dynasty document ID
 * @param {string} gameId - The game's id
 */
export async function deleteGameFromSubcollection(dynastyId, gameId) {
  try {
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(gameId))
    await deleteDoc(gameRef)
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
