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

All games in `games[]` array use the same format - NO distinction between user/CPU games:

```javascript
{
  id: 'game-xxx',
  year: 2028,
  week: 5,                    // or 'Bowl', 'CCG'
  gameType: 'regular',        // regular, conference_championship, bowl, cfp_*

  // Team identification (tid-based, NOT user-centric)
  team1Tid: 136,              // First team
  team2Tid: 42,               // Second team
  team1Score: 28,
  team2Score: 21,

  // Home/Away (single source of truth)
  homeTeamTid: 136,           // Which team is home (null = neutral site)
}
```

**Key conventions:**
- `homeTeamTid` = source of truth for home/away (null for neutral site games like bowls)
- `location` field: `'home'` = team1 is home, `'away'` = team2 is home, `'neutral'` = no home
- **NO `userTid`** - user involvement determined by comparing user's tid with team1Tid/team2Tid
- **NO legacy fields** (`userTeam`, `opponent`, `teamScore`, `opponentScore`) in new saves

**Player game logs**: Based on box score presence, NOT team fields (handles coach job changes correctly).

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

## CFP Game Shell System (January 2026)

The College Football Playoff uses a "shell" system where all 11 CFP game records are pre-created when seeds are entered, then populated with scores as games are played.

### Shell Structure

When CFP seeds (1-12) are saved, game shells are automatically created:

| Round | Count | Week | Slots |
|-------|-------|------|-------|
| First Round | 4 | Bowl 1 | cfpfr1, cfpfr2, cfpfr3, cfpfr4 |
| Quarterfinals | 4 | Bowl 2 | cfpqf1, cfpqf2, cfpqf3, cfpqf4 |
| Semifinals | 2 | Bowl 3 | cfpsf1, cfpsf2 |
| Championship | 1 | Bowl 4 | cfpnc |

### Key Files

- `src/data/cfpConstants.js` - Bracket structure with `CFP_BRACKET_SLOTS` configuration, bowl config helpers
- `src/context/DynastyContext.jsx`:
  - `createOrUpdateCFPGameShells(games, seedsWithTid, year, bowlConfig)` - Creates shells when seeds saved
  - `propagateCFPWinner(games, savedGame)` - Propagates winner to next round shell
  - `findUserCFPGameShell(dynasty, round, year)` - Find user's game shell by round
  - `saveCFPGames(dynastyId, gamesData, year, roundType)` - Save CFP game results
- `src/components/CFPSeedsModal.jsx` - Seeds entry + bowl configuration UI
- `src/pages/dynasty/Dashboard.jsx` - Auto-shell-creation useEffect for legacy dynasties

### Shell Game Format (tid-based)

```javascript
{
  id: 'cfpqf1-2029',           // {slotId}-{year}
  year: 2029,
  week: 'Bowl 2',
  gameType: 'cfp_quarterfinal',
  team1Tid: 42,                 // Bye seed team (known at creation)
  team2Tid: 131,                // Opponent (set via winner propagation)
  team1Score: null,             // Set when game played
  team2Score: null,
  homeTeamTid: null,            // CFP games are neutral site
  cfpSlot: 'cfpqf1',            // Slot identifier
  cfpRound: 'quarterfinal',     // Round identifier
  bowlName: 'Sugar Bowl',
  isCFPQuarterfinal: true       // Legacy flag
}
```

### Winner Propagation

When a CFP game is saved with scores, the winner's tid is automatically propagated to the next round:

- First Round winner → fills `team2Tid` of corresponding QF shell
- QF winners → fill `team1Tid`/`team2Tid` of SF shells
- SF winners → fill `team1Tid`/`team2Tid` of NC shell

Configuration in `CFP_BRACKET_SLOTS`:
```javascript
cfpfr2: {
  round: 'first_round',
  feedsInto: 'cfpqf1',  // Winner goes to Sugar Bowl
  ...
}
cfpsf1: {
  round: 'semifinal',
  feedsFrom: ['cfpqf1', 'cfpqf2'],  // Receives Sugar & Orange winners
  feedsInto: 'cfpnc',
  ...
}
```

### Dashboard Auto-Shell Creation

For legacy dynasties where seeds were saved before the shell system existed, Dashboard.jsx includes a useEffect that:
1. Detects when seeds exist but shells are missing (or have invalid tids)
2. Creates shells using `createOrUpdateCFPGameShells()`
3. Re-propagates first round winners to QF shells if needed

