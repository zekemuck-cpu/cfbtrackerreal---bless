import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  deleteField,
  arrayUnion,
  arrayRemove,
  waitForPendingWrites,
  getCountFromServer
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { indexedDBStorage } from './storage'
import { firestoreDocSize } from '../utils/firestoreSize'
import {
  getSeasonsSubcollection,
  rehydrateSeasonalShapes,
  PER_YEAR_FIELDS,
  PER_TEAM_YEAR_FIELDS,
  foldTeamsByYearFieldsFromFlat,
} from './seasonSubcollection'

const DYNASTIES_COLLECTION = 'dynasties'
const PLAYERS_SUBCOLLECTION = 'players'
const GAMES_SUBCOLLECTION = 'games'
const INVITES_SUBCOLLECTION = 'invites'
const WEEK_RECAPS_SUBCOLLECTION = 'weekRecaps'
// Recruiting Database's imported recruit list — moved out of the main
// document's own recruitingDatabasePlayers field for the same reason
// players/games/weekRecaps already were: it's a plain array that only ever
// grows, sitting on the ONE document every single page in a dynasty has to
// fetch just to render at all. A dynasty that's actually used this feature
// a lot was paying that download/parse cost on every page load, forever,
// even on pages that have nothing to do with recruiting. One doc per
// recruit (keyed by pid, exactly like PLAYERS_SUBCOLLECTION) means it's
// only ever fetched when something actually asks for it.
const RECRUITING_DATABASE_SUBCOLLECTION = 'recruitingDatabase'
// Mirrored from seasonSubcollection.js — kept local so the dynasty
// teardown path (deleteDynastyWithSubcollections) can wipe the
// seasons docs without crossing module boundaries.
const SEASONS_SUBCOLLECTION = 'seasons'
// SchemeBuilder's per-team depth-chart plan (dynasty.teamFuture[tid]) — one
// doc per tid, same reasoning as PLAYERS/GAMES. Doesn't fit the seasons
// subcollection's PER_YEAR_FIELDS/PER_TEAM_YEAR_FIELDS shape (it's the
// single CURRENT plan, not year-scoped history), so it gets its own small
// subcollection instead. Flagged by the main-doc size guard: a whole-league
// CFB27 sync writes every team's plan at once (~143 tids), which had grown
// into a meaningful fraction of the 1 MiB cap despite being assumed "small"
// when first written.
const TEAM_FUTURE_SUBCOLLECTION = 'teamFuture'

// Batch size limit for Firestore (max 500 per batch)
const BATCH_SIZE = 450

// Firestore's per-document cap (1 MiB) is NOT the only limit that matters for
// a batch write — the whole commit also has to fit under Firestore's request
// message-size ceiling (~11 MiB). A fixed 450-doc BATCH_SIZE assumes docs stay
// small; once games start carrying embedded box scores (every player's stat
// line, per game) or players carry enough season history, 450 of them in one
// commit can blow the request-size ceiling even though no individual doc is
// anywhere near the 1 MiB cap. Group into commits bounded by BOTH the doc
// count and the total serialized byte size.
//
// Budget set well below the ~11 MiB wire limit, NOT just under it. A batch
// estimated at 8 MiB via plain JSON.stringify().length still hit the real
// server-side cap in production (confirmed: the exact same "exceeds the
// limit: 11534336 bytes" error, on data that should have chunked safely
// under an 8 MiB budget) — JSON.stringify().length isn't what Firestore
// actually charges (an integer costs a fixed 8 bytes there regardless of
// its text length, etc.), so an "8 MiB" estimate could be a real document
// well past that. Callers now pass firestoreDocSize (src/utils/
// firestoreSize.js) — Firestore's own documented per-document size
// formula — instead of a raw stringify length, which closes most of that
// gap. 3 MiB is kept anyway as a real margin on top of that accurate
// number, not a guess compensating for an inaccurate one: this only has to
// absorb genuine wire-protocol overhead the storage-size formula doesn't
// cover (each write's document path/resource name, request envelope), which
// is on the order of tens of bytes per document, not megabytes.
const MAX_BATCH_BYTES = 3 * 1024 * 1024
function chunkForFirestoreBatch(items, sizeOf) {
  const chunks = []
  let current = []
  let currentBytes = 0
  for (const item of items) {
    const itemBytes = sizeOf(item)
    if (current.length > 0 && (current.length >= BATCH_SIZE || currentBytes + itemBytes > MAX_BATCH_BYTES)) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(item)
    currentBytes += itemBytes
  }
  if (current.length > 0) chunks.push(current)
  console.log(`[chunkForFirestoreBatch] ${items.length} item(s) -> ${chunks.length} batch(es), largest ~${(Math.max(...chunks.map(c => c.reduce((s, it) => s + sizeOf(it), 0)), 0) / 1e6).toFixed(2)} MB`)
  return chunks
}

/**
 * Recursively sanitize an object for Firestore
 * - Removes empty string keys (Firestore doesn't allow them)
 * - Removes undefined values (Firestore doesn't allow them)
 * - Converts undefined to null in arrays to preserve indices
 * @param {any} obj - The object to sanitize
 * @returns {any} - The sanitized object
 */
function sanitizeForFirestore(obj) {
  if (obj === null) return null
  if (obj === undefined) return null // Convert undefined to null at top level
  if (Array.isArray(obj)) {
    // For arrays, convert undefined to null to preserve indices
    return obj.map(item => item === undefined ? null : sanitizeForFirestore(item))
  }
  if (typeof obj === 'object') {
    // Handle Date objects
    if (obj instanceof Date) return obj
    // Handle Firestore Timestamp objects
    if (obj.toDate && typeof obj.toDate === 'function') return obj

    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip empty string keys
      if (key === '') continue
      // Skip undefined values entirely (don't include in result)
      if (value === undefined) continue
      result[key] = sanitizeForFirestore(value)
    }
    return result
  }
  // Firestore rejects NaN / Infinity / -Infinity and fails the ENTIRE
  // batch write if any field carries one (e.g. a 0-attempt stat that
  // divided to NaN). Coerce non-finite numbers to null so one bad stat
  // can't block saving a whole roster (audit H7).
  if (typeof obj === 'number' && !Number.isFinite(obj)) return null
  return obj
}

// Get all dynasties for a specific user
export async function getUserDynasties(userId) {
  try {
    const q = query(
      collection(db, DYNASTIES_COLLECTION),
      where('userId', '==', userId)
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => {
      const data = doc.data()
      // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
      const { id: _, ...cleanData } = data
      return {
        id: doc.id,  // Always use Firestore document ID
        ...cleanData
      }
    })
  } catch (error) {
    console.error('Error fetching dynasties:', error)
    throw error
  }
}

// Resubscribing onSnapshot wrapper: when the SDK invokes a listener's error
// handler the listener is TERMINATED and never auto-reconnects — a transient
// `unavailable`, an auth-token hiccup, or a rules deploy would silently kill
// realtime sync for the rest of the session (writes still "succeed" locally,
// so two editors could diverge without ever knowing). Re-subscribe with
// exponential backoff instead. Returns an unsubscribe that also cancels any
// pending retry.
function resubscribingSnapshot(makeQuery, onSnap, label) {
  let stopped = false
  let retryTimer = null
  let attempt = 0
  let unsubscribe = () => {}
  const start = () => {
    if (stopped) return
    unsubscribe = onSnapshot(makeQuery(), (snapshot) => {
      attempt = 0 // healthy again — reset backoff
      onSnap(snapshot)
    }, (error) => {
      console.error(`Error in ${label} subscription (will resubscribe):`, error?.code || error)
      if (stopped) return
      const delay = Math.min(5000 * 2 ** attempt, 120000) // 5s → 2min cap
      attempt++
      retryTimer = setTimeout(start, delay)
    })
  }
  start()
  return () => {
    stopped = true
    if (retryTimer) clearTimeout(retryTimer)
    unsubscribe()
  }
}

// Subscribe to real-time updates for user's dynasties
export function subscribeToDynasties(userId, callback) {
  return resubscribingSnapshot(
    () => query(collection(db, DYNASTIES_COLLECTION), where('userId', '==', userId)),
    (snapshot) => {
      const dynasties = snapshot.docs.map(doc => {
        const data = doc.data()
        // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
        const { id: _, ...cleanData } = data
        return {
          id: doc.id,  // Always use Firestore document ID
          ...cleanData
        }
      })
      callback(dynasties)
    },
    'dynasties'
  )
}

/**
 * Subscribe to dynasties the user has been granted edit access to but
 * doesn't own. Owner-side dynasties arrive via subscribeToDynasties;
 * this fills in the rest. Callers should dedupe by id since `editors`
 * may include the owner's uid (some dynasties auto-include the owner
 * for rule simplicity).
 */
export function subscribeToSharedDynasties(userId, callback) {
  if (!userId) {
    callback([])
    return () => {}
  }
  return resubscribingSnapshot(
    () => query(collection(db, DYNASTIES_COLLECTION), where('editors', 'array-contains', userId)),
    (snapshot) => {
      const dynasties = snapshot.docs.map(doc => {
        const data = doc.data()
        const { id: _, ...cleanData } = data
        return { id: doc.id, ...cleanData }
      })
      callback(dynasties)
    },
    'shared-dynasties'
  )
}

