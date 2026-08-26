// Turn Firestore's opaque `invalid-argument` into the exact field that caused it.
//
// Firestore rejects a write whose payload contains a value it can't serialize,
// and the error names NOTHING — just "invalid-argument". On a payload the size
// of a CFB27 save sync (whole-league teams map, per-week award history, depth
// charts for 136 schools) that is unactionable: a real user sat on a broken
// sync for days because the only signal was that the main-doc write silently
// failed while the subcollection writes succeeded.
//
// This walks a payload and reports every value Firestore will refuse, with a
// dotted path to it. Deliberately NOT run on the happy path — it's a deep walk
// over megabytes — only after a write has already failed, to explain why.

// Values Firestore cannot store. `undefined` is the overwhelmingly common one
// (any object literal with an optional field that wasn't set), and is also now
// neutralized at the SDK level via ignoreUndefinedProperties — it's still
// reported here because a payload full of them usually means a mapping bug
// worth knowing about, even when the write itself now succeeds.
function classify(value) {
  if (value === undefined) return 'undefined'
  const t = typeof value
  if (t === 'function') return 'function'
  if (t === 'symbol') return 'symbol'
  if (t === 'bigint') return 'bigint (unsupported)'
  if (t === 'number' && Number.isNaN(value)) return 'NaN'
  return null
}

/**
 * Walk `payload` and collect every Firestore-invalid value.
 * @returns {Array<{path: string, reason: string}>}
 */
export function findInvalidFirestoreValues(payload, { maxFindings = 25 } = {}) {
  const findings = []
  const seen = new WeakSet()

  const walk = (value, path, insideArray) => {
    if (findings.length >= maxFindings) return

    const bad = classify(value)
    if (bad) {
      findings.push({ path: path || '(root)', reason: bad })
      return
    }
    if (value === null) return

    if (Array.isArray(value)) {
      // Firestore has no nested-array type: an array directly containing
      // another array is rejected outright. (An array of OBJECTS that each
      // contain arrays is perfectly fine — only direct nesting is illegal.)
      if (insideArray) {
        findings.push({ path: path || '(root)', reason: 'nested array (array inside array)' })
        return
      }
      if (seen.has(value)) return
      seen.add(value)
      for (let i = 0; i < value.length; i++) walk(value[i], `${path}[${i}]`, true)
      return
    }

    if (typeof value === 'object') {
      // Firestore's own sentinels/types (FieldValue, Timestamp, GeoPoint,
      // DocumentReference) are class instances — walking into their guts
      // would produce nonsense findings, so leave anything non-plain alone.
      const proto = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && proto !== null) return
      if (seen.has(value)) return
      seen.add(value)
      for (const [k, v] of Object.entries(value)) {
        walk(v, path ? `${path}.${k}` : k, false)
      }
    }
  }

  walk(payload, '', false)
  return findings
}

/** One-line, user-showable summary. Empty string when the payload is clean. */
export function describeInvalidFirestoreValues(payload) {
  const findings = findInvalidFirestoreValues(payload)
  if (findings.length === 0) return ''
  const shown = findings.slice(0, 5).map(f => `${f.path} (${f.reason})`).join(', ')
  const more = findings.length > 5 ? ` +${findings.length - 5} more` : ''
  return `${shown}${more}`
}