### Opponent Lookup Functions (Dashboard.jsx)

All opponent lookup functions prioritize shell tids over legacy lookups:

```javascript
// Pattern for all rounds (QF, SF, NC):
const getCFPQuarterfinalOpponent = () => {
  // 1. First check shell's team2Tid
  const qfShell = userCFPQuarterfinalShell || userCFPQuarterfinalGame
  if (qfShell) {
    const userTid = currentDynasty.currentTid
    const opponentTid = qfShell.team1Tid === userTid ? qfShell.team2Tid : qfShell.team1Tid
    if (opponentTid) return opponentTid  // Return tid directly
  }

  // 2. Fallback to legacy bracket calculation
  // ...returns tid or abbr for backward compatibility
}
```

### CFP Seed Entry Format

Seeds stored in `dynasty.cfpSeedsByYear[year]`:
```javascript
[
  { seed: 1, team: 'UGA', tid: 42 },
  { seed: 2, team: 'OSU', tid: 68 },
  // ... seeds 3-12
]
```

**Important**: When looking up user's seed, check tid first:
```javascript
const userCFPSeed = cfpSeeds.find(s => s.tid === userTeamTid || s.team === userTeamAbbr)?.seed
```

### CFP Bowl Configuration (January 2026)

The NY6 bowls rotate which CFP games they host each year. Users configure bowl assignments when entering seeds.

**Storage**: `dynasty.cfpBowlConfigByYear[year]`:
```javascript
{
  seed1: 'Sugar Bowl',    // Bowl for #1 seed's QF game
  seed2: 'Cotton Bowl',   // Bowl for #2 seed's QF game
  seed3: 'Rose Bowl',     // Bowl for #3 seed's QF game
  seed4: 'Orange Bowl',   // Bowl for #4 seed's QF game
  sf1: 'Peach Bowl',      // SF1 (1/4 bracket side)
  sf2: 'Fiesta Bowl'      // SF2 (2/3 bracket side)
}
```

**Key points:**
- Config maps bye seeds to bowl names (seed-based, not slot-based)
- Bracket positions are fixed by seed (4, 1, 3, 2 top to bottom in QF)
- Bowl names float to wherever configured
- When shells are created, `bowlName` comes from `getBowlForSlot(slotId, config)` which maps slot→seed→bowl
- Dashboard and CFPBracket read bowl names from config based on seed
- If no config exists, `DEFAULT_BOWL_CONFIG` is used

**Constants** (`src/data/cfpConstants.js`):
- `CFP_NY6_BOWLS` - All 6 bowl names
- `DEFAULT_BOWL_CONFIG` - Default seed-to-bowl mapping
- `SEED_DESCRIPTIONS` - Human-readable descriptions for UI
- `getBowlForSeed(byeSeed, config)` - Get bowl name for a bye seed
- `getBowlForSlot(slotId, config)` - Get bowl name for a slot (maps to seed internally)

### BULLETPROOF Game Lookup (January 2026)

**CRITICAL**: Always use `cfpSlot` (not bowl name) to identify CFP games. Bowl names are for DISPLAY only.

**Why**: Bowl names rotate between slots each year (user-configurable), so looking up games by bowl name causes mismatches.

**Slot-to-Seed Mapping** (fixed structure):
```javascript
const slotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }
const byeSeedToSlot = { 1: 'cfpqf1', 2: 'cfpqf4', 3: 'cfpqf3', 4: 'cfpqf2' }
```

**Lookup Priority** (in CFPBracket.jsx, CFPSemifinalsModal.jsx):
1. Find by `game.cfpSlot === slotId` (primary)
2. Find by `game.id === `${slotId}-${year}`` (secondary)
3. Find by bye seed team in team1 position (tertiary, for legacy data)
4. **NO bowl name fallback** - this causes confusion!

**Saving QF Games** (in `saveCFPGames`):
- Determine slot from bye seed (seed1 field), NOT bowl name
- Sheet reader (`readCFPQuarterfinalsFromSheet`) now includes `cfpSlot` based on row position

### CFP_BRACKET_FLOW - Single Source of Truth

