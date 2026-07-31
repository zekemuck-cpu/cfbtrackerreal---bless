// staffDB.js
//
// Scout Staff configuration store. Staff hires (National Scout / Data
// Analyst) and the Program Outlook settings live ON the dynasty object under
// `dynasty.scoutStaff` — a plain { key: value } map — so they persist through
// the app's normal updateDynasty() save path (Firestore for cloud dynasties,
// IndexedDB for local ones) and travel with dynasty backups automatically.
// They are NO LONGER written to the separate device-local IndexedDB database.
//
// The legacy local database ('ScoutStaffComprehensiveDB') is still read ONCE by
// the migration in ScoutStaff (via getAllStaffDataForDynasty) to lift any
// existing on-device config up into the cloud, after which it's ignored.

// ── Cloud-backed accessor ───────────────────────────────────────────────────
//
// createStaffAccessor(dynasty, updateDynasty) returns the same
// { getStaffData, saveStaffData, deleteStaffData } shape callers already use,
// but reads from dynasty.scoutStaff and writes the merged map through
// updateDynasty. Reads are async-compatible (return a resolved value).
//
// A module-level accumulator keeps rapid SEQUENTIAL writes correct: the UI
// often fires several saveStaffData() calls back-to-back in one async flow
// (e.g. contract length + start year), and React's `dynasty` snapshot doesn't
// update between those awaits. Merging each write into the accumulator (rather
// than re-reading the stale snapshot) means no earlier write is clobbered.
const _acc = new Map()       // dynastyId -> latest merged scoutStaff map
const _lastBase = new Map()  // dynastyId -> last dynasty.scoutStaff reference adopted

export const createStaffAccessor = (dynasty, updateDynasty) => {
  const dynastyId = dynasty?.id ?? null
  const base = dynasty?.scoutStaff

  // Resync: when the dynasty hands us a concrete scoutStaff object whose
  // reference differs from the one we last accumulated against (a reload, an
  // import, or another writer), adopt it and drop the stale accumulator. While
  // scoutStaff is still undefined (never saved yet) we keep accumulating so an
  // unrelated re-render mid-flow can't wipe an in-flight write.
  if (base && _lastBase.get(dynastyId) !== base) {
    _lastBase.set(dynastyId, base)
    _acc.delete(dynastyId)
  }

  const startMap = () => _acc.get(dynastyId) || dynasty?.scoutStaff || {}

  const flush = async (nextMap) => {
    _acc.set(dynastyId, nextMap)
    if (dynastyId && updateDynasty) {
      await updateDynasty(dynastyId, { scoutStaff: nextMap })
    }
  }

  return {
    getStaffData: async (key) => {
      const v = startMap()[key]
      return v === undefined ? '' : v
    },
    saveStaffData: async (key, val) => {
      await flush({ ...startMap(), [key]: val })
      return true
    },
    deleteStaffData: async (key) => {
      const next = { ...startMap() }
      delete next[key]
      await flush(next)
      return true
    },
  }
}

// ── Legacy local IndexedDB (migration read only) ────────────────────────────
const DB_NAME = 'ScoutStaffComprehensiveDB';
const STORE_NAME = 'staff_records';

const initStaffDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror   = (e) => reject(e.target.error);
    request.onblocked = ()  => reject(new Error('IndexedDB blocked by another tab'));
  });
};

// Reads every key the legacy local store holds for a given dynasty (staff
// hires, Program Outlook config, etc.), stripping the `${dynastyId}:` prefix.
// Used ONCE by the ScoutStaff cloud migration to lift on-device config into
// dynasty.scoutStaff, and as an export-time safety net for a dynasty that
// hasn't run that migration yet. Returns {} when there's nothing to migrate.
export const getAllStaffDataForDynasty = async (dynastyId) => {
  if (!dynastyId) return {};
  try {
    const db = await initStaffDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const prefix = `${dynastyId}:`;
      const result = {};
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
            result[cursor.key.slice(prefix.length)] = cursor.value;
          }
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[staffDB] getAllStaffDataForDynasty failed:', err);
    return {};
  }
};
