/**
 * IndexedDB Storage Service (Free Tier)
 *
 * Uses the native IndexedDB API directly — no localforage, no localStorage
 * fallback. This guarantees large dynasty saves never hit the 5MB localStorage
 * quota, and removes all ambiguity about which driver is actually in use.
 */

const DB_NAME    = 'CFBDynastyTracker'
const DB_STORE   = 'dynasties'
const DB_VERSION = 2

const DYNASTIES_KEY = 'cfb-dynasties'

let DEBUG = true
const log = (...args) => { if (DEBUG) console.log('[IndexedDB]', ...args) }

// Cached DB connection — opened once, reused across all operations.
let _db = null

function friendlyIDBError(err) {
  const msg = err?.message || String(err)
  if (msg.includes('full disk') || msg.includes('QuotaExceeded') || err?.name === 'QuotaExceededError') {
    return new Error(
      'Your browser\'s storage is full. To fix this: open your browser settings, ' +
      'find "Site data" or "Storage" for this site, and clear it. Then reload and try again. ' +
      'Or use the "Clear App Storage" button in Dynasty Settings > Admin.'
    )
  }
  return err
}

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE)
      }
    }
    req.onsuccess = (e) => {
      _db = e.target.result
      // Reset cached connection if the browser closes it unexpectedly
      _db.onclose = () => { _db = null }
      resolve(_db)
    }
    req.onerror = (e) => reject(friendlyIDBError(e.target.error))
    req.onblocked = () => reject(new Error('IndexedDB open blocked — close other tabs and try again.'))
  })
}

function idbGet(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = () => reject(req.error)
  }))
}

function idbSet(key, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readwrite')
    const req = tx.objectStore(DB_STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  }))
}

function idbDelete(key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readwrite')
    const req = tx.objectStore(DB_STORE).delete(key)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  }))
}

// ─── Public storage interface ─────────────────────────────────────────────────