`src/data/cfpConstants.js` exports `CFP_BRACKET_FLOW` which defines EXACTLY how winners propagate:

```javascript
CFP_BRACKET_FLOW = {
  firstRound: {
    cfpfr1: { higherSeed: 5, lowerSeed: 12, feedsInto: 'cfpqf2', feedsPosition: 'team2' },
    cfpfr2: { higherSeed: 8, lowerSeed: 9, feedsInto: 'cfpqf1', feedsPosition: 'team2' },
    cfpfr3: { higherSeed: 6, lowerSeed: 11, feedsInto: 'cfpqf3', feedsPosition: 'team2' },
    cfpfr4: { higherSeed: 7, lowerSeed: 10, feedsInto: 'cfpqf4', feedsPosition: 'team2' },
  },
  quarterfinals: {
    cfpqf1: { byeSeed: 1, feedsInto: 'cfpsf1', feedsPosition: 'team1' },
    cfpqf2: { byeSeed: 4, feedsInto: 'cfpsf1', feedsPosition: 'team2' },
    cfpqf3: { byeSeed: 3, feedsInto: 'cfpsf2', feedsPosition: 'team1' },
    cfpqf4: { byeSeed: 2, feedsInto: 'cfpsf2', feedsPosition: 'team2' },
  },
  semifinals: {
    cfpsf1: { feedsFrom: ['cfpqf1', 'cfpqf2'], feedsInto: 'cfpnc', feedsPosition: 'team1' },
    cfpsf2: { feedsFrom: ['cfpqf3', 'cfpqf4'], feedsInto: 'cfpnc', feedsPosition: 'team2' },
  },
  championship: {
    cfpnc: { feedsFrom: ['cfpsf1', 'cfpsf2'], feedsInto: null, feedsPosition: null }
  }
}
```

**Key points:**
- `feedsPosition` is explicit: `'team1'` or `'team2'` - no guessing needed
- Winner propagation uses `propagateCFPWinner()` which reads from this config
- If shell is missing during propagation, it's created automatically
- DangerZone "Repair CFP" button re-propagates all completed games

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

## Admin Tools (DangerZone)

Located at `/dynasty/:id/admin`:
- Fix Roster Data - Repairs `teamsByYear` entries
- Clear Local Cache
- Document Size Analysis
- Migrate to Subcollections
- **Roster System Migration** - Migrates to stint-based roster tracking (see below)

### Stint-Based Roster Migration Tool

The "Roster System Migration" section in DangerZone allows migrating dynasties to the new stint-based roster system.

**Workflow:**
1. **Preview Migration** - Dry run that shows what will change without saving
2. **Apply Migration** - Converts all players to stint-based format and saves
3. **Revert** - Restores legacy `teamsByYear`/`classByYear` from backup

**What gets migrated:**
- `teamsByYear` → `teamHistory[]` array of stint objects
- Derives `entryYear`, `entryClass`, `redshirtYear` from existing data
- Legacy fields preserved as `_legacy_teamsByYear` and `_legacy_classByYear`

**Key functions** (`DynastyContext.jsx`):
- `dryRunStintMigration(dynasty)` - Preview changes
- `checkStintMigrationStatus(dynasty)` - Check if already migrated
- `applyStintMigration(dynastyId, force)` - Apply and save
- `revertStintMigration(dynastyId)` - Rollback to legacy

### Year Flip Behavior with Stint System

The year flip (Offseason Week 5→6, Signing Day) now handles both legacy and migrated players:

**For migrated players (with `teamHistory`):**
- `isPlayerOnRoster()` automatically checks stint periods - no `teamsByYear` entry needed
- `wasOnTeamLastSeason()` uses `isPlayerOnRosterStintBased()` for accurate lookup
- Year flip does NOT add `teamsByYear[nextYear]` entries - stints continue automatically
- Only `classByYear[nextYear]` is set for backward compatibility with displays
- Players leaving have their stint closed (`toYear` set to departure year)

**For legacy players (without `teamHistory`):**
- Behavior unchanged - still requires `teamsByYear[previousYear]` to be set
- Year flip adds `teamsByYear[nextYear]` = teamTid

**Class Progression:**
- For migrated players: uses `getPlayerClassForYear()` which calculates from `entryYear`/`entryClass`
- Redshirt detection still works - sets `redshirtYear` on player if they play ≤4 games

