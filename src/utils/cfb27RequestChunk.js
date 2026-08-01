// Splitting large player payloads across multiple API requests.
//
// WHY: a Vercel serverless function rejects any request body over ~4.5 MB with
// a bare 413 before the handler ever runs. A full CFB 27 league import is
// ~16,000 player records; serialized that is several times the cap, so the
// single-request form failed 100% of the time with
// "Bulk player import failed (413)" and nothing was written.
//
// Chunking by BYTES rather than by record count on purpose: player records vary
// a lot in size (a fully-scouted player with the complete attribute set is many
// times a bare one), so any fixed "N per request" is either wastefully small for
// light records or still over the cap for heavy ones. Measuring the real
// serialized size is correct for both.

// Cap per request. The platform limit is ~4.5 MB; the margin covers the JSON
// envelope (dynastyId, key names, array punctuation) and any transport
// overhead. Being under by a comfortable amount costs one extra request.
export const MAX_REQUEST_BYTES = 3 * 1024 * 1024

/**
 * Split `items` into groups whose serialized size each stay under `maxBytes`.
 * A single item larger than maxBytes still gets its own group — splitting it
 * further isn't possible here, and letting it through produces a clear 413 for
 * that one record instead of silently dropping it.
 *
 * @param {Array} items
 * @param {number} maxBytes
 * @returns {Array<Array>} groups, in the original order; [] for empty input
 */
export function chunkByBytes(items, maxBytes = MAX_REQUEST_BYTES) {
  const list = Array.isArray(items) ? items : []
  if (list.length === 0) return []

  const groups = []
  let current = []
  let currentBytes = 0

  for (const item of list) {
    let size
    try {
      size = JSON.stringify(item)?.length ?? 0
    } catch {
      size = 0 // unserializable — the request would fail anyway; don't crash here
    }
    size += 1 // separator

    if (current.length > 0 && currentBytes + size > maxBytes) {
      groups.push(current)
      current = []
      currentBytes = 0
    }
    current.push(item)
    currentBytes += size
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/**
 * Pair up two lists that travel in the same request (creates + patches) into
 * batches that are jointly under the size cap, preserving order within each.
 * Returns at least one batch when either list is non-empty.
 *
 * @returns {Array<{creates: Array, patches: Array}>}
 */
export function chunkPairByBytes(creates, patches, maxBytes = MAX_REQUEST_BYTES) {
  const c = chunkByBytes(creates, maxBytes)
  const p = chunkByBytes(patches, maxBytes)
  const batches = []
  // Sent as separate requests rather than zipped together: combining a full
  // creates chunk with a full patches chunk could exceed the cap again.
  for (const group of c) batches.push({ creates: group, patches: [] })
  for (const group of p) batches.push({ creates: [], patches: group })
  return batches
}
