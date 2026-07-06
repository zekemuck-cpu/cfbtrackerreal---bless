// Account-wide shared Recruiting Database — pool resolution, cross-dynasty merge,
// and duplicate detection. See the "Account-Wide Shared Recruiting Database" plan
// for the full design; this module is the one place all four call sites (the
// one-time migration, local-paste import, Import-by-URL, JSON restore, and dynasty
// deletion/storage-tier-migration handoff) share their logic from.
//
// Storage model: rather than a new account-level Firestore location (which would
// need a security-rules change + manual `firebase deploy`), one of the user's own
// dynasties acts as the "host" — the shared fields live as ordinary fields on that
// dynasty's own document, a location that's already fully writable by its owner.
// Every sibling dynasty stores `recruitingDatabaseHostDynastyId` and reads/writes
// through that host instead of itself. A host points at itself (self-referencing)
// so "resolved" is a single presence check, not a tri-state.
//
// Two independent pools per account, never mixed: Premium/cloud dynasties share one
// host; Free/local dynasties (this browser only) share a separate one — a local
// dynasty can't follow you to another device, so it can't host, or be hosted by, a
// cloud dynasty's data.

// No live Google Sheet to hand off anymore (see RecruitingDatabaseImportModal.jsx's
// header comment) — just the actual recruit data and its exclusion list.
const RECRUITING_DB_FIELDS = [
  'recruitingDatabasePlayers',
  'recruitingDatabaseExcludedPids',
];

export function isCloudDynasty(d) {
  return d?.storageType === 'cloud';
}

// Every OTHER dynasty this user owns in the same storage-tier pool as
// currentDynasty — same ownership scoping sharedRecruitingDb.js's
// getSiblingScoutedPlayers already uses (userId match), plus the storage-tier
// split a shared physical sheet can't cross.
export function getPoolSiblings(currentDynasty, dynasties) {
  if (!currentDynasty) return [];
  return (dynasties || []).filter(d =>
    String(d.id) !== String(currentDynasty.id) &&
    d.userId === currentDynasty.userId &&
    isCloudDynasty(d) === isCloudDynasty(currentDynasty)
  );
}

// The dynasty object to actually read/write Recruiting-Database fields on.
//   - Not yet migrated (no host pointer set) -> currentDynasty itself (legacy
//     per-dynasty state; the migration-trigger flow decides what to do next).
//   - Points at itself -> currentDynasty itself (it's the host).
//   - Points elsewhere -> the looked-up host dynasty.
//   - Points elsewhere but that dynasty can't be found -> null. This is a real
//     error, not a silent fallback: callers must show the recovery alert
//     ("couldn't find your shared database — restore from a JSON backup if you
//     have one") rather than quietly treating the current dynasty as empty.
export function resolveRecruitingDatabaseHost(currentDynasty, dynasties) {
  if (!currentDynasty) return null;
  const hostId = currentDynasty.recruitingDatabaseHostDynastyId;
  if (!hostId || String(hostId) === String(currentDynasty.id)) return currentDynasty;
  const host = (dynasties || []).find(d => String(d.id) === String(hostId));
  return host || null;
}

// Merges every dynasty's recruitingDatabasePlayers into one flat list with fresh,
// collision-free pids (each source dynasty's own pid namespace is independent, so
// pid alone can't survive a merge) — each entry tagged with where it came from,
// for the duplicate-review UI's "from Dynasty X" labels.
export function renumberForMerge(lists) {
  let nextPid = 1;
  const merged = [];
  for (const { dynastyId, dynastyName, players } of lists) {
    for (const p of (players || [])) {
      merged.push({ ...p, pid: nextPid++, _mergedFromDynastyId: dynastyId, _mergedFromDynastyName: dynastyName });
    }
  }
  return merged;
}