### Testing the Migration

**To test the stint-based migration:**
1. Go to DangerZone (`/dynasty/:id/admin`)
2. Download a backup first (always recommended)
3. Click "Preview Migration" to see what will change
4. Review the results - check for any warnings or errors
5. If satisfied, click "Apply Migration"
6. Test advancing weeks to verify roster carryover works

**If something goes wrong:**
- Use "Revert" button in DangerZone to restore legacy system
- The original `teamsByYear` and `classByYear` data is preserved as backup fields

**Implementation Status:**
- ✅ Core stint-based functions (`isPlayerOnRosterStintBased`, `getPlayerClassForYear`)
- ✅ Migration tool in DangerZone (preview, apply, revert)
- ✅ Year flip logic supports both systems
- ✅ `isPlayerOnRoster` auto-detects and uses stint system when available
- ✅ Google Sheets integrations updated
- ✅ Dashboard roster filters updated

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

---

## RESOLVED: CFP Bracket/Modal Team Mismatch Bug (January 2026)

### What Was Fixed

The CFP bracket had issues with teams showing in wrong positions. The fix implemented a **bulletproof** system:

1. **`CFP_BRACKET_FLOW`** in `cfpConstants.js` - Single source of truth for bracket structure with explicit `feedsPosition` ('team1' or 'team2')

2. **`propagateCFPWinner`** updated to use `CFP_BRACKET_FLOW` - No more guessing which position a winner goes to

3. **All lookup functions** now use `cfpSlot` as primary identifier - bowl names are display-only

4. **DangerZone repair function** enhanced with Phase 3 to re-propagate all completed game winners

### Key Files Modified

- `src/data/cfpConstants.js` - Added `CFP_BRACKET_FLOW` and `getBracketFlowConfig()`
- `src/context/DynastyContext.jsx` - Updated `propagateCFPWinner()` and `createOrUpdateCFPGameShells()`
- `src/pages/dynasty/CFPBracket.jsx` - cfpSlot-first lookups in `getQFGameBySlot()` and `getSFGameBySlot()`
- `src/components/CFPSemifinalsModal.jsx` - cfpSlot-first lookups
- `src/components/CFPChampionshipModal.jsx` - cfpSlot-first lookups
- `src/pages/dynasty/DangerZone.jsx` - Enhanced repair to re-propagate winners

### Slot-to-Bye-Seed Reference

```javascript
const slotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }

// SF1 (cfpsf1): Winners of cfpqf1 + cfpqf2 (1/4 bracket side)
// SF2 (cfpsf2): Winners of cfpqf3 + cfpqf4 (2/3 bracket side)
```

### To Fix Existing Corrupt Data

Go to DangerZone → "Repair CFP Games" - this will:
1. Add missing `tid` to seeds
2. Fix slot assignments
3. Re-propagate all completed game winners to their next rounds

---

## RESOLVED: Game Deletion Persistence Issue (January 2026)

**Status**: ✅ FIXED

### Problem (Now Fixed)

When a user deleted a game (via "Remove Duplicates" or "Delete Specific Game" in DangerZone), the game was removed from the UI. However, if the user swiped out of the app and returned, the deleted games would reappear.

### Root Cause

The `saveGamesToSubcollection` function has a `deleteOrphans` option that defaults to `false`. When games were saved:
1. The filtered `games` array was passed to `saveGamesToSubcollection`
2. But with `deleteOrphans: false`, the function only ADDED/UPDATED games, not deleted removed ones
3. The deleted game's document remained in the Firestore subcollection
4. On app reload, `getGamesSubcollection` fetched ALL documents, including the "deleted" one

### The Fix

In `src/context/DynastyContext.jsx` line ~4630, changed:
```javascript
saveGamesToSubcollection(dynastyId, mainDocUpdates.games)
```
To:
```javascript
saveGamesToSubcollection(dynastyId, mainDocUpdates.games, { deleteOrphans: true })
```

This ensures that when games are saved, any games that exist in Firestore but are NOT in the new games array get deleted.

### Note for Future

If games are still not persisting after this fix, check:
1. Is the dynasty using cloud storage (`storageType: 'cloud'`)? The fix only applies to cloud/Firestore storage.
2. For local storage (IndexedDB), the persistence should already work correctly.
3. Check browser console for any errors during save operations.

