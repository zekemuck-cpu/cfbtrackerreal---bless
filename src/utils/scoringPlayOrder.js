// Sort scoring plays into the order they happened in-game.
// Quarter counts up (1, 2, 3, 4, 5=OT, 6=2OT, ...); time-left counts DOWN
// within a quarter, so a play with more time remaining happened earlier.

// Normalize a player name for roster matching (case/punctuation-insensitive).
function normScorerName(n) {
  return (n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Build a resolver: scorer name -> the tid that player was on in `year`,
// rooted ENTIRELY in the user's dynasty file (players keyed by tid membership).
// Prefers stint-based teamHistory (the canonical roster source), falls back to
// teamsByYear. Returns null for unknown names (e.g. untracked opponent players).
export function buildScorerTidResolver(players, year) {
  const idx = new Map()
  for (const p of players || []) {
    const key = normScorerName(p?.name)
    if (key && !idx.has(key)) idx.set(key, p)
  }
  const y = Number(year)
  return (name) => {
    const p = idx.get(normScorerName(name))
    if (!p) return null
    const th = p.teamHistory
    if (Array.isArray(th) && Number.isFinite(y)) {
      for (const s of th) {
        if (s?.teamTid == null) continue
        const from = Number(s.fromYear)
        const to = s.toYear == null ? Infinity : Number(s.toYear)
        if (Number.isFinite(from) && y >= from && y <= to) return Number(s.teamTid)
      }
    }
    const tby = p.teamsByYear || {}
    const t = tby[y] ?? tby[String(y)]
    return t != null ? Number(t) : null
  }
}

// Attribute each scoring play's team-string to one of the game's two tids,
// rooted ENTIRELY in the user's dynasty file — NEVER the base team registry.
//
// Why this exists: play.team is stored as the abbreviation the AI transcribed
// off the in-game scoring screen (e.g. "UMD", "CHAR"). That is NOT necessarily
// the abbr that lives in dynasty.teams[tid] for the game's two teams — a cfb27
// file renames Maryland "UMD"→"TERPS" and Charlotte "CHAR"→"CLT". Every
// running-score consumer used to compare play.team directly against the two
// current side abbrs; when neither matched, the play fell to the "other" side,
// piling the ENTIRE game's scoring onto one team.
//
// Resolution is scoped to the game's exactly-two teams and uses only file data
// keyed by tid, in priority order:
//   1. the string equals dynasty.teams[tid].abbr for one of the two tids
//   2. the scorers on those rows are on that tid's roster in the game year
//      (getScorerTid reads the player's tid from the file)
//   3. two-team elimination: once one string is anchored to a tid, any other
//      string takes the other tid (only the user's own roster is tracked, so
//      the opponent's rows resolve here by exclusion)
//
// Returns a Map(UPPERCASED team string -> tid). Callers compare tids only.
export function resolveScoringTeamTids(plays, { team1Tid, team2Tid, teams = null, getScorerTid = null } = {}) {
  const t1 = team1Tid != null ? Number(team1Tid) : null
  const t2 = team2Tid != null ? Number(team2Tid) : null
  const map = new Map()
  if (t1 == null && t2 == null) return map

  const t1Abbr = teams?.[t1]?.abbr?.toUpperCase?.() || null
  const t2Abbr = teams?.[t2]?.abbr?.toUpperCase?.() || null

  const strings = []
  for (const p of plays || []) {
    const u = p?.team?.toUpperCase?.()
    if (u && !strings.includes(u)) strings.push(u)
  }

  // 1. File-abbr match (dynasty.teams[tid].abbr for the two game tids).
  for (const s of strings) {
    if (t1Abbr && s === t1Abbr) map.set(s, t1)
    else if (t2Abbr && s === t2Abbr) map.set(s, t2)
  }

  // 2. Scorer roster anchor — majority of resolvable scorers on rows with s.
  if (getScorerTid) {
    for (const s of strings) {
      if (map.has(s)) continue
      let c1 = 0, c2 = 0
      for (const p of plays) {
        if (p?.team?.toUpperCase?.() !== s) continue
        let tid = getScorerTid(p.scorer)
        if (tid == null && p.passer) tid = getScorerTid(p.passer)
        if (tid == null) continue
        const n = Number(tid)
        if (n === t1) c1++
        else if (n === t2) c2++
      }
      if (c1 > c2) map.set(s, t1)
      else if (c2 > c1) map.set(s, t2)
    }
  }

  // 3. Two-team elimination.
  if (t1 != null && t2 != null) {
    const used = new Set(map.values())
    const freeTid = used.has(t1) && !used.has(t2) ? t2
      : used.has(t2) && !used.has(t1) ? t1
        : null
    if (freeTid != null) {
      for (const s of strings) if (!map.has(s)) map.set(s, freeTid)
    }
  }

  return map
}

function parseTimeLeft(t) {
  if (t == null) return 0
  const parts = String(t).split(':')
  const mins = parseInt(parts[0], 10) || 0
  const secs = parseInt(parts[1], 10) || 0
  return mins * 60 + secs
}

// Map a raw quarter value (numeric, "1"-"4", "OT", "2OT", "3OT", etc.) into
// a comparable rank. Previously `Number("OT")` returned NaN and fell back
// to 0, which sorted every overtime play *before* Q1 and ruined running
// scores throughout the UI. OT → 5, 2OT → 6, and so on.
export function quarterRank(q) {
  if (q == null) return 0
  if (typeof q === 'number' && Number.isFinite(q)) return q
  const s = String(q).trim().toUpperCase()
  if (!s) return 0
  // Pure number like "1", "2", "3", "4"
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  // OT variants: "OT", "1OT", "2OT", ...
  const otMatch = s.match(/^(\d*)OT$/)
  if (otMatch) {
    const n = otMatch[1] ? parseInt(otMatch[1], 10) : 1
    return 4 + n
  }
  return 0
}

export function compareByGameTime(a, b) {
  const qa = quarterRank(a?.quarter)
  const qb = quarterRank(b?.quarter)
  if (qa !== qb) return qa - qb
  return parseTimeLeft(b?.timeLeft) - parseTimeLeft(a?.timeLeft)
}

export function sortPlaysChronologically(plays) {
  return [...(plays || [])].sort(compareByGameTime)
}

// Merge standalone PAT rows' patResult onto the preceding TD row.
//
// The All Plays AI prompt emits PATs as their own rows (scoreType="PAT",
// patResult="Made XP"). The Scoring Summary prompt collapses PAT into the
// TD row's column F. Both shapes can land in the same scoringSummary
// array depending on which entry path the user took. Downstream code
// (running score, recap math) only reads patResult off the TD row, so
// the standalone-row shape silently costs the team its 1-pt XP every
// time — visible as a "Made XP" chip that doesn't bump the score.
//
// Normalizer: for each standalone PAT row, walk backward to the most
// recent preceding scoring row. If that row is a TD from the same team
// with empty patResult, copy this PAT row's patResult onto it. The PAT
// row stays in place — it's still useful for PBP display (kicker name,
// time, etc.) and its getPlayPoints() yields 0 so there's no double-
// count.
//
// Returns a new array; only rows whose patResult was filled get cloned.
export function collapsePatRowsIntoTDs(plays) {
  if (!Array.isArray(plays) || plays.length === 0) return plays || []
  const chrono = sortPlaysChronologically(plays)
  const overrides = new Map()
  for (let i = 0; i < chrono.length; i++) {
    const p = chrono[i]
    const st = (p?.scoreType || '').trim()
    if (st !== 'PAT') continue
    if (!p.patResult) continue
    const team = (p.team || '').toUpperCase()
    for (let j = i - 1; j >= 0; j--) {
      const prev = chrono[j]
      const prevSt = (prev?.scoreType || '').trim()
      if (!prevSt) continue
      if (!/TD/.test(prevSt)) break
      if ((prev.team || '').toUpperCase() !== team) break
      if (prev.patResult) break
      overrides.set(prev, { ...prev, patResult: p.patResult })
      break
    }
  }
  if (overrides.size === 0) return plays
  return plays.map((p) => overrides.get(p) || p)
}
