// Splits a flat `updateDynasty`-shaped update object's top-level keys into
// several smaller objects, each under a safe byte budget, so a caller that
// bundles many fields together (e.g. a whole-league CFB27 sync) never fires
// a single Firestore write big enough to hit the ~11 MB request-size cap.
// Same byte-budget spirit as chunkForFirestoreBatch (src/services/
// dynastyService.js) but chunks an object's keys instead of an array of docs.

// Margin under Firestore's 1 MB per-document cap — the chunks land on the
// MAIN doc (after updateDynasty's own subcollection routing further shrinks
// most fields), so this stays well clear of that ceiling even before routing.
export const MAIN_DOC_CHUNK_BUDGET = 700_000

/**
 * @param {Object} updates - flat update object (e.g. { teams, games, ... })
 * @param {Object} [options]
 * @param {number} [options.maxBytes] - per-chunk byte budget
 * @param {string[]} [options.lastKeys] - keys forced into their own final
 *   chunk, in the order given, regardless of size (e.g. calendar-advance
 *   fields that must land only after every other chunk has been written)
 * @returns {Object[]} ordered list of update-object chunks
 */
export function chunkUpdateObject(updates, { maxBytes = MAIN_DOC_CHUNK_BUDGET, lastKeys = [] } = {}) {
  const forced = {}
  const rest = {}
  for (const [key, value] of Object.entries(updates)) {
    if (lastKeys.includes(key)) forced[key] = value
    else rest[key] = value
  }

  const sizeOf = (value) => {
    try { return new TextEncoder().encode(JSON.stringify(value ?? null)).length } catch { return 0 }
  }

  const chunks = []
  let current = {}
  let currentBytes = 0
  for (const [key, value] of Object.entries(rest)) {
    const bytes = sizeOf(value)
    // Only split BEFORE adding if current already has something — a single
    // oversized field still gets its own solo chunk rather than being
    // dropped or blocked, so the resulting Firestore error (if any) names
    // exactly that field instead of an opaque combined payload.
    if (Object.keys(current).length > 0 && currentBytes + bytes > maxBytes) {
      chunks.push(current)
      current = {}
      currentBytes = 0
    }
    current[key] = value
    currentBytes += bytes
  }
  if (Object.keys(current).length > 0) chunks.push(current)
  if (Object.keys(forced).length > 0) chunks.push(forced)
  return chunks
}
