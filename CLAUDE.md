# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

---

## Project Overview

CFB Dynasty Tracker - React web app for tracking College Football dynasty mode. Users create dynasties, manage schedules, rosters, and track games through multiple seasons.

## Deployment

- **Production URL**: https://dynastytracker.vercel.app
- **Hosting**: Vercel (auto-deploys from GitHub `main` branch)
- **Firebase Project**: `cfbtracker-200ab`

## Development Commands

```bash
npm run dev      # Start dev server (port 5000)
npm run build    # Build for production
```

**IMPORTANT**: After every code change, run `npm run build` to check for errors.

## Git Commit Policy

Do NOT commit automatically. Only commit when user explicitly requests it.

---

## tid-Based Team System (January 2026)

All teams use numeric Team IDs (tid) as the primary identifier:

| Range | Type |
|-------|------|
| 1-136 | FBS Teams |
| 137-140 | FCS Teams |

**Key concepts:**
- `dynasty.teams[tid]` - Team data keyed by tid (includes teambuilder replacements)
- `dynasty.currentTid` - User's current team
- `player.teamsByYear[year]` - Stores tid (number) for roster membership
- Games have `userTid`, `opponentTid`, `team1Tid`, `team2Tid` fields

**Helper functions** (in `src/data/teamRegistry.js`):
- `getTeam(teams, tid)` - Get team data by tid
- `getTidFromAbbr(abbr)` - Get tid from abbreviation
- `getTeamByAbbr(teams, abbr)` - Look up team by abbreviation
- `getMascotName(abbrOrTid, teams)` - Handles both tids and abbreviations

