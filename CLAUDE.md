# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

**IMPORTANT**: Update this file when you complete features or make significant changes.

---

## ✅ COMPLETED: Google OAuth Verification

**Status**: Verified and published (January 2026)

- ✅ Privacy Policy page (`/privacy`)
- ✅ Terms of Service page (`/terms`)
- ✅ Privacy/Terms links on Login page
- ✅ Domain verified via Google Search Console
- ✅ OAuth branding verified and published

Users now see a clean, verified Google sign-in experience.

---

## ✅ COMPLETED: News Ticker Simplification

**Status**: Simplified and working (January 2026)

**Problem**: Ticker was overly complex with 15+ section types, random selection logic, and buggy behavior showing only bowl/conf champ data repeatedly.

**Solution**: Complete rewrite with simplified architecture:
- 7 clean section types: season overview, upcoming game, game log, last game recap, season leaders, bowl history, career summary
- Simple sequential cycling (no random selection or memory tracking)
- Clean animation: hold → scroll → hold → advance
- Removed all debug code

**Files**:
- `src/components/NewsTicker/NewsTicker.jsx` - ~290 lines (was ~330)
- `src/components/NewsTicker/useTickerSections.js` - ~275 lines (was ~465)

Can add more section types later if needed (awards, all-americans, rankings, etc.)

---

## CRITICAL: Team-Centric Coding Requirement

**ALWAYS store data at the TEAM level, NOT the user/dynasty level.**

When users switch teams during their coaching career, dynasty-level data causes the old team's data to appear under the new team.

### The Pattern

**WRONG** (dynasty-level):
```javascript
dynasty.schedule = [...]
dynasty.recruits = [...]
```

**CORRECT** (team-centric):
```javascript
dynasty.schedulesByTeamYear[teamAbbr][year] = [...]
dynasty.recruitingCommitmentsByTeamYear[teamAbbr][year] = {...}
```

### Checklist for New Features

1. Ask: "Does this data belong to a specific team?"
2. If YES → Use `dynasty.{feature}ByTeamYear[teamAbbr][year]` pattern
3. Tag individual records with `team: teamAbbr` field
4. Create helper function like `getCurrent{Feature}(dynasty)` in DynastyContext
5. Filter by team when displaying data

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

## Code Quality Requirements

**IMPORTANT**: After every code change, run `npm run build` to check for errors. Fix any errors before considering the change complete.

## Git Commit Policy

Do NOT commit automatically. Only commit when user explicitly requests it.

When committing:
1. `git add -A`
2. `git status` to verify
3. Create commit with descriptive message
4. `git push` immediately

## Architecture

### Context Providers

1. **AuthProvider** (`src/context/AuthContext.jsx`) - Firebase Google Auth
2. **DynastyProvider** (`src/context/DynastyContext.jsx`) - Dynasty CRUD, dual-mode storage

### Data Storage Modes

**Dev Mode** (`VITE_DEV_MODE=true`): localStorage, no auth required
**Production Mode**: Firebase Firestore, requires Google OAuth

### Team-Centric Data Structures

All implemented in `DynastyContext.jsx` with helper functions:

| Data | Storage | Helper |
|------|---------|--------|
| Schedule | `schedulesByTeamYear[team][year]` | `getCurrentSchedule()` |
| Roster | `players[]` with `teamsByYear` | `getCurrentRoster()` |
| PreseasonSetup | `preseasonSetupByTeamYear[team][year]` | `getCurrentPreseasonSetup()` |
| TeamRatings | `teamRatingsByTeamYear[team][year]` | `getCurrentTeamRatings()` |
| CoachingStaff | `coachingStaffByTeamYear[team][year]` | `getCurrentCoachingStaff()` |
| GoogleSheet | `googleSheetsByTeam[team]` | `getCurrentGoogleSheet()` |
| Recruits | `recruitsByTeamYear[team][year]` | `getCurrentRecruits()` |
| Games | `games[]` with `userTeam` field | Filter by `userTeam` |
| Commitments | `recruitingCommitmentsByTeamYear[team][year][key]` | See Dashboard.jsx |

**Special structures:**
- `coachTeamByYear[year]` - Locked at Week 1 of regular season
- `lockedCoachingStaffByYear[team][year]` - Locked at end of regular season (Week 12)
- `playersLeavingByYear[year]` - Players graduating/transferring/declaring
- `portalTransferClassByYear[year]` - Portal transfer class assignments
- `fringeCaseClassByYear[year]` - Fringe case (5-9 games) class assignments
- `conferenceChampionshipDataByYear[year]` - CC week answers (madeChampionship, opponent, pendingFiring)
- `bowlEligibilityDataByYear[year]` - Bowl eligibility answers
- `cfpResultsByYear[year]` - CFP game results (firstRound, quarterfinals, semifinals, championship)