---

## Unified Team Ranking System (January 2026)

**Status**: Implemented

All pages should use the unified ranking helpers to display consistent team rankings.

### Helper Functions (`DynastyContext.jsx`)

```javascript
// Get ranking for any team in any year
getTeamRanking(dynasty, tidOrAbbr, year)
// Returns: { rank: number, source: 'final_poll'|'game', week?: number } | null

// Get ranking for current user team in current year
getCurrentTeamRanking(dynasty)
// Returns: { rank: number, source: 'final_poll'|'game', week?: number } | null
```

### Priority Order

1. **Final Poll Ranking** - If `finalPollsByYear[year].media` contains the team, use that ranking (end of season, authoritative)
2. **Game Ranking** - Otherwise, get `team1Rank` or `team2Rank` from the most recent played game in chronological order

### Display Convention

| Source | Badge Color | Example |
|--------|-------------|---------|
| Final Poll | Yellow (`#fbbf24`) | `#4` (end of season) |
| In-Season Game | Gray (`#6b7280`) | `#2` (current ranking) |

### Pages Updated

- **Dashboard.jsx** - Uses `getCurrentTeamRanking()` for header display
- **TeamYear.jsx** - Uses `getTeamRanking()` with visual distinction for final vs in-season
- **Team.jsx** - Still uses `getFinalRanking()` for team history (shows most recent final ranking across all years)

### CFP Seed vs AP Ranking

Note that CFP seed (e.g., "#4 Seed") is **separate** from AP ranking. A team could be:
- AP #2 (their media poll ranking)
- CFP #4 Seed (their playoff seeding)

The unified ranking system handles AP/Coaches poll rankings. CFP seeds are displayed separately in CFP-related UI components.

---

## 🚨 MAJOR REFACTOR: Stint-Based Roster System (January 2026)

**Status**: 🔄 IN PROGRESS

### Problem Statement

The current roster system using `teamsByYear` and `classByYear` is fragile:
- Year flip requires manually adding `teamsByYear[newYear]` for every returning player
- If any code path misses this, players "vanish" from the roster
- Bug discovered: 74 players lost when advancing from 2031→2032

### Solution: Stint-Based Roster + Calculated Class

1. **Stint-based roster**: Player has array of "stints" (periods on a team)
2. **Calculated class**: Derive class from `entryYear` + `entryClass` + `redshirtYear`

**Key benefit**: Year flip does NOTHING for roster. Players automatically continue until explicitly removed.

---

### NEW Player Data Model

```javascript
player = {
  pid: 'uuid',
  name: 'John Smith',
  position: 'QB',

  // === ROSTER MEMBERSHIP (stint-based) ===
  teamHistory: [
    { teamTid: 42, fromYear: 2029, toYear: null, reason: 'recruited' }
  ],

  // === CLASS/ELIGIBILITY (calculated) ===
  entryYear: 2029,           // Year joined THIS program
  entryClass: 'Fr',          // Class when joined (Fr, So, Jr, RS Jr, etc.)
  redshirtYear: null,        // Year redshirted AT THIS SCHOOL (null = none)

  // === FLAGS ===
  isRecruit: false,
  isHonorOnly: false,
  isPortal: false,

  // === STATS (unchanged) ===
  statsByYear: { ... },

  // === LEGACY (kept during migration) ===
  _legacy_teamsByYear: { ... },
  _legacy_classByYear: { ... },
}
```

---

### Core Helper Functions

```javascript
// Check if player is on roster for given team/year
function isPlayerOnRoster(player, teamTid, year) {
  if (player.isHonorOnly) return false
  if (getPlayerClass(player, year) === null) return false  // Graduated

  const stint = (player.teamHistory || []).find(s =>
    s.teamTid === teamTid &&
    year >= s.fromYear &&
    (s.toYear === null || year <= s.toYear)
  )
  return stint !== null
}

// Calculate class for any year
const CLASS_ORDER = ['Fr', 'So', 'Jr', 'Sr']
const RS_CLASS_ORDER = ['RS Fr', 'RS So', 'RS Jr', 'RS Sr']

function getPlayerClass(player, year) {
  if (year < player.entryYear) return null

  const yearsSinceEntry = year - player.entryYear
  const entryIsRS = player.entryClass?.startsWith('RS ')
  const baseEntryClass = player.entryClass?.replace('RS ', '') || 'Fr'

  const useRSTrack = entryIsRS || (player.redshirtYear !== null && year > player.redshirtYear)
  const track = useRSTrack ? RS_CLASS_ORDER : CLASS_ORDER
  const entryIndex = CLASS_ORDER.indexOf(baseEntryClass)

  let currentIndex = entryIndex + yearsSinceEntry
  if (player.redshirtYear !== null && year > player.redshirtYear && !entryIsRS) {
    currentIndex = entryIndex + yearsSinceEntry - 1
  }

  return track[currentIndex] ?? null
}
```

