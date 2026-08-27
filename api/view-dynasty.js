import { db } from './_firebaseAdmin.js';

/**
 * GET /api/view-dynasty?code=<shareCode>&v=<rev>
 *
 * Edge-cached read path for public share links (/view/:shareCode).
 *
 * Cost rationale: the client used to read the main doc + SIX subcollections
 * straight from Firestore on EVERY anonymous visit — ~800-1500 billed reads
 * per viewer for a big dynasty, with no rate limiting (a popular link or a
 * bot crawl multiplies that). This route returns the same raw data with
 * `s-maxage` so Vercel's edge cache absorbs repeat visitors; Firestore is
 * only hit on a cache miss.
 *
 * Freshness (no UX change): the client first reads just the MAIN doc from
 * Firestore (1 billed read — the same query it already ran) and passes its
 * lastModified as `v`. Since `v` is part of the cache key, any edit by the
 * owner produces a new URL and an immediate fresh read — viewers never see
 * stale data, while all visitors on the same version share one cached
 * response.
 *
 * Security: serves ONLY dynasties with isPublic == true and a matching
 * shareCode — the exact condition Firestore rules enforce for the
 * unauthenticated client path this replaces.
 */

// Admin-SDK Timestamps JSON-serialize as {_seconds,_nanoseconds}, which the
// client's tolerant readers don't all recognize. Convert to the web SDK's
// {seconds,nanoseconds} shape recursively so consumers see familiar data.
function normalizeTimestamps(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' && typeof value.seconds === 'number') {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds || 0 };
  }
  if (Array.isArray(value)) return value.map(normalizeTimestamps);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = normalizeTimestamps(v);
  return out;
}

const rowsOf = (snapshot) =>
  snapshot.docs.map((d) => ({ id: d.id, data: normalizeTimestamps(d.data()) }));

// A season doc's per-team-year fields (schedule, coaching staff, recruiting
// commitments, etc.) live sharded under seasons/{year}/teamShards/{0-7} —
// see src/services/seasonSubcollection.js's TEAM_SHARD_COUNT comment for
// why (a single combined doc for a full league can itself cross Firestore's
// 1 MiB cap). The literal 'teamShards' name can't be imported from that
// module here — it's written against the web SDK, this route runs on the
// admin SDK — so it's duplicated, same as every other subcollection name
// in this file. Merges shard data back onto each season row before it
// reaches the client, so getSeasonsSubcollection's rehydration (which
// expects the pre-sharding embedded shape) sees exactly what it always did.
async function buildSeasonRows(ref) {
  const seasonsSnap = await ref.collection('seasons').get();
  return Promise.all(seasonsSnap.docs.map(async (d) => {
    const shardsSnap = await ref.collection('seasons').doc(d.id).collection('teamShards').get();
    let data = d.data();
    if (!shardsSnap.empty) {
      const merged = { ...data };
      for (const shardDoc of shardsSnap.docs) {
        const shardData = shardDoc.data() || {};
        for (const [seasonField, teamMap] of Object.entries(shardData)) {
          if (!teamMap || typeof teamMap !== 'object') continue;
          merged[seasonField] = { ...(merged[seasonField] || {}), ...teamMap };
        }
      }
      data = merged;
    }
    return { id: d.id, data: normalizeTimestamps(data) };
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shareCode = String(req.query?.code || '').trim();
  // Share codes are 8 lowercase alphanumerics (generateShareCode) — reject
  // anything else before touching Firestore.
  if (!/^[a-z0-9]{4,32}$/.test(shareCode)) {
    return res.status(400).json({ error: 'Invalid share code' });
  }

  try {
    const snap = await db.collection('dynasties')
      .where('shareCode', '==', shareCode)
      .where('isPublic', '==', true)
      .limit(1)
      .get();

    if (snap.empty) {
      // Cache misses briefly too — a guessing/crawling burst on a dead code
      // shouldn't hit Firestore every time.
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(404).json({ error: 'Dynasty not found or sharing is disabled' });
    }

    const mainSnap = snap.docs[0];
    const dynastyId = mainSnap.id;
    const ref = db.collection('dynasties').doc(dynastyId);

    const [players, games, weekRecaps, seasonRows, socialFeed, socialCharacters, recruitingDatabase] = await Promise.all([
      ref.collection('players').get(),
      ref.collection('games').get(),
      ref.collection('weekRecaps').get(),
      buildSeasonRows(ref),
      ref.collection('socialFeed').get(),
      ref.collection('socialCharacters').get(),
      ref.collection('recruitingDatabase').get(),
    ]);

    // Public projection: strip internal identifiers before serving to
    // anonymous viewers. The owner's uid, member uid arrays, uid→team map,
    // and the last invite token are none of a viewer's business, and the
    // view page never reads them (verified: ViewDynastyContext consumes only
    // gameplay fields).
    const {
      id: _ignored,
      userId: _userId,
      editors: _editors,
      coCommishes: _coCommishes,
      memberTeams: _memberTeams,
      lastRedemption: _lastRedemption,
      ...mainData
    } = mainSnap.data();

    // The `v` param is part of the cache key, so any owner edit bumps
    // lastModified → new v → new cache entry, and viewers never see stale
    // CONTENT. The TTL instead bounds how long a link keeps serving after the
    // owner turns sharing OFF (revocation): a cached response needs no
    // Firestore re-check, so it outlives the isPublic flip. 5 minutes keeps
    // nearly all of the cost win (a viral link still costs at most one
    // Firestore read per 5 min per version) while capping the unshare lag.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({
      mainDoc: { id: dynastyId, ...normalizeTimestamps(mainData) },
      players: rowsOf(players),
      games: rowsOf(games),
      weekRecaps: rowsOf(weekRecaps),
      seasons: seasonRows,
      socialFeed: rowsOf(socialFeed),
      socialCharacters: rowsOf(socialCharacters),
      recruitingDatabase: rowsOf(recruitingDatabase),
    });
  } catch (error) {
    console.error('[view-dynasty] failed:', error);
    return res.status(500).json({ error: 'Failed to load dynasty' });
  }
}
