import { initAdmin } from './_firebaseAdmin.js';
import { verifyAuth } from './_verifyAuth.js';
import { setCors } from './_cors.js';

/**
 * Bulk-write the PLAYERS-subcollection delta for an existing-dynasty CFB27
 * save sync (see src/data/cfb27SaveSync.js for how the delta is computed).
 *
 * Sibling to cfb27-bulk-seed-players.js — same Admin-SDK BulkWriter
 * rationale (a whole-league sync can touch thousands of docs, past what the
 * client SDK's offline-write queue can take) and the same independent
 * editors-check (Admin SDK bypasses security rules). The difference: this
 * endpoint MERGES into existing docs (`patches`, `{merge: true}`) as well as
 * writing brand-new ones (`creates`, full overwrite) — a sync updates far
 * more existing players than it creates.
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

const MAX_DOCS = 20000;

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const decoded = await verifyAuth(req, res);
  if (!decoded) return; // verifyAuth already sent 401
  const uid = decoded.uid;

  const { dynastyId, creates, patches } = req.body || {};
  if (typeof dynastyId !== 'string' || !dynastyId) {
    return res.status(400).json({ error: 'dynastyId is required' });
  }
  const createsArr = Array.isArray(creates) ? creates : [];
  const patchesArr = Array.isArray(patches) ? patches : [];
  if (createsArr.length + patchesArr.length === 0) {
    return res.status(200).json({ written: 0, failed: 0 });
  }
  if (createsArr.length + patchesArr.length > MAX_DOCS) {
    return res.status(400).json({ error: `Too many player writes (max ${MAX_DOCS})` });
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
    console.error(`[cfb27-save-sync-players] write error (attempt ${error.failedAttempts}):`, error.message);
    return error.failedAttempts < 4;
  });

  const playersRef = dynastyRef.collection('players');
  let queued = 0;

  for (const player of createsArr) {
    if (!player || player.pid == null) continue;
    bulkWriter.set(playersRef.doc(String(player.pid)), sanitizeForFirestore(player));
    queued++;
  }
  for (const entry of patchesArr) {
    if (!entry || entry.pid == null || !entry.patch) continue;
    bulkWriter.set(playersRef.doc(String(entry.pid)), sanitizeForFirestore(entry.patch), { merge: true });
    queued++;
  }

  try {
    await bulkWriter.close();
  } catch (err) {
    console.error('[cfb27-save-sync-players] bulkWriter.close() failed:', err);
    return res.status(500).json({ error: `Bulk write failed: ${err.message}` });
  }

  return res.status(200).json({ written: queued, failed: failedCount });
}
