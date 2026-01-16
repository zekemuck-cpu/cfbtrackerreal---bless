/**
 * Storage Service - Main Entry Point
 *
 * PER-DYNASTY STORAGE ARCHITECTURE
 *
 * Each dynasty has a `storageType` field: 'local' | 'cloud'
 * - 'local' = IndexedDB (device only, no account needed)
 * - 'cloud' = Firebase (syncs across devices, requires premium)
 *
 * This service:
 * - Loads dynasties from BOTH backends
 * - Routes operations to the correct backend based on dynasty.storageType
 * - Allows premium users to create in either location
 * - Provides migration between local and cloud
 */

import { indexedDBStorage } from './indexedDBStorage';
import { firebaseStorage } from './firebaseStorage';

// Storage type constants (per dynasty)
export const STORAGE_TYPE = {
  LOCAL: 'local',   // IndexedDB
  CLOUD: 'cloud'    // Firebase
};

// Legacy exports for backward compatibility
export const STORAGE_TIER = {
  FREE: 'free',
  PREMIUM: 'premium'
};

// Debug logging
let DEBUG = true;
const log = (...args) => {
  if (DEBUG) console.log('[StorageService]', ...args);
};

/**
 * Storage Service
 *
 * Routes operations to correct backend based on each dynasty's storageType.
 */
