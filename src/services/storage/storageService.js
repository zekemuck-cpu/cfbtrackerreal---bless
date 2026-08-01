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

import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { indexedDBStorage } from './indexedDBStorage';
import { firebaseStorage } from './firebaseStorage';
import {
  createDynasty as createDynastyInFirestore,
  updateDynasty as updateDynastyInFirestore,
  getPlayersSubcollection,
  getGamesSubcollection,
  savePlayersToSubcollection,
  saveGamesToSubcollection,
  saveWeekRecapToSubcollection,
  saveSocialFeedToSubcollection,
  saveSocialCharacterShards,
  getRecruitingDatabaseSubcollection,
  saveRecruitingDatabaseSubcollection,
  getWeekRecapsSubcollection,
  getSocialFeedSubcollection,
  getSocialCharactersSubcollection,
  getSubcollectionServerCount
} from '../dynastyService';
import {
  isSeasonalField,
  splitSeasonalUpdateByYear,
  writeSeasonalUpdate,
  getSeasonsSubcollection
} from '../seasonSubcollection';

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
   * Uses subcollections for players/games to avoid 1MB document limit
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

      log(`Migrating dynasty ${dynastyId} to cloud with subcollections...`);

      // Extract EVERY heavy field that a live cloud dynasty keeps out of its
      // main doc, so the initial write stays under Firestore's 1 MB cap.
      // Historically this only stripped players + games, which left the
      // seasonal maps, week recaps, and social feed embedded — enough on a
      // long-running dynasty to blow the cap and fail the migration outright.
      // Mirror the exact fan-out that updateDynasty() does for cloud saves:
      //   players / games          -> their own subcollections
      //   seasonal ByYear/ByTeamYear fields -> seasons subcollection
      //   weekRecapsByYear         -> weekRecaps subcollection
      //   socialFeedByYear         -> socialFeed subcollection
      //   socialCharacters         -> socialCharacters (sharded) subcollection
      const {
        players,
        games,
        id,
        weekRecapsByYear,
        socialFeedByYear,
        socialCharacters,
        // Recruiting Database recruit list -> its own subcollection too, same
        // 1MB-main-doc reasoning as players/games/weekRecaps.
        recruitingDatabasePlayers,
        ...rest
      } = dynasty;

      // Pull the season-scoped fields out of the remaining main-doc data.
      const seasonalUpdates = {};
      const mainDynastyData = {};
      for (const [key, value] of Object.entries(rest)) {
        if (isSeasonalField(key)) {
          seasonalUpdates[key] = value;
        } else {
          mainDynastyData[key] = value;
        }
      }

      // Create the main dynasty document WITHOUT any of the heavy fields.
      // The main doc still carries `teams` (with per-team-year schedules,
      // ratings, coaching staff embedded) and `dynastyPoints` (team NIL) —
      // neither is season-routed. On a big dynasty these can push the main
      // doc past Firestore's 1 MB cap, which throws here. When that happens
      // we must fail loudly with an actionable message (not a generic one),
      // and the local copy is untouched because we never reach deleteDynasty.
      let cloudDynasty;
      try {
        cloudDynasty = await createDynastyInFirestore(this._userId, {
          ...mainDynastyData,
          storageType: STORAGE_TYPE.CLOUD,
          _subcollectionsMigrated: true, // Mark as using subcollections
          // Store counts for reference
          _playerCount: players?.length || 0,
          _gameCount: games?.length || 0,
        });
      } catch (createErr) {
        console.error('[Storage] Main-doc create failed during migration:', createErr);
        const tooBig = /maximum|exceeds|1048576|invalid-argument/i.test(
          `${createErr?.code || ''} ${createErr?.message || ''}`
        );
        return {
          success: false,
          error: tooBig
            ? 'This dynasty is too large to move to the cloud in one write (schedules + team data exceed Firestore\'s 1 MB document limit). Your local copy was kept — contact support to split it.'
            : `Could not create the cloud copy: ${createErr?.message || 'unknown error'}. Your local copy was kept.`,
          failedParts: ['main-document'],
        };
      }

      const cloudDynastyId = cloudDynasty.id;
      log(`Created main document ${cloudDynastyId}, now saving subcollections...`);

      // Save all subcollections. Track EACH write's outcome by name — we must
      // not delete the local (only complete) copy if a save threw, or the
      // dynasty is left gutted in the cloud with no recoverable source (audit
      // C5). Collecting the specific failed parts (instead of one boolean)
      // lets us tell the user exactly what didn't upload.
      const failedParts = [];

      if (players && players.length > 0) {
        try {
          await savePlayersToSubcollection(cloudDynastyId, players);
          log(`Saved ${players.length} players to subcollection`);
        } catch (playerErr) {
          console.error('[Storage] Failed to save players subcollection:', playerErr);
          failedParts.push('roster');
        }
      }

      if (games && games.length > 0) {
        try {
          await saveGamesToSubcollection(cloudDynastyId, games);
          log(`Saved ${games.length} games to subcollection`);
        } catch (gameErr) {
          console.error('[Storage] Failed to save games subcollection:', gameErr);
          failedParts.push('games');
        }
      }

      // Seasonal ByYear / ByTeamYear fields -> seasons subcollection (one doc
      // per year). splitSeasonalUpdateByYear fans the legacy maps into
      // year-keyed patches; writeSeasonalUpdate persists them.
      if (Object.keys(seasonalUpdates).length > 0) {
        try {
          const byYear = splitSeasonalUpdateByYear(seasonalUpdates);
          const years = await writeSeasonalUpdate(cloudDynastyId, byYear);
          log(`Saved seasonal fields for ${years?.length || 0} season(s) to subcollection`);
          // Silent no-op guard: we had season-scoped data (e.g. conference
          // schedules in schedulesByTeamYear) but nothing was written. Treat
          // that as a failure so it can't masquerade as a clean migration.
          if (Object.keys(byYear).length > 0 && (!years || years.length === 0)) {
            console.error('[Storage] Seasonal write produced no season docs despite pending data');
            failedParts.push('schedules & season data');
          }
        } catch (seasonErr) {
          console.error('[Storage] Failed to save seasons subcollection:', seasonErr);
          failedParts.push('schedules & season data');
        }
      }

      // Week recaps -> one doc per year/week.
      if (weekRecapsByYear && typeof weekRecapsByYear === 'object') {
        try {
          let recapCount = 0;
          for (const [year, byWeek] of Object.entries(weekRecapsByYear)) {
            if (!byWeek || typeof byWeek !== 'object') continue;
            for (const [week, recap] of Object.entries(byWeek)) {
              if (!recap) continue;
              await saveWeekRecapToSubcollection(cloudDynastyId, year, week, recap);
              recapCount++;
            }
          }
          if (recapCount) log(`Saved ${recapCount} week recap(s) to subcollection`);
        } catch (recapErr) {
          console.error('[Storage] Failed to save weekRecaps subcollection:', recapErr);
          failedParts.push('week recaps');
        }
      }

      // Social feed -> one doc per year/week.
      if (socialFeedByYear && typeof socialFeedByYear === 'object') {
        try {
          let feedCount = 0;
          for (const [year, byWeek] of Object.entries(socialFeedByYear)) {
            if (!byWeek || typeof byWeek !== 'object') continue;
            for (const [week, posts] of Object.entries(byWeek)) {
              if (!Array.isArray(posts) || posts.length === 0) continue;
              await saveSocialFeedToSubcollection(cloudDynastyId, year, week, posts);
              feedCount++;
            }
          }
          if (feedCount) log(`Saved ${feedCount} social feed week(s) to subcollection`);
        } catch (feedErr) {
          console.error('[Storage] Failed to save socialFeed subcollection:', feedErr);
          failedParts.push('social feed');
        }
      }

      // Social characters -> sharded subcollection docs.
      if (socialCharacters && typeof socialCharacters === 'object'
          && Object.keys(socialCharacters).length > 0) {
        try {
          await saveSocialCharacterShards(cloudDynastyId, socialCharacters);
          log(`Saved ${Object.keys(socialCharacters).length} social character(s) to subcollection`);
        } catch (charErr) {
          console.error('[Storage] Failed to save socialCharacters subcollection:', charErr);
          failedParts.push('social characters');
        }
      }

      // Recruiting Database recruit list -> its own subcollection.
      if (recruitingDatabasePlayers && recruitingDatabasePlayers.length > 0) {
        try {
          await saveRecruitingDatabaseSubcollection(cloudDynastyId, recruitingDatabasePlayers);
          log(`Saved ${recruitingDatabasePlayers.length} Recruiting Database recruits to subcollection`);
        } catch (rdErr) {
          console.error('[Storage] Failed to save Recruiting Database subcollection:', rdErr);
          failedParts.push('recruiting database');
        }
      }

      if (failedParts.length > 0) {
        // Keep the local copy intact so the user hasn't lost anything; the
        // cloud doc exists but is incomplete and will be reconciled on a
        // later retry (or via the Re-sync repair tool). Surface EXACTLY which
        // parts failed instead of a vague "some game data" message — the old
        // wording hid schedule/NIL loss behind "game data".
        console.error(
          `[Storage] Migration incomplete for ${dynastyId}; keeping local copy. Failed: ${failedParts.join(', ')}`
        );
        return {
          success: false,
          error: `Migration incomplete — these did not upload: ${failedParts.join(', ')}. Your local copy was kept, so nothing is lost. Retry, or use Re-sync to Cloud in Account to finish the upload.`,
          failedParts,
          cloudDynastyId,
        };
      }

      // READ-BACK VERIFICATION (root-cause guard for "switched local→cloud,
      // roster empty in the cloud save"): every subcollection write above
      // reported success, but a write that silently persisted nothing — or was
      // swallowed by the SDK's offline cache without ever reaching the server —
      // would still let us delete the local copy and leave the cloud roster
      // empty with no recoverable source. Before deleting local, count what
      // ACTUALLY landed on the server and require it to match what we uploaded.
      // Aggregate count is billed as one read each, so this is negligible for a
      // one-time migration.
      const verifyMismatch = [];
      // The seasons / weekRecaps / socialFeed writers commit to the SDK's
      // local cache and (unlike players/games/recruits) don't individually
      // await server acknowledgment. Force a full server sync here so
      // "everything uploaded" means uploaded to the SERVER, not queued in a
      // cache that dies with the tab. Timeout-raced so a dead connection
      // surfaces as a kept-local failure instead of hanging forever.
      try {
        await Promise.race([
          waitForPendingWrites(db),
          new Promise((_, reject) => setTimeout(
            () => reject(new Error('Timed out waiting for uploads to reach the server')), 60000)),
        ]);
      } catch (syncErr) {
        console.error('[Storage] Migration server-sync wait failed:', syncErr);
        verifyMismatch.push('server sync not confirmed');
      }
      // Compare server counts against the number of docs the save functions
      // actually WRITE — they skip entries with a missing pid/id and collapse
      // duplicates onto one doc — not the raw array length, or a single
      // pid-less legacy player would fail verification forever.
      const uniqueKeyCount = (arr, keyField) =>
        new Set((arr || []).filter(x => x && x[keyField]).map(x => String(x[keyField]))).size;
      try {
        const expectedPlayers = uniqueKeyCount(players, 'pid');
        if (expectedPlayers > 0) {
          const n = await getSubcollectionServerCount(cloudDynastyId, 'players');
          if (n < expectedPlayers) verifyMismatch.push(`roster (${n}/${expectedPlayers} uploaded)`);
        }
        const expectedGames = uniqueKeyCount(games, 'id');
        if (expectedGames > 0) {
          const n = await getSubcollectionServerCount(cloudDynastyId, 'games');
          if (n < expectedGames) verifyMismatch.push(`games (${n}/${expectedGames} uploaded)`);
        }
        const expectedRecruits = uniqueKeyCount(recruitingDatabasePlayers, 'pid');
        if (expectedRecruits > 0) {
          const n = await getSubcollectionServerCount(cloudDynastyId, 'recruitingDatabase');
          if (n < expectedRecruits) verifyMismatch.push(`recruiting database (${n}/${expectedRecruits} uploaded)`);
        }
      } catch (verifyErr) {
        // If we can't even read the counts back, do NOT delete local — err
        // entirely on the side of keeping the user's only complete copy.
        console.error('[Storage] Migration verification read failed:', verifyErr);
        verifyMismatch.push('could not verify upload');
      }

      if (verifyMismatch.length > 0) {
        console.error(
          `[Storage] Migration verification failed for ${dynastyId}; keeping local copy. ${verifyMismatch.join(', ')}`
        );
        return {
          success: false,
          error: `Couldn't confirm everything uploaded (${verifyMismatch.join(', ')}). Your local copy was kept, so nothing is lost — retry, or use Re-sync to Cloud in Account to finish.`,
          failedParts: verifyMismatch,
          cloudDynastyId,
        };
      }

      // Delete from local only after the cloud doc and ALL of its
      // subcollections are fully persisted AND verified on the server.
      await indexedDBStorage.deleteDynasty(dynastyId);

      log(`Migrated dynasty ${dynastyId} to cloud as ${cloudDynastyId}`);
      // Re-embed every heavy field we stripped so the caller's React state
      // still holds the full dynasty (the cloud main doc no longer carries
      // them — they now live in subcollections and are lazy-loaded on open).
      return {
        success: true,
        dynasty: {
          ...cloudDynasty,
          players,
          games,
          weekRecapsByYear,
          socialFeedByYear,
          socialCharacters,
          recruitingDatabasePlayers,
          ...seasonalUpdates,
        },
      };
    } catch (error) {
      console.error('[Storage] Migration to cloud failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Repair an incomplete local -> cloud migration WITHOUT re-creating or
   * deleting anything.
   *
   * Use case: a prior migrateDynastyToCloud() left a partial cloud copy
   * (e.g. roster uploaded but conference schedules in `schedulesByTeamYear`
   * and team NIL in `dynastyPoints` never landed), and the complete original
   * is still sitting in local IndexedDB. This re-pushes EVERY field from the
   * local source into the EXISTING cloud document, idempotently:
   *   - main-doc fields (teams, dynastyPoints, settings, ...) -> updateDoc
   *   - seasonal ByYear/ByTeamYear fields (schedulesByTeamYear, ...) -> seasons
   *   - players / games / recaps / feed / characters / recruits -> subcollections
   *
   * The local copy is NEVER deleted, so this is safe to run repeatedly. Each
   * part reports independently, so schedules + NIL can still be recovered even
   * if the oversized `teams` main-doc write fails the 1 MB cap (schedules also
   * live in the seasons subcollection, which has no such limit).
   *
   * @param {string} localDynastyId  - source dynasty in IndexedDB (complete)
   * @param {string} cloudDynastyId  - existing target cloud dynasty document
   * @returns {Promise<{success: boolean, written: string[], failed: string[], error?: string}>}
   */
  async resyncDynastyToCloud(localDynastyId, cloudDynastyId) {
    if (!this._isPremium || !this._userId) {
      return { success: false, error: 'Premium required for cloud storage', written: [], failed: [] };
    }
    if (!localDynastyId || !cloudDynastyId) {
      return { success: false, error: 'Both a local and a cloud dynasty id are required', written: [], failed: [] };
    }

    let source;
    try {
      source = await indexedDBStorage.getDynasty(localDynastyId);
    } catch (readErr) {
      return { success: false, error: `Could not read local dynasty: ${readErr?.message || readErr}`, written: [], failed: [] };
    }
    if (!source) {
      return { success: false, error: `No local dynasty found with id ${localDynastyId}`, written: [], failed: [] };
    }

    log(`Re-syncing local ${localDynastyId} into cloud ${cloudDynastyId}...`);

    const written = [];
    const failed = [];

    // Extract heavy fields exactly like migrateDynastyToCloud does, so nothing
    // is written to the main doc that belongs in a subcollection.
    const {
      players,
      games,
      id: _ignoredId,
      storageType: _ignoredStorage,
      userId: _ignoredUserId,
      weekRecapsByYear,
      socialFeedByYear,
      socialCharacters,
      recruitingDatabasePlayers,
      ...rest
    } = source;

    const seasonalUpdates = {};
    const mainDynastyData = {};
    for (const [key, value] of Object.entries(rest)) {
      if (isSeasonalField(key)) seasonalUpdates[key] = value;
      else mainDynastyData[key] = value;
    }

    // 1) Main-doc fields (teams -> schedules, dynastyPoints -> NIL, settings).
    //    Force cloud identity; never clobber storageType/userId with local's.
    try {
      await updateDynastyInFirestore(cloudDynastyId, {
        ...mainDynastyData,
        storageType: STORAGE_TYPE.CLOUD,
        _subcollectionsMigrated: true,
      });
      written.push('team & NIL data');
    } catch (mainErr) {
      console.error('[Storage] Re-sync main-doc write failed:', mainErr);
      const tooBig = /maximum|exceeds|1048576|invalid-argument/i.test(
        `${mainErr?.code || ''} ${mainErr?.message || ''}`
      );
      failed.push(tooBig ? 'team & NIL data (too large for one write)' : 'team & NIL data');
    }

    // 2) Seasonal fields (conference schedules live here) -> seasons subcollection.
    if (Object.keys(seasonalUpdates).length > 0) {
      try {
        const byYear = splitSeasonalUpdateByYear(seasonalUpdates);
        const years = await writeSeasonalUpdate(cloudDynastyId, byYear);
        if (Object.keys(byYear).length > 0 && (!years || years.length === 0)) {
          failed.push('schedules & season data');
        } else {
          written.push('schedules & season data');
        }
      } catch (seasonErr) {
        console.error('[Storage] Re-sync seasonal write failed:', seasonErr);
        failed.push('schedules & season data');
      }
    }

    // 3) Roster.
    if (Array.isArray(players) && players.length > 0) {
      try {
        await savePlayersToSubcollection(cloudDynastyId, players);
        written.push('roster');
      } catch (e) {
        console.error('[Storage] Re-sync players failed:', e);
        failed.push('roster');
      }
    }

    // 4) Games.
    if (Array.isArray(games) && games.length > 0) {
      try {
        await saveGamesToSubcollection(cloudDynastyId, games);
        written.push('games');
      } catch (e) {
        console.error('[Storage] Re-sync games failed:', e);
        failed.push('games');
      }
    }

    // 5) Week recaps.
    if (weekRecapsByYear && typeof weekRecapsByYear === 'object') {
      try {
        for (const [year, byWeek] of Object.entries(weekRecapsByYear)) {
          if (!byWeek || typeof byWeek !== 'object') continue;
          for (const [week, recap] of Object.entries(byWeek)) {
            if (!recap) continue;
            await saveWeekRecapToSubcollection(cloudDynastyId, year, week, recap);
          }
        }
        written.push('week recaps');
      } catch (e) {
        console.error('[Storage] Re-sync week recaps failed:', e);
        failed.push('week recaps');
      }
    }

    // 6) Social feed.
    if (socialFeedByYear && typeof socialFeedByYear === 'object') {
      try {
        for (const [year, byWeek] of Object.entries(socialFeedByYear)) {
          if (!byWeek || typeof byWeek !== 'object') continue;
          for (const [week, posts] of Object.entries(byWeek)) {
            if (!Array.isArray(posts) || posts.length === 0) continue;
            await saveSocialFeedToSubcollection(cloudDynastyId, year, week, posts);
          }
        }
        written.push('social feed');
      } catch (e) {
        console.error('[Storage] Re-sync social feed failed:', e);
        failed.push('social feed');
      }
    }

    // 7) Social characters.
    if (socialCharacters && typeof socialCharacters === 'object'
        && Object.keys(socialCharacters).length > 0) {
      try {
        await saveSocialCharacterShards(cloudDynastyId, socialCharacters);
        written.push('social characters');
      } catch (e) {
        console.error('[Storage] Re-sync social characters failed:', e);
        failed.push('social characters');
      }
    }

    // 8) Recruiting database.
    if (Array.isArray(recruitingDatabasePlayers) && recruitingDatabasePlayers.length > 0) {
      try {
        await saveRecruitingDatabaseSubcollection(cloudDynastyId, recruitingDatabasePlayers);
        written.push('recruiting database');
      } catch (e) {
        console.error('[Storage] Re-sync recruiting database failed:', e);
        failed.push('recruiting database');
      }
    }

    log(`Re-sync complete. Wrote: [${written.join(', ')}]. Failed: [${failed.join(', ')}].`);
    return {
      success: failed.length === 0,
      written,
      failed,
      error: failed.length ? `Some parts did not upload: ${failed.join(', ')}.` : undefined,
    };
  },

  /**
   * Migrate a single dynasty from cloud to local.
   *
   * Cloud dynasties store players + games in subcollections
   * (dynasties/{id}/players and /games) to stay under Firestore's 1MB
   * doc limit. Local IndexedDB dynasties are single-doc — we MUST pull
   * the subcollections out of the cloud and embed them as arrays on
   * the local dynasty before deleting the cloud copy, otherwise the
   * local copy is empty and the round-trip back to cloud loses
   * everything.
   *
   * @param {string} dynastyId
   * @param {Object} options
   * @param {boolean} [options.deleteFromCloud=true] — when false, the
   *   cloud copy is left in place as a backup. Cancel-time auto-export
   *   uses this so a user who lapses but later re-subscribes (or who
   *   simply needs to recover) hasn't lost their cloud data.
   * @returns {Promise<{success: boolean, dynasty?: Object, players?: number, games?: number}>}
   */
  async migrateDynastyToLocal(dynastyId, options = {}) {
    const { deleteFromCloud = true } = options;
    try {
      const dynasty = await firebaseStorage.getDynasty(dynastyId);
      if (!dynasty) {
        return { success: false, error: 'Dynasty not found' };
      }

      // Pull subcollections — these are the actual game data. If this
      // step fails, we abort BEFORE deleting the cloud copy.
      //
      // CRITICAL: migrateDynastyToCloud fans EVERY heavy field out of the main
      // doc into subcollections (players, games, seasons, weekRecaps,
      // socialFeed, socialCharacters, recruitingDatabase) and deleteField()s
      // them off the main doc. So `dynasty` (the main doc) no longer carries
      // any of them — this cloud→local pull MUST read them all back or the
      // local copy silently loses them. Previously it pulled only players,
      // games, and the Recruiting Database, which dropped the seasons
      // subcollection — including committed recruits (recruitsByTeamYear /
      // recruitingCommitmentsByTeamYear / recruitingClassRankByTeamYear),
      // schedules, standings, and awards — plus week recaps and social. The
      // recruit loss surfaced as "my recruits don't show up in the cloud"
      // after a local→cloud→local round-trip (e.g. a subscription lapse
      // auto-export).
      let players = [];
      let games = [];
      let recruitingDatabasePlayers = [];
      let seasonalFields = {};
      let weekRecapsByYear = {};
      let socialFeedByYear = {};
      let socialCharacters = {};
      try {
        // serverFirst on EVERY read: this is a destructive one-shot (when
        // deleteFromCloud, the cloud main doc is deleted after the pull), so
        // it must copy SERVER truth. The default cache-first getters can
        // return a stale snapshot from this device's SDK cache — migrating
        // that and deleting cloud would silently discard every edit made on
        // another device since this one last synced. serverFirst also THROWS
        // on failure (unlike the firebaseStorage wrappers, which swallow
        // errors into an empty array that would migrate as "no players"), so
        // any read problem aborts the migration before anything is deleted.
        players = (await getPlayersSubcollection(dynastyId, { serverFirst: true })) || [];
        games = (await getGamesSubcollection(dynastyId, { serverFirst: true })) || [];
        // Recruiting Database recruits live in their own subcollection too
        // (see migrateRecruitingDatabaseToSubcollection) — fall back to
        // whatever's still on the main doc for a dynasty that hasn't been
        // opened yet since that migration shipped.
        recruitingDatabasePlayers = (await getRecruitingDatabaseSubcollection(dynastyId, { serverFirst: true })) || [];
        if (recruitingDatabasePlayers.length === 0 && dynasty.recruitingDatabasePlayers?.length > 0) {
          recruitingDatabasePlayers = dynasty.recruitingDatabasePlayers;
        }
        // Seasons subcollection rehydrates back into the legacy ByYear /
        // ByTeamYear field names (recruitsByTeamYear, schedulesByTeamYear,
        // awardsByYear, etc.) — spread straight onto the local dynasty.
        seasonalFields = (await getSeasonsSubcollection(dynastyId, { serverFirst: true })) || {};
        weekRecapsByYear = (await getWeekRecapsSubcollection(dynastyId, { serverFirst: true })) || {};
        socialFeedByYear = (await getSocialFeedSubcollection(dynastyId, { serverFirst: true })) || {};
        socialCharacters = (await getSocialCharactersSubcollection(dynastyId, { serverFirst: true })) || {};
        log(`Pulled ${players.length} players + ${games.length} games + ${recruitingDatabasePlayers.length} Recruiting Database recruits + ${Object.keys(seasonalFields).length} seasonal fields from cloud subcollections (server-verified) for ${dynastyId}`);
      } catch (subErr) {
        console.error('[Storage] Failed to fetch subcollections during migrate-to-local:', subErr);
        return {
          success: false,
          error: `Could not fetch dynasty contents from cloud: ${subErr.message}`,
        };
      }

      // Create locally with the full payload embedded. Local (IndexedDB)
      // dynasties keep everything as plain fields — no per-document size
      // ceiling to dodge there. Seasonal fields are spread first so that any
      // same-named legacy field still on the main doc is superseded by the
      // authoritative subcollection value (subcollection wins on overlap).
      const localPayload = {
        ...dynasty,
        ...seasonalFields,
        players,
        games,
        recruitingDatabasePlayers,
        // Merge week recaps: legacy main-doc union subcollection (sub wins).
        weekRecapsByYear: { ...(dynasty.weekRecapsByYear || {}), ...weekRecapsByYear },
        socialFeedByYear: { ...(dynasty.socialFeedByYear || {}), ...socialFeedByYear },
        socialCharacters: { ...(dynasty.socialCharacters || {}), ...socialCharacters },
        storageType: STORAGE_TYPE.LOCAL,
        _subcollectionsMigrated: undefined, // local format doesn't use this flag
      };
      // UPSERT, not blind create: the local copy keeps the cloud id, and
      // createDynasty just pushes onto the list with no id dedupe. A retried
      // downgrade auto-export (partial failure → pendingDowngrade re-runs the
      // whole loop next session) or a repeat manual switch would otherwise
      // create a SECOND local record with the same id — after which every
      // id-keyed read/update/delete silently operates on whichever copy
      // happens to be first, leaving the other as a stale ghost.
      const existingLocal = await indexedDBStorage.getDynasty(dynastyId);
      const localDynasty = existingLocal
        ? await indexedDBStorage.updateDynasty(dynastyId, localPayload)
        : await indexedDBStorage.createDynasty(localPayload);

      // Only delete cloud copy after local save succeeded AND caller
      // explicitly opted in. NOTE: deleteDynasty currently deletes only
      // the main doc; subcollections are orphaned at the old id. That's
      // intentional for now — it acts as a soft backup if migration
      // ever loses data.
      if (deleteFromCloud) {
        await firebaseStorage.deleteDynasty(dynastyId);
      }

      log(`Migrated dynasty ${dynastyId} to local (players=${players.length}, games=${games.length}, deletedCloud=${deleteFromCloud})`);
      return { success: true, dynasty: localDynasty, players: players.length, games: games.length };
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

  /**
   * Write orphan-recovered players + games arrays into a target dynasty,
   * picking the right backend based on the target's storageType.
   * Used by the admin "Recover Orphan" flow after the API has pulled
   * the orphan subcollections out of Firestore.
   *
   * Behavior:
   *   • Local target: dynasty.players and .games arrays are REPLACED
   *     (not merged) so re-running recovery doesn't duplicate.
   *   • Cloud target: subcollections are written via the standard
   *     savePlayersToSubcollection / saveGamesToSubcollection helpers.
   *     Existing subcollection docs are overwritten by ID; any items
   *     present in the target but not in the recovery payload are
   *     left in place.
   */
  async recoverOrphanIntoTarget(targetDynastyId, players, games) {
    const target = await this.getDynasty(targetDynastyId);
    if (!target) return { success: false, error: 'Target dynasty not found' };

    try {
      if (target.storageType === STORAGE_TYPE.CLOUD) {
        if (Array.isArray(players) && players.length > 0) {
          await savePlayersToSubcollection(targetDynastyId, players);
        }
        if (Array.isArray(games) && games.length > 0) {
          await saveGamesToSubcollection(targetDynastyId, games);
        }
        await firebaseStorage.updateDynasty(targetDynastyId, {
          _subcollectionsMigrated: true,
          _playerCount: players?.length || 0,
          _gameCount: games?.length || 0,
        });
      } else {
        await indexedDBStorage.updateDynasty(targetDynastyId, {
          players: Array.isArray(players) ? players : [],
          games: Array.isArray(games) ? games : [],
        });
      }
      log(`Recovery wrote players=${players?.length || 0}, games=${games?.length || 0} into ${target.storageType} dynasty ${targetDynastyId}`);
      return { success: true, players: players?.length || 0, games: games?.length || 0 };
    } catch (err) {
      console.error('[Storage] Recovery write failed:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Bulk migrate every cloud dynasty owned by the current user to local.
   * Used by the cancel-time auto-export when a subscription ends.
   *
   * @param {Object} options
   * @param {boolean} [options.deleteFromCloud=true] — pass false to
   *   preserve the cloud copies as a backup. The cancel flow uses
   *   false so a lapsed user doesn't lose Firestore data on the way
   *   back to local.
   */
  async migrateToLocal(options = {}) {
    const { deleteFromCloud = true } = options;
    try {
      const cloudDynasties = await firebaseStorage.getDynasties();
      let migratedCount = 0;

      for (const dynasty of cloudDynasties) {
        const result = await this.migrateDynastyToLocal(dynasty.id, { deleteFromCloud });
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
