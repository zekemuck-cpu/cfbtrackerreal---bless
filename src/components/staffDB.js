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