### Custom Conference Alignment

Conference data uses automatic year-based inheritance:

```javascript
dynasty = {
  // Primary storage - by year (only stored when user edits)
  customConferencesByYear: {
    2025: { "ACC": [...], "Big Ten": [...], ... },
    // 2026, 2027 not stored = inherit from 2025
    2028: { "ACC": [...], ... }  // Only stored if user edited
  },
  // Legacy field - kept updated for backwards compatibility
  customConferences: { ... }
}
```

**Key behavior:**
- If user doesn't touch conferences, they automatically inherit from previous year
- `getCustomConferencesForYear(dynasty, year)` walks back through years to find most recent data
- Only stores data for years where user actually made changes
- `getCurrentCustomConferences(dynasty)` - Get conferences for current year (with fallback)

**Helper functions** (in DynastyContext.jsx):
- `getCustomConferencesForYear(dynasty, year)` - Get conferences for specific year, walks back if not found
- `getCurrentCustomConferences(dynasty)` - Get conferences for current year
- `getTeamConferenceForDynasty(dynasty, teamAbbr, year)` - Get a team's conference

**Default conferences** defined in:
- `src/data/conferenceTeams.js` - Used when no custom conferences exist
- `src/services/sheetsService.js` - DEFAULT_CONFERENCES for Google Sheets

### Phase System

1. **Preseason** - Week 0, setup (schedule/roster entry)
2. **Regular Season** - Weeks 1-12
3. **Conference Championship** - Separate phase (NOT postseason week 1)
4. **Postseason** - Weeks 1-5 (Bowl Weeks)
5. **Offseason** - Weeks 1-8:
   - Week 1: Players Leaving
   - Weeks 2-5: Recruiting Weeks 1-4
   - Week 6: National Signing Day (YEAR FLIP happens here) - Tasks:
     1. Signing Day (final recruiting commitments) - MUST complete first
     2. Transfer Destinations
     3. Recruiting Class Rank
     4. Position Changes
     5. Portal Transfer Class Assignment (if portal transfers exist)
     6. Fringe Case Class Assignment (if players with 5-9 games exist)
   - Week 7: Training Camp (Training Results, Recruit Overalls, Encourage Transfers)
   - Week 8: Offseason Complete (triggers `advanceToNewSeason()`)

### Key Files

- `src/context/DynastyContext.jsx` - All data operations and helpers
- `src/pages/dynasty/Dashboard.jsx` - Main dashboard with phase-specific tasks
- `src/pages/dynasty/TeamYear.jsx` - Team season page with Stats modal
- `src/pages/dynasty/Player.jsx` - Player profile with stats tables
- `src/pages/dynasty/CoachCareer.jsx` - Coach career page with team links and season tiles
- `src/pages/dynasty/DangerZone.jsx` - Admin Tools page with data repair utilities
- `src/data/teamAbbreviations.js` - Team abbreviations and colors
- `src/services/sheetsService.js` - Google Sheets integration

### Modal Pattern

```jsx
<div
  className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
  style={{ margin: 0 }}
>
  <div onClick={(e) => e.stopPropagation()}>
    {/* Modal content */}
  </div>
</div>
```

## Player Data Architecture

### teamsByYear - THE Source of Truth for Roster Membership

**`teamsByYear` is the ONLY field that determines roster membership.** All other fields (`isRecruit`, legacy departure fields, etc.) are ignored for roster filtering.

```javascript
player.teamsByYear = { 2025: 'UT', 2026: 'UT', 2027: 'MICH' }
```

**Used for**:
- Roster filtering via `isPlayerOnRoster()` - THE ONLY CHECK
- Stats table team display per year (Player.jsx)
- Career Timeline display (Player.jsx)
- Historical roster accuracy when coaches change teams

**Updated automatically in**:
- `saveRoster()` - Sets `teamsByYear[year] = teamAbbr`
- Class progression (Signing Day) - Sets `teamsByYear[nextYear]` for continuing players
- `advanceToNewSeason()` - Sets `teamsByYear[currentYear]` for all active players
- `handleTransferDestinationsSave()` - Sets `teamsByYear[nextYear] = destination`
- Recruit creation - Sets `teamsByYear[enrollmentYear] = team`