// Create a new dynasty
export async function createDynasty(userId, dynastyData) {
  try {
    // Sanitize data to remove undefined values (Firestore doesn't allow them)
    const sanitizedData = sanitizeForFirestore(dynastyData)

    const docRef = await addDoc(collection(db, DYNASTIES_COLLECTION), {
      ...sanitizedData,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    return {
      id: docRef.id,
      ...sanitizedData,
      userId
    }
  } catch (error) {
    console.error('Error creating dynasty:', error)
    throw error
  }
}

// Update an existing dynasty
export async function updateDynasty(dynastyId, updates) {
  try {
    const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)

    // Sanitize data to remove undefined values (Firestore doesn't allow them)
    const sanitizedUpdates = sanitizeForFirestore(updates)

    await updateDoc(docRef, {
      ...sanitizedUpdates,
      updatedAt: serverTimestamp()
    })
  } catch (error) {
    console.error('Error updating dynasty:', error)
    throw error
  }
}

/**
 * Add the redeeming user to a dynasty's editors[] via the redemption rule.
 *
 * The Firestore redemption rule (see firestore.rules) is strict: it allows
 * ONLY `editors` and `lastRedemption` to change in this write, and requires
 * the new editors[] to be the old list with EXACTLY this uid appended. So we
 * must NOT go through updateDynasty() (which appends `updatedAt` and would
 * blow the `affectedKeys().hasOnly([...])` check), and we must NOT reconstruct
 * editors[] client-side (the joiner can't read the doc, so they don't know the
 * current list). `arrayUnion(uid)` resolves server-side to old+[uid], which
 * satisfies the size()+1 and "uid in editors" checks without a prior read.
 */
export async function addEditorViaRedemption(dynastyId, uid, token) {
  const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  await updateDoc(docRef, {
    editors: arrayUnion(uid),
    lastRedemption: { uid, token, at: Date.now() },
  })
}

/**
 * Remove the calling user from a shared dynasty they don't own ("leave").
 *
 * This is what a NON-OWNER's "delete" must do instead of the destructive
 * teardown: a non-owner can't delete the parent doc (owner-only rule) and
 * can only delete a subset of the subcollections, so running the teardown
 * would partially wipe the OWNER's dynasty and then fail. Leaving just drops
 * this uid from editors[] / coCommishes[] / memberTeams{uid}; the shared-
 * dynasty listener (editors array-contains uid) then removes it from their
 * list. Allowed by the editor-update rule (userId unchanged; the rule checks
 * the OLD editors list, where this uid still appears).
 */
export async function leaveDynasty(dynastyId, uid) {
  const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  await updateDoc(docRef, {
    editors: arrayRemove(uid),
    coCommishes: arrayRemove(uid),
    [`memberTeams.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// ─── Atomic member management ─────────────────────────────────────
// These mutate ONLY the membership fields and use arrayUnion/arrayRemove
// + per-uid dot-notation so two managers acting at once can't clobber
// each other's change (the whole-array overwrites via updateDynasty were
// last-write-wins — audit H5). They write the dynasty doc directly, so
// the real-time listener carries the change back into local state.

/** Add a uid to editors[] (idempotent — arrayUnion no-ops if present). */
export async function addEditorAtomic(dynastyId, uid) {
  await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), {
    editors: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  })
}

/** Remove a member entirely: editors, co-commish, and their per-uid metadata. */
export async function removeMemberAtomic(dynastyId, uid) {
  await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), {
    editors: arrayRemove(uid),
    coCommishes: arrayRemove(uid),
    [`memberTeams.${uid}`]: deleteField(),
    [`memberLabels.${uid}`]: deleteField(),
    [`memberPhotos.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

/** Promote (isCo=true) or demote (isCo=false) a uid in coCommishes[]. */
export async function setCoCommishAtomic(dynastyId, uid, isCo) {
  await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), {
    coCommishes: isCo ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Set a single member's live team list (and optionally their per-year
 * history slot) with per-uid dot-notation so a concurrent assignment to a
 * DIFFERENT member can't wipe this one. `tids` is the full replacement
 * list for this uid; pass [] to clear. When `historyForUid` is provided it
 * replaces only this uid's memberTeamHistory entry. To also strip the tid
 * from a previous holder (one-coach-per-team), pass their uid+list in
 * `alsoClear` as { [uid]: tids }; pass their re-stamped per-year history in
 * `alsoHistory` as { [uid]: historyForUid } so the stripped team stops
 * attributing the current year's games to them as well.
 */
export async function setMemberTeamsAtomic(dynastyId, uid, tids, historyForUid, alsoClear, alsoHistory) {
  const updates = {
    [`memberTeams.${uid}`]: tids,
    updatedAt: serverTimestamp(),
  }
  if (historyForUid !== undefined) updates[`memberTeamHistory.${uid}`] = historyForUid
  if (alsoClear) {
    for (const [otherUid, otherTids] of Object.entries(alsoClear)) {
      updates[`memberTeams.${otherUid}`] = otherTids
    }
  }
  if (alsoHistory) {
    for (const [otherUid, otherHistory] of Object.entries(alsoHistory)) {
      if (otherHistory !== undefined) updates[`memberTeamHistory.${otherUid}`] = otherHistory
    }
  }
  await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), updates)
}

/**
 * Register a local-coach seat (a separately tracked coaching career a
 * single user controls). Writes the registry entry plus an initial
 * display label via per-id dot-notation so it can't clobber another
 * manager's concurrent membership write.
 */
export async function addLocalCoachAtomic(dynastyId, localId, ownerUid, createdAt, label) {
  const updates = {
    [`localCoaches.${localId}`]: { owner: ownerUid || null, createdAt: createdAt ?? null },
    updatedAt: serverTimestamp(),
  }
  if (label) updates[`memberLabels.${localId}`] = label
  await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), updates)
}

/**
 * Delete a local-coach seat and ALL of its per-id metadata (label, teams,
 * photo, staff, and team history). Unlike removeMemberAtomic — which keeps
 * a departed real member's history so their past career still renders —
 * a local coach is a user-created seat, so a full delete is the intent.
 * Per-id deleteField() so it never disturbs other coaches' entries.
 */
export async function removeLocalCoachAtomic(dynastyId, localId) {
  await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), {
    [`localCoaches.${localId}`]: deleteField(),
    [`memberTeams.${localId}`]: deleteField(),
    [`memberLabels.${localId}`]: deleteField(),
    [`memberPhotos.${localId}`]: deleteField(),
    [`memberCoachingStaff.${localId}`]: deleteField(),
    [`memberTeamHistory.${localId}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// ─── Invite tokens ───────────────────────────────────────────────
// Stored as token-keyed docs in dynasties/{id}/invites/{token}.
// Firestore rules:
//   - get  : any signed-in user (URL-shared)
//   - list : denied (no enumeration)
//   - create/delete : editors only
//   - update : redemption only (any signed-in user can mark themselves
//              redeemed once on an unredeemed unexpired invite)
//
// See firestore.rules for the gory details.

/**
 * Create an invite doc. `invite.token` is the doc ID.
 *   { token, role, createdBy, createdAt, expiresAt?, label?,
 *     redeemedBy: null, redeemedAt: null }
 */
export async function createInviteDoc(dynastyId, invite) {
  if (!invite?.token) throw new Error('createInviteDoc: missing token')
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, invite.token)
  const payload = sanitizeForFirestore({
    role: invite.role || 'member',
    createdBy: invite.createdBy || null,
    createdAt: serverTimestamp(),
    expiresAt: invite.expiresAt ?? null,
    label: invite.label ?? null,
    redeemedBy: null,
    redeemedAt: null,
  })
  await setDoc(ref, payload)
  return invite.token
}

/** Read one invite by token. Returns null if not found. */
export async function getInviteDoc(dynastyId, token) {
  if (!token) return null
  const snap = await getDoc(doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, token))
  if (!snap.exists()) return null
  return { token: snap.id, ...snap.data() }
}

/** List ALL invite docs for a dynasty (editors only — server rule denies list). */
export async function listInviteDocs(dynastyId) {
  const colRef = collection(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION)
  const snap = await getDocs(colRef)
  return snap.docs.map(d => ({ token: d.id, ...d.data() }))
}

/**
 * Subscribe to invites changes. Used by the Members page so the
 * pending-invites list updates when the commish revokes one or a new
 * one is generated.
 */
export function subscribeToInvites(dynastyId, callback) {
  if (!dynastyId) return () => {}
  const colRef = collection(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION)
  return onSnapshot(
    colRef,
    (snap) => callback(snap.docs.map(d => ({ token: d.id, ...d.data() }))),
    (err) => {
      console.error('[subscribeToInvites] failed:', err)
      callback([])
    },
  )
}

/** Revoke an invite — editors only. */
export async function deleteInviteDoc(dynastyId, token) {
  if (!token) return
  await deleteDoc(doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, token))
}

/**
 * Mark an invite redeemed by `uid`. Step 1 of the two-phase join. The
 * follow-up call (claimEditorSlot) appends uid to the dynasty's
 * editors[]. The Firestore rule on the invite doc enforces:
 *   - was unredeemed
 *   - was unexpired
 *   - the new redeemedBy MUST equal request.auth.uid
 *   - only redeemedBy/redeemedAt are changing
 */
export async function redeemInviteDoc(dynastyId, token, uid) {
  if (!token || !uid) throw new Error('redeemInviteDoc: missing token or uid')
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, INVITES_SUBCOLLECTION, token)
  await updateDoc(ref, {
    redeemedBy: uid,
    redeemedAt: serverTimestamp(),
  })
}

// Delete a dynasty
export async function deleteDynasty(dynastyId) {
  try {
    await deleteDoc(doc(db, DYNASTIES_COLLECTION, dynastyId))
  } catch (error) {
    console.error('Error deleting dynasty:', error)
    throw error
  }
}

// Get a single dynasty by ID
export async function getDynasty(dynastyId) {
  try {
    const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const data = docSnap.data()
      // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
      const { id: _, ...cleanData } = data
      return {
        id: docSnap.id,  // Always use Firestore document ID
        ...cleanData
      }
    }
    return null
  } catch (error) {
    console.error('Error fetching dynasty:', error)
    throw error
  }
}

// Get a public dynasty by share code (no authentication required)
export async function getPublicDynastyByShareCode(shareCode) {
  try {
    // Filter on BOTH shareCode and isPublic. This is required for security:
    // an unauthenticated `list` query is only permitted if the rules can
    // PROVE every result is readable, and the public read rule gates on
    // `isPublic == true` — so the query must constrain isPublic or Firestore
    // rejects it with permission-denied (which is what broke every /view link
    // when this filter was removed). Two equality filters need no composite
    // index — Firestore serves equality-only multi-field queries from the
    // auto-created single-field indexes.
    const q = query(
      collection(db, DYNASTIES_COLLECTION),
      where('shareCode', '==', shareCode),
      where('isPublic', '==', true)
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return null
    }

    const docSnap = snapshot.docs[0]
    const data = docSnap.data()

    // Sharing must be explicitly enabled — treat missing field as disabled
    if (!data.isPublic) {
      return null
    }

    // Remove any 'id' field from data to avoid conflicts with Firestore doc ID
    const { id: _, ...cleanData } = data
    return {
      id: docSnap.id,
      ...cleanData
    }
  } catch (error) {
    console.error('Error fetching public dynasty:', error)
    throw error
  }
}

// Generate a unique share code
export function generateShareCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// Migrate local data (localStorage and IndexedDB) to Firestore for a user
export async function migrateLocalStorageData(userId) {
  try {
    // Check both localStorage (legacy) and IndexedDB (new) for data to migrate
    const localStorageData = localStorage.getItem('cfb-dynasties')
    const indexedDBData = await indexedDBStorage.getDynasties()

    // Combine data sources, preferring IndexedDB if both exist
    let dynasties = []
    if (indexedDBData && indexedDBData.length > 0) {
      dynasties = indexedDBData
    } else if (localStorageData) {
      dynasties = JSON.parse(localStorageData)
    }

    if (dynasties.length === 0) return []

    const migratedDynasties = []

    for (const dynasty of dynasties) {
      // Remove the old ID and let Firestore generate new ones
      const { id, ...dynastyData } = dynasty
      const newDynasty = await createDynasty(userId, dynastyData)
      migratedDynasties.push(newDynasty)
    }

    // Clear local storage after successful migration
    localStorage.removeItem('cfb-dynasties')
    await indexedDBStorage.clearAll()

    return migratedDynasties
  } catch (error) {
    console.error('Error migrating local data:', error)
    throw error
  }
}

// ============================================================================
// SUBCOLLECTION FUNCTIONS - Players and Games stored in separate collections
// ============================================================================

/**
 * Get all players from the players subcollection.
 *
 * Uses `getDocs()` so the SDK can serve from its local cache when the
 * cached version matches the server, and only round-trips when fresh
 * data is genuinely needed. The previous version used
 * `getDocsFromServer()` to defeat a stale-cache bug seen during the
 * one-time subcollection migration; that migration is long done, but
 * the forced server fetch was still firing on every dynasty open and
 * adding 5–30s of cold-start latency on mobile (where Firestore
 * deserialization is slower and the payload can be multiple MB).
 *
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Array>} Array of player objects
 */
/**
 * Authoritative count of docs in a dynasty subcollection, read straight from
 * the SERVER (not the cache). Uses Firestore's aggregate count — billed as a
 * single read regardless of collection size. Used to verify a local→cloud
 * migration actually landed before the local copy is deleted.
 * @param {string} dynastyId
 * @param {string} subcollectionName e.g. 'players', 'games', 'recruitingDatabase'
 * @returns {Promise<number>}
 */
export async function getSubcollectionServerCount(dynastyId, subcollectionName) {
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, subcollectionName)
  const snap = await getCountFromServer(ref)
  return snap.data().count
}

export async function getPlayersSubcollection(dynastyId, options = {}) {
  const { onFresh = null, serverFirst = false } = options
  const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)

  // serverFirst: destructive one-shot flows (cloud→local migration) must read
  // SERVER truth, never a possibly-stale cache — a stale cache here would get
  // persisted locally and the fresher cloud copy deleted. Throws on failure so
  // the caller aborts instead of proceeding with partial data.
  if (serverFirst) {
    const snap = await getDocsFromServer(playersRef)
    return snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
  }

  // Cache-first read: try the local IndexedDB cache before going to the
  // network. Default getDocs() is server-priority and blocks on slow
  // connections — that's what made clicking into a dynasty hang for
  // minutes on mobile despite persistentLocalCache being enabled
  // (onSnapshot serves from cache, but getDocs does not by default).
  //
  // Cross-device staleness fix: when the cache hits, ALSO fire a
  // background server fetch and propagate the fresh result via
  // onFresh(). Without that callback the previous code dropped the
  // server result on the floor — meaning a save made on Device A
  // never reached Device B until something else evicted the cache.
  // Caller updates React state in onFresh so the UI catches up the
  // moment the network returns.
  try {
    const cachedSnap = await getDocsFromCache(playersRef)
    if (!cachedSnap.empty) {
      const cached = cachedSnap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
      // Only pay for the background server read when a caller actually wants the
      // fresh result. Without onFresh the result was discarded anyway, so firing
      // getDocsFromServer billed a full-collection read for nothing.
      if (onFresh) {
        const requestedAt = Date.now()
        getDocsFromServer(playersRef).then(snap => {
          const fresh = snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
          try { onFresh(fresh, { requestedAt }) } catch (e) { console.error('onFresh callback threw:', e) }
        }).catch(() => {})
      }
      return cached
    }
  } catch (_) {
    // Cache unavailable (Safari private mode, IndexedDB blocked, first
    // open before cache seeded) — fall through to the network.
  }

  try {
    // The cache-empty case above is exactly what happens the FIRST time a
    // given session touches this dynasty's players (e.g. editing a sibling
    // dynasty's scouted recruit from the shared Recruiting Database) — a
    // bare getDocs() here is server-priority with no timeout, so a slow or
    // blocked connection hangs this call (and everything awaiting it, like
    // a Save button) forever with no error. Race it against a timeout so a
    // bad connection surfaces as a catchable error instead of an infinite
    // "Saving…" — callers already fall back to dynasty.players on failure.
    const snapshot = await Promise.race([
      getDocs(playersRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out loading players — check your connection and try again.')), 15000)),
    ])
    return snapshot.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
  } catch (error) {
    console.error('Error fetching players subcollection:', error)
    throw error
  }
}

/**
 * Get all games from the games subcollection
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Array>} Array of game objects
 */
export async function getGamesSubcollection(dynastyId, options = {}) {
  const { onFresh = null, serverFirst = false } = options
  const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)

  // serverFirst — see comment in getPlayersSubcollection.
  if (serverFirst) {
    const snap = await getDocsFromServer(gamesRef)
    return snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
  }

  // Cache-first — see comment in getPlayersSubcollection. The onFresh
  // callback is how cross-device updates (recap saved on Device A,
  // viewed on Device B) propagate: the cached read returns instantly
  // for the fast initial paint, and the background server fetch
  // pushes any newer data into React state once it returns.
  try {
    const cachedSnap = await getDocsFromCache(gamesRef)
    if (!cachedSnap.empty) {
      const cached = cachedSnap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
      // Only pay for the server read when a caller wants the fresh result.
      if (onFresh) {
        const requestedAt = Date.now()
        getDocsFromServer(gamesRef).then(snap => {
          const fresh = snap.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
          try { onFresh(fresh, { requestedAt }) } catch (e) { console.error('onFresh callback threw:', e) }
        }).catch(() => {})
      }
      return cached
    }
  } catch (_) {
    // Fall through to network.
  }

  try {
    const snapshot = await getDocs(gamesRef)
    return snapshot.docs.map(d => ({ ...d.data(), _firestoreId: d.id }))
  } catch (error) {
    console.error('Error fetching games subcollection:', error)
    throw error
  }
}

/**
 * Bump the dynasty main doc's `lastModified` field in the same writeBatch
 * as a subcollection write. This is the cross-device-sync trigger:
 * subscribeToDynasties listens to the MAIN doc; subcollection writes
 * alone don't fire it, so without this bump Device B never learns
 * about a save Device A made to the games / players / weekRecaps
 * subcollections. Adding the update to the batch keeps the whole
 * thing atomic — either everything lands or nothing does — and adds
 * zero round-trips because batches are one network call.
 */
function bumpDynastyLastModifiedInBatch(batch, dynastyId) {
  const mainDocRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  batch.update(mainDocRef, { lastModified: Date.now() })
}

// Like the above, but also stamps socialUpdatedAt. Other devices watch this
// field to know the social universe changed (import/edit/delete/posts) and
// re-fetch the social subcollections — there's no live listener on them.
function bumpSocialUpdatedAtInBatch(batch, dynastyId) {
  const mainDocRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  const now = Date.now()
  batch.update(mainDocRef, { lastModified: now, socialUpdatedAt: now })
}

/**
 * Save a single player to the players subcollection
 * Uses player.pid as document ID for consistent updates
 * This is the EFFICIENT method for single-player updates (1 write instead of N)
 * @param {string} dynastyId - The dynasty document ID
 * @param {Object} player - The player object (must have pid)
 */
export async function savePlayerToSubcollection(dynastyId, player) {
  try {
    if (!player.pid) {
      throw new Error('Player must have a pid')
    }
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    // Remove _firestoreId before saving and sanitize
    const { _firestoreId, ...rawPlayerData } = player
    const playerData = sanitizeForFirestore(rawPlayerData)

    // CRITICAL: full set() (NOT merge) so deleted nested keys actually get
    // removed in Firestore. merge: true preserved keys the caller omitted —
    // including keys the user explicitly deleted in the editor (e.g. removing
    // teamsByYear[2034] from a player's career tab). That caused "player
    // reappears on the roster after reload" because the old year key survived
    // the write. Callers (updatePlayer) always pass the full player object,
    // so a full replace is safe and correct.
    console.log(`[savePlayerToSubcollection] WRITING ${player.pid} (${player.name}) — teamsByYear:`, JSON.stringify(playerData.teamsByYear))
    // writeBatch combines the player write + main-doc lastModified
    // bump into one atomic network call. Without the bump the
    // dynasty listener on other devices doesn't fire — see
    // bumpDynastyLastModifiedInBatch comment.
    const batch = writeBatch(db)
    batch.set(playerRef, playerData)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[savePlayerToSubcollection] COMMITTED ${player.pid} (${player.name}) to server`)
  } catch (error) {
    console.error('Error saving player to subcollection:', error)
    throw error
  }
}

