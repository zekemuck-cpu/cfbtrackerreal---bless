# Console dynasty-creation portraits

One JSON per team, `<tid>.json`, mapping a normalized player name to that
player's `GenericHeadAssetName` from the game:

    { "brentgordonjr": "Unique_Player_12345", ... }

`defaultRosterLoader` reads these when it seeds a console dynasty's starting
rosters, so day-one players get their real in-game faces instead of a
silhouette. It only ever affects that initial seed; every season after is the
user's to maintain, exactly as before.

**These files are generated, not hand-written.** The bundled rosters in
`cfb27Rosters/` and `defaultRosters/` carry no portrait id — that link exists
only inside a CFB 27 save file. Regenerate from a BASE (week-zero, unedited)
save with:

    node scripts/build-default-portrait-map.mjs /path/to/SAVEFILE

A save from deep into a dynasty has transferred, graduated and recruited
players who no longer match the bundled rosters, so it would produce wrong
faces for exactly the players this is meant to cover.

Until the script is run this directory holds no team files, and the whole
feature is a no-op: every seeded player keeps a blank `pictureUrl` and falls
back to the team logo, which is what console dynasties did before.

Do not hand-edit. A guessed mapping puts the wrong face on a real player,
which is worse than no face at all.