export const indexedDBStorage = {
  async getDynasties() {
    try {
      log('getDynasties() called')
      const dynasties = await idbGet(DYNASTIES_KEY)
      log(`getDynasties() returned ${dynasties?.length || 0} dynasties`)
      return dynasties || []
    } catch (error) {
      console.error('[IndexedDB] Error getting dynasties:', error)
      return []
    }
  },

  async saveDynasties(dynasties) {
    try {
      log(`saveDynasties() called with ${dynasties?.length || 0} dynasties`)
      await idbSet(DYNASTIES_KEY, dynasties)
      log('saveDynasties() complete')
    } catch (error) {
      console.error('[IndexedDB] Error saving dynasties:', error)
      throw error
    }
  },

  async getDynasty(dynastyId) {
    try {
      log(`getDynasty(${dynastyId}) called`)
      const dynasties = await this.getDynasties()
      const dynasty = dynasties.find(d => String(d.id) === String(dynastyId)) || null
      log(`getDynasty(${dynastyId}) found: ${dynasty ? dynasty.name : 'null'}`)
      return dynasty
    } catch (error) {
      console.error('[IndexedDB] Error getting dynasty:', error)
      return null
    }
  },

  async createDynasty(dynasty) {
    try {
      log(`createDynasty() called for "${dynasty.name}"`)
      const dynasties = await this.getDynasties()
      dynasties.push(dynasty)
      await this.saveDynasties(dynasties)
      log(`createDynasty() complete - id: ${dynasty.id}`)
      return dynasty
    } catch (error) {
      console.error('[IndexedDB] Error creating dynasty:', error)
      throw error
    }
  },

  async updateDynasty(dynastyId, updates) {
    try {
      log(`updateDynasty(${dynastyId}) called with keys:`, Object.keys(updates))
      const dynasties = await this.getDynasties()
      const index = dynasties.findIndex(d => String(d.id) === String(dynastyId))

      if (index === -1) throw new Error(`Dynasty ${dynastyId} not found`)

      const updated = { ...dynasties[index] }
      for (const [key, value] of Object.entries(updates)) {
        if (key.includes('.')) {
          const parts = key.split('.')
          let obj = updated
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {}
            obj = obj[parts[i]]
          }
          obj[parts[parts.length - 1]] = value
        } else {
          updated[key] = value
        }
      }

      dynasties[index] = updated
      await this.saveDynasties(dynasties)
      log(`updateDynasty(${dynastyId}) complete`)
      return updated
    } catch (error) {
      console.error('[IndexedDB] Error updating dynasty:', error)
      throw error
    }
  },

  async deleteDynasty(dynastyId) {
    try {
      log(`deleteDynasty(${dynastyId}) called`)
      const dynasties = await this.getDynasties()
      const filtered = dynasties.filter(d => String(d.id) !== String(dynastyId))
      await this.saveDynasties(filtered)
      log(`deleteDynasty(${dynastyId}) complete`)
    } catch (error) {
      console.error('[IndexedDB] Error deleting dynasty:', error)
      throw error
    }
  },

  async clearAll() {
    try {
      log('clearAll() called')
      await idbDelete(DYNASTIES_KEY)
      log('clearAll() complete')
    } catch (error) {
      console.error('[IndexedDB] Error clearing data:', error)
      throw error
    }
  },

  setDebug(enabled) {
    DEBUG = enabled
    log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`)
  },

  async isAvailable() {
    try {
      await idbSet('__test__', true)
      await idbDelete('__test__')
      return true
    } catch (error) {
      console.error('[IndexedDB] Storage not available:', error)
      return false
    }
  },

  async getStorageInfo() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate()
        return { used: usage, quota, percent: ((usage / quota) * 100).toFixed(2) }
      }
      return { used: 0, quota: 0, percent: 0 }
    } catch (error) {
      console.error('[IndexedDB] Error getting storage info:', error)
      return { used: 0, quota: 0, percent: 0 }
    }
  },

  // Deletes the entire IndexedDB database and clears related localStorage keys.
  // Use as a last resort when storage is corrupted or disk is full.
  async deleteDatabase() {
    try {
      if (_db) { _db.close(); _db = null }
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME)
        req.onsuccess = () => resolve()
        req.onerror   = (e) => reject(e.target.error)
        req.onblocked = () => {
          // Still resolve — deletion will complete once other tabs close
          resolve()
        }
      })
      // Also clear any leftover localforage localStorage keys
      localStorage.removeItem('CFBDynastyTracker/dynasties/cfb-dynasties')
      localStorage.removeItem('cfb-dynasties')
      log('deleteDatabase() complete — all app storage cleared')
      return true
    } catch (error) {
      console.error('[IndexedDB] deleteDatabase failed:', error)
      throw error
    }
  },

  // Migrates data from the old localforage-localStorage key format.
  // Safe to call every init — skips if IndexedDB already has data.
  async migrateFromLocalStorage() {
    try {
      // localforage stored data under this compound key when using localStorage driver
      const localforageKey = 'CFBDynastyTracker/dynasties/cfb-dynasties'
      const rawForage = localStorage.getItem(localforageKey)
      // Also check the plain key some older code paths used
      const rawPlain  = localStorage.getItem('cfb-dynasties')
      const raw = rawForage || rawPlain
      if (!raw) return false

      const existingIDB = await this.getDynasties()
      if (existingIDB.length > 0) {
        log('Migration skipped — IndexedDB already has data')
        return false
      }

      const dynasties = JSON.parse(raw)
      await this.saveDynasties(dynasties)
      // Clean up both possible localStorage keys after successful migration
      localStorage.removeItem(localforageKey)
      localStorage.removeItem('cfb-dynasties')
      log(`Migration complete — moved ${dynasties.length} dynasties to IndexedDB`)
      return true
    } catch (error) {
      console.error('[IndexedDB] Migration from localStorage failed:', error)
      return false
    }
  },
}

export default indexedDBStorage