/**
 * Save multiple players to the players subcollection using batch writes
 * IMPORTANT: Only deletes orphans if explicitly requested - partial updates are safe by default
 * @param {string} dynastyId - The dynasty document ID
 * @param {Array} players - Array of player objects
 * @param {Object} options - Optional settings
 * @param {boolean} options.deleteOrphans - If true, deletes players not in the array (use for full sync like merging duplicates)
 * @param {boolean} options.forceOverwrite - If true, skips safety checks (for explicit user actions like migration)
 */
export async function savePlayersToSubcollection(dynastyId, players, options = {}) {
  const { deleteOrphans = false, forceOverwrite = false, onProgress = null, removePids = null } = options

  try {
    // Handle empty array case - do nothing, don't delete existing players
    const playersToSave = players || []

    // Targeted removals (diff-based saves): the caller already knows exactly
    // which pids were removed, so delete just those docs — no full-collection
    // orphan scan (which billed a read per existing player on every save).
    const pidsToRemove = Array.isArray(removePids) ? removePids.map(String).filter(Boolean) : []

    // SAFETY: Never save an empty array unless forceOverwrite is true
    // Empty array usually indicates a bug, not intentional deletion.
    // (A pure-removal call — no upserts, only removePids — is legitimate.)
    if (playersToSave.length === 0 && pidsToRemove.length === 0 && !forceOverwrite) {
      console.warn('[savePlayersToSubcollection] Received empty players array - skipping to prevent data loss. Use forceOverwrite=true to override.')
      return
    }

    console.log(`[savePlayersToSubcollection] Saving ${playersToSave.length} players to dynasty ${dynastyId}${pidsToRemove.length ? ` (+${pidsToRemove.length} targeted removals)` : ''}`)

    if (pidsToRemove.length > 0) {
      for (let i = 0; i < pidsToRemove.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        pidsToRemove.slice(i, i + BATCH_SIZE).forEach(id => {
          batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, id))
        })
        await batch.commit()
      }
    }

    // Handle orphan cleanup if requested
    if (deleteOrphans) {
      const playersRef = collection(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION)
      const snapshot = await getDocs(playersRef)
      const existingIds = new Set(snapshot.docs.map(doc => doc.id))
      const existingCount = existingIds.size
      const newIds = new Set(playersToSave.filter(p => p.pid).map(p => String(p.pid)))
      const orphanedIds = [...existingIds].filter(id => !newIds.has(id))

      // CRITICAL SAFETY CHECK: Prevent accidental mass deletion
      // If we're about to delete more than 50% of existing players, refuse unless forced
      if (orphanedIds.length > 0 && existingCount > 50) {
        const deletionPercentage = (orphanedIds.length / existingCount) * 100
        if (deletionPercentage > 50 && !forceOverwrite) {
          console.error(`[savePlayersToSubcollection] SAFETY CHECK BLOCKED: Would delete ${orphanedIds.length} of ${existingCount} players (${deletionPercentage.toFixed(1)}%). This looks like a bug. Saving ${playersToSave.length} players WITHOUT orphan cleanup.`)
          console.error(`[savePlayersToSubcollection] To force deletion, use forceOverwrite: true`)
          // Continue WITHOUT deleting orphans - just save the new players
        } else {
          // Safe to delete
          console.log(`[savePlayersToSubcollection] Deleting ${orphanedIds.length} orphaned players (${deletionPercentage.toFixed(1)}% of ${existingCount})`)
          for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
            const batch = writeBatch(db)
            orphanedIds.slice(i, i + BATCH_SIZE).forEach(id => {
              batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, id))
            })
            await batch.commit()
          }
          await waitForPendingWrites(db)
        }
      } else if (orphanedIds.length > 0) {
        // Small deletion - safe to proceed
        console.log(`[savePlayersToSubcollection] Deleting ${orphanedIds.length} orphaned players`)
        for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
          const batch = writeBatch(db)
          orphanedIds.slice(i, i + BATCH_SIZE).forEach(id => {
            batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, id))
          })
          await batch.commit()
        }
        await waitForPendingWrites(db)
      }
    }

    // Dedupe by pid before batching: two entries sharing a pid would both
    // batch.set() the SAME doc — the second silently wins and the roster
    // shrinks by one on next load with no error anywhere. Last entry wins
    // (identical to Firestore's in-batch ordering) but now it's logged.
    {
      const pidCount = playersToSave.filter(p => p && p.pid).length
      const byPid = new Map()
      for (const p of playersToSave) { if (p && p.pid) byPid.set(String(p.pid), p) }
      if (byPid.size < pidCount) {
        console.warn(`[savePlayersToSubcollection] ${pidCount - byPid.size} duplicate pid(s) in save array — collapsed to one doc each (last entry wins)`)
      }
    }

    // Sanitize once up front so each player's byte size can be measured
    // before deciding batch membership (see chunkForFirestoreBatch above —
    // a batch of players carrying heavy per-year history/portraits can
    // exceed the request-size ceiling well before it hits the 450-doc cap).
    //
    // ALWAYS full replace (not merge). Firestore's merge mode recursively
    // merges nested objects, which means keys the caller INTENTIONALLY
    // removed (e.g. teamsByYear[2034] deleted from a player's career tab,
    // or stale keys trimmed by a migration) silently survive the write.
    // Callers always build a complete player object from the current
    // in-memory state, so a full replace is both safe and correct.
    // The `forceOverwrite` option is kept on this function for the
    // orphan-cleanup behavior above; individual player docs no longer
    // branch on it. See the matching comment in savePlayerToSubcollection.
    const preparedPlayers = []
    for (const player of playersToSave) {
      if (!player.pid) {
        console.warn('Skipping player without pid:', player.name)
        continue
      }
      const { _firestoreId, ...rawPlayerData } = player
      const playerData = sanitizeForFirestore(rawPlayerData)
      const bytes = firestoreDocSize(playerData)
      preparedPlayers.push({ pid: String(player.pid), data: playerData, bytes })
    }

    const playerChunks = chunkForFirestoreBatch(preparedPlayers, p => p.bytes)
    let playersSaved = 0
    for (let batchNum = 0; batchNum < playerChunks.length; batchNum++) {
      const chunk = playerChunks[batchNum]
      const batch = writeBatch(db)
      for (const p of chunk) {
        batch.set(doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, p.pid), p.data)
      }

      await batch.commit()
      playersSaved += chunk.length
      console.log(`[savePlayersToSubcollection] Batch ${batchNum + 1}/${playerChunks.length} committed locally (${chunk.length} players)`)
      // Report progress so the create UI can show a moving bar during a big seed.
      if (onProgress) {
        try { onProgress({ saved: playersSaved, total: preparedPlayers.length }) } catch (_) {}
      }

      // Add delay between batches to prevent "Write stream exhausted" error
      // Scale delay based on number of batches for large datasets
      if (batchNum + 1 < playerChunks.length) {
        const delayMs = playerChunks.length > 3 ? 300 : 200
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    console.log(`[savePlayersToSubcollection] All batches committed locally - waiting for server sync...`)

    // CRITICAL: Wait for pending writes to actually reach the server
    // batch.commit() only commits to local cache with offline persistence enabled
    // waitForPendingWrites ensures data is actually sent to Firestore server
    try {
      await waitForPendingWrites(db)
      console.log(`[savePlayersToSubcollection] ✓ Server sync confirmed - all writes acknowledged`)
    } catch (syncError) {
      console.error(`[savePlayersToSubcollection] ERROR: Server sync failed!`, syncError)
      throw new Error(`Failed to sync writes to server: ${syncError.message}`)
    }

    console.log(`[savePlayersToSubcollection] Successfully saved ${playersToSave.length} players to SERVER`)
  } catch (error) {
    console.error('Error saving players to subcollection:', error)
    throw error
  }
}

