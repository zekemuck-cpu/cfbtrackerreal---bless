/**
 * IndexedDB Storage Service (Free Tier)
 *
 * Uses localforage for IndexedDB access with localStorage-like API.
 * Provides ~50MB+ storage compared to localStorage's 5-10MB limit.
 */

import localforage from 'localforage';

// Debug logging flag - set to true to see all storage operations
let DEBUG = true;

const log = (...args) => {
  if (DEBUG) console.log('[IndexedDB]', ...args);
};

// Configure localforage instance for dynasties
const dynastyStore = localforage.createInstance({
  name: 'CFBDynastyTracker',
  storeName: 'dynasties',
  description: 'Dynasty data storage for CFB Dynasty Tracker'
});

// Storage key (matches old localStorage key for potential migration)
const DYNASTIES_KEY = 'cfb-dynasties';

/**
 * IndexedDB Storage Implementation
 *
 * All methods are async and return Promises.
 * Data structure is identical to Firebase storage for easy migration.
 */
export const indexedDBStorage = {
  /**
   * Get all dynasties from IndexedDB
   * @returns {Promise<Array>} Array of dynasty objects
   */
  async getDynasties() {
    try {
      log('getDynasties() called');
      const dynasties = await dynastyStore.getItem(DYNASTIES_KEY);
      log(`getDynasties() returned ${dynasties?.length || 0} dynasties`);
      return dynasties || [];
    } catch (error) {
      console.error('[IndexedDB] Error getting dynasties:', error);
      return [];
    }
  },

  /**
   * Save all dynasties to IndexedDB
   * @param {Array} dynasties - Array of dynasty objects
   * @returns {Promise<void>}
   */
  async saveDynasties(dynasties) {
    try {
      log(`saveDynasties() called with ${dynasties?.length || 0} dynasties`);
      await dynastyStore.setItem(DYNASTIES_KEY, dynasties);
      log('saveDynasties() complete');
    } catch (error) {
      console.error('[IndexedDB] Error saving dynasties:', error);
      throw error;
    }
  },

  /**
   * Get a single dynasty by ID
   * @param {string} dynastyId - Dynasty ID
   * @returns {Promise<Object|null>} Dynasty object or null
   */
  async getDynasty(dynastyId) {
    try {
      log(`getDynasty(${dynastyId}) called`);
      const dynasties = await this.getDynasties();
      const dynasty = dynasties.find(d => String(d.id) === String(dynastyId)) || null;
      log(`getDynasty(${dynastyId}) found: ${dynasty ? dynasty.name : 'null'}`);
      return dynasty;
    } catch (error) {
      console.error('[IndexedDB] Error getting dynasty:', error);
      return null;
    }
  },

  /**
   * Create a new dynasty
   * @param {Object} dynasty - Dynasty object (must include id)
   * @returns {Promise<Object>} Created dynasty
   */
  async createDynasty(dynasty) {
    try {
      log(`createDynasty() called for "${dynasty.name}"`);
      const dynasties = await this.getDynasties();
      dynasties.push(dynasty);
      await this.saveDynasties(dynasties);
      log(`createDynasty() complete - id: ${dynasty.id}`);
      return dynasty;
    } catch (error) {
      console.error('[IndexedDB] Error creating dynasty:', error);
      throw error;
    }
  },

  /**
   * Update a dynasty by ID
   * @param {string} dynastyId - Dynasty ID
   * @param {Object} updates - Partial updates to apply
   * @returns {Promise<Object>} Updated dynasty
   */
  async updateDynasty(dynastyId, updates) {
    try {
      log(`updateDynasty(${dynastyId}) called with keys:`, Object.keys(updates));
      const dynasties = await this.getDynasties();
      const index = dynasties.findIndex(d => String(d.id) === String(dynastyId));

      if (index === -1) {
        throw new Error(`Dynasty ${dynastyId} not found`);
      }

      // Apply updates (supports dot notation for nested fields)
      const updated = { ...dynasties[index] };

      for (const [key, value] of Object.entries(updates)) {
        if (key.includes('.')) {
          // Handle dot notation (e.g., 'preseasonSetup.scheduleEntered')
          const parts = key.split('.');
          let obj = updated;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
          }
          obj[parts[parts.length - 1]] = value;
        } else {
          updated[key] = value;
        }
      }

      dynasties[index] = updated;
      await this.saveDynasties(dynasties);
      log(`updateDynasty(${dynastyId}) complete`);
      return updated;
    } catch (error) {
      console.error('[IndexedDB] Error updating dynasty:', error);
      throw error;
    }
  },

  /**
   * Delete a dynasty by ID
   * @param {string} dynastyId - Dynasty ID
   * @returns {Promise<void>}
   */
  async deleteDynasty(dynastyId) {
    try {
      log(`deleteDynasty(${dynastyId}) called`);
      const dynasties = await this.getDynasties();
      const filtered = dynasties.filter(d => String(d.id) !== String(dynastyId));
      await this.saveDynasties(filtered);
      log(`deleteDynasty(${dynastyId}) complete`);
    } catch (error) {
      console.error('[IndexedDB] Error deleting dynasty:', error);
      throw error;
    }
  },

  /**
   * Clear all dynasty data
   * @returns {Promise<void>}
   */
  async clearAll() {
    try {
      log('clearAll() called');
      await dynastyStore.removeItem(DYNASTIES_KEY);
      log('clearAll() complete');
    } catch (error) {
      console.error('[IndexedDB] Error clearing data:', error);
      throw error;
    }
  },

  /**
   * Set debug mode
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebug(enabled) {
    DEBUG = enabled;
    log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  },

  /**
   * Check if IndexedDB is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      await dynastyStore.setItem('__test__', true);
      await dynastyStore.removeItem('__test__');
      return true;
    } catch (error) {
      console.error('[IndexedDB] Storage not available:', error);
      return false;
    }
  },

  /**
   * Get storage usage info
   * @returns {Promise<Object>} { used, quota, percent }
   */
  async getStorageInfo() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        return {
          used: usage,
          quota: quota,
          percent: ((usage / quota) * 100).toFixed(2)
        };
      }
      return { used: 0, quota: 0, percent: 0 };
    } catch (error) {
      console.error('[IndexedDB] Error getting storage info:', error);
      return { used: 0, quota: 0, percent: 0 };
    }
  },

  /**
   * Migrate data from localStorage to IndexedDB
   * Call this once on app init to migrate existing localStorage users
   * @returns {Promise<boolean>} True if migration occurred
   */
  async migrateFromLocalStorage() {
    try {
      const localData = localStorage.getItem('cfb-dynasties');
      if (!localData) return false;

      const existingIndexedDB = await this.getDynasties();
      if (existingIndexedDB.length > 0) {
        // Already have data in IndexedDB, don't overwrite
        console.log('[IndexedDB] Data already exists, skipping migration');
        return false;
      }

      const dynasties = JSON.parse(localData);
      await this.saveDynasties(dynasties);

      // Optionally remove localStorage after successful migration
      // localStorage.removeItem('cfb-dynasties');

      console.log('[IndexedDB] Successfully migrated from localStorage');
      return true;
    } catch (error) {
      console.error('[IndexedDB] Migration from localStorage failed:', error);
      return false;
    }
  }
};

export default indexedDBStorage;
