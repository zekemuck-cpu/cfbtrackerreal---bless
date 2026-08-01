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

// Rolling local backups (safeguard against a bad write or a browser clear).
// A ring of the last few known-good non-empty snapshots, kept under a
// separate key so a wipe of the primary key doesn't take them with it in
// the same operation. Throttled so rapid saves don't churn the ring.
const BACKUPS_KEY = 'cfb-dynasties-backups';
const MAX_BACKUPS = 3;
const BACKUP_MIN_INTERVAL_MS = 10 * 60 * 1000; // at most one snapshot / 10 min

// Snapshot the known-good state we're about to persist. Best-effort: a
// backup failure must never block or fail the real save.
async function maybeSnapshotBackup(dynasties) {
  try {
    if (!Array.isArray(dynasties) || dynasties.length === 0) return;
    const backups = (await idbGet(BACKUPS_KEY)) || [];
    const last = backups[backups.length - 1];
    if (last && typeof last.ts === 'number' && Date.now() - last.ts < BACKUP_MIN_INTERVAL_MS) {
      return; // throttled — a recent snapshot already covers this window
    }
    backups.push({ ts: Date.now(), dynasties });
    while (backups.length > MAX_BACKUPS) backups.shift();
    await idbSet(BACKUPS_KEY, backups);
  } catch (e) {
    console.warn('[IndexedDB] backup snapshot failed (non-fatal):', e?.message || e);
  }
}

/**
 * IndexedDB Storage Implementation
 *
 * All methods are async and return Promises.
 * Data structure is identical to Firebase storage for easy migration.
 */
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

  /**
   * Save all dynasties to IndexedDB
   * @param {Array} dynasties - Array of dynasty objects
   * @param {Object} [options]
   * @param {boolean} [options.allowEmpty] - Permit overwriting a non-empty
   *   store with an empty array. Only the intentional-clear paths
   *   (deleteDynasty removing the last dynasty, clearAll) pass this.
   * @returns {Promise<void>}
   */
  async saveDynasties(dynasties, options = {}) {
    const { allowEmpty = false } = options;
    try {
      const list = Array.isArray(dynasties) ? dynasties : [];
      log(`saveDynasties() called with ${list.length} dynasties`);

      // DATA-LOSS GUARD: refuse to overwrite a non-empty store with an empty
      // array unless the caller explicitly intends it. getDynasties() returns
      // [] on a transient read error, and the local update path maps that to
      // [] and would then persist it here — silently wiping every local
      // dynasty. Only a genuine "deleted my last dynasty" / clearAll passes
      // allowEmpty, so blocking the rest is safe.
      if (list.length === 0 && !allowEmpty) {
        const existing = await idbGet(DYNASTIES_KEY);
        if (Array.isArray(existing) && existing.length > 0) {
          console.error(`[IndexedDB] BLOCKED empty overwrite of ${existing.length} existing dynasties (pass { allowEmpty: true } for an intentional clear).`);
          throw new Error('Refusing to overwrite existing local dynasties with an empty list');
        }
      }

      // Snapshot the good state into the rolling backup ring BEFORE the write,
      // so even a corrupt write leaves a recoverable prior copy. Throttled and
      // best-effort — never blocks the real save.
      await maybeSnapshotBackup(list);

      await idbSet(DYNASTIES_KEY, list);
      log('saveDynasties() complete');
    } catch (error) {
      console.error('[IndexedDB] Error saving dynasties:', error)
      throw error
    }
  },

  /**
   * List the rolling local backup snapshots (newest last).
   * @returns {Promise<Array<{ts:number, dynasties:Array}>>}
   */
  async getBackups() {
    try {
      const backups = await idbGet(BACKUPS_KEY);
      return Array.isArray(backups) ? backups : [];
    } catch (error) {
      console.error('[IndexedDB] Error reading backups:', error);
      return [];
    }
  },

  /**
   * Restore a backup snapshot by timestamp. MERGES the snapshot's local
   * dynasties into the current store by id (snapshot wins on conflict) so a
   * restore can only ADD/repair dynasties, never delete ones created since.
   * @param {number} ts - The snapshot's ts (from getBackups)
   * @returns {Promise<{restored:number}>}
   */
  async restoreBackup(ts) {
    const backups = await this.getBackups();
    const snap = backups.find(b => Number(b.ts) === Number(ts));
    if (!snap || !Array.isArray(snap.dynasties)) {
      throw new Error('Backup snapshot not found');
    }
    const current = await this.getDynasties();
    const byId = new Map(current.map(d => [String(d.id), d]));
    for (const d of snap.dynasties) {
      if (d && d.id != null) byId.set(String(d.id), d);
    }
    const merged = [...byId.values()];
    await this.saveDynasties(merged);
    return { restored: snap.dynasties.length };
  },

  /**
   * Get a single dynasty by ID
   * @param {string} dynastyId - Dynasty ID
   * @returns {Promise<Object|null>} Dynasty object or null
   */
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
      log(`deleteDynasty(${dynastyId}) called`);
      const dynasties = await this.getDynasties();
      const filtered = dynasties.filter(d => String(d.id) !== String(dynastyId));
      // Intentional removal — allow the store to reach empty (deleting the
      // last dynasty). Guarded so an errant read (getDynasties → []) can't
      // wipe the store under cover of a delete: only proceed to an empty
      // result when we actually found and removed the target.
      const removedTarget = filtered.length < dynasties.length;
      await this.saveDynasties(filtered, { allowEmpty: removedTarget });
      log(`deleteDynasty(${dynastyId}) complete`);
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
