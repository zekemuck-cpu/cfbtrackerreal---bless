# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

---

## CURRENT WORK: Player Editor Page

We are actively working on the **Player Editor** (`/dynasty/:id/player/:pid/edit`).

**Files:**
- `src/pages/dynasty/PlayerEdit.jsx` - Full page player editor (replaces modal)
- `src/components/PlayerTimelineEditor.jsx` - Team history editing component

**Key fields:**
- `player.jerseyNumber` - Jersey number (NOT `jersey`)
- `player.overallByYear` - OVR rating per season
- `player.teamHistory[]` - Stint-based roster membership

---

## Project Overview

CFB Dynasty Tracker - React web app for tracking College Football dynasty mode.

- **Production URL**: https://dynastytracker.app
- **Hosting**: Vercel (auto-deploys from `main` branch)
- **Firebase Project**: `cfbtracker-200ab`

## Development Commands

```bash
npm run dev      # Start dev server (port 5000)
npm run build    # Build for production
```

**IMPORTANT**: After every code change, run `npm run build` to check for errors.

## Git Commit Policy

Do NOT commit automatically. Only commit when user explicitly requests it.

## Version Management

**CRITICAL: ALWAYS update the version number with EVERY change pushed to main.**

The app version is displayed at the bottom of every page in the format: `Dynasty Tracker vYYYY.MM.DD.build`

**Location**: `src/components/Layout.jsx` - Update the `APP_VERSION` constant

**Format**: `YYYY.MM.DD.build` (e.g., `2026.02.09.0001`)

**When to update**:
- Every commit to main
- Increment the build number (last segment) for each change on the same day
- Update the date when working on a new day

**Example progression**:
- `2026.02.09.0001` - First change on Feb 9
- `2026.02.09.0002` - Second change on Feb 9
- `2026.02.10.0001` - First change on Feb 10

This helps users verify they're on the latest version when viewing the live site.

---

## UI/UX Guidelines

**NO decorative icons or symbols.** Keep the UI clean and text-based.

### Modal Backdrop Pattern

All modals MUST use this pattern for the backdrop to ensure full-screen coverage:

```jsx
<div
  className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
  style={{ margin: 0 }}
  onClick={onClose}
>
```

**Required elements:**
- `fixed inset-0 top-0 left-0 right-0 bottom-0` - Ensures full viewport coverage
- `style={{ margin: 0 }}` - Prevents any inherited margins from creating gaps
- `z-[9999]` - High z-index to appear above other content

Without the explicit `top-0 left-0 right-0 bottom-0` and `margin: 0`, the modal backdrop may not reach the edges of the viewport.

---

## tid-Based Team System

**CRITICAL: NEVER use teamAbbr for team identification. ALWAYS use tid (Team ID).**

All teams use numeric Team IDs (tid) as the primary identifier:
- `dynasty.teams[tid]` - Team data keyed by tid
- `dynasty.currentTid` - User's current team
- `player.teamsByYear[year]` - Stores tid (number) for roster membership
- `game.team1Tid`, `game.team2Tid`, `game.homeTeamTid` - Game team references

**Why tid, not abbr:**
- Team abbreviations can change or conflict (teambuilder teams)
- tid is the stable, unique identifier across the entire system
- All data relationships are based on tid

**Helper functions** (in `src/data/teamRegistry.js`):
- `getTeam(teams, tid)`, `getTidFromAbbr(abbr)`, `getMascotName(abbrOrTid, teams)`

---

## Key Architecture

### Context Providers
- **AuthProvider** (`src/context/AuthContext.jsx`) - Firebase Google Auth
- **DynastyProvider** (`src/context/DynastyContext.jsx`) - Dynasty CRUD, dual-mode storage

### Storage Tiers
- **Free**: IndexedDB (local only)
- **Premium**: Firebase Firestore (cloud sync)

### Key Files
- `src/context/DynastyContext.jsx` - All data operations
- `src/pages/dynasty/Dashboard.jsx` - Main dashboard
- `src/data/teamRegistry.js` - tid-based team data

---

## Player Data

### Key Fields
```javascript
player = {
  pid: 'uuid',
  name: 'John Smith',
  jerseyNumber: '12',           // Jersey number
  position: 'QB',
  overall: 85,
  overallByYear: { 2029: 82, 2030: 85 },  // OVR by season
  teamsByYear: { 2029: 42 },    // tid values
  teamHistory: [                 // Stint-based membership
    { teamTid: 42, fromYear: 2029, toYear: null, reason: 'recruited' }
  ],
  statsByYear: { ... },
  classByYear: { ... },
}
```

### Roster Functions
- `isPlayerOnRoster(player, tidOrAbbr, year)` - Check roster membership
- Uses stint-based `teamHistory[]` if available, falls back to `teamsByYear`

---

## Game System

Games use tid-based fields:
```javascript
{
  team1Tid: 136,
  team2Tid: 42,
  team1Score: 28,
  team2Score: 21,
  homeTeamTid: 136,  // null = neutral site
}
```

---

## Team Colors

Use `useTeamColors(teamName, dynasty.teams)` hook for dynamic theming.

For player pages, get the player's team (not dynasty's current team):
```javascript
const playerTeamTid = player.teamsByYear[currentYear] || player.team
const playerTeamName = getMascotName(playerTeamTid, dynasty.teams)
const teamColors = useTeamColors(playerTeamName, dynasty.teams)
```

---

## Firestore Updates

Use dot notation for nested fields:
```javascript
{ 'preseasonSetup.scheduleEntered': true }  // Correct
{ preseasonSetup: { scheduleEntered: true } }  // Wrong - replaces object
```

---

## Admin Tools

Located at `/dynasty/:id/admin` (DangerZone):
- Fix Roster Data
- Migrate to Subcollections
- Roster System Migration (stint-based)