// Groups recruits that look like the exact same person entered more than once —
// matched conservatively (name + position + archetype + stars, all exact,
// case-insensitive) so two genuinely different recruits are never mistaken for
// duplicates. Returns only groups of size >= 2; singletons aren't duplicates.
export function findDuplicateClusters(players) {
  const groups = new Map();
  (players || []).forEach(p => {
    const key = [
      String(p.name || '').trim().toLowerCase(),
      String(p.position || '').trim().toUpperCase(),
      String(p.archetype || '').trim().toLowerCase(),
      String(p.stars ?? ''),
    ].join('|');
    if (!key.trim()) return; // no name at all — nothing meaningful to cluster
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return Array.from(groups.values()).filter(g => g.length >= 2);
}

// Applies the user's Keep/Delete choices from the duplicate-review screen.
// `deletedPids` is a Set of pids (post-renumbering) the user chose to drop;
// everything else is kept.
export function applyDuplicateResolution(players, deletedPids) {
  if (!deletedPids || deletedPids.size === 0) return players;
  return players.filter(p => !deletedPids.has(p.pid));
}

// Called before a dynasty is actually removed from its pool — by real deletion, or
// by a storage-tier migration (which deletes the old dynasty ID and creates a new
// one on the other tier; see storageService.js). If this dynasty isn't a host for
// anyone, it's a no-op — its pool is unaffected. If it IS a host with other pool
// members, hands the shared data off to one of them automatically (nothing lost,
// no prompt needed). If it's the ONLY member of its pool, returns a `lone-host`
// result instead of touching anything — the caller must prompt the user to export a
// JSON backup before letting the deletion/migration proceed, since there would
// otherwise be nowhere left for the shared database to live.
export async function handleDynastyLeavingPool(dynastyId, dynasties, updateDynasty) {
  const hostedDynasties = (dynasties || []).filter(d => String(d.recruitingDatabaseHostDynastyId) === String(dynastyId));
  if (hostedDynasties.length === 0) return { ok: true, wasHost: false };

  const leavingDynasty = dynasties.find(d => String(d.id) === String(dynastyId));
  const others = hostedDynasties.filter(d => String(d.id) !== String(dynastyId));
  if (others.length === 0) {
    return { ok: false, wasHost: true, reason: 'lone-host', dynasty: leavingDynasty };
  }

  const newHost = others[0];
  const carry = {};
  RECRUITING_DB_FIELDS.forEach(field => { carry[field] = leavingDynasty?.[field] ?? null; });
  carry.recruitingDatabaseHostDynastyId = newHost.id;

  await updateDynasty(newHost.id, carry);
  await Promise.all(
    others.filter(d => String(d.id) !== String(newHost.id))
      .map(d => updateDynasty(d.id, { recruitingDatabaseHostDynastyId: newHost.id }))
  );
  return { ok: true, wasHost: true, newHostId: newHost.id };
}

// The one "recent number" ranking, shared by every surface that shows it
// (the Database table, the Update Dev Traits dashboard task, anywhere else
// that needs it) so a recruit's number can never disagree between them.
// Ranks by permanent entry order — earliest scoutedAt first (a stamp set
// once, at first entry, never touched again), addedIndex as a tiebreak for
// anything scouted before that field existed. Returns a Map keyed by
// `${sourceDynastyId ?? ''}:${pid}` -> rank (1 = first ever entered).
export function computeRecentRanks(players) {
  const ranked = [...(players || [])].sort((a, b) => {
    const at = a.scoutedAt ?? 0;
    const bt = b.scoutedAt ?? 0;
    if (at !== bt) return at - bt;
    return (a.addedIndex ?? 0) - (b.addedIndex ?? 0);
  });
  const rankByKey = new Map();
  ranked.forEach((r, i) => {
    rankByKey.set(`${r.sourceDynastyId ?? ''}:${r.pid}`, i + 1);
  });
  return rankByKey;
}

// No React needed, so this works equally from a component (PlayerDatabase.jsx's
// Export button) or from DynastyContext.jsx's deletion/storage-tier-migration
// handoff (the "nowhere left for this data to live" last-resort backup).
// Strips merge/rank bookkeeping fields that only make sense in-app, never in a
// portable backup file.
//
// Prefers the File System Access API's showSaveFilePicker — the actual native
// "Save As" dialog, letting the user pick the folder and file name — over a
// plain <a download>, which just drops a fixed-name file straight into the
// browser's default downloads folder with no prompt. Only Chromium browsers
// support it today, so this always falls back to the plain-download path on
// anything else (Safari/Firefox), or if the picker call fails for any reason
// other than the user cancelling it (e.g. called outside a direct user
// gesture, which the API requires — falling back rather than throwing means
// a caller in a less direct click context still gets a working export).
// Returns 'saved', 'cancelled' (user closed the picker without choosing), so
// callers can skip a misleading success toast on cancel.
export async function downloadRecruitingDatabaseJson(players, filenamePrefix = 'recruiting-database') {
  const payload = (players || []).map(({ recentRank, _mergedFromDynastyId, _mergedFromDynastyName, ...p }) => p);
  const json = JSON.stringify(payload, null, 2);
  const suggestedName = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`;

  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return 'saved';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      console.warn('showSaveFilePicker failed, falling back to a plain download:', err);
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'saved';
}

export { RECRUITING_DB_FIELDS };
