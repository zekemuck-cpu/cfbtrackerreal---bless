// Recruiting Database local-paste import merge — deliberately independent of
// the Targets tab's recruitingTargets.js. The Recruiting Database is a
// personal scouting reference, not a roster-commitment workflow: recruits
// pulled in here must never set `isTarget`/`commitmentTid` or otherwise
// appear on the Targets page. See CLAUDE.md-adjacent decision: "Imports don't
// mark recruits as targets."
//
// Storage: dynasty.recruitingDatabasePlayers — a separate array from
// dynasty.players, with its own small pid namespace scoped to this array.
//
// This used to also back a live, two-way Google Sheet sync (read the sheet,
// diff against a synced snapshot, write back) — removed entirely along with
// the rest of the Sheets integration; see RecruitingDatabaseImportModal.jsx's
// header comment for why. `mergeRecruitingDatabaseRows` below is now only
// used for the local-paste import (a one-shot "fold these new/updated rows
// into the existing database" merge), never round-tripped against a sheet.

// Whole-record, most-recent-edit-wins merge of freshly-parsed import rows
// against the current local Recruiting Database. Local-only recruits (not
// present in the import) pass through unchanged. An imported row with no pid
// (e.g. copied from an old export, or hand-typed) can't be timestamp-compared
// against anything local, so it's always taken as a new entry.
export function mergeRecruitingDatabaseRows({ incomingRows = [], localRecruits = [] }) {
  const localByPid = new Map()
  localRecruits.forEach(p => { if (p.pid != null) localByPid.set(Number(p.pid), p) })

  let maxPid = localRecruits.reduce((m, p) => Math.max(m, Number(p.pid) || 0), 0)
  const consumedPids = new Set()
  const merged = []

  for (const row of incomingRows) {
    if (!row?.name) continue
    const rowPid = row.pid != null ? Number(row.pid) : null
    const local = rowPid != null ? localByPid.get(rowPid) : null

    if (local) {
      consumedPids.add(rowPid)
      const localTime = local.updatedAt || 0
      const rowTime = row.updatedAt || 0
      merged.push(rowTime > localTime ? { ...row, pid: rowPid, scoutedAt: row.scoutedAt ?? local.scoutedAt } : local)
    } else {
      const pid = rowPid != null ? rowPid : ++maxPid
      if (pid > maxPid) maxPid = pid
      // Brand new to this dynasty — stamp a permanent "first entered" time now
      // if the import didn't already carry one (e.g. an older export from
      // before this column existed). The `+ merged.length` nudge keeps a
      // multi-row bulk import's relative order stable (top row = entered
      // first) even though Date.now() alone could tie within one batch.
      const scoutedAt = row.scoutedAt ?? (Date.now() + merged.length)
      merged.push({ ...row, pid, scoutedAt })
    }
  }

  for (const p of localRecruits) {
    if (p.pid != null && consumedPids.has(Number(p.pid))) continue
    merged.push(p)
  }

  return { mergedRecruits: merged, nextPid: maxPid + 1 }
}
