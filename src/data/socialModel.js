/**
 * Social Media feature — structural data model (pure, no React, no persistence).
 *
 * The fictional "universe" of characters is authored EXTERNALLY and imported
 * via importUniverse(). This module owns the schema, normalization, the recap
 * social-block parser, and the deterministic ids that tie posts to characters
 * and games.
 *
 * Identity rules (match the rest of the app):
 *   - Every character is rooted at a stable string `id`.
 *   - Team-affiliated characters carry `teamTid` (number). The app reads tid,
 *     never abbr, for team relationships.
 *   - The recap AI references characters by `@handle` (what it naturally
 *     writes); the parser resolves @handle -> id via a handle index.
 *   - Team accounts the universe did not provide are auto-instantiated from a
 *     `beat:<tid>` / `fan:<tid>` convention so the structure never depends on
 *     the universe being 100% complete.
 */

import { stripMascotFromName } from './teams'

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_SOCIAL_SETTINGS = {
  enabled: true,
  postsPerGame: 3, // 2-3 default; tunable up with no hard cap
  nationalCount: 8, // general national posts per week
  scope: 'all', // 'all' | 'ranked' | 'user'
}

export const DEFAULT_SOCIAL_PLATFORM = {
  // Intentionally unbranded — prompts describe it generically as "a mock social
  // media platform similar to X/Twitter" rather than inventing a brand name.
  name: '',
  postNoun: 'post',
  repostNoun: 'repost',
  likeNoun: 'like',
  handlePrefix: '@',
  brandColor: '#1d9bf0',
  logo: null,
}

export const CHARACTER_KINDS = ['national', 'team', 'conference', 'custom']

const PALETTE = [
  '#1d9bf0', '#e0245e', '#17bf63', '#794bc4',
  '#f45d22', '#ffad1f', '#657786', '#00b0b9',
]

// ─── Hashing (djb2) — used for color picks and deterministic post ids ─────────

