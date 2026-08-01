# Pulling Scout Staff updates from the `bless` remote

Bless (GitHub `zekemuck-cpu/cfbtrackerreal---bless`) is a separate fork where the
**Scout Staff** feature is developed. He periodically pings that a new version is
ready ("Scout Staff update v12 pushed and ready to be pulled in"). This doc is the
repeatable procedure for pulling those updates into our `main` without breaking it.

## The one thing to understand first

**The two repos have diverged massively.** Bless's `main` is missing large amounts
of our work, and our `main` is missing large amounts of his. As of this writing the
files that Scout Staff touches differ by thousands of lines between the repos:

- `src/services/sheetsService.js` — ~2000 lines of difference
- `src/components/PlayerDatabase.jsx` — a few hundred lines
- `src/components/ScoutStaff.jsx` — a few dozen lines

Because of that divergence, **NEVER do any of these** to pull a Scout Staff update:

- ❌ `git merge bless/main` — drags in all of bless's unrelated divergence and/or reverts ours
- ❌ `git checkout bless/main -- <file>` — overwrites the whole file, clobbering our work in it
- ❌ Copy/paste a whole file from bless

Any of those will silently wipe out our own changes living in the same files (our
Google Sheets Recruiting Database sync, box-score sheets, recruiting import, etc.).

## The correct procedure: cherry-pick the single version commit

Each "Scout Staff vN" is a single, self-contained commit on `bless/main`. We pull it
in by cherry-picking just that commit. The prior versions are already in our `main`
(we port each one as it lands), so the new commit applies as a clean incremental delta.

```bash
# 1. Fetch the latest bless history
git fetch bless

# 2. Find the update commit (top of the log, titled "Scout Staff ... vN" or similar)
git log bless/main --oneline -15

# 3. Inspect exactly what it changes BEFORE applying — never apply blind
git show <sha> --stat
git show <sha> -- src/components src/services   # read the actual source diff

# 4. Cherry-pick WITHOUT committing so you can review the merge result
git cherry-pick -n <sha>
```

Expected result: the **source files auto-merge cleanly**, and only
`dist/index.html` reports a conflict. `dist/index.html` is generated build output —
we always regenerate it, so just take ours:

```bash
git checkout --ours dist/index.html && git add dist/index.html
```

## Verify before committing

1. **Grep that the intended changes actually landed** (a clean auto-merge can still
   drop a hunk if our base already had part of it). Pull the key identifiers out of
   the `git show` diff and confirm each one is present, e.g.:
   ```bash
   grep -n "syncNow\|RECRUITING_DATABASE_DEV_TRAITS\|stateRank: pl.stateRank" \
     src/components/PlayerDatabase.jsx src/services/sheetsService.js src/components/ScoutStaff.jsx
   ```
2. **Check for missing imports / undefined references** that the delta relies on.
   `esbuild` will NOT fail the build on an undefined variable, so eyeball anything the
   new code calls (e.g. v12 used `getPlayerClassForYear` in `ScoutStaff.jsx` — confirm
   it's imported; and `combinedPlayers` in the auto-push effect — confirm it's defined).
3. **Build** — this is the real validation and also stamps the footer version:
   ```bash
   # bump MANUAL_BUILD in vite.config.js first (see below), then:
   npm run build
   ```

## Commit (per this repo's rules)

- Bump `MANUAL_BUILD` in `vite.config.js` before building (footer version stamp).
- Commit source + the tracked `dist/index.html`. `dist/` is gitignored except
  `index.html`, so use `git commit -a` plus `git add -f dist/index.html`.
- New files imported by the delta must be `git add`-ed explicitly (`git commit -a`
  skips untracked files, which breaks the Vercel build).

## What "Scout Staff v12" contained (reference example)

Commit `8275b5a0` on `bless/main`, applied 2026-07-03:

- **`ScoutStaff.jsx`** — `shapeRecruit` was silently dropping `stateRank`, `height`,
  `weight`, `hometown`, `state`, and `class`; added them so the Recruiting Database
  and its Sheet sync see the full recruit.
- **`sheetsService.js`** — new `RECRUITING_DATABASE_DEV_TRAITS` list (adds `Hidden`)
  used for the Recruiting Database sheet's dev-trait dropdown, separate from the
  Targets sheet's `DEV_TRAITS`.
- **`PlayerDatabase.jsx`** — the big one: refactored manual `handleSave` into a shared
  `syncNow({silent})` engine and added a **debounced auto-push** effect so any local
  change (add/edit/import/delete) mirrors out to the linked Google Sheet within ~2s
  without a manual Save; `handleEditSave`/`handleDelete` made properly async with error
  handling; GradeModal dev-trait rendered as a glowing pill; Edit-modal and table
  attributes laid out in two columns. "Save" now means "pull in sheet-side edits."
