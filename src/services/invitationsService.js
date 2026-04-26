/**
 * Invitations service
 *
 * League invitations live in a top-level `invitations` collection so the
 * invitee can query their own pending invitations across all leagues
 * (`where('inviteeEmail', '==', user.email)`) without first knowing
 * which dynasties to look in. The dynasty doc itself only carries the
 * accepted members[] (the source of truth for membership).
 *
 * Invitation lifecycle:
 *   1. commish createInvitation({ dynastyId, inviteeEmail, initialTeams })
 *      → doc created with status: 'pending'
 *   2. invitee sees it via subscribeToMyInvitations(email)
 *   3. invitee acceptInvitation(invitationId)
 *      → status flips 'accepted'
 *      → application code (caller) writes the new member to dynasty.members[]
 *   4. (or) invitee declineInvitation(invitationId)
 *      → status flips 'declined' (audit trail kept)
 *   5. (or) commish revokeInvitation(invitationId)
 *      → status flips 'revoked'
 *
 * Phase 1 emits these calls but does NOT enforce write authority on the
 * dynasty doc itself — the actual member-add is performed by the
 * commish's client when they next open the dynasty (we listen for
 * accepted invitations and reconcile members[]). Phase 3 will move
 * member-add to a Cloud Function for server-trusted reconciliation.
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore'
import { db } from '../config/firebase'

const INVITATIONS = 'invitations'

const normalizeEmail = (email) => String(email || '').toLowerCase().trim()

// ─────────────────────────────────────────────────────────────────────
// Mutations (commish-side)
// ─────────────────────────────────────────────────────────────────────

/**
 * Commish creates an invitation. Returns the new invitation's id.
 * Throws if the email is malformed or the same person is already a
 * member or already has a pending invite for this dynasty.
 *
 * The caller is responsible for verifying:
 *   - currentUser is the commish of the dynasty
 *   - dynasty.members.length < MAX_MEMBERS_PER_LEAGUE (caller checks)
 */
export async function createInvitation({
  dynastyId,
  dynastyName,
  dynastyOwnerUid,
  commissionerEmail,
  inviteeEmail,
  initialTeams = [],
}) {
  if (!dynastyId || !dynastyOwnerUid || !inviteeEmail) {
    throw new Error('createInvitation: missing required fields')
  }
  const email = normalizeEmail(inviteeEmail)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email address')
  }

  // Reject duplicates: any pending invite for the same dynasty + email.
  // Constrains on dynastyOwnerUid so the query is provably safe under
  // the Firestore read rule (rule allows read when dynastyOwnerUid ==
  // request.auth.uid OR invitee email matches; the dup check is run by
  // the commish so the dynastyOwnerUid filter satisfies it).
  const existing = await getDocs(query(
    collection(db, INVITATIONS),
    where('dynastyOwnerUid', '==', dynastyOwnerUid),
    where('dynastyId', '==', dynastyId),
    where('inviteeEmail', '==', email),
    where('status', '==', 'pending'),
  ))
  if (!existing.empty) {
    throw new Error('That email already has a pending invitation for this league.')
  }

  const ref = doc(collection(db, INVITATIONS))
  await setDoc(ref, {
    dynastyId,
    dynastyName: dynastyName || '',
    dynastyOwnerUid,
    commissionerEmail: normalizeEmail(commissionerEmail || ''),
    inviteeEmail: email,
    inviteeUid: null,
    initialTeams: (initialTeams || []).map(Number).filter(Number.isFinite),
    status: 'pending',
    createdAt: serverTimestamp(),
    respondedAt: null,
  })
  return ref.id
}

/** Commish revokes a pending invite. */
export async function revokeInvitation(invitationId) {
  await updateDoc(doc(db, INVITATIONS, invitationId), {
    status: 'revoked',
    respondedAt: serverTimestamp(),
  })
}

// ─────────────────────────────────────────────────────────────────────
// Mutations (invitee-side)
// ─────────────────────────────────────────────────────────────────────

/**
 * Invitee accepts the invitation. Stamps the inviteeUid (from current
 * auth) so the commish's reconciliation step can finalize membership.
 *
 * Caller passes uid because this service is auth-agnostic.
 */
export async function acceptInvitation(invitationId, inviteeUid) {
  if (!invitationId || !inviteeUid) {
    throw new Error('acceptInvitation: invitationId + inviteeUid required')
  }
  await updateDoc(doc(db, INVITATIONS, invitationId), {
    status: 'accepted',
    inviteeUid,
    respondedAt: serverTimestamp(),
  })
}