export function hashStr(str) {
  let h = 5381
  const s = String(str ?? '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}

// ─── Handle helpers ──────────────────────────────────────────────────────────

export function normalizeHandle(handle) {
  const s = String(handle ?? '').trim()
  if (!s) return ''
  return s.startsWith('@') ? s : '@' + s
}

function slugifyHandle(handle) {
  return String(handle ?? '').replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '')
}

/**
 * Normalize a real X/Twitter link. Accepts a full URL, an @handle, or a bare
 * username and returns a canonical https://x.com/<user> URL. Returns '' for
 * empty input. This is only ever set on real accounts (never auto-derived from
 * a fictional account's generated handle).
 */
export function normalizeXUrl(input) {
  const s = String(input ?? '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  const user = s.replace(/^@+/, '').replace(/^(?:x\.com|twitter\.com)\//i, '').replace(/[^a-z0-9_]/gi, '')
  return user ? `https://x.com/${user}` : ''
}

// ─── Character normalization ─────────────────────────────────────────────────

/**
 * Normalize one raw universe record into a canonical character.
 * Returns null if it can't form a valid identity (no handle).
 */
export function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object') return null
  const handle = normalizeHandle(raw.handle)
  if (!handle) return null
  const id = (raw.id && String(raw.id).trim()) || slugifyHandle(handle)
  if (!id) return null

  const teamTid = (raw.teamTid != null && Number.isFinite(Number(raw.teamTid)))
    ? Number(raw.teamTid)
    : null
  const kind = CHARACTER_KINDS.includes(raw.kind)
    ? raw.kind
    : (teamTid != null ? 'team' : 'national')

  return {
    id,
    handle,
    displayName: String(raw.displayName || handle.replace(/^@/, '')).trim(),
    kind,
    role: raw.role ? String(raw.role) : '',
    teamTid,
    conference: raw.conference ? String(raw.conference) : null,
    personality: raw.personality ? String(raw.personality) : '',
    bio: raw.bio ? String(raw.bio) : '',
    category: raw.category ? String(raw.category) : '',
    verified: !!raw.verified,
    location: raw.location ? String(raw.location) : '',
    website: raw.website ? String(raw.website) : null,
    xUrl: raw.xUrl ? String(raw.xUrl) : null,
    joinedLabel: raw.joinedLabel ? String(raw.joinedLabel) : '',
    followingCount: Number.isFinite(Number(raw.followingCount)) ? Number(raw.followingCount) : 0,
    followerCount: Number.isFinite(Number(raw.followerCount)) ? Number(raw.followerCount) : 0,
    color: (typeof raw.color === 'string' && raw.color)
      ? raw.color
      : PALETTE[Math.abs(hashStr(id)) % PALETTE.length],
    avatar: raw.avatar || null,
    bannerImage: raw.bannerImage || null,
    avatarPrompt: raw.avatarPrompt ? String(raw.avatarPrompt) : '',
    pinnedPostId: raw.pinnedPostId || null,
    origin: raw.origin || 'import',
    customized: !!raw.customized,
    // Marks an account that personifies a real-world person/brand (has a real
    // PFP/cover or a real X link), as opposed to a fictional universe account.
    // Preserved through import so the tag survives the user's export/edit/import
    // workflow; falls back to inferring from the presence of an image/xUrl.
    isReal: raw.isReal != null
      ? !!raw.isReal
      : !!((raw.avatar && String(raw.avatar).trim()) || (raw.bannerImage && String(raw.bannerImage).trim()) || (raw.xUrl && String(raw.xUrl).trim())),
  }
}

/**
 * Import a raw universe array into a canonical character map.
 *
 * @param {Array} rawArray  - the universe pack
 * @param {Object} opts
 * @param {Set<number>} [opts.validTids] - tids present in the dynasty; team
 *        characters whose teamTid is not in it are parked (so a pruned dynasty
 *        carries no orphan accounts).
 * @returns {{ byId, handleIndex, skipped, dupHandles, count }}
 */
export function importUniverse(rawArray, { validTids = null } = {}) {
  const byId = {}
  const handleIndex = {}
  const skipped = []
  const dupHandles = []
  if (!Array.isArray(rawArray)) return { byId, handleIndex, skipped, dupHandles, count: 0 }

  for (const raw of rawArray) {
    const c = normalizeCharacter(raw)
    if (!c) { skipped.push({ reason: 'invalid' }); continue }
    if (c.kind === 'team') {
      if (c.teamTid == null) { skipped.push({ reason: 'team-without-tid', id: c.id }); continue }
      if (validTids && !validTids.has(c.teamTid)) {
        skipped.push({ reason: 'tid-not-in-dynasty', id: c.id, teamTid: c.teamTid })
        continue
      }
    }
    const hk = c.handle.toLowerCase()
    if (handleIndex[hk] && handleIndex[hk] !== c.id) { dupHandles.push(c.handle); continue }
    byId[c.id] = c
    handleIndex[hk] = c.id
  }
  return { byId, handleIndex, skipped, dupHandles, count: Object.keys(byId).length }
}

// ─── Bundled default universe (shared base) ──────────────────────────────────
// The authored universe ships with the app as a static asset and is the BASE
// for every dynasty (zero import step). Per-dynasty `socialCharacters` holds
// only OVERRIDES — user edits and auto-instantiated accounts — which overlay
// the base. Lazy-loaded (dynamic import) so it never bloats the main bundle.

let _universeById = null
let _universePromise = null

// Bumped whenever the bundled universe (socialUniverse.json) gets a meaningful
// refresh. Dynasties that imported an older universe compare their stored
// socialUniverseVersion against this to offer an in-app upgrade.
export const SOCIAL_UNIVERSE_VERSION = 3

export async function ensureUniverseLoaded() {
  if (_universeById) return _universeById
  if (!_universePromise) {
    _universePromise = import('./socialUniverse.json')
      .then(mod => {
        const arr = mod?.default || mod
        const { byId } = importUniverse(arr)
        _universeById = byId
        return byId
      })
      .catch(err => {
        console.error('[social] failed to load universe:', err)
        _universeById = {}
        return _universeById
      })
  }
  return _universePromise
}

/** Synchronous accessor — returns {} until ensureUniverseLoaded() resolves. */
export function getLoadedUniverse() {
  return _universeById || {}
}

/**
 * The dynasty's effective character set.
 *   - Default: bundled base universe overlaid with per-dynasty edits.
 *   - After an imported pack replaces the universe (socialUniverseReplaced),
 *     the per-dynasty set IS the universe (no base merge).
 */
export function getEffectiveCharacters(dynasty) {
  const own = dynasty?.socialCharacters || {}
  let merged
  if (dynasty?.socialUniverseReplaced) {
    merged = own
  } else {
    const base = getLoadedUniverse()
    merged = Object.keys(base).length ? { ...base, ...own } : own
  }
  // Tombstones: ids the user deleted. Filtered here (rather than removed from
  // storage) so a deletion sticks even when the account lives in an immutable
  // imported shard. Cleared on a fresh universe import.
  const deleted = dynasty?.socialDeletedIds
  if (Array.isArray(deleted) && deleted.length) {
    const del = new Set(deleted.map(String))
    const out = {}
    for (const [id, c] of Object.entries(merged)) if (!del.has(String(id))) out[id] = c
    return out
  }
  return merged
}

/**
 * Whether an account personifies a real-world person/brand (vs a fictional
 * universe account). Respects an explicit `isReal` tag when present, but falls
 * back to inferring from a real PFP/cover/X-link — so the real/fictional split
 * works even for universes stored before the tag existed (no re-import needed).
 */
export function isRealAccount(c) {
  if (!c) return false
  if (c.isReal != null) return !!c.isReal
  return !!(
    (c.avatar && String(c.avatar).trim()) ||
    (c.bannerImage && String(c.bannerImage).trim()) ||
    (c.xUrl && String(c.xUrl).trim())
  )
}

/**
 * Whether an account is the OFFICIAL account of a team (the verified athletics
 * handle, e.g. @OleMissFB), as opposed to a beat/fan/parody account. Identified
 * by the canonical `Official Account` category on a team-affiliated character.
 * The team's official post about a game is the one that carries the uploaded
 * final-score graphic in the feed.
 */
export function isOfficialTeamAccount(c) {
  return !!(c && c.kind === 'team' && c.teamTid != null && c.category === 'Official Account')
}

/** Build a handle(lowercased) -> id index over an existing characters map. */
export function buildHandleIndex(charactersById) {
  const idx = {}
  for (const c of Object.values(charactersById || {})) {
    if (c?.handle) idx[c.handle.toLowerCase()] = c.id
  }
  return idx
}

// ─── Auto-instantiated team accounts (fallback when the universe lacks one) ───

const TEAM_ROLE_DEFS = {
  beat: { suffix: 'Beat', role: 'beat reporter', verified: true, category: 'Beat Reporter' },
  fan: { suffix: 'Fan', role: 'superfan', verified: false, category: 'Fan Account' },
}

export function teamCharId(role, teamTid) {
  return `${role}:${teamTid}`
}

/**
 * Build a default character record for a team account not present in the
 * universe. `team` is the dynasty team slot (for name/abbr/color).
 */
export function autoInstantiateTeamCharacter(role, teamTid, team) {
  const def = TEAM_ROLE_DEFS[role] || TEAM_ROLE_DEFS.beat
  const fullName = team?.name || `Team ${teamTid}`
  const school = stripMascotFromName(fullName) || fullName
  const abbr = team?.abbr || ''
  const handleBase = (abbr || school.replace(/\s+/g, '')) + def.suffix
  return {
    id: teamCharId(role, teamTid),
    handle: '@' + handleBase,
    displayName: `${school} ${def.suffix}`,
    kind: 'team',
    role: def.role,
    teamTid,
    conference: null,
    personality: role === 'fan'
      ? `A passionate ${school} fan. Emotional and reactive, lives and dies with every play.`
      : `Covers ${school} like a local beat reporter. Measured and sourced, focused on the depth chart, film, and practice notes.`,
    bio: `${def.category} • ${school}`,
    category: def.category,
    verified: def.verified,
    location: '',
    website: null,
    joinedLabel: '',
    followingCount: 0,
    followerCount: 0,
    color: team?.primaryColor || '#657786',
    avatar: null,
    bannerImage: null,
    avatarPrompt: '',
    pinnedPostId: null,
    origin: 'auto',
    customized: false,
  }
}

// ─── Game tag map (shared by the prompt builder AND the parser) ───────────────

/**
 * Assign stable G-tags to a week's games. Both the prompt builder and the
 * parser call this on the SAME week's games, so the tag->game mapping is
 * reproduced deterministically with nothing stored. Order = sorted by id.
 *
 * @returns {Array<{ tag, gameId, game }>}
 */
export function buildGameTagMap(weekGames) {
  const list = Array.isArray(weekGames) ? [...weekGames] : []
  list.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
  return list.map((game, i) => ({ tag: `G${i + 1}`, gameId: game?.id ?? null, game }))
}

// ─── Recap social-block extraction & parsing ──────────────────────────────────

// Matches a properly closed block
const SOCIAL_FENCE_CLOSED_RE = /```\s*cfb-social\s*\n?([\s\S]*?)```/i
// Matches an open/truncated block (AI cut off before the closing ```)
const SOCIAL_FENCE_OPEN_RE = /```\s*cfb-social\s*\n?([\s\S]+)/i

/**
 * Pull the cfb-social fenced block out of a pasted AI response.
 * Handles: properly closed blocks, truncated responses (no closing ```),
 * spaces between backticks and language name, and case variations.
 *
 * `allowBareLines` (opt-in for the social-ingest modals): when no fence is
 * present, accept the paste IF it already reads as bare social records — users
 * commonly copy just the block's contents, or the AI emits the lines without a
 * fence. Gated on "most non-empty lines parse as `scope | author | text`" so a
 * fence-less prose recap is never mistaken for posts.
 * @returns {{ found, body, recapWithoutBlock }}
 */
