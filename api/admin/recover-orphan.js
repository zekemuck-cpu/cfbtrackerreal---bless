import { db } from '../_firebaseAdmin.js';
import { verifyAdmin } from '../_verifyAuth.js';

/**
 * Admin-only orphan-subcollection recovery.
 *
 * When migrate-to-local fetched only the main doc (bug fixed in
 * 2026-04-25 build), the subcollections at dynasties/{oldId}/players and
 * /games were left orphaned in Firestore. The Firestore rules block
 * client reads of those orphans because the rule checks the parent
 * doc's userId and the parent doc no longer exists.
 *
 * This endpoint uses the admin SDK to bypass rules, reads the orphan
 * subcollections, and returns them as JSON. The client then writes
 * the data into a local IndexedDB dynasty.
 *
 * Body: { oldDynastyId: string }
 * Returns: { players: Array, games: Array, playerCount, gameCount }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return;

  const { oldDynastyId } = req.body || {};
  if (!oldDynastyId || typeof oldDynastyId !== 'string') {
    return res.status(400).json({ error: 'oldDynastyId (string) is required' });
  }

  try {
    const dynastyRef = db.collection('dynasties').doc(oldDynastyId);

    const [playersSnap, gamesSnap] = await Promise.all([
      dynastyRef.collection('players').get(),
      dynastyRef.collection('games').get(),
    ]);

    const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.status(200).json({
      ok: true,
      oldDynastyId,
      players,
      games,
      playerCount: players.length,
      gameCount: games.length,
    });
  } catch (err) {
    console.error('[admin/recover-orphan] failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
