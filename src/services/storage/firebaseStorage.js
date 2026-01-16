/**
 * Firebase Storage Service (Paid Tier)
 *
 * Wraps existing dynastyService.js Firestore functions.
 * Provides same interface as indexedDBStorage for easy swapping.
 */

import {
  getUserDynasties,
  createDynasty as createDynastyInFirestore,
  updateDynasty as updateDynastyInFirestore,
  deleteDynasty as deleteDynastyInFirestore,
  getDynasty as getDynastyFromFirestore,
  subscribeToDynasties,
  getPlayersSubcollection,
  savePlayersToSubcollection,
  getGamesSubcollection,
  saveGamesToSubcollection
} from '../dynastyService';

/**
 * Firebase Storage Implementation
 *
 * All methods are async and return Promises.
 * Requires userId for all operations (cloud storage is per-user).
 */
export const firebaseStorage = {
  // User ID must be set before operations
  _userId: null,

  /**
   * Set the current user ID
   * Must be called after authentication
   * @param {string} userId - Firebase user ID
   */
  setUserId(userId) {
    this._userId = userId;
  },

  /**
   * Get all dynasties for current user from Firestore
   * @returns {Promise<Array>} Array of dynasty objects
   */
  async getDynasties() {
    if (!this._userId) {
      console.error('[Firebase] No user ID set');
      return [];
    }
    try {
      return await getUserDynasties(this._userId);
    } catch (error) {
      console.error('[Firebase] Error getting dynasties:', error);
      return [];
    }
  },

  /**
   * Save dynasties - Note: Firebase saves individually, not as batch
   * This method exists for interface compatibility but isn't typically used
   * @param {Array} dynasties - Array of dynasty objects
   * @returns {Promise<void>}
   */
  async saveDynasties(dynasties) {
    // Firebase doesn't have a "save all" - each dynasty is a separate doc
    // This would be used for migration scenarios
    console.warn('[Firebase] saveDynasties called - use updateDynasty for individual updates');
  },

  /**
   * Get a single dynasty by ID
   * @param {string} dynastyId - Dynasty ID
   * @returns {Promise<Object|null>} Dynasty object or null
   */
  async getDynasty(dynastyId) {
    try {
      return await getDynastyFromFirestore(dynastyId);
    } catch (error) {
      console.error('[Firebase] Error getting dynasty:', error);
      return null;
    }
  },

  /**
   * Create a new dynasty
   * @param {Object} dynasty - Dynasty object
   * @returns {Promise<Object>} Created dynasty with Firestore ID
   */
  async createDynasty(dynasty) {
    if (!this._userId) {
      throw new Error('No user ID set for Firebase storage');
    }
    try {
      // Remove local ID if present - Firestore generates its own
      const { id, ...dynastyData } = dynasty;
      return await createDynastyInFirestore(this._userId, dynastyData);
    } catch (error) {
      console.error('[Firebase] Error creating dynasty:', error);
      throw error;
    }
  },

  /**
   * Update a dynasty by ID
   * @param {string} dynastyId - Dynasty ID
   * @param {Object} updates - Partial updates to apply
   * @returns {Promise<void>}
   */
  async updateDynasty(dynastyId, updates) {
    try {
      await updateDynastyInFirestore(dynastyId, updates);
    } catch (error) {
      console.error('[Firebase] Error updating dynasty:', error);
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
      await deleteDynastyInFirestore(dynastyId);
    } catch (error) {
      console.error('[Firebase] Error deleting dynasty:', error);
      throw error;
    }
  },

  /**
   * Clear all dynasty data for user
   * Note: This is destructive - deletes all user's dynasties
   * @returns {Promise<void>}
   */
  async clearAll() {
    if (!this._userId) {
      throw new Error('No user ID set for Firebase storage');
    }
    try {
      const dynasties = await this.getDynasties();
      for (const dynasty of dynasties) {
        await this.deleteDynasty(dynasty.id);
      }
    } catch (error) {
      console.error('[Firebase] Error clearing data:', error);
      throw error;
    }
  },

  /**
   * Check if Firebase is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return !!this._userId;
  },

  /**
   * Subscribe to real-time dynasty updates
   * @param {Function} callback - Called with updated dynasties array
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    if (!this._userId) {
      console.error('[Firebase] No user ID set for subscription');
      return () => {};
    }
    return subscribeToDynasties(this._userId, callback);
  },

  // ============================================================================
  // SUBCOLLECTION METHODS - For migrated dynasties
  // ============================================================================

  /**
   * Get players from subcollection
   * @param {string} dynastyId - Dynasty ID
   * @returns {Promise<Array>} Array of player objects
   */
  async getPlayers(dynastyId) {
    try {
      return await getPlayersSubcollection(dynastyId);
    } catch (error) {
      console.error('[Firebase] Error getting players:', error);
      return [];
    }
  },

  /**
   * Save players to subcollection
   * @param {string} dynastyId - Dynasty ID
   * @param {Array} players - Array of player objects
   * @returns {Promise<void>}
   */
  async savePlayers(dynastyId, players) {
    try {
      await savePlayersToSubcollection(dynastyId, players);
    } catch (error) {
      console.error('[Firebase] Error saving players:', error);
      throw error;
    }
  },

  /**
   * Get games from subcollection
   * @param {string} dynastyId - Dynasty ID
   * @returns {Promise<Array>} Array of game objects
   */
  async getGames(dynastyId) {
    try {
      return await getGamesSubcollection(dynastyId);
    } catch (error) {
      console.error('[Firebase] Error getting games:', error);
      return [];
    }
  },

  /**
   * Save games to subcollection
   * @param {string} dynastyId - Dynasty ID
   * @param {Array} games - Array of game objects
   * @returns {Promise<void>}
   */
  async saveGames(dynastyId, games) {
    try {
      await saveGamesToSubcollection(dynastyId, games);
    } catch (error) {
      console.error('[Firebase] Error saving games:', error);
      throw error;
    }
  }
};

export default firebaseStorage;