export const storageService = {
  _user: null,
  _userId: null,
  _isPremium: false,
  _initialized: false,

  /**
   * Initialize storage service with user info
   * @param {Object} options - { isPremium, uid }
   */
  initialize({ isPremium = false, uid = null } = {}) {
    this._isPremium = isPremium;
    this._userId = uid;

    if (uid) {
      firebaseStorage.setUserId(uid);
    }

    this._initialized = true;
    log(`Initialized - isPremium: ${isPremium}, userId: ${uid || 'none'}`);
  },

  /**
   * Check if user has premium (can use cloud storage)
   * @returns {boolean}
   */
  isPremium() {
    return this._isPremium;
  },

  /**
   * Get user ID (for Firebase operations)
   * @returns {string|null}
   */
  getUserId() {
    return this._userId;
  },

  /**
   * Set debug mode
   * @param {boolean} enabled
   */
  setDebug(enabled) {
    DEBUG = enabled;
    indexedDBStorage.setDebug(enabled);
    log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  },

  // Legacy methods for backward compatibility
  getTier() {
    return this._isPremium ? STORAGE_TIER.PREMIUM : STORAGE_TIER.FREE;
  },

  setTier() {
    // No-op - tier is now determined by dynasty.storageType
    log('setTier is deprecated - storage is now per-dynasty');
  },

  loadPersistedTier() {
    // Clean up old localStorage keys
    localStorage.removeItem('cfb-storage-tier');
    localStorage.removeItem('cfb-storage-userId');
    return false;
  },

  clearPersistedTier() {
    localStorage.removeItem('cfb-storage-tier');
    localStorage.removeItem('cfb-storage-userId');
  },

  getStorage() {
    // Legacy - returns local storage as default
    return indexedDBStorage;
  },

  // ============================================================================
  // STORAGE OPERATIONS - Now routes based on dynasty.storageType
  // ============================================================================

  /**
   * Get storage backend for a dynasty
   * @param {Object|string} dynastyOrType - Dynasty object or storageType string
   * @returns {Object} Storage backend
   */
  getStorageFor(dynastyOrType) {
    const storageType = typeof dynastyOrType === 'string'
      ? dynastyOrType
      : dynastyOrType?.storageType;

    return storageType === STORAGE_TYPE.CLOUD ? firebaseStorage : indexedDBStorage;
  },

  /**
   * Get ALL dynasties from both local and cloud storage
   * @returns {Promise<Array>}
   */
  async getDynasties() {
    const results = [];

    // Always get local dynasties
    try {
      const localDynasties = await indexedDBStorage.getDynasties();
      // Ensure they have storageType set
      for (const dynasty of localDynasties) {
        results.push({
          ...dynasty,
          storageType: STORAGE_TYPE.LOCAL
        });
      }
      log(`Loaded ${localDynasties.length} local dynasties`);
    } catch (error) {
      console.error('[Storage] Error loading local dynasties:', error);
    }

    // Get cloud dynasties if user is signed in
    if (this._userId) {
      try {
        const cloudDynasties = await firebaseStorage.getDynasties();
        // Ensure they have storageType set
        for (const dynasty of cloudDynasties) {
          results.push({
            ...dynasty,
            storageType: STORAGE_TYPE.CLOUD
          });
        }
        log(`Loaded ${cloudDynasties.length} cloud dynasties`);
      } catch (error) {
        console.error('[Storage] Error loading cloud dynasties:', error);
      }
    }

    log(`Total dynasties loaded: ${results.length}`);
    return results;
  },

  /**
   * Save all dynasties - routes each to correct backend
   * @param {Array} dynasties
   */
  async saveDynasties(dynasties) {
    const localDynasties = dynasties.filter(d => d.storageType !== STORAGE_TYPE.CLOUD);
    const cloudDynasties = dynasties.filter(d => d.storageType === STORAGE_TYPE.CLOUD);

    if (localDynasties.length > 0) {
      await indexedDBStorage.saveDynasties(localDynasties);
    }
    // Cloud dynasties are saved individually, not in bulk
  },

  /**
   * Get a single dynasty by ID
   * @param {string} dynastyId
   * @param {string} storageType - Optional hint for which storage to check first
   * @returns {Promise<Object|null>}
   */
  async getDynasty(dynastyId, storageType = null) {
    // If we know the storage type, check that first
    if (storageType === STORAGE_TYPE.CLOUD && this._userId) {
      const dynasty = await firebaseStorage.getDynasty(dynastyId);
      if (dynasty) {
        return { ...dynasty, storageType: STORAGE_TYPE.CLOUD };
      }
    } else if (storageType === STORAGE_TYPE.LOCAL) {
      const dynasty = await indexedDBStorage.getDynasty(dynastyId);
      if (dynasty) {
        return { ...dynasty, storageType: STORAGE_TYPE.LOCAL };
      }
    }

    // Check both backends
    const localDynasty = await indexedDBStorage.getDynasty(dynastyId);
    if (localDynasty) {
      return { ...localDynasty, storageType: STORAGE_TYPE.LOCAL };
    }

    if (this._userId) {
      const cloudDynasty = await firebaseStorage.getDynasty(dynastyId);
      if (cloudDynasty) {
        return { ...cloudDynasty, storageType: STORAGE_TYPE.CLOUD };
      }
    }

    return null;
  },

  /**
   * Create a new dynasty
   * @param {Object} dynasty
   * @param {string} storageType - Where to create it ('local' or 'cloud')
   * @returns {Promise<Object>}
   */
  async createDynasty(dynasty, storageType = STORAGE_TYPE.LOCAL) {
    // Premium required for cloud storage
    if (storageType === STORAGE_TYPE.CLOUD && !this._isPremium) {
      console.warn('[Storage] Cloud storage requires premium. Creating locally.');
      storageType = STORAGE_TYPE.LOCAL;
    }

    const storage = this.getStorageFor(storageType);
    const result = await storage.createDynasty({
      ...dynasty,
      storageType
    });

    return { ...result, storageType };
  },

  /**
   * Update a dynasty
   * @param {string} dynastyId
   * @param {Object} updates
   * @param {string} storageType - Which storage backend to use
   * @returns {Promise<Object|void>}
   */
  async updateDynasty(dynastyId, updates, storageType = null) {
    // If no storage type provided, find the dynasty first
    if (!storageType) {
      const dynasty = await this.getDynasty(dynastyId);
      storageType = dynasty?.storageType || STORAGE_TYPE.LOCAL;
    }

    const storage = this.getStorageFor(storageType);
    return storage.updateDynasty(dynastyId, updates);
  },

  /**
   * Delete a dynasty
   * @param {string} dynastyId
   * @param {string} storageType - Which storage backend
   * @returns {Promise<void>}
   */
  async deleteDynasty(dynastyId, storageType = null) {
    // If no storage type provided, find the dynasty first
    if (!storageType) {
      const dynasty = await this.getDynasty(dynastyId);
      storageType = dynasty?.storageType || STORAGE_TYPE.LOCAL;
    }

    const storage = this.getStorageFor(storageType);
    return storage.deleteDynasty(dynastyId);
  },

  /**
   * Clear all storage (both local and cloud)
   * @returns {Promise<void>}
   */
  async clearAll() {
    await indexedDBStorage.clearAll();
    // Don't clear cloud storage - too dangerous
  },

  /**
   * Check if storage is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return indexedDBStorage.isAvailable();
  },

  // ============================================================================
  // MIGRATION FUNCTIONS
  // ============================================================================

  /**
   * Migrate a single dynasty from local to cloud
   * @param {string} dynastyId
   * @returns {Promise<{success: boolean, dynasty?: Object}>}
   */
  async migrateDynastyToCloud(dynastyId) {
    if (!this._isPremium || !this._userId) {
      return { success: false, error: 'Premium required for cloud storage' };
    }

    try {
      // Get the local dynasty
      const dynasty = await indexedDBStorage.getDynasty(dynastyId);
      if (!dynasty) {
        return { success: false, error: 'Dynasty not found' };
      }

      // Create in cloud
      const cloudDynasty = await firebaseStorage.createDynasty({
        ...dynasty,
        storageType: STORAGE_TYPE.CLOUD
      });

      // Delete from local
      await indexedDBStorage.deleteDynasty(dynastyId);

      log(`Migrated dynasty ${dynastyId} to cloud`);
      return { success: true, dynasty: cloudDynasty };
    } catch (error) {
      console.error('[Storage] Migration to cloud failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Migrate a single dynasty from cloud to local
   * @param {string} dynastyId
   * @returns {Promise<{success: boolean, dynasty?: Object}>}
   */
  async migrateDynastyToLocal(dynastyId) {
    try {
      // Get the cloud dynasty
      const dynasty = await firebaseStorage.getDynasty(dynastyId);
      if (!dynasty) {
        return { success: false, error: 'Dynasty not found' };
      }

      // Create locally
      const localDynasty = await indexedDBStorage.createDynasty({
        ...dynasty,
        storageType: STORAGE_TYPE.LOCAL
      });

      // Delete from cloud
      await firebaseStorage.deleteDynasty(dynastyId);

      log(`Migrated dynasty ${dynastyId} to local`);
      return { success: true, dynasty: localDynasty };
    } catch (error) {
      console.error('[Storage] Migration to local failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Migrate ALL local dynasties to cloud (for premium upgrade)
   * @returns {Promise<{success: boolean, migratedCount: number}>}
   */
  async migrateAllToCloud() {
    if (!this._isPremium || !this._userId) {
      return { success: false, migratedCount: 0, error: 'Premium required' };
    }

    try {
      const localDynasties = await indexedDBStorage.getDynasties();
      let migratedCount = 0;

      for (const dynasty of localDynasties) {
        const result = await this.migrateDynastyToCloud(dynasty.id);
        if (result.success) {
          migratedCount++;
        }
      }

      return { success: true, migratedCount };
    } catch (error) {
      return { success: false, migratedCount: 0, error: error.message };
    }
  },

  /**
   * Legacy: Migrate from old localStorage to IndexedDB
   * @returns {Promise<boolean>}
   */
  async migrateFromLocalStorage() {
    return indexedDBStorage.migrateFromLocalStorage();
  },

  // Legacy aliases
  async migrateToCloud(userId) {
    if (userId && !this._userId) {
      firebaseStorage.setUserId(userId);
      this._userId = userId;
    }
    return this.migrateAllToCloud();
  },

  async migrateToLocal() {
    // Migrate all cloud dynasties to local
    try {
      const cloudDynasties = await firebaseStorage.getDynasties();
      let migratedCount = 0;

      for (const dynasty of cloudDynasties) {
        const result = await this.migrateDynastyToLocal(dynasty.id);
        if (result.success) {
          migratedCount++;
        }
      }

      return { success: true, migratedCount };
    } catch (error) {
      return { success: false, migratedCount: 0 };
    }
  },

  // ============================================================================
  // PREMIUM FEATURES
  // ============================================================================

  /**
   * Subscribe to real-time updates for cloud dynasties
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    if (!this._userId) {
      return () => {};
    }
    return firebaseStorage.subscribe(callback);
  },

  /**
   * Get players from subcollection (for migrated cloud dynasties)
   * @param {string} dynastyId
   * @param {string} storageType
   * @returns {Promise<Array>}
   */
  async getPlayers(dynastyId, storageType = null) {
    if (storageType === STORAGE_TYPE.CLOUD) {
      return firebaseStorage.getPlayers(dynastyId);
    }
    const dynasty = await indexedDBStorage.getDynasty(dynastyId);
    return dynasty?.players || [];
  },

  /**
   * Get games from subcollection (for migrated cloud dynasties)
   * @param {string} dynastyId
   * @param {string} storageType
   * @returns {Promise<Array>}
   */
  async getGames(dynastyId, storageType = null) {
    if (storageType === STORAGE_TYPE.CLOUD) {
      return firebaseStorage.getGames(dynastyId);
    }
    const dynasty = await indexedDBStorage.getDynasty(dynastyId);
    return dynasty?.games || [];
  }
};

export default storageService;
