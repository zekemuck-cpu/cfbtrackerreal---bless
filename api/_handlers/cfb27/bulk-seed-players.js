import { initAdmin } from '../../_firebaseAdmin.js';
import { verifyPremium } from '../../_verifyAuth.js';
import { setCors } from '../../_cors.js';

/**
 * Bulk-write a CFB 27 save import's full player roster (every resolved
 * team, ~16k docs) into a dynasty's Firestore `players` subcollection.
 *
 * Why this exists, not the client's normal savePlayersToSubcollection
 * (src/services/dynastyService.js): that function batches writes through the
 * Firebase CLIENT SDK, which queues writes in a local offline-persistence
 * cache before syncing to the server. That queue has a real, documented cap
 * ("Write stream exhausted maximum allowed queued writes" — see the comment
 * above saveWeeklyScores in dynastyService.js, which hit the same wall with
 * ~1000+ games). A whole-league import is ~16,257 docs — an order of
 * magnitude past what that path was ever designed for, and manually pacing
 * batches with sleeps (the client's existing mitigation) made a real import
 * take minutes.
 *
 * The Admin SDK's BulkWriter has no such client-side offline queue — it
 * talks straight to Firestore server-side with its own automatic batching,
 * concurrency, and exponential-backoff retry, and is exactly what Firestore
 * recommends for imports at this scale. Since Admin SDK calls bypass
 * Firestore security rules entirely, this endpoint independently verifies
 * the requester is actually an editor on the target dynasty before writing
 * a single doc.
 *
 * Player mapping (raw save row -> app player schema) still happens
 * CLIENT-SIDE via src/data/cfb27SaveImport.js — this endpoint only does the
 * bulk Firestore write of the already-mapped player objects.
 */

export const config = {
  maxDuration: 60,
};

function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map((item) => (item === undefined ? null : sanitizeForFirestore(item)));
  }
  if (typeof obj === 'object') {
    if (obj instanceof Date) return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '' || value === undefined) continue;
      result[key] = sanitizeForFirestore(value);
    }
    return result;
  }
  return obj;
}

const MAX_PLAYERS = 20000; // headroom over a full 16,257-player league import

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Premium-gated: these endpoints spend R2 + serverless + Firestore
  // budget per call, and cloud storage is already premium-only.
  const decoded = await verifyPremium(req, res);
  if (!decoded) return; // verifyAuth already sent 401
  const uid = decoded.uid;

  const { dynastyId, players } = req.body || {};
  if (typeof dynastyId !== 'string' || !dynastyId) {
    return res.status(400).json({ error: 'dynastyId is required' });
  }
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'players must be a non-empty array' });
  }
  if (players.length > MAX_PLAYERS) {
    return res.status(400).json({ error: `Too many players (max ${MAX_PLAYERS})` });
  }

  const firestore = initAdmin();
  const dynastyRef = firestore.collection('dynasties').doc(dynastyId);

  const dynastySnap = await dynastyRef.get();
  if (!dynastySnap.exists) {
    return res.status(404).json({ error: 'Dynasty not found' });
  }
  const dynasty = dynastySnap.data();
  const editors = Array.isArray(dynasty.editors) ? dynasty.editors : [];
  if (!editors.includes(uid)) {
    return res.status(403).json({ error: 'Not authorized to modify this dynasty' });
  }

  const bulkWriter = firestore.bulkWriter();
  let failedCount = 0;
  bulkWriter.onWriteError((error) => {
    failedCount++;
    console.error(`[cfb27-bulk-seed-players] write error (attempt ${error.failedAttempts}):`, error.message);
    return error.failedAttempts < 4;
  });

  const playersRef = dynastyRef.collection('players');
  let queued = 0;
  for (const player of players) {
    if (!player || player.pid == null) continue;
    const ref = playersRef.doc(String(player.pid));
    bulkWriter.set(ref, sanitizeForFirestore(player));
    queued++;
  }

  try {
    await bulkWriter.close();
  } catch (err) {
    console.error('[cfb27-bulk-seed-players] bulkWriter.close() failed:', err);
    return res.status(500).json({ error: `Bulk write failed: ${err.message}` });
  }

  return res.status(200).json({ written: queued, failed: failedCount });
}