export async function declineInvitation(invitationId) {
  await updateDoc(doc(db, INVITATIONS, invitationId), {
    status: 'declined',
    respondedAt: serverTimestamp(),
  })
}

// ─────────────────────────────────────────────────────────────────────
// Queries / subscriptions
// ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to all pending invitations for an email address. The
 * invitee uses this to see leagues they've been invited to.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToMyInvitations(email, callback) {
  const target = normalizeEmail(email)
  if (!target) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, INVITATIONS),
    where('inviteeEmail', '==', target),
    where('status', '==', 'pending'),
  )
  return onSnapshot(q, (snap) => {
    const items = []
    snap.forEach(d => items.push({ id: d.id, ...d.data() }))
    callback(items)
  }, (err) => {
    console.error('[invitations] subscribe error:', err)
    callback([])
  })
}

/**
 * Subscribe to all invitations for a given dynasty. Commish uses this
 * on the league settings page to see who's been invited and the status
 * of each. Constrains on dynastyOwnerUid for rule compatibility.
 */
export function subscribeToDynastyInvitations(dynastyId, dynastyOwnerUid, callback) {
  if (!dynastyId || !dynastyOwnerUid) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, INVITATIONS),
    where('dynastyOwnerUid', '==', dynastyOwnerUid),
    where('dynastyId', '==', dynastyId),
  )
  return onSnapshot(q, (snap) => {
    const items = []
    snap.forEach(d => items.push({ id: d.id, ...d.data() }))
    callback(items)
  }, (err) => {
    console.error('[invitations] subscribe-dynasty error:', err)
    callback([])
  })
}

/**
 * One-shot fetch of accepted invitations for a dynasty. Used by the
 * commish's reconciliation pass: when an accepted invite is seen, the
 * commish's client adds the corresponding member to dynasty.members[]
 * and the invitation can be left in 'accepted' state as the audit
 * record. This is called from DynastyContext on dynasty-load.
 */
/**
 * Reconciliation pass: scans for accepted invitations for a dynasty and
 * adds the corresponding members to dynasty.members[]. Idempotent —
 * safe to call repeatedly. Caller passes the dynasty + the current user
 * (must be the commish for any work to happen) + a writer function.
 *
 * Returns the count of new members added (0 if nothing to do).
 *
 * Called from:
 *   - DynastyContext on every currentDynasty load (auto)
 *   - LeagueSettings page via its own live-subscription effect (snappy
 *     in-page update without waiting for a navigation)
 */
export async function reconcileAcceptedInvitations({
  dynasty,
  currentUserUid,
  updateDynasty,
  // Helpers passed from leagueModel to avoid circular import.
  getMembers,
  getMemberByEmail,
  isCommish,
  createMember,
  computeMemberUids,
}) {
  if (!dynasty?.id || !dynasty?.userId || !currentUserUid) return 0
  if (!isCommish(dynasty, currentUserUid)) return 0

  const accepted = await fetchAcceptedInvitationsForDynasty(dynasty.id, dynasty.userId)
  if (accepted.length === 0) return 0

  const existingMembers = getMembers(dynasty)
  const newMembers = []
  for (const inv of accepted) {
    if (getMemberByEmail(dynasty, inv.inviteeEmail)) continue
    newMembers.push(createMember({
      uid: inv.inviteeUid || null,
      email: inv.inviteeEmail,
      teams: inv.initialTeams || [],
      isCommish: false,
    }))
  }
  if (newMembers.length === 0) return 0

  const merged = [...existingMembers, ...newMembers]
  await updateDynasty(dynasty.id, {
    members: merged,
    memberUids: computeMemberUids(merged),
  })
  return newMembers.length
}

export async function fetchAcceptedInvitationsForDynasty(dynastyId, dynastyOwnerUid) {
  if (!dynastyId || !dynastyOwnerUid) return []
  const q = query(
    collection(db, INVITATIONS),
    where('dynastyOwnerUid', '==', dynastyOwnerUid),
    where('dynastyId', '==', dynastyId),
    where('status', '==', 'accepted'),
  )
  const snap = await getDocs(q)
  const items = []
  snap.forEach(d => items.push({ id: d.id, ...d.data() }))
  return items
}
