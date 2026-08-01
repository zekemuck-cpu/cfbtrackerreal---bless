# Roster Input: Why Some Players Come In With Only 6 Attributes

This documents a known limitation of the screenshot-to-roster import (the
"Roster Entry" flow in `src/components/RosterEntryModal.jsx`), so the behavior
isn't mistaken for a bug in the prompt or the parser.

## The short version

An AI reading your screenshots can only record what is actually visible in the
pixels. In EA CFB, a player's **full attribute set is only on screen when that
player is highlighted/selected**, or when they appear as a row in the scrolling
**attribute-table view**. The plain roster **list view** shows only six
attributes per row: `SPD, ACC, AGI, COD, STR, AWR`.

So any player who was never highlighted and never captured in an attribute-table
screenshot can only come out with those six attributes. That is the ceiling for
what is capturable for them, not a prompt failure.

## What the import does today

The prompt runs in two ordered steps:

1. **Extract everything visible from the screenshots, for every player** — the
   same exhaustive effort for all of them. A player is not lower priority
   because they do (or don't) already have data on file.
2. **Fill remaining gaps from known data** — for any field still blank after
   step 1, fill it from that player's existing row in the dynasty (hometown,
   height/weight, archetype, attributes, etc.). The screenshot always wins on
   any field it shows; known data only fills blanks. Nothing is ever invented.

This is why most of the roster comes in complete: starters and rotation players
get highlighted (or show up in attribute-table shots), and returning players
have prior data on file to fill any gaps.

## Why a few players still land partial

A player ends up with only the six list-view attributes when **both** of these
are true:

- They were **never highlighted** and **never appeared in an attribute-table
  screenshot**, so only their list-view row (six attributes) was visible, and
- They are **new** (a freshman or a first-time import), so there is **no prior
  data on file** to fill the missing attributes from.

With nothing in the pixels and nothing on file, the remaining attributes are
genuinely unavailable. Leaving them blank is correct — inventing them would
corrupt the roster.

Example from a recent import (South Alabama): players like
`K. Graham-Harris`, `W. Malone`, and `T. Devers-Poole` came in with six
attributes, while the rest of the roster was complete. All three are deep-bench
players who were only visible in the list view and had no prior data on file.

## How to get those players to 100%

To fully fill a partial player, make sure their **full** ratings are on screen
in at least one screenshot, then re-run the import:

- **Attribute-table view (best for bulk):** open the ratings table (the
  `DAC / RUN / TUP / BSK / PAC / …` grid) and **scroll sideways**, taking a
  screenshot at each scroll position so every attribute column is captured. This
  exposes the full ~20-25 attributes for EVERY player in the list at once (not
  just the highlighted one). The later scroll screenshots don't repeat the name
  column — they're just grids of numbers — so keep the rows in the SAME ORDER and
  make each scroll OVERLAP the previous one by a column or two. The importer's
  prompt now stitches those scrolled shots together: it matches each nameless
  number row back to its player by row position, the highlighted row, and the
  overlapping columns, then concatenates every column into that player's ratings.
- **Highlight the player:** select the player so their full card/rating set
  renders, and capture that.

Re-running with those screenshots lets step 1 read the full set. Anything still
not on screen stays blank by design.

## Where this lives in the code

- Prompt + known-data gap-fill: `src/components/RosterEntryModal.jsx`
  (the `buildAIPrompt` call, the `KNOWN ROSTER DATA` section, and the
  `COLUMN O — Attributes` spec).
- Attribute codes/legend: `src/utils/attributeEntry.js`.
- Paste parsing: `splitTsv` in `src/utils/tsvParse.js` (skips code fences and
  `=== label ===` lines, so pasted AI output imports cleanly).