export function extractSocialBlock(recapText, { allowBareLines = false } = {}) {
  const text = String(recapText ?? '')

  // 1. Prefer a properly closed block
  const closed = text.match(SOCIAL_FENCE_CLOSED_RE)
  if (closed) {
    const recapWithoutBlock = (text.slice(0, closed.index) + text.slice(closed.index + closed[0].length))
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { found: true, body: closed[1] || '', recapWithoutBlock }
  }

  // 2. Accept a truncated block — AI ran out of tokens before closing ```
  const open = text.match(SOCIAL_FENCE_OPEN_RE)
  if (open) {
    return { found: true, body: open[1] || '', recapWithoutBlock: text.slice(0, open.index).trim() }
  }

  // 3. Fence-less fallback — the paste itself may BE the social lines.
  if (allowBareLines) {
    const records = parseSocialLines(text)
    const nonEmpty = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (records.length > 0 && nonEmpty.length > 0 && records.length / nonEmpty.length >= 0.6) {
      return { found: true, body: text, recapWithoutBlock: '' }
    }
  }

  return { found: false, body: '', recapWithoutBlock: text }
}

/**
 * Parse the raw block body into { scope, author, text } records.
 * Format per line: `<scope> | <author> | <text>` — split on the first two
 * pipes only, so pipes/quotes/apostrophes inside the post text are safe.
 */