/**
 * Get every recruit in a dynasty's Recruiting Database (the imported/
 * database-only recruits — see recruitingDatabasePlayers everywhere else in
 * the app). One doc per recruit, keyed by pid, mirroring
 * getPlayersSubcollection — same cache-first read + onFresh callback for a
 * background server refresh, so a save made on one device shows up on
 * another without waiting for the local cache to get evicted.
 */
export async function getRecruitingDatabaseSubcollection(dynastyId, options = {}) {
  if (!dynastyId) return []
  const { onFresh = null, serverFirst = false } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, RECRUITING_DATABASE_SUBCOLLECTION)

  // serverFirst — see comment in getPlayersSubcollection.
  if (serverFirst) {
    const snap = await getDocsFromServer(ref)
    return snap.docs.map(d => d.data())
  }

  try {
    const cachedSnap = await getDocsFromCache(ref)
    if (!cachedSnap.empty) {
      const cached = cachedSnap.docs.map(d => d.data())
      // Only pay for the server read when a caller wants the fresh result.
      if (onFresh) {
        getDocsFromServer(ref).then(snap => {
          const fresh = snap.docs.map(d => d.data())
          try { onFresh(fresh) } catch (e) { console.error('onFresh callback threw:', e) }
        }).catch(() => {})
      }
      return cached
    }
  } catch (_) {
    // Cache unavailable — fall through to the network.
  }

  try {
    const snapshot = await Promise.race([
      getDocs(ref),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out loading the Recruiting Database — check your connection and try again.')), 15000)),
    ])
    return snapshot.docs.map(d => d.data())
  } catch (error) {
    console.error('Error fetching Recruiting Database subcollection:', error)
    throw error
  }
}

// Stable, key-order-independent serialization so an unchanged recruit compares
// equal to its stored copy regardless of the key order Firestore hands back.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}

/**
 * INCREMENTAL save for the Recruiting Database subcollection. Callers pass the
 * complete current list (import, batch edit, delete, JSON restore all rebuild
 * the whole array), but we only WRITE the docs that are new or actually changed
 * and only DELETE the ones removed — computed by diffing against the stored
 * copies. The previous version re-wrote every recruit on every save, which
 * doesn't scale: a heavy user building a 10k-recruit database would issue 10k
 * writes on every single add and blow past Firestore's queued-write ceiling
 * ("resource-exhausted: Write stream exhausted maximum allowed queued writes").
 * Now adding 19 recruits to 110 writes 19 docs, and editing one writes one.
 * Batched with the same inter-batch delay savePlayersToSubcollection uses, for
 * the rare case where the delta itself spans multiple Firestore batches.
 */
export async function saveRecruitingDatabaseSubcollection(dynastyId, players) {
  const toSave = (players || []).filter(p => p?.pid != null)
  try {
    const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, RECRUITING_DATABASE_SUBCOLLECTION)
    const existingSnapshot = await getDocs(ref)
    const existingById = new Map(existingSnapshot.docs.map(d => [d.id, d.data()]))
    const nextIds = new Set(toSave.map(p => String(p.pid)))
    const orphanedIds = [...existingById.keys()].filter(id => !nextIds.has(id))

    // Only new or content-changed recruits. _firestoreId is a client-only field
    // that never lands in Firestore, so strip it before both comparing and
    // writing (otherwise every recruit would look "changed").
    const changed = []
    for (const player of toSave) {
      const { _firestoreId, ...raw } = player
      const data = sanitizeForFirestore(raw)
      const prev = existingById.get(String(player.pid))
      if (!prev || stableStringify(data) !== stableStringify(prev)) {
        changed.push({ pid: String(player.pid), data })
      }
    }

    // Truly nothing to do — don't touch Firestore at all (no write, no bump).
    if (changed.length === 0 && orphanedIds.length === 0) return

    // Delete removed recruits (batched).
    for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      orphanedIds.slice(i, i + BATCH_SIZE).forEach(id => {
        batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, RECRUITING_DATABASE_SUBCOLLECTION, id))
      })
      await batch.commit()
    }

    // Write only the changed/new recruits (batched, small delay between batches
    // to stay under the same write-stream ceiling savePlayersToSubcollection
    // guards against).
    const totalBatches = Math.ceil(changed.length / BATCH_SIZE)
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      changed.slice(i, i + BATCH_SIZE).forEach(({ pid, data }) => {
        batch.set(doc(db, DYNASTIES_COLLECTION, dynastyId, RECRUITING_DATABASE_SUBCOLLECTION, pid), data)
      })
      // Bump the main doc's lastModified in the SAME batch as the last chunk so
      // other devices' dynasty listener notices the change.
      if (i + BATCH_SIZE >= changed.length) bumpDynastyLastModifiedInBatch(batch, dynastyId)
      await batch.commit()
      if (i + BATCH_SIZE < changed.length) {
        await new Promise(resolve => setTimeout(resolve, totalBatches > 3 ? 300 : 200))
      }
    }
    // Only orphans were deleted (no doc writes) — still bump lastModified so the
    // deletion propagates to other devices.
    if (changed.length === 0 && orphanedIds.length > 0) {
      const batch = writeBatch(db)
      bumpDynastyLastModifiedInBatch(batch, dynastyId)
      await batch.commit()
    }

    await waitForPendingWrites(db)
  } catch (error) {
    console.error('Error saving Recruiting Database subcollection:', error)
    throw error
  }
}

/**
 * One-time move of a dynasty's legacy main-doc recruitingDatabasePlayers
 * array into its own subcollection — same shape of migration already done
 * for weekRecapsByYear (see migrateWeekRecapsToSubcollection), same safety
 * rule: if the subcollection already has data, trust it and just clear the
 * legacy field rather than risk overwriting newer data with stale legacy
 * data. Idempotent — safe to call repeatedly/concurrently across devices.
 */
export async function migrateRecruitingDatabaseToSubcollection(dynastyId, legacyPlayers) {
  if (!Array.isArray(legacyPlayers) || legacyPlayers.length === 0) return
  const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  try {
    const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, RECRUITING_DATABASE_SUBCOLLECTION)
    const existingSnapshot = await getDocsFromServer(ref)
    if (!existingSnapshot.empty) {
      // Subcollection is already the authoritative copy — just drop the
      // stale legacy field, don't touch the subcollection's own data.
      await updateDoc(docRef, { recruitingDatabasePlayers: deleteField() })
      return
    }
  } catch (err) {
    console.warn(`[migrateRecruitingDatabaseToSubcollection] could not read existing subcollection — aborting to prevent data loss:`, err?.code || err?.message)
    return
  }
  await saveRecruitingDatabaseSubcollection(dynastyId, legacyPlayers)
  // Atomic field deletion shrinks the main doc immediately, same rationale
  // as the recap migration's own deleteField step.
  await updateDoc(docRef, { recruitingDatabasePlayers: deleteField() })
}

/**
 * Delete a player from the players subcollection
 * This is the EFFICIENT method for single-player deletes (1 delete instead of N writes)
 * @param {string} dynastyId - The dynasty document ID
 * @param {number|string} playerId - The player's pid
 */
export async function deletePlayerFromSubcollection(dynastyId, playerId) {
  try {
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(playerId))
    // Atomic delete + main-doc bump so other devices' listener fires.
    const batch = writeBatch(db)
    batch.delete(playerRef)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[deletePlayerFromSubcollection] Deleted player ${playerId} from server`)
  } catch (error) {
    console.error('Error deleting player from subcollection:', error)
    throw error
  }
}

/**
 * Save a single game to the games subcollection
 * Uses game.id as document ID for consistent updates
 * This is the EFFICIENT method for single-game updates (1 write instead of N)
 * @param {string} dynastyId - The dynasty document ID
 * @param {Object} game - The game object (must have id)
 */
// Strip stash fields and other underscore-prefixed transient fields
// before persisting a game record. The weekly-scores rank pass uses
// `_team1CurrentWeekRank` / `_team2CurrentWeekRank` to carry the
// user's entered rank from one step to the next, and they're meant
// to be deleted before the game is saved. Doing the strip at the
// service boundary too is defense-in-depth — any future caller path
// that bypasses the strip in saveWeeklyScores can't accidentally
// persist these fields.
function stripTransientGameFields(game) {
  if (!game || typeof game !== 'object') return game
  const cleaned = {}
  for (const [k, v] of Object.entries(game)) {
    if (k === '_firestoreId') continue
    if (k.startsWith('_team1CurrentWeekRank')) continue
    if (k.startsWith('_team2CurrentWeekRank')) continue
    cleaned[k] = v
  }
  return cleaned
}

export async function saveGameToSubcollection(dynastyId, game) {
  try {
    if (!game.id) {
      throw new Error('Game must have an id')
    }
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
    const rawGameData = stripTransientGameFields(game)
    const gameData = sanitizeForFirestore(rawGameData)

    // Atomic: game write + main-doc lastModified bump in one batch.
    // Without the bump, the dynasty listener on other devices never
    // fires for subcollection-only writes — that's the recap-saved-
    // on-laptop-but-missing-on-phone bug.
    const batch = writeBatch(db)
    batch.set(gameRef, gameData)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[saveGameToSubcollection] Saved game ${game.id} to server`)
  } catch (error) {
    console.error('Error saving game to subcollection:', error)
    throw error
  }
}

/**
 * Weekly-scores fast path: persist a small set of games that just got
 * inserted/replaced (the ~60-130 games for ONE week) plus optional
 * deletions, all in a single writeBatch.
 *
 * Why this exists: saveWeeklyScores was passing the FULL dynasty.games
 * array to updateDynasty, which routes through saveGamesToSubcollection
 * with deleteOrphans=true — a full-rewrite of every game in the
 * subcollection. On a multi-year dynasty (1000+ games) that produces
 * 1000+ setDoc calls, blowing past Firestore's offline-queue limit
 * and triggering the "Write stream exhausted maximum allowed queued
 * writes" error the user reported. The fix: only persist the games
 * that ACTUALLY changed in this save.
 *
 * Caller invariant: pass the games this save just produced (insert
 * or replace) AND the IDs of any games this save is removing
 * (typically: previously-stored weekly-scores rows for the same
 * week+team-pair that got rebuilt with fresh data). Don't pass the
 * full dynasty roster — this helper is for incremental writes.
 */
/**
 * Roster-history-style fast path: persist a small set of player docs
 * that just had targeted field updates (e.g. teamsByYear merges from
 * a Roster History Sheet sync). No orphan cleanup, no full rewrite.
 *
 * Pair this with a reference-diff in the caller (the .map() in
 * RosterHistoryModal returns the SAME ref for unchanged players, so
 * `updatedPlayers.filter((p, i) => p !== originalPlayers[i])` gives
 * you the exact set to persist).
 *
 * Single writeBatch for up to 500 players — covers any realistic
 * partial-roster-update flow without touching the rest of the
 * subcollection. Was previously routed through
 * savePlayersToSubcollection's full-rewrite path which fired
 * thousands of setDocs for a few-hundred-player change.
 */
