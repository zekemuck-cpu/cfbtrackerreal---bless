// Recruiting Database ↔ Google Sheet sync — deliberately independent of the
// Targets tab's recruitingTargets.js. The Recruiting Database is a personal
// scouting reference, not a roster-commitment workflow: recruits pulled in
// here must never set `isTarget`/`commitmentTid` or otherwise appear on the
// Targets page. See CLAUDE.md-adjacent decision: "Imports don't mark recruits
// as targets."
//
// Storage: dynasty.recruitingDatabasePlayers — a separate array from
// dynasty.players, with its own small pid namespace scoped to this array.

import { serializeRecruitingDatabaseRow } from './recruitingDatabaseSheetFormat'

const snapshotKey = (recruit) => JSON.stringify(serializeRecruitingDatabaseRow(recruit))

// Whole-record, most-recent-edit-wins merge of a read-back Google Sheet
// against the current local Recruiting Database. Local-only recruits (not
// present in the sheet) pass through unchanged — the next Save will push them
// out. Sheet rows with no pid can't be timestamp-compared against anything
// local, so they're always taken as new entries (same as a fresh import).
export function mergeRecruitingDatabaseRows({ sheetRows = [], localRecruits = [] }) {
  const localByPid = new Map()
  localRecruits.forEach(p => { if (p.pid != null) localByPid.set(Number(p.pid), p) })

  let maxPid = localRecruits.reduce((m, p) => Math.max(m, Number(p.pid) || 0), 0)
  const consumedPids = new Set()
  const merged = []

  for (const row of sheetRows) {
    if (!row?.name) continue
    const rowPid = row.pid != null ? Number(row.pid) : null
    const local = rowPid != null ? localByPid.get(rowPid) : null

    if (local) {
      consumedPids.add(rowPid)
      const localTime = local.updatedAt || 0
      const sheetTime = row.updatedAt || 0
      merged.push(sheetTime > localTime ? { ...row, pid: rowPid } : local)
    } else {
      const pid = rowPid != null ? rowPid : ++maxPid
      if (pid > maxPid) maxPid = pid
      merged.push({ ...row, pid })
    }
  }

  for (const p of localRecruits) {
    if (p.pid != null && consumedPids.has(Number(p.pid))) continue
    merged.push(p)
  }

  return { mergedRecruits: merged, nextPid: maxPid + 1 }
}

// Content-diff-based reconciliation for "Save" (the true 2-way sync path).
// A human editing a cell directly in Google Sheets never bumps any kind of
// per-row timestamp — there is no signal in the sheet itself for "this was
// just edited." Comparing local.updatedAt against the sheet's stale/last-
// written Updated column (mergeRecruitingDatabaseRows' approach, used by the
// one-shot Import pull) therefore always favors local, silently discarding
// manual sheet edits. This instead compares each pid's current content on
// both sides against a snapshot of what was last confirmed synced:
//   - Content unchanged from the snapshot on a side → that side didn't
//     change since the last sync.
//   - Sheet changed, local didn't (per updatedAt vs lastSyncedAt) → sheet wins.
//   - Anything else (only local changed, neither changed, or a genuine
//     simultaneous edit on both sides) → local wins, so a deliberate in-app
//     edit is never silently overwritten by indeterminate sheet drift.
// A pid present in the last snapshot but missing from the sheet now was
// deleted there on purpose — dropped locally, unless it's a real Target
// (targetPids), which this sync must never delete. Returns `deletedPids` too:
// a pid sourced from `players` (this dynasty's own targets or a sibling
// dynasty's scouted players) isn't stored in recruitingDatabasePlayers at
// all, so dropping it from `mergedRecruits` alone doesn't stop it from
// reappearing — that pool is recomputed fresh from its live source on every
// render. The caller persists `deletedPids` as an explicit exclusion list so
// a sheet-driven deletion actually sticks for those entries too.
export function reconcileRecruitingDatabaseSync({
  sheetRows = [], localRecruits = [], targetPids = new Set(), syncedSnapshot = {}, lastSyncedAt = 0,
}) {
  const sheetByPid = new Map()
  sheetRows.forEach(r => { if (r.pid != null) sheetByPid.set(String(r.pid), r) })
  const localByPid = new Map()
  localRecruits.forEach(p => { if (p.pid != null) localByPid.set(String(p.pid), p) })

  let maxPid = localRecruits.reduce((m, p) => Math.max(m, Number(p.pid) || 0), 0)
  const allPids = new Set([...sheetByPid.keys(), ...localByPid.keys()])
  const merged = []
  const nextSnapshot = {}
  const deletedPids = []

  for (const key of allPids) {
    const sheetRow = sheetByPid.get(key)
    const localRow = localByPid.get(key)
    const synced = syncedSnapshot[key]

    if (!sheetRow && synced != null && !targetPids.has(key)) {
      deletedPids.push(key) // deleted in the sheet on purpose — drop it, not a real Target
      continue
    }
    if (!localRow) {
      merged.push(sheetRow)
      nextSnapshot[key] = snapshotKey(sheetRow)
      continue
    }
    if (!sheetRow) {
      merged.push(localRow) // real Target missing from the sheet — never delete it
      nextSnapshot[key] = snapshotKey(localRow)
      continue
    }

    const sheetChanged = synced == null || snapshotKey(sheetRow) !== synced
    const localChangedSinceSync = synced == null || (localRow.updatedAt || 0) > lastSyncedAt
    const winner = (sheetChanged && !localChangedSinceSync) ? { ...sheetRow, pid: Number(key) } : localRow
    merged.push(winner)
    nextSnapshot[key] = snapshotKey(winner)
  }

  for (const p of localRecruits) {
    if (p.pid != null) continue
    const pid = ++maxPid
    const withPid = { ...p, pid }
    merged.push(withPid)
    nextSnapshot[String(pid)] = snapshotKey(withPid)
  }

  return { mergedRecruits: merged, nextSnapshot, nextPid: maxPid + 1, deletedPids }
}
