// Shrink the CFB27 portrait pack before uploading it to a CDN.
//
// WHY: the pack ships at ~33 KB/file across ~26,200 files (~860 MB), but the
// app never renders a portrait larger than 96 CSS px — that's the player-page
// hero (`w-24`); every other use is a 20–40 px avatar (see PlayerAvatar's
// `size` prop and Player.jsx's hero <img>). Storing 860 MB to display 96 px
// circles is pure waste: slower first paint for users, more to upload, more
// to keep in sync every time the manifests grow.
//
// TARGET is 256 px, not 96. Two reasons for the headroom: a 2x-DPR display
// needs 192 px for that hero to stay sharp, and the hero is click-to-enlarge,
// so an unknown-but-larger render exists. 256 is the smallest round number
// that covers both with margin. Do NOT drop this to 96 "because that's the
// display size" — it will look soft on every retina screen.
//
// Run on the machine that HAS the pack (it's gitignored, so that's whoever
// built it). Writes to a SEPARATE output directory — the source pack is never
// modified, so a bad run costs nothing but disk.
//
//   npm i sharp        # one-time, not added to package.json (dev-only tool)
//   node scripts/shrink-portraits.mjs public/cfb27-portraits ./portraits-small
//
// Then upload the OUTPUT dir, preserving the folder structure:
//   rclone copy ./portraits-small r2remote:<bucket>/cfb27-portraits \
//     --progress --transfers=32 --checkers=32
//
// Note the destination path ends in /cfb27-portraits — mapPortraitUrl builds
// `{base}/cfb27-portraits/unique/{id}.webp`, so that segment is part of the
// PATH, not the bucket name. See docs/CFB27_PORTRAIT_CDN_SETUP.md.

import { readdir, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

const [, , SRC = 'public/cfb27-portraits', OUT = './portraits-small'] = process.argv
const MAX_PX = 256
const QUALITY = 80

let sharp
try {
  ({ default: sharp } = await import('sharp'))
} catch {
  console.error('sharp is not installed. Run:  npm i sharp')
  process.exit(1)
}

const fmt = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.(webp|png|jpe?g)$/i.test(entry.name)) yield full
  }
}

let count = 0
let before = 0
let after = 0
let failed = 0

for await (const file of walk(SRC)) {
  const rel = path.relative(SRC, file)
  // Always emit .webp regardless of source extension — the app builds every
  // portrait URL with a .webp suffix, so a passthrough .png would 404.
  const dest = path.join(OUT, rel.replace(/\.(png|jpe?g)$/i, '.webp'))
  await mkdir(path.dirname(dest), { recursive: true })
  try {
    before += (await stat(file)).size
    await sharp(file)
      // `withoutEnlargement` so an already-small portrait is re-encoded but
      // never upscaled — upscaling would ADD bytes for zero visual gain.
      .resize(MAX_PX, MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(dest)
    after += (await stat(dest)).size
    count++
    if (count % 1000 === 0) console.log(`  ${count} files… ${fmt(before)} -> ${fmt(after)}`)
  } catch (err) {
    // Keep going. One corrupt source file must not abandon a 26k-file run —
    // a missing portrait falls back to the team logo, which is survivable;
    // a half-finished pack that has to be restarted is not.
    failed++
    console.warn(`  skipped ${rel}: ${err.message}`)
  }
}

console.log(`\nDone. ${count} files converted${failed ? `, ${failed} skipped` : ''}.`)
console.log(`Before: ${fmt(before)}`)
console.log(`After:  ${fmt(after)}`)
if (before > 0) {
  console.log(`Saved:  ${fmt(before - after)} (${(100 - (after / before) * 100).toFixed(1)}% smaller)`)
}