export async function saveChangedPlayers(dynastyId, changedPlayers = []) {
  if (!Array.isArray(changedPlayers) || changedPlayers.length === 0) return

  // Defense-in-depth: clamp at 500 docs per batch (Firestore's hard
  // cap). Extremely unlikely to hit on partial roster updates, but a
  // pathological input shouldn't silently truncate.
  if (changedPlayers.length > 500) {
    throw new Error(`saveChangedPlayers: too many players (${changedPlayers.length}), cap is 500. Use savePlayersToSubcollection for full-roster writes.`)
  }

  const batch = writeBatch(db)
  let count = 0
  for (const player of changedPlayers) {
    if (!player?.pid) continue
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    const { _firestoreId: _fid, ...rawPlayer } = player
    batch.set(playerRef, sanitizeForFirestore(rawPlayer))
    count++
  }

  if (count === 0) return
  // Cross-device sync trigger — see bumpDynastyLastModifiedInBatch.
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
  await waitForPendingWrites(db)
  console.log(`[saveChangedPlayers] Wrote ${count} changed players in 1 batch`)
}

export async function saveWeeklyGamesChanges(dynastyId, gamesToSet = [], gameIdsToDelete = []) {
  const totalOps = (gamesToSet?.length || 0) + (gameIdsToDelete?.length || 0)
  if (totalOps === 0) return

  // CRITICAL: when an ID appears in BOTH gamesToSet and gameIdsToDelete,
  // we must NOT issue a delete for it — Firestore writeBatch executes
  // ops in submission order, and a later delete will wipe out a game
  // we just set in the same batch. saveWeeklyScores's existing-id-reuse
  // pattern (`id: existing?.id || idForGame(...)`) puts the same ID in
  // both arrays for any matchup that existed before AND exists now;
  // without this filter the new write got reverted by the trailing
  // delete, leaving only brand-new matchups in the subcollection. That
  // was the "games are gone" bug — Alabama Prince's Wk 4 re-save
  // tracked 62 games but only 3 actually persisted (the 2 new
  // matchups + the user-team game that uses a non-weekly id).
  const setIdSet = new Set()
  for (const game of gamesToSet || []) {
    if (game?.id) setIdSet.add(String(game.id))
  }
  const safeDeletes = (gameIdsToDelete || []).filter(id => id != null && !setIdSet.has(String(id)))

  // Firestore caps writeBatch at 500 ops. ~60-130 game inserts plus a
  // handful of deletions stays comfortably under that on every realistic
  // weekly slate; if that ever grows, split into multiple batches.
  const batch = writeBatch(db)

  for (const game of gamesToSet || []) {
    if (!game?.id) continue
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
    const rawGame = stripTransientGameFields(game)
    batch.set(gameRef, sanitizeForFirestore(rawGame))
  }

  for (const gameId of safeDeletes) {
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(gameId))
    batch.delete(gameRef)
  }

  // Cross-device sync trigger — see bumpDynastyLastModifiedInBatch.
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
  await waitForPendingWrites(db)
  console.log(`[saveWeeklyGamesChanges] Committed ${gamesToSet?.length || 0} sets + ${safeDeletes.length} deletes (${(gameIdsToDelete?.length || 0) - safeDeletes.length} delete-then-set duplicates filtered) in 1 batch`)
}

/**
 * Box-score-save fast path: persist exactly one game and a small set
 * of players (the ones whose stats actually changed because of the
 * incoming box score) in a single batched write.
 *
 * Why this exists: when the user saves a Sheet-driven box score
 * (player stats / scoring summary / team stats), addGame's downstream
 * `updateDynasty` was routing through `savePlayersToSubcollection` and
 * `saveGamesToSubcollection`. Those rewrite EVERY player and EVERY
 * game in the dynasty, with multi-batch delays + a `getDocsFromServer`
 * verify-read at the end. On a 5000-player / 1000-game dynasty that
 * was 30+ seconds per save even though only ~20-30 players actually
 * had any new stats. This helper writes just the affected docs and
 * skips the verify-read entirely; cost is O(changed players) instead
 * of O(all players).
 *
 * Single 30-doc writeBatch costs one round-trip total — cheaper than
 * Promise.all([savePlayer, savePlayer, ...]) which fires N setDocs in
 * parallel (each its own roundtrip).
 *
 * Caller invariant: changedPlayers must be a SUBSET of the dynasty's
 * roster — pass only entries whose reference moved between the
 * pre-processBoxScoreSave and post-processBoxScoreSave players arrays.
 * Don't use this for full-roster saves; orphan cleanup is intentionally
 * skipped.
 */
export async function saveChangedPlayersAndGame(dynastyId, changedPlayers, game) {
  if (!game?.id) {
    throw new Error('Game must have an id')
  }

  const batch = writeBatch(db)

  // The single game doc.
  const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(game.id))
  const { _firestoreId: _gFid, ...rawGame } = game
  batch.set(gameRef, sanitizeForFirestore(rawGame))

  // Each changed player. Skip entries without a pid (defensive — same
  // guard savePlayersToSubcollection has).
  let playerCount = 0
  for (const player of changedPlayers || []) {
    if (!player?.pid) continue
    const playerRef = doc(db, DYNASTIES_COLLECTION, dynastyId, PLAYERS_SUBCOLLECTION, String(player.pid))
    const { _firestoreId: _pFid, ...rawPlayer } = player
    batch.set(playerRef, sanitizeForFirestore(rawPlayer))
    playerCount++
  }

  // Cross-device sync trigger — see bumpDynastyLastModifiedInBatch.
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
  // Single waitForPendingWrites covers the whole batch.
  await waitForPendingWrites(db)
  console.log(`[saveChangedPlayersAndGame] Wrote 1 game + ${playerCount} changed players in one batch`)
}

/**
 * Save multiple games to the games subcollection using batch writes
 * IMPORTANT: Only deletes orphans if explicitly requested - partial updates are safe by default
 * @param {string} dynastyId - The dynasty document ID
 * @param {Array} games - Array of game objects
 * @param {Object} options - Optional settings
 * @param {boolean} options.deleteOrphans - If true, deletes games not in the array (DANGEROUS - only use for full sync)
 * @param {boolean} options.forceDeleteOrphans - If true, bypasses safety check (EXTREMELY DANGEROUS - only for explicit user actions)
 */
export async function saveGamesToSubcollection(dynastyId, games, options = {}) {
  const { deleteOrphans = false, forceDeleteOrphans = false, removeIds = null } = options

  try {
    // Handle empty array case
    const gamesToSave = games || []

    // Targeted removals (diff-based saves): delete exactly the ids the
    // caller knows were removed — no full-collection orphan scan.
    const idsToRemove = Array.isArray(removeIds) ? removeIds.map(String).filter(Boolean) : []
    if (idsToRemove.length > 0) {
      console.log(`[saveGamesToSubcollection] Removing ${idsToRemove.length} games by id (targeted)`)
      for (let i = 0; i < idsToRemove.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        idsToRemove.slice(i, i + BATCH_SIZE).forEach(id => {
          batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, id))
        })
        await batch.commit()
      }
    }

    // Only check for orphans if explicitly requested (full sync operations only)
    if (deleteOrphans) {
      // Get current IDs in subcollection to find orphans
      const gamesRef = collection(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION)
      const snapshot = await getDocs(gamesRef)
      const existingIds = new Set(snapshot.docs.map(doc => doc.id))
      const existingCount = existingIds.size

      // Get IDs we're about to save
      const newIds = new Set(gamesToSave.filter(g => g.id).map(g => String(g.id)))

      // Find orphaned IDs (exist in subcollection but not in our save list)
      const orphanedIds = [...existingIds].filter(id => !newIds.has(id))

      // CRITICAL SAFETY CHECK: Prevent accidental mass deletion.
      // Block if deleting > 30% of existing games (lowered from 50% — the
      // original threshold let a stale-state save silently delete a large
      // fraction of real games before the guard fired). Always require
      // forceDeleteOrphans for deletions that large.
      if (orphanedIds.length > 0) {
        const deletionPercentage = existingCount > 0 ? (orphanedIds.length / existingCount) * 100 : 0
        if (deletionPercentage > 30 && !forceDeleteOrphans) {
          console.error(`[saveGamesToSubcollection] SAFETY CHECK BLOCKED: Would delete ${orphanedIds.length} of ${existingCount} games (${deletionPercentage.toFixed(1)}%). This looks like a stale-state write. Saving ${gamesToSave.length} games WITHOUT orphan cleanup.`)
          console.error(`[saveGamesToSubcollection] To force deletion, use forceDeleteOrphans: true`)
          // Continue WITHOUT deleting orphans - just save the new games
        } else {
          // Safe to delete - small percentage or explicitly forced
          console.log(`[saveGamesToSubcollection] Deleting ${orphanedIds.length} orphaned game documents (deleteOrphans=true, ${deletionPercentage.toFixed(1)}% of ${existingCount})`)
          for (let i = 0; i < orphanedIds.length; i += BATCH_SIZE) {
            const batch = writeBatch(db)
            const batchIds = orphanedIds.slice(i, i + BATCH_SIZE)

            for (const id of batchIds) {
              const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, id)
              batch.delete(gameRef)
            }

            await batch.commit()
          }
        }
      }
    }

    // Save games (skip if empty)
    if (gamesToSave.length === 0) return

    // Surface duplicate ids — see the matching check in
    // savePlayersToSubcollection (same silent last-wins collapse).
    {
      const idCount = gamesToSave.filter(g => g && g.id).length
      const uniqueIds = new Set(gamesToSave.filter(g => g && g.id).map(g => String(g.id)))
      if (uniqueIds.size < idCount) {
        console.warn(`[saveGamesToSubcollection] ${idCount - uniqueIds.size} duplicate game id(s) in save array — collapsed to one doc each (last entry wins)`)
      }
    }

    // Sanitize once up front so each game's byte size can be measured before
    // deciding batch membership (see chunkForFirestoreBatch above — a batch
    // of games carrying box scores can exceed the request-size ceiling well
    // before it hits the 450-doc count cap).
    const preparedGames = []
    for (const game of gamesToSave) {
      if (!game.id) {
        console.warn('Skipping game without id:', game)
        continue
      }
      // Remove _firestoreId before saving and sanitize to remove empty keys
      const { _firestoreId, ...rawGameData } = game
      const gameData = sanitizeForFirestore(rawGameData)
      const bytes = firestoreDocSize(gameData)
      preparedGames.push({ id: String(game.id), data: gameData, bytes })
    }

    const gameChunks = chunkForFirestoreBatch(preparedGames, g => g.bytes)
    for (let batchNum = 0; batchNum < gameChunks.length; batchNum++) {
      const chunk = gameChunks[batchNum]
      const batch = writeBatch(db)
      for (const g of chunk) {
        batch.set(doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, g.id), g.data)
      }
      await batch.commit()

      // Add delay between batches to prevent "Write stream exhausted" error
      // — same protection savePlayersToSubcollection already has, and the
      // same reason it's needed here: box scores make games batches large
      // and numerous enough on a fully-synced dynasty (confirmed in
      // production: a 933-game sync across 5 batches hit exactly this
      // error with no pacing between commits).
      if (batchNum + 1 < gameChunks.length) {
        const delayMs = gameChunks.length > 3 ? 300 : 200
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  } catch (error) {
    console.error('Error saving games to subcollection:', error)
    throw error
  }
}

/**
 * Delete a game from the games subcollection
 * This is the EFFICIENT method for single-game deletes (1 delete instead of N writes)
 * @param {string} dynastyId - The dynasty document ID
 * @param {string} gameId - The game's id
 */
export async function deleteGameFromSubcollection(dynastyId, gameId) {
  try {
    const gameRef = doc(db, DYNASTIES_COLLECTION, dynastyId, GAMES_SUBCOLLECTION, String(gameId))
    // Atomic delete + main-doc bump so other devices' listener fires.
    const batch = writeBatch(db)
    batch.delete(gameRef)
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()

    // Wait for server confirmation
    await waitForPendingWrites(db)
    console.log(`[deleteGameFromSubcollection] Deleted game ${gameId} from server`)
  } catch (error) {
    console.error('Error deleting game from subcollection:', error)
    throw error
  }
}