---

### Game Rules (CFB 25)

- Max 5 seasons total eligibility
- 1 redshirt year max (can be taken any year)
- JUCO: Players come in with class (JUCO Jr → enters as Jr)
- Portal transfers: Class assigned via Portal Transfer Class Modal
- No medical redshirts

---

### Migration Requirements

#### Files to Update (262+ teamsByYear, 75+ classByYear usages)

**TIER 1 - CRITICAL**
| File | What to Update |
|------|----------------|
| `DynastyContext.jsx` | `isPlayerOnRoster()`, `getCurrentRoster()`, class progression, all writes |
| `sheetsService.js` | 8 sheet functions (roster dropdowns, players leaving, etc.) |
| `BoxScoreSheetModal.jsx` | `getRosterForTeamByTid()` |
| `GameEdit.jsx` | 5 roster filtering locations |

**TIER 2 - HIGH**
| File | What to Update |
|------|----------------|
| `Dashboard.jsx` | Enrollment, transfers, display (15+ locations) |
| `Player.jsx` | Career timeline (10+ locations) |
| `PlayerEditModal.jsx` | Year-by-year editing |
| `GameEntryModal.jsx` | Player dropdowns |

**TIER 3 - MEDIUM**
| File | What to Update |
|------|----------------|
| `TeamYear.jsx` | Roster display |
| `Roster.jsx` | Roster display |
| `Team.jsx` | Team membership |
| `DangerZone.jsx` | Migration tool |
| `RosterEditModal.jsx` | Roster filtering |
| `StatsEntryModal.jsx` | Player dropdowns |

**TIER 4 - LOW (Display Only)**
| File | What to Update |
|------|----------------|
| `Awards.jsx`, `AllAmericans.jsx`, `AllConference.jsx` | Team matching |
| `Recruiting.jsx` | Enrollment tracking |
| `NewsTicker/useTickerSections.js` | Player display |

---

### Migration Function

```javascript
function migratePlayerToNewSystem(player) {
  const teamHistory = deriveTeamHistory(player.teamsByYear)
  const entryYear = player.recruitYear ||
    Math.min(...Object.keys(player.teamsByYear || {}).map(Number))
  const entryClass = player.classByYear?.[entryYear] || player.year || 'Fr'
  const redshirtYear = detectRedshirtYear(player.classByYear)

  return {
    ...player,
    teamHistory, entryYear, entryClass, redshirtYear,
    _legacy_teamsByYear: player.teamsByYear,
    _legacy_classByYear: player.classByYear,
  }
}

function deriveTeamHistory(teamsByYear) {
  if (!teamsByYear) return []
  const years = Object.keys(teamsByYear).map(Number).sort((a, b) => a - b)
  const stints = []
  let currentStint = null

  for (const year of years) {
    const teamTid = teamsByYear[year]
    if (!currentStint || currentStint.teamTid !== teamTid) {
      if (currentStint) currentStint.toYear = year - 1
      currentStint = { teamTid, fromYear: year, toYear: null,
        reason: stints.length === 0 ? 'recruited' : 'transfer' }
      stints.push(currentStint)
    }
  }
  return stints
}

function detectRedshirtYear(classByYear) {
  if (!classByYear) return null
  const years = Object.keys(classByYear).map(Number).sort((a, b) => a - b)
  for (let i = 0; i < years.length - 1; i++) {
    const thisClass = classByYear[years[i]]
    const nextClass = classByYear[years[i + 1]]
    if (thisClass && nextClass && !thisClass.startsWith('RS ') &&
        nextClass === `RS ${thisClass}`) {
      return years[i]
    }
  }
  return null
}
```

