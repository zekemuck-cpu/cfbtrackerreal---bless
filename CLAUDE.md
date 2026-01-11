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

**ALWAYS store data at the TEAM level, NOT the user/dynasty level.**

```javascript
// WRONG (dynasty-level):
dynasty.schedule = [...]

// CORRECT (team-centric):
dynasty.schedulesByTeamYear[teamAbbr][year] = [...]
```

**Pattern for new features:**
1. Use `dynasty.{feature}ByTeamYear[teamAbbr][year]` storage
2. Create helper function `getCurrent{Feature}(dynasty)` in DynastyContext
3. Filter by team when displaying data

---

## Architecture

### Context Providers

1. **AuthProvider** (`src/context/AuthContext.jsx`) - Firebase Google Auth
2. **DynastyProvider** (`src/context/DynastyContext.jsx`) - Dynasty CRUD, dual-mode storage

### Data Storage Modes

- **Dev Mode** (`VITE_DEV_MODE=true`): localStorage, no auth required
- **Production Mode**: Firebase Firestore, requires Google OAuth

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
2. **Regular Season** - Weeks 1-12
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