// ─── Team Future (Scheme Builder depth-chart plans) subcollection ──────
// One doc per tid, keyed by tid, mirroring PLAYERS/GAMES. Not seasons-
// subcollection material — see TEAM_FUTURE_SUBCOLLECTION's comment.

/**
 * Get every team's Scheme Builder depth-chart plan. Returns the same
 * `{ [tid]: data }` shape the main doc's `teamFuture` field always had, so
 * existing readers (SchemeBuilder.jsx, TeamOutlook.jsx) need no changes —
 * only the load path that hydrates `dynasty.teamFuture` needs to call this.
 */
export async function getTeamFutureSubcollection(dynastyId, options = {}) {
  const { onFresh = null } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, TEAM_FUTURE_SUBCOLLECTION)
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      const out = {}
      for (const d of cached.docs) out[d.id] = d.data()
      // Background refresh so a plan edited on another device shows up
      // without waiting for this cache entry to get evicted.
      if (onFresh) {
        getDocsFromServer(ref).then(snap => {
          const fresh = {}
          for (const d of snap.docs) fresh[d.id] = d.data()
          try { onFresh(fresh) } catch (e) { console.error('onFresh callback threw:', e) }
        }).catch(() => {})
      }
      return out
    }
  } catch (_) {
    // Cache unavailable — fall through to the network.
  }
  try {
    const snap = await getDocs(ref)
    const out = {}
    for (const d of snap.docs) out[d.id] = d.data()
    return out
  } catch (error) {
    console.error('Error fetching teamFuture subcollection:', error)
    return {}
  }
}

/**
 * Save the whole teamFuture object to its subcollection — one doc per tid,
 * full replace (not merge), matching savePlayersToSubcollection's own
 * reasoning: callers always pass the complete current state (SchemeBuilder's
 * per-team save spreads the existing object plus one tid's change; the
 * CFB27 sync passes every tid at once), so a full replace per doc is both
 * safe and correct — it can't leave a stale sub-key behind.
 */
export async function saveTeamFutureSubcollection(dynastyId, teamFuture) {
  const entries = Object.entries(teamFuture || {}).filter(([tid]) => tid)
  if (entries.length === 0) return
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const [tid, data] of entries.slice(i, i + BATCH_SIZE)) {
      batch.set(doc(db, DYNASTIES_COLLECTION, dynastyId, TEAM_FUTURE_SUBCOLLECTION, String(tid)), sanitizeForFirestore(data))
    }
    bumpDynastyLastModifiedInBatch(batch, dynastyId)
    await batch.commit()
  }
}

/**
 * One-time move of a dynasty's legacy main-doc teamFuture object into its
 * own subcollection — same shape of migration as
 * migrateRecruitingDatabaseToSubcollection, same safety rule: if the
 * subcollection already has data, trust it and just clear the legacy field
 * rather than risk overwriting newer data with stale legacy data.
 * Idempotent — safe to call repeatedly/concurrently across devices.
 */
export async function migrateTeamFutureToSubcollection(dynastyId, legacyTeamFuture) {
  if (!legacyTeamFuture || Object.keys(legacyTeamFuture).length === 0) return
  const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  try {
    const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, TEAM_FUTURE_SUBCOLLECTION)
    const existingSnapshot = await getDocsFromServer(ref)
    if (!existingSnapshot.empty) {
      // Subcollection is already the authoritative copy — just drop the
      // stale legacy field, don't touch the subcollection's own data.
      await updateDoc(docRef, { teamFuture: deleteField() })
      return
    }
  } catch (err) {
    console.warn(`[migrateTeamFutureToSubcollection] could not read existing subcollection — aborting to prevent data loss:`, err?.code || err?.message)
    return
  }
  await saveTeamFutureSubcollection(dynastyId, legacyTeamFuture)
  // Atomic field deletion shrinks the main doc immediately, same rationale
  // as the recruiting-database migration's own deleteField step.
  await updateDoc(docRef, { teamFuture: deleteField() })
}

// ─── Week Recaps subcollection ──────────────────────────────────────
// Recaps are AI-generated narrative text, often several KB each. Long-
// running dynasties were pushing the parent dynasty document past the
// 1 MB Firestore size cap (one beta doc was 1,051,303 bytes), at which
// point ALL writes to the dynasty document fail with INVALID_ARGUMENT
// — including totally unrelated saves like preseason setup. Storing
// each recap as its own doc keyed by `${year}-${week}` keeps the parent
// doc lean and lets recap volume scale freely.

const recapDocId = (year, week) => `${Number(year)}-${Number(week)}`

/**
 * Save a single week recap as its own subcollection doc.
 *
 * Three-step durability guarantee — beta users were reporting recaps
 * disappearing after closing and reopening the site, and the failure
 * mode for that is `setDoc` resolving as soon as the LOCAL cache is
 * updated while the server-side write fails (rules denial, expired
 * auth, network drop) and gets silently dropped:
 *   1. setDoc — write to local cache + queue server sync
 *   2. waitForPendingWrites — block until the SDK acks every pending
 *      write from the server
 *   3. read-back verify — fetch the doc fresh from the server (no
 *      cache) and confirm the `text` field is what we just wrote
 *
 * If verify fails, throw — WeekRecapModal's catch surfaces the actual
 * error code in the toast so the user knows the save didn't stick
 * (instead of seeing a fake success toast and losing the recap on
 * the next reload).
 */
export async function saveWeekRecapToSubcollection(dynastyId, year, week, recap) {
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION, recapDocId(year, week))
  const payload = sanitizeForFirestore({
    year: Number(year),
    week: Number(week),
    generatedAt: recap?.generatedAt ?? Date.now(),
    text: recap?.text || '',
  })

  // Atomic: recap write + main-doc lastModified bump in one batch
  // so subscribeToDynasties on Device B fires (subcollection-only
  // writes don't reach a main-doc listener). See
  // bumpDynastyLastModifiedInBatch.
  //
  // Performance note: we intentionally do NOT await waitForPendingWrites
  // or a read-back verify here. Those patterns add 2 extra network round
  // trips that made recap saves feel sluggish (800 ms – 2 s on a normal
  // connection). For recap text — which is regenerable — the batch commit
  // is sufficient; the Firestore SDK queues and retries server delivery
  // automatically. The local cache is updated synchronously, so the UI
  // reflects the save immediately.
  const batch = writeBatch(db)
  batch.set(ref, payload)
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
}

export async function deleteWeekRecapFromSubcollection(dynastyId, year, week) {
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION, recapDocId(year, week))
  // Atomic delete + main-doc bump so other devices' listener fires.
  const batch = writeBatch(db)
  batch.delete(ref)
  bumpDynastyLastModifiedInBatch(batch, dynastyId)
  await batch.commit()
}

/**
 * Load all week recaps and rebuild the legacy `{ [year]: { [week]: {...} } }`
 * shape that consumers (Dashboard, WeeklyScores, WeekRecapModal) already
 * expect. Cache-first like other subcollection reads.
 */
export async function getWeekRecapsSubcollection(dynastyId, options = {}) {
  const { onFresh = null, serverFirst = false } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION)
  // serverFirst — see comment in getPlayersSubcollection.
  if (serverFirst) {
    const snap = await getDocsFromServer(ref)
    return buildRecapsMap(snap.docs)
  }
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      if (onFresh) {
        getDocsFromServer(ref).then(snap => {
          try { onFresh(buildRecapsMap(snap.docs)) } catch (e) { console.error('onFresh callback threw:', e) }
        }).catch(() => {})
      }
      return buildRecapsMap(cached.docs)
    }
  } catch (_) { /* fall through to network */ }
  try {
    const snap = await getDocs(ref)
    return buildRecapsMap(snap.docs)
  } catch (error) {
    console.error('Error fetching weekRecaps subcollection:', error)
    return {}
  }
}

function buildRecapsMap(docs) {
  const out = {}
  for (const d of docs) {
    const data = d.data()
    const y = Number(data.year)
    const w = Number(data.week)
    if (!Number.isFinite(y) || !Number.isFinite(w)) continue
    if (!out[y]) out[y] = {}
    out[y][w] = { generatedAt: data.generatedAt, text: data.text || '' }
  }
  return out
}

// ─── Social Media feature persistence ────────────────────────────────────────
// Posts: one doc per (year, week) under `socialFeed`, mirroring weekRecaps —
// keeps a 300+ post week well under the 1 MB doc cap and lazy-loadable.
// Characters: a 1700+ universe sharded across `socialCharacters/shard-N` docs
// (immutable import), plus runtime-added (auto-instantiated) and user-edited
// characters that overlay on load. Those overrides are themselves sharded
// across `_ov-{n}` docs (by hashed id) to stay under the 1 MB doc cap when a
// large share of the universe is customized; a legacy single `_overrides` doc
// is still read for backward compatibility. `_meta` records shardCount so
// stale shards from a smaller re-import are ignored.

const SOCIAL_FEED_SUBCOLLECTION = 'socialFeed'
const SOCIAL_CHARACTERS_SUBCOLLECTION = 'socialCharacters'
const SOCIAL_CHARS_PER_SHARD = 250

// In-app character edits are spread across this many override docs (_ov-0..N)
// keyed by a stable hash of the character id. A single override doc would hit
// Firestore's 1 MB per-document ceiling once a large share of a 1,800-account
// universe is customized; sharding keeps each doc small so heavy editing always
// saves. 8 shards holds ~225 full character objects each before nearing 1 MB.
const SOCIAL_OVERRIDE_SHARD_COUNT = 8

function socialHashStr(s) {
  let h = 0
  const str = String(s)
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const socialOverrideShardId = (id) => `_ov-${socialHashStr(id) % SOCIAL_OVERRIDE_SHARD_COUNT}`

const socialFeedDocId = (year, week) => `${Number(year)}-${Number(week)}`

export async function saveSocialFeedToSubcollection(dynastyId, year, week, posts) {
  const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_FEED_SUBCOLLECTION, socialFeedDocId(year, week))
  const payload = sanitizeForFirestore({
    year: Number(year),
    week: Number(week),
    posts: Array.isArray(posts) ? posts : [],
    updatedAt: Date.now(),
  })
  const batch = writeBatch(db)
  batch.set(ref, payload)
  bumpSocialUpdatedAtInBatch(batch, dynastyId)
  await batch.commit()
}

function buildSocialFeedMap(docs) {
  const out = {}
  for (const d of docs) {
    if (d.id.startsWith('_')) continue
    const data = d.data()
    const y = Number(data.year)
    const w = Number(data.week)
    if (!Number.isFinite(y) || !Number.isFinite(w)) continue
    if (!out[y]) out[y] = {}
    out[y][w] = Array.isArray(data.posts) ? data.posts : []
  }
  return out
}

export async function getSocialFeedSubcollection(dynastyId, options = {}) {
  const { onFresh = null, serverFirst = false } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_FEED_SUBCOLLECTION)
  // serverFirst — see comment in getPlayersSubcollection.
  if (serverFirst) {
    const snap = await getDocsFromServer(ref)
    return buildSocialFeedMap(snap.docs)
  }
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      if (onFresh) {
        getDocsFromServer(ref).then(snap => {
          try { onFresh(buildSocialFeedMap(snap.docs)) } catch (e) { console.error('social onFresh threw:', e) }
        }).catch(() => {})
      }
      return buildSocialFeedMap(cached.docs)
    }
  } catch (_) { /* fall through */ }
  try {
    const snap = await getDocs(ref)
    return buildSocialFeedMap(snap.docs)
  } catch (error) {
    console.error('Error fetching socialFeed subcollection:', error)
    return {}
  }
}