### Unified Roster Membership Check - `isPlayerOnRoster()`

**ALWAYS use `isPlayerOnRoster(player, teamAbbr, year)` for roster filtering.**

```javascript
import { isPlayerOnRoster } from '../context/DynastyContext'

// Filter players for a specific team/year
const rosterPlayers = players.filter(p => isPlayerOnRoster(p, teamAbbr, year))
```

**The function is simple**:
```javascript
function isPlayerOnRoster(player, teamAbbr, year) {
  if (player.isHonorOnly) return false
  return player.teamsByYear?.[year] === teamAbbr
}
```

That's it. No `isRecruit` checks, no legacy field checks. If `teamsByYear[year] === team`, they're on the roster.

### Player classByYear (Class History Tracking)

Each player has a `classByYear` object tracking what class they were each season:
```javascript
player.classByYear = { 2025: 'Fr', 2026: 'So', 2027: 'RS So' }
```

**Used for**:
- TeamYear.jsx roster display - Shows class for the specific season being viewed
- PlayerEditModal Roster History - Edit class alongside team for each year

**Updated automatically in**:
- `saveRoster()` - Sets classByYear[year] = player.year
- `advanceWeek()` - Sets classByYear during Signing Day class progression (offseason week 5→6)
- `advanceToNewSeason()` - Sets classByYear for recruit conversion and adds tracking for continuing players

### Player Movements System (Display Only)

The `movements[]` array tracks career history for DISPLAY purposes only. It does NOT affect roster membership.

```javascript
player.movements = [
  { year: 2025, type: 'recruited', from: null, to: 'UT' },
  { year: 2027, type: 'entered_portal', from: 'UT', to: null, reason: 'Transfer' },
  { year: 2027, type: 'recommit', from: null, to: 'UT', reason: 'Returned from portal' }
]
```

**Movement Types** (`MOVEMENT_TYPES` in DynastyContext.jsx):
| Type | When | Description |
|------|------|-------------|
| `recruited` | HS/JUCO signs | Player recruited to team |
| `portal_in` | Portal transfer commits | Transfer portal player joins |
| `entered_portal` | Player enters portal | Player leaving via transfer |
| `transfer` | Transfer finalized | Player moved to new team |
| `departure` | Graduating/Pro Draft | Player leaves (no destination) |
| `added` | Manual roster add | Added via editor |
| `removed` | Manual roster delete | Removed via editor |
| `recommit` | Was leaving, came back | Returned after entering portal |

**Career Timeline** (Player.jsx) is built from `teamsByYear` as source of truth, with `movements[]` providing context for how/why team changes happened.

### Player Lifecycle Through Offseason

| Player Type | Week 1 (Leaving) | Week 6 (Signing Day) | Week 8 (advanceToNewSeason) | Result |
|-------------|------------------|----------------------|----------------------------|--------|
| **Normal returning** | - | Gets `teamsByYear[newYear]` | Confirmed | On roster |
| **New HS recruit** | - | Created with `teamsByYear[newYear]` | `isRecruit: false` | On roster |
| **Portal transfer in** | - | Created with `teamsByYear[newYear]` | `isRecruit: false` | On roster |
| **Graduating** | Added to leaving list | Skipped | No `teamsByYear[newYear]` | NOT on roster |
| **Pro Draft** | Added to leaving list | Skipped | No `teamsByYear[newYear]` | NOT on roster |
| **Transfer out** | Added to leaving list | Gets `teamsByYear[newYear] = newTeam` | On new team | NOT on old roster |
| **Recommit** | Added to leaving list | Gets `teamsByYear[newYear] = sameTeam` | `isRecruit: false` | On roster |

### Class Progression

**CLASS_PROGRESSION mapping** (in DynastyContext.jsx):
```javascript
{
  'HS': 'Fr',
  'JUCO Fr': 'Fr',   // Drop JUCO prefix, keep class
  'JUCO So': 'So',
  'JUCO Jr': 'Jr',
  'JUCO Sr': 'Sr',
  'Fr': 'So',
  'RS Fr': 'RS So',
  'So': 'Jr',
  'RS So': 'RS Jr',
  'Jr': 'Sr',
  'RS Jr': 'RS Sr',
  'Sr': 'RS Sr',
  'RS Sr': 'RS Sr'
}
```

**Redshirt rules**: Players with ≤4 games get RS prefix added (unless already RS)

### Player statsByYear (Stats Storage) - SINGLE SOURCE OF TRUTH