---

### Migration Phases

1. **Backup**: Export dynasty to JSON
2. **Dry Run**: Validate migration without saving
3. **Migrate**: Apply new fields, keep legacy fields
4. **Validate**: Run app, compare old vs new results
5. **Cleanup**: Remove legacy fields after confirmed stable

---

### DangerZone Tool

Add migration tool with:
- Export Backup button
- Dry Run (validate without saving)
- Apply Migration
- Revert Migration (restore from legacy fields)

---

### Year Flip Changes (The Big Win)

**BEFORE**: Must manually add `teamsByYear[newYear]` for every player (buggy)
**AFTER**: Do nothing! Ongoing stints (`toYear: null`) automatically include future years

---

## CRITICAL: Firestore Memory-Only Cache (January 2026)

**Status**: ✅ IMPLEMENTED

### Problem

Firestore's default IndexedDB-based offline persistence was causing data inconsistencies:
- Writes would complete "successfully" but only be cached locally
- When switching dynasties and returning, the local cache would serve stale data
- Stint migration data showed 819 players immediately after save, but only 405 after app reload
- `waitForPendingWrites()` was returning success even when data hadn't reached the server

### Solution

Disabled Firestore's IndexedDB persistence entirely by using memory-only cache:

```javascript
// src/config/firebase.js
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
```

### Effects

**Pros:**
- All reads/writes go directly to Firestore server
- No more cache-related data inconsistencies
- Data is guaranteed to be the server's true state

**Cons:**
- App requires network connection to function
- Slightly slower reads (no local cache)
- Higher Firestore read costs (no cache hits)

### Related Server Sync Mechanisms

In `src/services/dynastyService.js`:

```javascript
// After batch commits, ensure server acknowledgment:
await waitForPendingWrites(db)

// When reading protection flags, bypass any caching:
const dynastyDoc = await getDocFromServer(dynastyRef)
```

### Migration Markers

To track which data version is persisted on the server:

```javascript
// On player during migration:
player._teamHistoryMigratedAt = Date.now()

// On dynasty document:
dynasty._stintMigrationApplied = true
```

---

## Team History Editing (PlayerEditModal)

**Status**: ✅ IMPLEMENTED

The `PlayerEditModal.jsx` component now includes a "Team History" tab for editing player stints directly.

### UI Features

- **View all stints**: Shows `teamTid`, `fromYear`, `toYear`, `reason` for each stint
- **Edit stints**: Modify any field (team dropdown, year inputs)
- **Add new stint**: Button to add a new stint entry
- **Delete stints**: Remove individual stints
- **Reason options**: recruited, portal_in, juco_in, transfer, added

### Data Validation

- `fromYear` is required
- `toYear` can be null (ongoing stint) or a year >= fromYear
- `teamTid` validated against `dynasty.teams`
- Changes saved to `player.teamHistory[]` array

### Key Functions

```javascript
// In PlayerEditModal.jsx:
handleTeamHistorySave(updatedTeamHistory) // Validates and saves stints
validateTeamHistory(stints) // Checks for overlaps, invalid data
```

---

## Stint Migration Protection Mechanisms

### Double-Write Prevention

The `savePlayersToSubcollection` function checks for `_stintMigrationApplied` flag before saving:

```javascript
// In dynastyService.js savePlayersToSubcollection:
const dynastyDoc = await getDocFromServer(dynastyRef)
if (dynastyDoc.exists() && dynastyDoc.data()._stintMigrationApplied) {
  console.warn(`ABORT: Dynasty ${dynastyId} has _stintMigrationApplied flag`)
  return // Skip save to prevent overwriting with old data
}
```

### Verification After Migration

```javascript
// In DynastyContext.jsx applyStintMigration:
const updated = await getPlayersSubcollection(dynastyId)
const withHistory = updated.filter(p => p.teamHistory?.length > 0)
console.log(`Verified: ${withHistory.length} players with teamHistory`)
```

### Debug Logging

Search console for these log prefixes:
- `[savePlayersToSubcollection]` - Batch save operations
- `[getPlayersSubcollection]` - Player load with teamHistory counts
- `[DynastyContext]` - Dynasty load/save with migration status
- `[processMigrationPersistence]` - Migration marker verification