/** Write the imported universe as immutable shards (replaces any prior import). */
export async function saveSocialCharacterShards(dynastyId, charactersById) {
  const entries = Object.entries(charactersById || {})
  const shardCount = Math.max(1, Math.ceil(entries.length / SOCIAL_CHARS_PER_SHARD))
  // Firestore batches cap at 500 writes; shardCount is tiny (~7), so one batch.
  const batch = writeBatch(db)
  for (let s = 0; s < shardCount; s++) {
    const chunk = {}
    for (const [id, ch] of entries.slice(s * SOCIAL_CHARS_PER_SHARD, (s + 1) * SOCIAL_CHARS_PER_SHARD)) {
      chunk[id] = ch
    }
    const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_CHARACTERS_SUBCOLLECTION, `shard-${s}`)
    batch.set(ref, sanitizeForFirestore({ chars: chunk }))
  }
  const metaRef = doc(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_CHARACTERS_SUBCOLLECTION, '_meta')
  batch.set(metaRef, { shardCount, importedAt: Date.now() })
  bumpSocialUpdatedAtInBatch(batch, dynastyId)
  await batch.commit()
}

/**
 * Merge runtime-added / user-edited characters into the override docs.
 * Edits are sharded across `_ov-{n}` docs (by hashed id) so no single doc
 * approaches Firestore's 1 MB limit even when most of a large universe is
 * customized. merge:true preserves each shard's other character keys.
 */
export async function saveSocialCharacterOverrides(dynastyId, characters) {
  if (!characters || Object.keys(characters).length === 0) return
  const byShard = {}
  for (const [id, ch] of Object.entries(characters)) {
    const shardId = socialOverrideShardId(id)
    if (!byShard[shardId]) byShard[shardId] = {}
    byShard[shardId][id] = ch
  }
  const batch = writeBatch(db)
  for (const [shardId, chars] of Object.entries(byShard)) {
    const ref = doc(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_CHARACTERS_SUBCOLLECTION, shardId)
    batch.set(ref, sanitizeForFirestore({ chars }), { merge: true })
  }
  bumpSocialUpdatedAtInBatch(batch, dynastyId)
  await batch.commit()
}

/**
 * Delete all character override docs (legacy `_overrides` + sharded `_ov-{n}`).
 * Called on a fresh universe import so the imported shards become the single
 * source of truth — otherwise stale overlays (e.g. an auto-saved account that
 * posted) mask the newly imported bio/avatar/prompt for that account.
 */
export async function clearSocialCharacterOverrides(dynastyId) {
  const batch = writeBatch(db)
  batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_CHARACTERS_SUBCOLLECTION, '_overrides'))
  for (let i = 0; i < SOCIAL_OVERRIDE_SHARD_COUNT; i++) {
    batch.delete(doc(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_CHARACTERS_SUBCOLLECTION, `_ov-${i}`))
  }
  await batch.commit()
}

function mergeSocialCharacterDocs(docs) {
  let shardCount = null
  const shards = {}
  let legacyOverrides = {}          // old single `_overrides` doc
  const overrideShards = {}         // new `_ov-{n}` docs
  for (const d of docs) {
    if (d.id === '_meta') { shardCount = Number(d.data()?.shardCount) || null; continue }
    if (d.id === '_overrides') { legacyOverrides = d.data()?.chars || {}; continue }
    let m = d.id.match(/^_ov-(\d+)$/)
    if (m) { overrideShards[Number(m[1])] = d.data()?.chars || {}; continue }
    m = d.id.match(/^shard-(\d+)$/)
    if (m) shards[Number(m[1])] = d.data()?.chars || {}
  }
  const byId = {}
  const max = shardCount != null ? shardCount : Object.keys(shards).length
  for (let s = 0; s < max; s++) Object.assign(byId, shards[s] || {}) // imported base
  Object.assign(byId, legacyOverrides)                              // legacy edits
  for (const k of Object.keys(overrideShards)) Object.assign(byId, overrideShards[k]) // sharded edits win
  return byId
}

export async function getSocialCharactersSubcollection(dynastyId, options = {}) {
  const { onFresh = null, serverFirst = false } = options
  const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, SOCIAL_CHARACTERS_SUBCOLLECTION)
  // serverFirst — see comment in getPlayersSubcollection.
  if (serverFirst) {
    const snap = await getDocsFromServer(ref)
    return mergeSocialCharacterDocs(snap.docs)
  }
  try {
    const cached = await getDocsFromCache(ref)
    if (!cached.empty) {
      if (onFresh) {
        getDocsFromServer(ref).then(snap => {
          try { onFresh(mergeSocialCharacterDocs(snap.docs)) } catch (e) { console.error('social chars onFresh threw:', e) }
        }).catch(() => {})
      }
      return mergeSocialCharacterDocs(cached.docs)
    }
  } catch (_) { /* fall through */ }
  try {
    const snap = await getDocs(ref)
    return mergeSocialCharacterDocs(snap.docs)
  } catch (error) {
    console.error('Error fetching socialCharacters subcollection:', error)
    return {}
  }
}

/**
 * One-shot migration for dynasties that still have the legacy
 * `weekRecapsByYear` map embedded on the main document. Writes each
 * year/week to the subcollection, then clears the field via deleteField
 * — that removal SHRINKS the parent doc, which is the only path back
 * under the 1 MB cap once the doc has gone over.
 *
 * SUBCOLLECTION-WINS: before writing each legacy cell, fetches the
 * existing subcollection state directly from the server and skips
 * cells that already exist there. Without this guard, the migration
 * would overwrite freshly-saved subcollection data with stale legacy
 * data from in-memory state — the exact failure mode that caused
 * recaps to disappear after close+reopen. The legacy field on the
 * main doc is, by definition, NEVER fresher than the subcollection
 * once any save has happened (every saveWeekRecap writes to the
 * subcollection first), so "subcollection wins per-cell" is the
 * correct conflict resolution.
 *
 * Idempotent: setDoc replaces, deleteField on an absent field is a no-op.
 */
export async function migrateWeekRecapsToSubcollection(dynastyId, legacyRecapsByYear) {
  if (!legacyRecapsByYear || typeof legacyRecapsByYear !== 'object') return

  // Snapshot the existing subcollection state from the server so we
  // know which cells are already authoritative there.
  let existing = {}
  try {
    const ref = collection(db, DYNASTIES_COLLECTION, dynastyId, WEEK_RECAPS_SUBCOLLECTION)
    const snap = await getDocsFromServer(ref)
    for (const d of snap.docs) {
      const data = d.data() || {}
      const y = Number(data.year)
      const w = Number(data.week)
      if (!Number.isFinite(y) || !Number.isFinite(w)) continue
      if (!existing[y]) existing[y] = {}
      existing[y][w] = true
    }
  } catch (err) {
    // If we can't read existing state, BAIL on the destructive part of
    // the migration. Better to leave legacy data on the main doc than
    // risk overwriting fresher subcollection data with stale legacy
    // data. The deleteField step is also skipped so retry is safe.
    console.warn(`[migrateWeekRecapsToSubcollection] could not read existing subcollection — aborting to prevent data loss:`, err?.code || err?.message)
    return
  }

  const writes = []
  for (const [year, weeks] of Object.entries(legacyRecapsByYear)) {
    if (!weeks || typeof weeks !== 'object') continue
    for (const [week, recap] of Object.entries(weeks)) {
      if (!recap || typeof recap !== 'object' || !recap.text) continue
      // Skip cells the subcollection already has — they're newer.
      if (existing[Number(year)]?.[Number(week)]) continue
      writes.push(saveWeekRecapToSubcollection(dynastyId, year, week, recap))
    }
  }
  await Promise.all(writes)
  // Clear the legacy field on the main doc — atomic field deletion,
  // which shrinks the resulting doc and so isn't subject to the 1 MB
  // cap that blocks normal updates on bloated dynasties.
  const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
  await updateDoc(docRef, { weekRecapsByYear: deleteField() })
}

/**
 * Get a dynasty with its subcollections (players and games)
 * Fetches main document and subcollections in parallel
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Object|null>} Dynasty object with players and games arrays
 */
export async function getDynastyWithSubcollections(dynastyId) {
  try {
    // Fetch main document and subcollections in parallel
    const [mainDoc, players, games] = await Promise.all([
      getDynasty(dynastyId),
      getPlayersSubcollection(dynastyId),
      getGamesSubcollection(dynastyId)
    ])

    if (!mainDoc) return null

    // If migrated, always use subcollection data (even if empty)
    // If not migrated, use main document data
    if (mainDoc._subcollectionsMigrated) {
      return {
        ...mainDoc,
        players: players,
        games: games
      }
    } else {
      // Not migrated - use subcollections if they have data, otherwise main doc
      return {
        ...mainDoc,
        players: players.length > 0 ? players : (mainDoc.players || []),
        games: games.length > 0 ? games : (mainDoc.games || [])
      }
    }
  } catch (error) {
    console.error('Error fetching dynasty with subcollections:', error)
    throw error
  }
}

/**
 * Get a public dynasty by share code with subcollections
 * @param {string} shareCode - The share code
 * @returns {Promise<Object|null>} Dynasty object with players and games
 */
export async function getPublicDynastyWithSubcollections(shareCode) {
  try {
    // First get the main document
    const mainDoc = await getPublicDynastyByShareCode(shareCode)
    if (!mainDoc) return null

    // Fetch every subcollection the owner-side loader pulls — without
    // weekRecaps + seasons here, the viewer sees a dynasty with NO
    // weekly recaps, NO awards, NO conference standings, etc. (the
    // owner moved that data out of the main doc into per-year + per-
    // recap subcollections to dodge Firestore's 1 MB cap). Public
    // share viewers were stuck on the pre-migration shape and
    // silently lost everything that had been migrated.
    const [players, games, weekRecaps, seasonalRehydrated, socialFeedData, socialCharData, recruitingDatabase] = await Promise.all([
      getPlayersSubcollection(mainDoc.id),
      getGamesSubcollection(mainDoc.id),
      getWeekRecapsSubcollection(mainDoc.id),
      getSeasonsSubcollection(mainDoc.id),
      getSocialFeedSubcollection(mainDoc.id),
      getSocialCharactersSubcollection(mainDoc.id),
      getRecruitingDatabaseSubcollection(mainDoc.id),
    ])

    return assemblePublicDynasty(mainDoc, { players, games, weekRecaps, seasonalRehydrated, socialFeedData, socialCharData, recruitingDatabase })
  } catch (error) {
    console.error('Error fetching public dynasty with subcollections:', error)
    throw error
  }
}

/**
 * Merge a public dynasty's main doc + already-shaped subcollection data into
 * the single dynasty object viewers consume. Shared by the direct-Firestore
 * path above and the edge-cached /api/view-dynasty path below — one merge
 * implementation, two transports.
 */
