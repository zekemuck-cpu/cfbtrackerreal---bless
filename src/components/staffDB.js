// staffDB.js
const DB_NAME = 'ScoutStaffComprehensiveDB';
const STORE_NAME = 'staff_records';

const initStaffDB = () => {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
  });
};

export const getStaffData = async (key) => {
  const db = await initStaffDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || '');
  });
};

export const saveStaffData = async (key, val) => {
  const db = await initStaffDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(val, key);
    transaction.oncomplete = () => resolve(true);
  });
};

export const deleteStaffData = async (key) => {
  const db = await initStaffDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(key);
    transaction.oncomplete = () => resolve(true);
  });
};