**Teambuilder**: Simply replaces data at a tid slot (doesn't create new tids).

---

## CRITICAL: Team-Centric Coding Requirement

**ALWAYS store data at the TEAM level using tid, NOT abbreviation.**

```javascript
// WRONG (old abbr-based):
dynasty.schedulesByTeamYear[teamAbbr][year] = [...]

// CORRECT (tid-based):
dynasty.teams[tid].byYear[year].schedule = [...]
```

**Pattern for new features:**
1. Use `dynasty.teams[tid].byYear[year].{feature}` storage
2. Create helper function `getCurrent{Feature}(dynasty)` in DynastyContext
3. Always use tid (number) for team references, never abbreviation strings

---

## Architecture

### Context Providers

1. **AuthProvider** (`src/context/AuthContext.jsx`) - Firebase Google Auth
2. **DynastyProvider** (`src/context/DynastyContext.jsx`) - Dynasty CRUD, dual-mode storage

### Tiered Storage System (January 2026)

The app supports two storage tiers that can be switched at runtime:

| Tier | Storage | Sync | Capacity |
|------|---------|------|----------|
| **Free** | IndexedDB (local) | None (device only) | ~50MB+ |
| **Premium** | Firebase Firestore | Real-time cloud sync | Unlimited |

**Key Files:**
- `src/services/storage/storageService.js` - Main router, tier management
- `src/services/storage/indexedDBStorage.js` - Free tier (uses localforage)
- `src/services/storage/firebaseStorage.js` - Premium tier wrapper
- `src/services/storage/index.js` - Module exports

**How it works:**
```javascript
import { storageService, STORAGE_TIER } from '../services/storage'

// Check current tier
storageService.isPremium()  // true = Firebase, false = IndexedDB

// All storage operations route through storageService
const dynasties = await storageService.getDynasties()
await storageService.updateDynasty(id, updates)
```

**Tier Persistence:**
- Tier setting saved to localStorage (`cfb-storage-tier`)
- Loaded on app init via `storageService.loadPersistedTier()`
- Clear with `storageService.clearPersistedTier()`

**DynastyContext Integration:**
- Checks `storageService.isPremium()` for routing (not `VITE_DEV_MODE`)
- Pattern: `const useLocalStorage = !storageService.isPremium()`
- If `useLocalStorage || !user` → IndexedDB, else → Firebase

**Testing Toggle:**
- Available on Home page (click "Storage: ..." text)
- Also in Danger Zone admin page
- Switches tier and reloads page

**Google Sheets:**
- Works independently of storage tier (uses OAuth tokens from localStorage)
- Users can sign in with Google for Sheets without needing premium storage

### Firestore Subcollection Architecture

Players and games stored in subcollections (solves 1MB document limit):

```
/dynasties/{dynastyId}
  ├── /players/{playerId}
  └── /games/{gameId}
```

Migration via Admin Tools "Migrate to Subcollections" button. Flag: `_subcollectionsMigrated: true`

### Phase System

1. **Preseason** - Week 0, setup
2. **Regular Season** - Weeks 0-15 (16 weeks, matches CFB 26)
3. **Conference Championship** - Separate phase
4. **Postseason** - Weeks 1-5 (Bowl Weeks)
5. **Offseason** - Weeks 1-8:
   - Week 1: Players Leaving
   - Weeks 2-5: Recruiting
   - Week 6: National Signing Day (YEAR FLIP happens here)
   - Week 7: Training Camp
   - Week 8: Custom Conferences, Encourage Transfers → Preseason

### Key Files

- `src/context/DynastyContext.jsx` - All data operations and helpers
- `src/pages/dynasty/Dashboard.jsx` - Main dashboard with phase-specific tasks
- `src/data/teamRegistry.js` - tid-based team data
- `src/services/sheetsService.js` - Google Sheets integration

---

## Player Data Architecture

### teamsByYear - Source of Truth for Roster Membership

```javascript
player.teamsByYear = { 2025: 11, 2026: 11, 2027: 85 }  // tid values
```

**ALWAYS use `isPlayerOnRoster(player, tidOrAbbr, year)` for roster filtering.**

### Player Movements (Display Only)

```javascript
player.movements = [
  { year: 2025, type: 'recruited', from: null, to: 11 },
  { year: 2027, type: 'transfer', from: 11, to: 85 }
]
```

Movement types: `recruited`, `portal_in`, `juco_in`, `added`, `transfer`, `encouraged_transfer`, `entered_portal`, `departure`, `recommit`

### Player statsByYear

All stats stored in `player.statsByYear[year]`. Box score saves update via delta tracking.

---

## Unified Game System

All games in `games[]` array with `gameType` field:
- Types: `regular`, `conference_championship`, `bowl`, `cfp_first_round`, `cfp_quarterfinal`, `cfp_semifinal`, `cfp_championship`
- **CPU games**: Have `team1Tid`/`team2Tid` but NO `userTid`
- **User games**: Have `userTid` and `opponentTid`

**Player game logs**: Based on box score presence, NOT `userTeam` (handles coach job changes correctly).

### Game Edit Page

The `GameEdit.jsx` page creates game records immediately on open (not on save) to enable Google Sheets integration. Key behaviors:
- Games created with `team1Tid`/`team2Tid` fields (not abbreviations)
- URL updates to include the new game ID
- Box score data stored under `game.boxScore`:
  - `game.boxScore.teamStats` - Team stats from Google Sheets
  - `game.boxScore.scoringSummary` - Scoring plays
  - `game.boxScore.home` - Home team player stats
  - `game.boxScore.away` - Away team player stats

### BoxScoreSheetModal

Resolves team abbreviations from multiple sources:
1. `game.team1` / `game.team2` (direct abbreviations)
2. `getOriginalTeamAbbr(game.team1Tid)` (resolved from tids)

### Schedule-Game Linking

Schedule entries link directly to game records via `gameId`. Games are created when schedule is saved (not when played).

**Schedule Entry Structure:**
```javascript
{
  week: 0,                   // Week 0-15
  opponent: "OSU",           // Abbreviation, or "BYE" for bye weeks
  opponentTid: 42,           // Direct tid reference (null for BYE)
  location: "home",          // home/away/neutral
  gameId: "game-1704000001", // Links to game record (null for BYE)
  isBye: false               // true for bye weeks
}
```

**Key Functions** (in `DynastyContext.jsx`):
- `createGamesFromSchedule(dynasty, schedule, userTid, year)` - Creates game records when schedule saved
- `getScheduleWithGameData(dynasty)` - Merges schedule entries with game data for display
- `saveSchedule()` - Automatically creates games and links them

**BYE Weeks**: Use "BYE" as opponent - no game record created, special display in Dashboard.

---

## Team Record System (Single Source of Truth)

All team win/loss records use a centralized system. **Do NOT calculate records inline** - use these functions from `DynastyContext.jsx`:

| Function | Purpose |
|----------|---------|
| `getTeamRecord(dynasty, tid, year)` | Get stored record for any team/year |
| `getCurrentTeamRecord(dynasty)` | Get current user team's record |
| `getRecordAsOfGame(dynasty, game, tid)` | Get record at end of specific game |
| `calculateTeamRecordFromGames()` | Internal calculation (fallback) |
| `buildRecordUpdatePayload()` | Creates update payload for game saves |

**Storage locations** (both updated for backward compatibility):
- `dynasty.teams[tid].byYear[year].record` - New tid-based structure
- `dynasty.teamRecordsByTeamYear[abbr][year]` - Legacy structure

**Automatic updates**: When a game is saved via `GameEdit.jsx`, records are automatically recalculated for both teams involved.

**Important**: College football has no ties. Records are always `wins-losses` format (e.g., "8-4").

---

## Conference Standings → Team Records Flow

When conference standings are saved (during offseason), records for ALL teams are now stored:

1. **Data Entry**: User enters standings via Google Sheets modal (`ConferenceStandingsModal.jsx`)
2. **Save Process** (`Dashboard.jsx` onSave):
   - Saves to `conferenceStandingsByYear[year][conference]` - primary standings data
   - Also updates `teamRecordsByTeamYear[abbr][year]` - legacy record storage
   - Also updates `teams[tid].byYear[year].record` - tid-based record storage

3. **Record Display** (in `Team.jsx` and `TeamYear.jsx`):
   - Priority: `conferenceStandingsByYear` > `teamRecordsByTeamYear` > calculated from games
   - This ensures all 130+ FBS teams show correct records, not just teams the user played against

**Debug logs** (search console for):
- `[ConferenceStandings]` - Save process logs
- `[TeamYear:ABBR]` - Record source selection

---

## Important Notes

### Firestore Updates

Use dot notation for nested fields:
```javascript
{ 'preseasonSetup.scheduleEntered': true }  // Correct
{ preseasonSetup: { scheduleEntered: true } }  // Wrong - replaces object
```

### Team Colors

Use `useTeamColors(teamName, dynasty.teams)` hook for dynamic theming.

### View-Only Mode

When `isViewOnly` is true, hide all edit/add functionality.

### Modal Pattern

```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4" style={{ margin: 0 }}>
  <div onClick={(e) => e.stopPropagation()}>
    {/* Modal content */}
  </div>
</div>
```

---

## Admin Tools

Located at `/dynasty/:id/admin`:
- Fix Roster Data - Repairs `teamsByYear` entries
- Clear Local Cache
- Document Size Analysis
- Migrate to Subcollections

---

## Hidden Dev Tools

Features hidden with `{false && (...)}`:
- Roster History button - `Players.jsx:240`
- Random Fill button - `GameEntryModal.jsx:1395`

---

## MIGRATION TRACKER: Abbreviation → TID

**Goal**: Replace ALL team abbreviation-based references with tid-based references.

**Status Legend**: ✅ Done | 🔄 In Progress | ❌ Not Started

---

### 1. Legacy ByTeamYear Storage Structures (CRITICAL)

All these use `abbr` as keys - should migrate to `dynasty.teams[tid].byYear[year].*`

**NOTE**: Most structures already dual-write (write to both old and new) and read tid-based first.

| Structure | READ | WRITE | Status |
|-----------|------|-------|--------|
| `schedulesByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `preseasonSetupByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `teamRatingsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `coachingStaffByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `recruitsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `lockedCoachingStaffByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `playersLeavingByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `conferenceChampionshipDataByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `bowlEligibilityDataByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `draftResultsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `transferDestinationsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `trainingResultsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `portalTransferClassByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `fringeCaseClassByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `encourageTransfersByTeamYear[abbr][year]` | ✅ tid-first | ✅ tid-only | ✅ |
| `recruitingCommitmentsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `teamRecordsByTeamYear[abbr][year]` | ✅ tid-first | ✅ dual-write | ✅ |
| `rankingsByTeamYear[abbr][year]` | N/A | N/A | ✅ (legacy, only in revert) |

---

### 2. getCurrentTeamAbbr() Calls (~80+ instances)

Should use `getCurrentTeamTid(dynasty)` directly instead.

**Helper Functions (COMPLETED)**:
The following helper functions in DynastyContext.jsx have been refactored to use `getCurrentTeamTid()` directly:
- ✅ `getCurrentSchedule()` - uses tid-first, gets abbr only for legacy fallback
- ✅ `getCurrentPreseasonSetup()` - uses tid-first, gets abbr only for legacy fallback
- ✅ `getCurrentTeamRatings()` - uses tid-first, gets abbr only for legacy fallback
- ✅ `getCurrentCoachingStaff()` - uses tid-first, gets abbr only for legacy fallback
- ✅ `getCurrentGoogleSheet()` - uses tid-first
- ✅ `getCurrentRecruits()` - uses tid-first, gets abbr only for legacy fallback
- ✅ `getPlayersNeedingClassConfirmation()` - uses tid-first
- ✅ `getLockedCoachingStaff()` - uses tid-first
- ✅ `migrateRosterData()` - uses tid-first

**Remaining usages** (lower priority - mostly display or legacy compatibility):

| File | Approx Count | Status |
|------|--------------|--------|
| DynastyContext.jsx (remaining) | ~40+ | ❌ (many are display/logging only) |
| Dashboard.jsx | ~30+ | ❌ |
| Recruiting.jsx | ~5+ | ❌ |
| Other components | ~15+ | ❌ |

---

### 3. Schedule Entry Fields

| Field | Should Be | Files | Status |
|-------|-----------|-------|--------|
| `entry.opponent` (string abbr) | Keep for display, ensure `opponentTid` set | Dashboard, GameEdit, DynastyContext | ❌ |

---

### 4. Game Record Legacy Fields

| Legacy Field | New Field | Files | Status |
|--------------|-----------|-------|--------|
| `game.opponent` | `game.opponentTid` | Multiple | ❌ |
| `game.userTeam` | `game.userTid` | Multiple | ❌ |
| `game.team1` | `game.team1Tid` | Multiple | ❌ |
| `game.team2` | `game.team2Tid` | Multiple | ❌ |

---

### 5. Player teamsByYear Values

Some places still write abbreviations instead of tids.

| File | Lines | Issue | Status |
|------|-------|-------|--------|
| DynastyContext.jsx | 2569-2582 | Migration may store abbrs | ❌ |
| DynastyContext.jsx | 296, 6161 | Player team filtering | ❌ |
| Player.jsx | 488-490, 1232-1313 | Timeline reads teamsByYear | ❌ |

---

### 6. Helper Functions Using Abbr (teamRegistry.js)

| Function | Line | Replacement | Status |
|----------|------|-------------|--------|
| `getTeamByAbbr(teams, abbr)` | 1679 | Use tid lookup | ❌ |
| `getLogoByAbbr(teams, abbr)` | 1696 | Use tid lookup | ❌ |
| `getColorsByAbbr(teams, abbr)` | 1709 | Use tid lookup | ❌ |
| `getNameByAbbr(teams, abbr)` | 1725 | Use tid lookup | ❌ |

---

### 7. Component Display Logic (Lower Priority)

These read abbrs for display - can keep reading both formats for backward compat.

| File | Approx Refs | Status |
|------|-------------|--------|
| Team.jsx | ~50+ | ❌ |
| Game.jsx | ~20+ | ❌ |
| Dashboard.jsx | ~30+ | ❌ |
| CFPBracket.jsx | ~10+ | ❌ |
| GameEdit.jsx | ~20+ | ❌ |

---

### 8. Other Abbr-Keyed Data

| Pattern | File | Status |
|---------|------|--------|
| `coachTeamByYear[year].team` (abbr) | DynastyContext.jsx | ❌ |
| `conferenceByTeamYear[abbr]` | DynastyContext.jsx | ❌ |

---

### Migration Strategy

1. **Phase 1**: Update all WRITE operations to use tid
2. **Phase 2**: Update READ operations to prefer tid, fallback to abbr
3. **Phase 3**: Add migration function to convert existing dynasties
4. **Phase 4**: Remove abbr fallbacks once all dynasties migrated

### Completed Migrations

**ByTeamYear Structures (18/18 complete)**:
- ✅ `schedulesByTeamYear` - READ tid-first, WRITE dual
- ✅ `preseasonSetupByTeamYear` - READ tid-first, WRITE dual
- ✅ `teamRatingsByTeamYear` - READ tid-first, WRITE dual
- ✅ `coachingStaffByTeamYear` - READ tid-first, WRITE dual
- ✅ `recruitsByTeamYear` - READ tid-first, WRITE dual
- ✅ `lockedCoachingStaffByTeamYear` - READ tid-first, WRITE dual
- ✅ `playersLeavingByTeamYear` - READ tid-first, WRITE dual
- ✅ `conferenceChampionshipDataByTeamYear` - READ tid-first, WRITE dual
- ✅ `bowlEligibilityDataByTeamYear` - READ tid-first, WRITE dual
- ✅ `draftResultsByTeamYear` - READ tid-first, WRITE dual
- ✅ `transferDestinationsByTeamYear` - READ tid-first, WRITE dual
- ✅ `trainingResultsByTeamYear` - READ tid-first, WRITE dual
- ✅ `portalTransferClassByTeamYear` - READ tid-first, WRITE dual (fixed)
- ✅ `fringeCaseClassByTeamYear` - READ tid-first, WRITE dual (fixed)
- ✅ `encourageTransfersByTeamYear` - READ tid-first, WRITE tid-only
- ✅ `recruitingCommitmentsByTeamYear` - READ tid-first, WRITE dual
- ✅ `teamRecordsByTeamYear` - READ tid-first, WRITE dual
- ✅ `rankingsByTeamYear` - legacy, only used in revert (not actively written)

### Remaining Work

**ByTeamYear Structures**: ✅ ALL COMPLETE

**Helper Functions**: ✅ KEY FUNCTIONS COMPLETE
- Core getter functions now use `getCurrentTeamTid()` directly
- Legacy abbr lookups only used as fallback for old data

**Still TODO**:
- Game record legacy fields (`opponent`, `userTeam`, `team1`, `team2`)
- Player `teamsByYear` values (ensure always tid)
- Remaining `getCurrentTeamAbbr()` usages in components (lower priority)

---

## STORAGE TIER SYSTEM ✅ IMPLEMENTED

**Status**: Core infrastructure complete. Payment integration pending.

### User Experience by Tier

| Feature | Free (IndexedDB) | Premium (Firebase) |
|---------|-----------------|-----------------|
| Auto-save | ✅ Yes | ✅ Yes |
| Google sign-in | ✅ Yes (for Sheets) | ✅ Yes |
| Google Sheets integration | ✅ Works | ✅ Works |
| Multi-device sync | ❌ No | ✅ Yes |
| Public sharing | ❌ No | ✅ Yes |
| Storage limit | ~50MB+ | Unlimited |

---

### Implementation Status

#### Phase 1: Storage Abstraction Layer ✅ COMPLETE
- Created `src/services/storage/` module with IndexedDB and Firebase backends
- Installed `localforage` package for IndexedDB access

#### Phase 2: Update DynastyContext.jsx ✅ COMPLETE
- Replaced all localStorage calls with IndexedDB calls
- Routes storage based on `storageService.isPremium()`

#### Phase 3: Decouple Auth from Storage ✅ COMPLETE
- Google Sheets works independently of storage tier
- Uses OAuth tokens from localStorage directly

#### Phase 4: Runtime Tier Switching ✅ COMPLETE
- Toggle available on Home page and Danger Zone
- Tier persisted to localStorage (`cfb-storage-tier`)
- Page reloads after tier change to reload data from correct backend

#### Phase 5: Payment Integration 🔄 NEXT
- [ ] Set up Stripe account
- [ ] Create `users` collection in Firestore for tier tracking
- [ ] Build webhook handler (Vercel serverless or Firebase Functions)
- [ ] Add upgrade UI and Stripe Checkout integration
- [ ] Handle subscription lifecycle (active, canceled, past_due)

### Migration Functions (Built-in)

```javascript
// Upgrade: Free → Premium (IndexedDB → Firebase)
await storageService.migrateToCloud(userId)

// Downgrade: Premium → Free (Firebase → IndexedDB)
await storageService.migrateToLocal()

// Legacy: Old localStorage → IndexedDB (runs on app init)
await storageService.migrateFromLocalStorage()
```

Users can upgrade/downgrade mid-dynasty - data structure is identical in both backends.
