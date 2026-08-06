// Firestore's DOCUMENTED per-document size formula — see
// https://firebase.google.com/docs/firestore/storage-size — computes what
// Firestore actually charges for a document. This differs meaningfully from
// a plain JSON.stringify().length for data shaped like a box score (hundreds
// of small numeric fields): Firestore charges a FIXED per-value cost for
// every field regardless of how short its JSON text representation is (an
// integer costs 8 bytes whether it's `1` or `1000000`), plus a per-field-name
// and per-document/per-map overhead that JSON.stringify has no equivalent
// for. A batch estimated via JSON.stringify can look comfortably under
// budget while Firestore's real accounting disagrees — confirmed in
// production: an 8 MiB stringify-based estimate still failed against the
// real ~11 MiB request cap. Using this exact formula instead of a guessed
// multiplier is what actually closes that gap, rather than just widening a
// margin around an estimate of unknown accuracy.
// `seen` guards against a circular reference recursing forever (a real
// document graph never legitimately contains one — Firestore itself can't
// store one — but a bug that introduces one client-side used to silently
// abort the OLD JSON.stringify-based estimate entirely, which skipped the
// size guard right when it mattered most). A cycle just stops re-counting
// the repeated object instead of throwing, so the estimate degrades
// gracefully rather than either crashing or under/over-counting wildly.
export function firestoreValueSize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return 1
  const type = typeof value
  if (type === 'boolean') return 1
  if (type === 'number') return 8
  if (type === 'string') return new TextEncoder().encode(value).length + 1
  if (Array.isArray(value)) {
    if (seen.has(value)) return 0
    seen.add(value)
    return value.reduce((sum, v) => sum + firestoreValueSize(v, seen), 0) + 16
  }
  if (value instanceof Date) return 8
  if (type === 'object') {
    // Firestore Timestamp-like objects (has toDate()) cost the same as a date.
    if (typeof value.toDate === 'function') return 8
    if (seen.has(value)) return 0
    seen.add(value)
    let sum = 16
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined) continue
      sum += new TextEncoder().encode(key).length + 1 + firestoreValueSize(v, seen)
    }
    return sum
  }
  // Never let an estimate throw on something unexpected (e.g. a function
  // slipping through) — fall back to a rough proxy rather than crash.
  try { return new TextEncoder().encode(JSON.stringify(value)).length } catch { return 0 }
}

/**
 * Full per-document size Firestore charges: 32 bytes fixed document
 * overhead plus every top-level field's name + value size. Use this (not
 * JSON.stringify().length) anywhere a byte estimate feeds a Firestore size
 * decision — per-document cap checks, batch-chunking budgets, etc.
 */
export function firestoreDocSize(docData) {
  let sum = 32
  for (const [key, value] of Object.entries(docData || {})) {
    if (value === undefined) continue
    sum += new TextEncoder().encode(key).length + 1 + firestoreValueSize(value)
  }
  return sum
}
