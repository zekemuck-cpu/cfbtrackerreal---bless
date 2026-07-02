// staffDB.js
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

export const getStaffData = async (key) => {
  try {
    const db = await initStaffDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? '');
      request.onerror   = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[staffDB] getStaffData failed for key:', key, err);
    return '';
  }
};

export const saveStaffData = async (key, val) => {
  try {
    const db = await initStaffDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(val, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror    = (e) => reject(e.target.error);
      transaction.onabort    = (e) => reject(e.target.error ?? new Error('Transaction aborted'));
    });
  } catch (err) {
    console.error('[staffDB] saveStaffData failed for key:', key, err);
    throw err;
  }
};

export const deleteStaffData = async (key) => {
  try {
    const db = await initStaffDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror    = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[staffDB] deleteStaffData failed for key:', key, err);
  }
};

// Returns prefixed versions of the three DB functions scoped to a specific dynasty.
// Pass the result into components instead of importing the raw functions directly.
export const createStaffAccessor = (dynastyId) => {
  const k = key => dynastyId ? `${dynastyId}:${key}` : key;
  return {
    getStaffData:    (key)      => getStaffData(k(key)),
    saveStaffData:   (key, val) => saveStaffData(k(key), val),
    deleteStaffData: (key)      => deleteStaffData(k(key)),
  };
};

// Reads every key stored for a given dynasty (staff hires, Program Outlook
// config, etc.) and returns them as a plain object with the dynastyId prefix
// stripped. Used by dynasty export so Scout Staff's local-only config travels
// with a backup instead of being silently left out of it.
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

// Writes a plain { key: value } object back into staff_records, prefixed for
// the given dynastyId — the counterpart to getAllStaffDataForDynasty, used
// when restoring a dynasty from a backup.
export const setAllStaffDataForDynasty = async (dynastyId, data) => {
  if (!dynastyId || !data || typeof data !== 'object') return;
  const entries = Object.entries(data);
  if (!entries.length) return;
  try {
    const db = await initStaffDB();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const [key, value] of entries) {
        store.put(value, `${dynastyId}:${key}`);
      }
      transaction.oncomplete = () => resolve(true);
      transaction.onerror    = (e) => reject(e.target.error);
      transaction.onabort    = (e) => reject(e.target.error ?? new Error('Transaction aborted'));
    });
  } catch (err) {
    console.error('[staffDB] setAllStaffDataForDynasty failed:', err);
    throw err;
  }
};
