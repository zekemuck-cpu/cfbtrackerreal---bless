// Recruiting Database helpers — per-dynasty only. Each dynasty has its own
// recruitingDatabasePlayers; there is no cross-dynasty sharing or "host"
// dynasty anymore (that account-wide shared-database design was removed:
// writes to a dynasty other than the one currently open had no protection
// against a stale Firestore listener echo silently reverting them — see the
// fix in DynastyContext.jsx's subscribeToDynasties handler. Carrying data
// from an old dynasty into a new one is now a manual Export JSON / Restore
// from JSON step, same as moving to a brand-new account).

// Merges recruit lists (e.g. "what's already in the database" + "what's in a
// restored backup file") into one flat list with fresh, collision-free pids —
// each source's own pid namespace is independent, so pid alone can't survive
// a merge. Each entry is tagged with where it came from, for the duplicate-
// review UI's "from X" labels.
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

// The one "recent number" ranking, shared by every surface that shows it
// (the Database table, the Update Dev Traits dashboard task, anywhere else
// that needs it) so a recruit's number can never disagree between them.
// Ranks by permanent entry order — earliest scoutedAt first (a stamp set
// once, at first entry, never touched again), addedIndex as a tiebreak for
// anything scouted before that field existed. Returns a Map keyed by pid ->
// rank (1 = first ever entered).
export function computeRecentRanks(players) {
  const ranked = [...(players || [])].sort((a, b) => {
    const at = a.scoutedAt ?? 0;
    const bt = b.scoutedAt ?? 0;
    if (at !== bt) return at - bt;
    return (a.addedIndex ?? 0) - (b.addedIndex ?? 0);
  });
  const rankByKey = new Map();
  ranked.forEach((r, i) => {
    rankByKey.set(`${r.pid}`, i + 1);
  });
  return rankByKey;
}

// No React needed, so this works equally from a component (PlayerDatabase.jsx's
// Export button) or from anywhere else that needs a portable backup of a
// recruit list. Strips merge/rank bookkeeping fields that only make sense
// in-app, never in a portable backup file.
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