**All stats are stored ONLY in `player.statsByYear`**. Stats display is based purely on whether data exists - no `isRecruit` or other flag checks.

```javascript
player.statsByYear = {
  2025: {
    gamesPlayed: 13,
    snapsPlayed: 850,
    passing: { cmp: 250, att: 350, yds: 3000, td: 25, int: 5, lng: 65, sacks: 10 },
    rushing: { car: 50, yds: 200, td: 3, lng: 25, fumbles: 1 },
    receiving: { rec: 0, yds: 0, td: 0, lng: 0 },
    defense: { tkl: 0, tfl: 0, sacks: 0, ff: 0, int: 0, td: 0 },
    kicking: { fgm: 0, fga: 0, lng: 0, xpm: 0, xpa: 0 },
    punting: { punts: 0, yds: 0, lng: 0, in20: 0 },
    kickReturn: { ret: 0, yds: 0, td: 0, lng: 0 },
    puntReturn: { ret: 0, yds: 0, td: 0, lng: 0 }
  }
}
```

**Stats updates**:
1. **Box score delta tracking** - When games with box scores are saved, `processBoxScoreSave()` calculates the delta between new and old stats and applies it to `player.statsByYear`. This prevents double-counting on edits.
   - Each game stores `statsContributed` for future delta calculations
   - On game deletion, `processBoxScoreDelete()` subtracts the contribution
2. **Manual entry** - TeamStats.jsx saves games/snaps and detailed stats directly to `player.statsByYear`
3. **PlayerEditModal** - Can edit individual player stats per year

**Reading stats** (in Player.jsx, TeamStats.jsx, DynastyRecords.jsx):
- Read ONLY from `player.statsByYear[year]` - NO box score fallbacks
- Stats display if data exists (no `isRecruit` check)

**Stats Entry Workflow** (TeamStats.jsx):
1. **GP/Snaps Entry** (StatsEntryModal) - Enter games played and snaps for entire roster
2. **Detailed Stats Entry** (DetailedStatsEntryModal) - Enter passing, rushing, etc. stats
   - Sheet includes Snaps column (read-only) and sorts by snaps descending
   - Players with most snaps appear at top for quick data entry

## Important Notes

### Firestore Updates

Use dot notation for nested fields in production:
```javascript
// Correct - merges field
{ 'preseasonSetup.scheduleEntered': true }

// Wrong - replaces entire object
{ preseasonSetup: { scheduleEntered: true } }
```

### Team Colors

Use `useTeamColors(teamName)` hook for dynamic theming.

### View-Only Mode

When `isViewOnly` is true from `useDynasty()`, hide all edit/add functionality.

### Unified Game System

All games stored in `games[]` array with `gameType` field:
- Game types: `regular`, `conference_championship`, `bowl`, `cfp_first_round`, `cfp_quarterfinal`, `cfp_semifinal`, `cfp_championship`
- **CPU games**: Have `team1`/`team2` but NO `opponent` AND NO `userTeam`
- **User games**: Have `opponent` field (and `userTeam`)

### The `userTeam` Field on Games - Critical Understanding

The `userTeam` field on games identifies **which team the coach was coaching when that game was played**. It is ESSENTIAL for team-centric data but must be used correctly.

**What `userTeam` does:**
- Set automatically when saving user games: `userTeam = currentTeamAbbr`
- Allows filtering games by which team the coach was coaching
- Differentiates user games from CPU vs CPU games (CPU games have NO `userTeam`)

**CORRECT uses of `userTeam`:**
```javascript
// 1. Detecting CPU vs user games
const isCPUGame = !g.userTeam && !g.opponent && g.team1 && g.team2

// 2. Filtering games for a SPECIFIC team view (TeamYear, Dashboard)
const teamGames = games.filter(g => g.userTeam === teamAbbr)

// 3. Calculating coach career stats (all games where coach was involved)
const coachGames = games.filter(g => g.userTeam)  // Any team coached

// 4. News ticker showing CURRENT team highlights
const currentTeamGames = games.filter(g => g.userTeam === currentTeamAbbr)
```

**WRONG uses of `userTeam`:**
```javascript
// DON'T filter player game logs by userTeam - use box score presence instead!
// WRONG:
const playerGames = games.filter(g => g.userTeam === playerTeam && g.boxScore)

// CORRECT:
const playerGames = games.filter(g => g.boxScore && g.year === year)
// Then search boxScore.home and boxScore.away for the player
```

