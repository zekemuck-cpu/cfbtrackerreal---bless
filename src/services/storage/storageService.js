/**
 * Storage Service - Main Entry Point
 *
 * Routes storage operations to the appropriate backend:
 * - Free tier: IndexedDB (local storage)
 * - Paid tier: Firebase (cloud sync)
 *
 * Usage:
 *   import { storageService } from './services/storage/storageService';
 *
 *   // Initialize with user (call after auth)
 *   storageService.initialize(user);
 *
 *   // Use storage operations
 *   const dynasties = await storageService.getDynasties();
 */

import { indexedDBStorage } from './indexedDBStorage';
import { firebaseStorage } from './firebaseStorage';

// Storage tier constants
export const STORAGE_TIER = {
  FREE: 'free',      // IndexedDB (local)
  PREMIUM: 'premium' // Firebase (cloud)
};

// Debug logging
let DEBUG = true;
const log = (...args) => {
  if (DEBUG) console.log('[StorageService]', ...args);
};

/**
 * Storage Service
 *
 * Automatically routes to correct storage backend based on user tier.
 */
export const storageService = {
  _currentTier: STORAGE_TIER.FREE,
  _user: null,
  _initialized: false,

  /**
   * Initialize storage service with user
   * Call this after authentication
   * @param {Object|null} user - User object with isPremium flag, or null for free tier
   */
  initialize(user) {
    this._user = user;

    // Determine tier based on user
    // For now: authenticated users with isPremium get Firebase, others get IndexedDB
    if (user?.isPremium) {
      this._currentTier = STORAGE_TIER.PREMIUM;
      firebaseStorage.setUserId(user.uid);
    } else {
      this._currentTier = STORAGE_TIER.FREE;
    }

    this._initialized = true;
    log(`Initialized with tier: ${this._currentTier}, user: ${user?.uid || 'none'}`);
  },

  /**
   * Force a specific tier (for testing or migration)
   * @param {string} tier - STORAGE_TIER.FREE or STORAGE_TIER.PREMIUM
   * @param {string} userId - Firebase user ID (required for premium tier)
   */
  setTier(tier, userId = null) {
    const previousTier = this._currentTier;
    this._currentTier = tier;

    if (tier === STORAGE_TIER.PREMIUM && userId) {
      firebaseStorage.setUserId(userId);
      // Store userId for reload persistence
      localStorage.setItem('cfb-storage-userId', userId);
    }

    // Persist tier setting to localStorage for reload persistence
    localStorage.setItem('cfb-storage-tier', tier);

    log(`Tier changed: ${previousTier} → ${tier}`);
  },

  /**
   * Load persisted tier from localStorage (called on app init)
   * @returns {boolean} True if tier was restored from localStorage
   */
  loadPersistedTier() {
    const savedTier = localStorage.getItem('cfb-storage-tier');
    const savedUserId = localStorage.getItem('cfb-storage-userId');

    if (savedTier) {
      this._currentTier = savedTier;
      if (savedTier === STORAGE_TIER.PREMIUM && savedUserId) {
        firebaseStorage.setUserId(savedUserId);
      }
      log(`Restored tier from localStorage: ${savedTier}`);
      return true;
    }
    return false;
  },

  /**
   * Clear persisted tier (revert to default behavior)
   */
  clearPersistedTier() {
    localStorage.removeItem('cfb-storage-tier');
    localStorage.removeItem('cfb-storage-userId');
    log('Cleared persisted tier setting');
  },

  /**
   * Set debug mode for all storage services
   * @param {boolean} enabled - Whether to enable debug logging
   */
  setDebug(enabled) {
    DEBUG = enabled;
    indexedDBStorage.setDebug(enabled);
    log(`Debug mode ${enabled ? 'enabled' : 'disabled'} for all storage services`);
  },

  /**
   * Get current storage tier
   * @returns {string} Current tier
   */
  getTier() {
    return this._currentTier;
  },

  /**
   * Check if using premium (cloud) storage
   * @returns {boolean}
   */
  isPremium() {
    return this._currentTier === STORAGE_TIER.PREMIUM;
  },

  /**
   * Get the active storage backend
   * @returns {Object} indexedDBStorage or firebaseStorage
   */
  getStorage() {
    return this.isPremium() ? firebaseStorage : indexedDBStorage;
  },

  // ============================================================================
  // STORAGE OPERATIONS - Delegated to active backend
  // ============================================================================

  /**
   * Get all dynasties
   * @returns {Promise<Array>}
   */
  async getDynasties() {
    return this.getStorage().getDynasties();
  },

  /**
   * Save all dynasties (mainly for IndexedDB)
   * @param {Array} dynasties
   * @returns {Promise<void>}
   */
  async saveDynasties(dynasties) {
    return this.getStorage().saveDynasties(dynasties);
  },

  /**
   * Get a single dynasty by ID
   * @param {string} dynastyId
   * @returns {Promise<Object|null>}
   */
  async getDynasty(dynastyId) {
    return this.getStorage().getDynasty(dynastyId);
  },

  /**
   * Create a new dynasty
   * @param {Object} dynasty
   * @returns {Promise<Object>}
   */
  async createDynasty(dynasty) {
    return this.getStorage().createDynasty(dynasty);
  },

  /**
   * Update a dynasty
   * @param {string} dynastyId
   * @param {Object} updates
   * @returns {Promise<Object|void>}
   */
  async updateDynasty(dynastyId, updates) {
    return this.getStorage().updateDynasty(dynastyId, updates);
  },

  /**
   * Delete a dynasty
   * @param {string} dynastyId
   * @returns {Promise<void>}
   */
  async deleteDynasty(dynastyId) {
    return this.getStorage().deleteDynasty(dynastyId);
  },

  /**
   * Clear all storage
   * @returns {Promise<void>}
   */
  async clearAll() {
    return this.getStorage().clearAll();
  },

  /**
   * Check if storage is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return this.getStorage().isAvailable();
  },

  // ============================================================================
  // MIGRATION FUNCTIONS
  // ============================================================================

  /**
   * Migrate data from free tier (IndexedDB) to premium tier (Firebase)
   * Call when user upgrades to premium
   * @param {string} userId - Firebase user ID
   * @returns {Promise<{success: boolean, migratedCount: number}>}
   */
  async migrateToCloud(userId) {
    try {
      console.log('[Storage] Starting migration to cloud...');

      // Get all dynasties from IndexedDB
      const localDynasties = await indexedDBStorage.getDynasties();

      if (localDynasties.length === 0) {
        console.log('[Storage] No local dynasties to migrate');
        return { success: true, migratedCount: 0 };
      }

      // Set up Firebase storage with user ID
      firebaseStorage.setUserId(userId);

      // Migrate each dynasty
      let migratedCount = 0;
      for (const dynasty of localDynasties) {
        try {
          await firebaseStorage.createDynasty(dynasty);
          migratedCount++;
          console.log(`[Storage] Migrated dynasty: ${dynasty.name}`);
        } catch (error) {
          console.error(`[Storage] Failed to migrate dynasty ${dynasty.name}:`, error);
        }
      }

      // Optionally clear local storage after successful migration
      if (migratedCount === localDynasties.length) {
        // await indexedDBStorage.clearAll();
        console.log('[Storage] Migration complete - local data preserved as backup');
      }

      return { success: true, migratedCount };
    } catch (error) {
      console.error('[Storage] Migration failed:', error);
      return { success: false, migratedCount: 0 };
    }
  },

  /**
   * Migrate data from premium tier (Firebase) to free tier (IndexedDB)
   * Call when user downgrades from premium
   * @returns {Promise<{success: boolean, migratedCount: number}>}
   */
  async migrateToLocal() {
    try {
      console.log('[Storage] Starting migration to local...');

      // Get all dynasties from Firebase
      const cloudDynasties = await firebaseStorage.getDynasties();

      if (cloudDynasties.length === 0) {
        console.log('[Storage] No cloud dynasties to migrate');
        return { success: true, migratedCount: 0 };
      }

      // Get existing local dynasties to avoid duplicates
      const existingLocal = await indexedDBStorage.getDynasties();
      const existingIds = new Set(existingLocal.map(d => d.id));

      // Migrate each dynasty that doesn't already exist locally
      let migratedCount = 0;
      for (const dynasty of cloudDynasties) {
        if (!existingIds.has(dynasty.id)) {
          try {
            await indexedDBStorage.createDynasty(dynasty);
            migratedCount++;
            console.log(`[Storage] Migrated dynasty to local: ${dynasty.name}`);
          } catch (error) {
            console.error(`[Storage] Failed to migrate dynasty ${dynasty.name}:`, error);
          }
        }
      }

      return { success: true, migratedCount };
    } catch (error) {
      console.error('[Storage] Migration to local failed:', error);
      return { success: false, migratedCount: 0 };
    }
  },

  /**
   * Check for existing localStorage data and migrate to IndexedDB
   * Call on app initialization for backward compatibility
   * @returns {Promise<boolean>} True if migration occurred
   */
  async migrateFromLocalStorage() {
    return indexedDBStorage.migrateFromLocalStorage();
  },

  // ============================================================================
  // PREMIUM-ONLY FEATURES
  // ============================================================================

  /**
   * Subscribe to real-time updates (Premium only)
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    if (!this.isPremium()) {
      console.warn('[Storage] Real-time sync is a premium feature');
      return () => {};
    }
    return firebaseStorage.subscribe(callback);
  },

  /**
   * Get players from subcollection (Premium only, for migrated dynasties)
   * @param {string} dynastyId
   * @returns {Promise<Array>}
   */
  async getPlayers(dynastyId) {
    if (!this.isPremium()) {
      // Free tier: players are in dynasty.players
      const dynasty = await this.getDynasty(dynastyId);
      return dynasty?.players || [];
    }
    return firebaseStorage.getPlayers(dynastyId);
  },

  /**
   * Get games from subcollection (Premium only, for migrated dynasties)
   * @param {string} dynastyId
   * @returns {Promise<Array>}
   */
  async getGames(dynastyId) {
    if (!this.isPremium()) {
      // Free tier: games are in dynasty.games
      const dynasty = await this.getDynasty(dynastyId);
      return dynasty?.games || [];
    }
    return firebaseStorage.getGames(dynastyId);
  }
};

export default storageService;