export function parseSocialLines(body) {
  const out = []
  for (const rawLine of String(body ?? '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const i1 = line.indexOf('|')
    if (i1 < 0) continue
    const i2 = line.indexOf('|', i1 + 1)
    if (i2 < 0) continue
    const scope = line.slice(0, i1).trim()
    const author = line.slice(i1 + 1, i2).trim()
    const text = line.slice(i2 + 1).trim()
    if (!scope || !author || !text) continue
    out.push({ scope, author, text })
  }
  return out
}

/** Deterministic post id — re-pasting the same content dedupes/upserts. */
export function postId(year, week, charId, gameId, text) {
  // Normalize year/week to strings so type inconsistencies don't produce different hashes
  return 'p' + (hashStr(`${year}|${week}|${charId}|${gameId || ''}|${text}`) >>> 0).toString(36)
}

/**
 * Resolve parsed lines into stored posts, creating any characters that need to
 * exist (unknown @handles, or beat:/fan: team accounts). Pure: all context is
 * passed in.
 *
 * @param {Object} ctx
 * @param {Array}  ctx.lines        - from parseSocialLines()
 * @param {number} ctx.year
 * @param {number} ctx.week
 * @param {Object} ctx.gameTagMap   - { TAG(upper) -> gameId } for this week
 * @param {Object} ctx.handleIndex  - { handle(lower) -> charId }
 * @param {Object} ctx.charactersById
 * @param {Object} ctx.teamsById    - dynasty.teams (tid -> team), for team accounts
 * @param {Function} [ctx.now]      - () => timestamp (injectable; defaults 0)
 * @returns {{ posts, newCharacters }}
 */
export function resolveSocialPosts({
  lines, year, week, gameTagMap = {}, handleIndex = {},
  charactersById = {}, teamsById = {}, now = () => 0,
}) {
  const posts = []
  const newCharacters = {}
  const handleIdx = { ...handleIndex }

  const ensureChar = (char) => {
    if (charactersById[char.id] || newCharacters[char.id]) return char.id
    newCharacters[char.id] = char
    handleIdx[char.handle.toLowerCase()] = char.id
    return char.id
  }

  const resolveAuthor = (author) => {
    const a = String(author || '').trim()
    if (!a) return null

    // @handle -> id (universe character). Auto-create a generic national if unknown.
    if (a.startsWith('@')) {
      const hit = handleIdx[a.toLowerCase()]
      if (hit) return hit
      const id = slugifyHandle(a) || `nat_${Math.abs(hashStr(a))}`
      return ensureChar({
        ...autoNational(a),
        id,
      })
    }

    // beat:<tidOrAbbr> / fan:<tidOrAbbr> -> team account (auto-instantiate).
    const m = a.match(/^(beat|fan)\s*[:#]\s*(.+)$/i)
    if (m) {
      const role = m[1].toLowerCase()
      const token = m[2].trim()
      const tid = resolveTeamToken(token, teamsById)
      if (tid == null) return null
      const id = teamCharId(role, tid)
      if (charactersById[id] || newCharacters[id]) return id
      return ensureChar(autoInstantiateTeamCharacter(role, tid, teamsById[tid] || teamsById[String(tid)]))
    }

    // Bare token: treat as a handle.
    return resolveAuthor('@' + a)
  }

  const resolveScope = (scope) => {
    // Strip any brackets the AI may have copied from the games listing (e.g. [G1] → G1)
    const s = String(scope || '').trim().toUpperCase().replace(/^\[|\]$/g, '')
    if (!s || s === 'N' || s === 'NATIONAL') return null
    if (gameTagMap[s] != null) return gameTagMap[s]
    return null // unknown tag -> treat as national rather than drop
  }

  for (const line of lines || []) {
    const charId = resolveAuthor(line.author)
    if (!charId) continue
    const gameId = resolveScope(line.scope)
    const text = String(line.text || '').trim()
    if (!text) continue
    posts.push({
      id: postId(year, week, charId, gameId, text),
      charId,
      gameId: gameId ?? null,
      year: Number(year),
      week: Number(week),
      text,
      createdAt: now(),
    })
  }
  return { posts, newCharacters }
}

/** Minimal generic national character for an unknown @handle seen in a parse. */
function autoNational(handle) {
  const h = normalizeHandle(handle)
  const name = h.replace(/^@/, '')
  return {
    id: slugifyHandle(h),
    handle: h,
    displayName: name,
    kind: 'national',
    role: '',
    teamTid: null,
    conference: null,
    personality: '',
    bio: '',
    category: '',
    verified: false,
    location: '',
    website: null,
    joinedLabel: '',
    followingCount: 0,
    followerCount: 0,
    color: PALETTE[Math.abs(hashStr(h)) % PALETTE.length],
    avatar: null,
    bannerImage: null,
    avatarPrompt: '',
    pinnedPostId: null,
    origin: 'auto',
    customized: false,
  }
}

/** Resolve a team token (numeric tid, or abbr) to a tid against dynasty.teams. */
function resolveTeamToken(token, teamsById) {
  const t = String(token || '').trim()
  if (!t) return null
  if (/^\d+$/.test(t)) {
    const tid = Number(t)
    return (teamsById[tid] || teamsById[String(tid)]) ? tid : null
  }
  const upper = t.toUpperCase()
  for (const [tid, team] of Object.entries(teamsById || {})) {
    if (team?.abbr && team.abbr.toUpperCase() === upper) return Number(tid)
  }
  return null
}

/** Merge new posts into an existing week array, deduped/upserted by post id. */
export function mergePosts(existing, incoming) {
  const byId = {}
  for (const p of existing || []) if (p?.id) byId[p.id] = p
  for (const p of incoming || []) if (p?.id) byId[p.id] = { ...(byId[p.id] || {}), ...p }
  return Object.values(byId)
}
