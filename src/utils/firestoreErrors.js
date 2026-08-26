// Classification of Firestore write rejections that need user action.
//
// The one that matters most: a main doc over Firestore's 1 MiB cap. The server
// rejects EVERY update to such a doc — including a single-field bump — with
// code 'invalid-argument', and because every subcollection write batches a
// main-doc lastModified bump in the SAME atomic batch, the whole batch fails
// with it. Net effect for the user: every save of any kind silently dies while
// the optimistic local state keeps showing their data — until a reload, when
// everything since the doc crossed the cap is simply gone. That is the
// "logged the whole season, came back and it was gone except week two" report.
//
// Matching is deliberately on BOTH the code and size-specific message text:
// 'invalid-argument' alone also covers unrelated malformed-data errors, and
// we only want the loud "your dynasty is over the cap" banner for the real
// thing.

/** True when a write rejection means: the main document exceeds the 1 MiB cap. */
export function isDocTooLargeError(err) {
  if (!err) return false
  const code = String(err.code || '')
  const msg = String(err.message || err || '')
  if (!/invalid-argument/i.test(code) && !/INVALID_ARGUMENT/.test(msg)) return false
  return (
    /exceeds the maximum allowed size/i.test(msg) ||
    /longer than \d+ bytes/i.test(msg) ||
    /1048576/.test(msg) ||
    /entity is too big/i.test(msg) ||
    /document is too large/i.test(msg)
  )
}