**Why player game logs must NOT use `userTeam`:**
When coaches take new jobs, `userTeam` changes. A player who appeared in a CFP game while the coach was at Team A won't show that game in their log if we filter by `userTeam` after the coach moves to Team B. The box score approach ensures player stats display correctly regardless of coaching changes.

### Player Game Log - Box Score Based

**CRITICAL**: Player game logs are based purely on box score presence, NOT on `userTeam`.

```javascript
// Simple logic: if player is in box score, show the game
const yearGames = dynasty.games.filter(g => g.year === year && g.boxScore)
// Then search for player in boxScore.home and boxScore.away
```

**Why this matters**: When coaches take new jobs, filtering by `userTeam` breaks historical data. The box score approach ensures player stats display correctly regardless of coaching changes.

**Game order sorting** for display (highest = most recent):
- Regular season: week number (1-12)
- Conference Championship: 100
- CFP First Round: 101
- CFP Quarterfinal: 102
- CFP Semifinal: 103
- CFP Championship: 104
- Bowl games: 100 + week

### CFP First Round Data Format

CFP First Round games in `cfpResultsByYear[year].firstRound[]`:
```javascript
{
  seed1: 5,        // Higher seed (home team)
  seed2: 12,       // Lower seed (away team)
  team1: 'TEAM',   // Higher seed team (home)
  team2: 'OPP',    // Lower seed team (away)
  team1Score: 35,
  team2Score: 28,
  winner: 'TEAM'
}
```
**IMPORTANT**: Higher seed = home team (team1). Sheet data must be transformed from `higherSeed`/`lowerSeed` format.

### Google Sheets OAuth

- Requires OAuth access token (not Firebase ID token)
- Token stored in localStorage with 1-hour expiry
- If expired, user must sign out and back in
- Scopes: `spreadsheets` and `drive.file`

### Schedule Card Design Pattern

Both Dashboard.jsx and TeamYear.jsx use a consistent schedule card design:

```jsx
<div className="flex items-center w-full overflow-hidden">
  {/* W/L or Week Badge - left side */}
  <div className="w-10 sm:w-14 flex-shrink-0 text-center py-2 sm:py-3 rounded-l-xl font-bold text-[10px] sm:text-sm"
    style={{ backgroundColor: hasResult ? (isWin ? '#22c55e' : '#ef4444') : oppColors.textColor, color: ... }}>
    {hasResult ? (isWin ? 'W' : 'L') : weekLabel}
  </div>

  {/* Game Info - right side */}
  <div className="flex-1 flex items-center justify-between py-2 sm:py-3 px-2 sm:px-4 rounded-r-xl min-w-0"
    style={{ backgroundColor: oppColors.backgroundColor }}>
    <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
      {/* Location badge: w-6 h-6 sm:w-8 sm:h-8 */}
      {/* Logo: w-7 h-7 sm:w-10 sm:h-10 */}
      {/* Team name + week subtitle */}
    </div>
    {/* Score: text-sm sm:text-lg */}
  </div>
</div>
```

**Mobile-responsive sizing**:
- Week badge: `w-10 sm:w-14`
- Location badge: `w-6 h-6 sm:w-8 sm:h-8`
- Logo: `w-7 h-7 sm:w-10 sm:h-10`
- Gaps: `gap-1.5 sm:gap-3`
- Text: `text-xs sm:text-base` for names, `text-[9px] sm:text-xs` for subtitles

## Admin Tools Page

The Admin Tools page (`/dynasty/:id/admin`) provides data repair utilities:

- **Fix Roster Data** (`cleanupRosterData()` in DynastyContext) - Repairs roster issues:
  - Removes `teamsByYear` entries for players who departed in prior years
  - Ensures recruits have proper `teamsByYear` entries for their enrollment year
  - Handles recommit cases (players who returned after entering portal)

- **Clear Local Cache** - Clears localStorage items related to dynasty data and Google Sheets tokens

Access via sidebar: "Admin Tools" link at the bottom (only visible to dynasty owners, not in view-only mode).

### Roster Filtering Bug Prevention

Both Signing Day class progression and `advanceToNewSeason()` include a critical check:
```javascript
// Skip players who weren't on the team last season (they already left in a prior year)
if (!playerTeamPrevSeason && !player.isRecruit) return player
```
This prevents players who departed in earlier years from being re-added to the roster.

## Hidden Dev Tools

Features hidden with `{false && (...)}` for future use:
- **Roster History button** - All Players page (`Players.jsx:240`)
- **Random Fill button** - Game Entry modal (`GameEntryModal.jsx:1395`)