function assemblePublicDynasty(mainDoc, { players, games, weekRecaps, seasonalRehydrated, socialFeedData, socialCharData, recruitingDatabase }) {
  {
    // Merge weekRecaps: legacy main-doc `weekRecapsByYear` UNION
    // subcollection, with subcollection winning per-(year, week) on
    // overlap. Same conflict resolution the owner-side path uses —
    // a partially-migrated dynasty needs both sources to be
    // visible to the viewer.
    const legacyRecaps = mainDoc.weekRecapsByYear || {}
    const weekRecapsByYear = {}
    for (const y of Object.keys(legacyRecaps)) {
      weekRecapsByYear[y] = { ...(legacyRecaps[y] || {}) }
    }
    for (const y of Object.keys(weekRecaps || {})) {
      if (!weekRecapsByYear[y]) weekRecapsByYear[y] = {}
      Object.assign(weekRecapsByYear[y], weekRecaps[y] || {})
    }

    // Merge seasonal fields the same way. `seasonalRehydrated` is
    // already in legacy `<field>ByYear` / `<field>ByTeamYear` shape
    // thanks to getSeasonsSubcollection. Sub wins per-(field, year)
    // on overlap.
    const perYearSet = new Set(PER_YEAR_FIELDS)
    const allSeasonalFields = [...PER_YEAR_FIELDS, ...PER_TEAM_YEAR_FIELDS]
    const mergedSeasonal = {}
    for (const field of allSeasonalFields) {
      const legacy = mainDoc[field]
      const fromSub = seasonalRehydrated[field]
      const hasLegacy = legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0
      const hasSub = fromSub && typeof fromSub === 'object' && Object.keys(fromSub).length > 0
      if (!hasLegacy && !hasSub) continue
      if (perYearSet.has(field)) {
        mergedSeasonal[field] = { ...(legacy || {}), ...(fromSub || {}) }
      } else {
        const out = {}
        for (const [teamKey, yearMap] of Object.entries(legacy || {})) {
          out[teamKey] = { ...(yearMap || {}) }
        }
        for (const [teamKey, yearMap] of Object.entries(fromSub || {})) {
          out[teamKey] = { ...(out[teamKey] || {}), ...(yearMap || {}) }
        }
        mergedSeasonal[field] = out
      }
    }

    // Players / games merge: same _subcollectionsMigrated branch as
    // before — unchanged, just folded into the larger return.
    const playersOut = mainDoc._subcollectionsMigrated
      ? players
      : (players.length > 0 ? players : (mainDoc.players || []))
    const gamesOut = mainDoc._subcollectionsMigrated
      ? games
      : (games.length > 0 ? games : (mainDoc.games || []))

    // Recruiting Database: same _subcollectionsMigrated branch as players/games.
    // Once migrated, the field is deleteField()'d off the main doc, so the
    // subcollection is the only source — a migrated dynasty showed an empty
    // Recruiting Database to public viewers before this was read.
    const recruitingDbOut = mainDoc._subcollectionsMigrated
      ? (recruitingDatabase || [])
      : ((recruitingDatabase && recruitingDatabase.length > 0) ? recruitingDatabase : (mainDoc.recruitingDatabasePlayers || []))

    // Fold rankByWeek/division/schoolGrades/recruitingClassConferenceRank/
    // recruitingClassStats back into teams[tid].byYear[year] — same as the
    // owner-side load path (DynastyContext.jsx's applyMigrations) — so
    // public/shared views read correct rank data for a migrated dynasty
    // instead of missing it (these fields were stripped off the main-doc
    // `teams` map by updateDynasty and only live in `mergedSeasonal` now).
    return foldTeamsByYearFieldsFromFlat({
      ...mainDoc,
      ...mergedSeasonal,
      players: playersOut,
      games: gamesOut,
      weekRecapsByYear,
      socialFeedByYear: socialFeedData || {},
      socialCharacters: socialCharData || {},
      recruitingDatabasePlayers: recruitingDbOut,
    })
  }
}

/**
 * Edge-cached public dynasty load (Firestore cost).
 *
 * The direct path above bills ~800-1500 reads PER ANONYMOUS VISIT of a
 * shared link. This path bills exactly ONE read (the main-doc query — the
 * same query the direct path starts with) to learn the dynasty's
 * lastModified, then fetches everything else from /api/view-dynasty with
 * that rev in the URL. The rev is part of the CDN cache key, so:
 *   - all visitors on the same version share one cached response
 *     (Firestore is hit once per version, not once per visitor), and
 *   - any owner edit bumps lastModified → new URL → immediate fresh data.
 * Freshness is identical to the direct path; only the read volume changes.
 *
 * Falls back to the direct-Firestore path on ANY api failure so a viewer
 * never sees an error the old path would have survived.
 */
export async function getPublicDynastyCached(shareCode) {
  const mainDoc = await getPublicDynastyByShareCode(shareCode)
  if (!mainDoc) return null

  const rev = Number(mainDoc.lastModified || 0) || 0
  // Legacy docs with no lastModified can't be version-keyed — a cached
  // response could go permanently stale. Use the direct path for those.
  if (rev <= 0) return getPublicDynastyWithSubcollections(shareCode)

  try {
    const resp = await fetch(`/api/view-dynasty?code=${encodeURIComponent(shareCode)}&v=${rev}`)
    if (resp.status === 404) return null
    if (!resp.ok) throw new Error(`view-dynasty api returned ${resp.status}`)
    const raw = await resp.json()

    // Adapt raw {id, data} rows to the doc-like shape the map builders use.
    const asDocs = (rows) => (rows || []).map(r => ({ id: r.id, data: () => r.data }))

    return assemblePublicDynasty(raw.mainDoc, {
      players: (raw.players || []).map(r => ({ ...r.data, _firestoreId: r.id })),
      games: (raw.games || []).map(r => ({ ...r.data, _firestoreId: r.id })),
      weekRecaps: buildRecapsMap(asDocs(raw.weekRecaps)),
      seasonalRehydrated: rehydrateSeasonalShapes(asDocs(raw.seasons)),
      socialFeedData: buildSocialFeedMap(asDocs(raw.socialFeed)),
      socialCharData: mergeSocialCharacterDocs(asDocs(raw.socialCharacters)),
      recruitingDatabase: (raw.recruitingDatabase || []).map(r => ({ ...r.data, _firestoreId: r.id })),
    })
  } catch (error) {
    console.warn('[view] cached api path failed, falling back to direct Firestore reads:', error?.message || error)
    return getPublicDynastyWithSubcollections(shareCode)
  }
}

/**
 * Delete all documents in a subcollection
 * @param {string} dynastyId - The dynasty document ID
 * @param {string} subcollectionName - Name of the subcollection
 */
async function deleteSubcollection(dynastyId, subcollectionName) {
  try {
    const subcollectionRef = collection(db, DYNASTIES_COLLECTION, dynastyId, subcollectionName)
    const snapshot = await getDocs(subcollectionRef)

    if (snapshot.empty) return

    // Build all batches up front, then commit them in parallel. Was
    // serial-with-100ms-delays-between-batches; on a 5000-player
    // dynasty that's 10 batches × ~500ms RTT + ~900ms of artificial
    // sleep = ~6s just for the players subcollection. Parallel
    // commits land in roughly one round-trip.
    const batches = []
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db)
      for (const docSnap of snapshot.docs.slice(i, i + BATCH_SIZE)) {
        batch.delete(docSnap.ref)
      }
      batches.push(batch.commit())
    }
    await Promise.all(batches)
  } catch (error) {
    console.error(`Error deleting ${subcollectionName} subcollection:`, error)
    throw error
  }
}

/**
 * Delete a dynasty and all its subcollections.
 *
 * Order matters: wipe every subcollection FIRST (in parallel — they're
 * independent of each other), THEN wipe the parent dynasty doc. The
 * earlier version fired all six deletes in parallel via Promise.all
 * "because subcollections live independently of the parent doc, so
 * order doesn't matter for correctness." That comment was wrong about
 * rules:
 *
 *   match /dynasties/{id}/players/{playerId} {
 *     allow write: if isPremium() && parentDynasty().userId == request.auth.uid;
 *     ...
 *   }
 *   function parentDynasty() {
 *     return get(/databases/$(database)/documents/dynasties/$(dynastyId)).data;
 *   }
 *
 * Every subcollection's create/delete rule calls parentDynasty() to
 * check editors[] / owner identity. When the parent doc delete wins
 * the parallel race, every subcollection batch that lands after it
 * fails the rule check with "Missing or insufficient permissions" —
 * parentDynasty() can't read a deleted document.
 *
 * Serializing the parent delete after the subcollections costs ~one
 * extra Firestore round-trip (~300-500ms), which is well worth it for
 * a delete operation that already runs in the background after the
 * optimistic UI update.
 */
export async function deleteDynastyWithSubcollections(dynastyId) {
  try {
    // Tombstone FIRST (best-effort): a teardown that dies partway (network
    // drop, one subcollection delete rejected) leaves the parent doc alive
    // with some subcollections already gone — the dynasty then "reappears"
    // in the list half-wiped (roster deleted, doc intact). The _deleting
    // flag lets the listener hide it and retry the teardown instead of
    // resurrecting a gutted dynasty. Best-effort because a lapsed-premium
    // owner may lack update permission while still being allowed to delete.
    try {
      await updateDoc(doc(db, DYNASTIES_COLLECTION, dynastyId), { _deleting: true })
    } catch (_) { /* proceed without tombstone */ }

    // allSettled so one failure doesn't abort siblings mid-flight — then
    // require ALL to have succeeded before removing the parent doc (rules
    // on subcollection deletes need the parent to still exist).
    const names = [
      PLAYERS_SUBCOLLECTION,
      GAMES_SUBCOLLECTION,
      WEEK_RECAPS_SUBCOLLECTION,
      SEASONS_SUBCOLLECTION,
      INVITES_SUBCOLLECTION,
      SOCIAL_FEED_SUBCOLLECTION,
      SOCIAL_CHARACTERS_SUBCOLLECTION,
      RECRUITING_DATABASE_SUBCOLLECTION,
    ]
    const results = await Promise.allSettled(names.map(n => deleteSubcollection(dynastyId, n)))
    const failed = names.filter((_, i) => results[i].status === 'rejected')
    if (failed.length > 0) {
      throw new Error(`Could not delete: ${failed.join(', ')} — the dynasty was kept and will finish deleting on next load`)
    }
    await deleteDoc(doc(db, DYNASTIES_COLLECTION, dynastyId))
  } catch (error) {
    console.error('Error deleting dynasty with subcollections:', error)
    throw error
  }
}

/**
 * Migrate a dynasty's players and games from main document to subcollections
 * This is idempotent - safe to run multiple times
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<Object>} Migration result with counts
 */
export async function migrateDynastyToSubcollections(dynastyId) {
  try {
    // Get the current dynasty document
    const dynasty = await getDynasty(dynastyId)
    if (!dynasty) {
      return { success: false, message: 'Dynasty not found' }
    }

    // Check if already migrated
    if (dynasty._subcollectionsMigrated) {
      return {
        success: true,
        message: 'Already migrated',
        alreadyMigrated: true,
        playerCount: 0,
        gameCount: 0
      }
    }

    const players = dynasty.players || []
    const games = dynasty.games || []

    // Check if there's anything to migrate
    if (players.length === 0 && games.length === 0) {
      // Mark as migrated even if empty
      await updateDynasty(dynastyId, { _subcollectionsMigrated: true })
      return {
        success: true,
        message: 'No data to migrate, marked as migrated',
        playerCount: 0,
        gameCount: 0
      }
    }

    console.log(`Migrating dynasty ${dynastyId}: ${players.length} players, ${games.length} games`)

    // Write players to subcollection
    if (players.length > 0) {
      await savePlayersToSubcollection(dynastyId, players)
      console.log(`Migrated ${players.length} players to subcollection`)
    }

    // Write games to subcollection
    if (games.length > 0) {
      await saveGamesToSubcollection(dynastyId, games)
      console.log(`Migrated ${games.length} games to subcollection`)
    }

    // Mark dynasty as migrated and DELETE the arrays from main document
    // Using deleteField() to completely remove the fields and reduce document size
    // This is crucial for documents that are at or over the 1MB limit
    const docRef = doc(db, DYNASTIES_COLLECTION, dynastyId)
    await updateDoc(docRef, {
      _subcollectionsMigrated: true,
      players: deleteField(), // Delete field to reduce document size
      games: deleteField(),   // Delete field to reduce document size
      updatedAt: serverTimestamp()
    })

    console.log(`Migration complete for dynasty ${dynastyId}`)

    return {
      success: true,
      message: `Migrated ${players.length} players and ${games.length} games to subcollections`,
      playerCount: players.length,
      gameCount: games.length
    }
  } catch (error) {
    console.error('Error migrating dynasty to subcollections:', error)
    return {
      success: false,
      message: error.message || 'Migration failed'
    }
  }
}

/**
 * Check if a dynasty has been migrated to subcollections
 * @param {string} dynastyId - The dynasty document ID
 * @returns {Promise<boolean>}
 */
export async function isDynastyMigrated(dynastyId) {
  try {
    const dynasty = await getDynasty(dynastyId)
    return dynasty?._subcollectionsMigrated === true
  } catch (error) {
    console.error('Error checking migration status:', error)
    return false
  }
}

// NOTE: a `subscribeToSubcollections` helper used to live here — a live
// onSnapshot over the ENTIRE players + games subcollections. It had zero
// callers, and wiring it up would bill a read per doc on every change for
// every connected client (a massive Firestore cost footgun). Removed
// deliberately; cross-device sync uses the main-doc listener + the
// rev-gated cache-first getters instead.
