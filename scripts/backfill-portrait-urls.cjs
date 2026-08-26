#!/usr/bin/env node
'use strict';
/**
 * NOT NEEDED ON THIS BRANCH — DO NOT RUN WITHOUT READING THIS FIRST.
 *
 * This script was written against the fork, where pictureUrl really is a
 * dead stored string. On main it is redundant: resolvePortraitUrl
 * (src/utils/imageProxy.js) re-points any stored `/cfb27-portraits/...` URL
 * at the CURRENTLY-configured host on every render, so setting
 * VITE_CFB27_PORTRAIT_BASE and redeploying already fixes every
 * previously-synced player with no data migration at all. Every portrait
 * render path goes through it (proxyImageUrl applies it centrally;
 * PlayerAvatar, Player.jsx, PlayerEdit, PlayerEditModal and ComparePlayers
 * call it directly), and resolvePortraitUrl.test.js covers the exact
 * pre-migration URL shape this script targets.
 *
 * Running it anyway would mean handing a production service-account
 * credential to a script that rewrites a field on EVERY player in EVERY
 * dynasty in the project — a large, irreversible write against live user
 * data — to reach a state the app already reaches on its own at render
 * time. The cost/risk is real and the benefit is zero, so the default
 * answer is: don't.
 *
 * Kept in the repo because the logic is sound and it's the right tool IF the
 * render-time rebase is ever removed, or if some future need requires the
 * stored value itself to be correct (e.g. exporting player data to somewhere
 * that can't run the rebase). If that day comes, dry-run it first.
 *
 * Original header follows.
 *
 */
/**
 * One-time fix for existing dynasties: player.pictureUrl is computed ONCE
 * at CFB27 save-sync time (see mapPortraitUrl in src/data/cfb27SaveImport.js)
 * and stored as a plain string on the player record — it is NOT recomputed
 * on page load. So switching VITE_CFB27_PORTRAIT_BASE to the new R2 host and
 * redeploying only fixes players synced AFTER that point; every already-
 * synced player still has whatever URL was baked in at their last sync.
 *
 * This script recomputes pictureUrl for every player in every dynasty from
 * data ALREADY stored on that player (player.cfb27AssetName — the raw
 * portrait asset name, kept on every synced player as a stable re-match key)
 * against the manifests of what actually has a file in the portrait pack.
 * No user needs to re-sync their save for this — it's a pure server-side
 * data fix, same logic as mapPortraitUrl just ported to Node (no `window`/
 * `import.meta.env` here, so it can't import that file directly).
 *
 * Coach portraits do NOT need this: CoachCareer.jsx / AllCoachesModal.jsx
 * call mapCoachPortraitUrl(assetName) live at render time from the raw
 * asset name, never a stored URL — those fix themselves the moment the R2
 * base env var is live, for every dynasty, no migration needed.
 *
 * Usage:
 *   node scripts/backfill-portrait-urls.cjs <portraitBaseUrl> [--dry-run]
 *
 * Example:
 *   node scripts/backfill-portrait-urls.cjs https://pub-63e48a1f2ce84939b873911d2adb5b15.r2.dev --dry-run
 *   node scripts/backfill-portrait-urls.cjs https://pub-63e48a1f2ce84939b873911d2adb5b15.r2.dev
 *
 * Run --dry-run FIRST and read the summary before running for real — this
 * writes to every dynasty in the project once un-dry-run.
 *
 * Env: reads FIREBASE_SERVICE_ACCOUNT the same way every other admin script
 * in this repo does. Point FIRESTORE_EMULATOR_HOST at the local emulator to
 * test against fake data before running against the real project — the
 * Admin SDK auto-detects that env var, same mechanism seed-emulator-premium
 * .cjs relies on.
 */

const path = require('path');
const fs = require('fs');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const UNIQUE_PORTRAIT_ID_SET = new Set(require('../src/data/cfb27UniquePortraitIds.json'));
const GENERIC_PORTRAIT_KEY_SET = new Set(require('../src/data/cfb27GenericPortraitKeys.json'));

// Node port of mapPortraitUrl (src/data/cfb27SaveImport.js) — same two
// branches, same manifest gate, base passed explicitly instead of read from
// import.meta.env (unavailable outside Vite).
function buildPortraitUrl(genericHeadAssetName, base) {
  if (!genericHeadAssetName) return '';
  let relPath = null;
  if (genericHeadAssetName.startsWith('Unique_')) {
    const parts = genericHeadAssetName.split('_');
    const n = parts[parts.length - 1];
    if (/^[0-9]+$/.test(n) && UNIQUE_PORTRAIT_ID_SET.has(Number(n))) {
      relPath = `/cfb27-portraits/unique/${n}.webp`;
    }
  } else if (genericHeadAssetName.startsWith('Generic_')) {
    const key = genericHeadAssetName.slice('Generic_'.length);
    if (GENERIC_PORTRAIT_KEY_SET.has(key)) {
      relPath = `/cfb27-portraits/generic/${key}.webp`;
    }
  }
  if (!relPath) return '';
  return `${String(base).replace(/\/$/, '')}${relPath}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const baseUrl = args.find((a) => !a.startsWith('--'));

  if (!baseUrl) {
    console.error('Usage: node scripts/backfill-portrait-urls.cjs <portraitBaseUrl> [--dry-run]');
    process.exit(1);
  }

  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || undefined;

  const { initAdmin } = await import('../api/_firebaseAdmin.js');
  const firestore = initAdmin();

  console.log(`[backfill] Portrait base: ${baseUrl}`);
  console.log(`[backfill] Mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE (will write)'}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`[backfill] Targeting EMULATOR at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  } else {
    console.log('[backfill] Targeting REAL PROJECT (no FIRESTORE_EMULATOR_HOST set)');
  }

  let scanned = 0;
  let noAssetName = 0;
  let alreadyCorrect = 0;
  let notInManifest = 0;
  let toUpdate = 0;

  let batch = firestore.batch();
  let batchCount = 0;
  let batchesCommitted = 0;

  const commitBatch = async () => {
    if (batchCount === 0) return;
    if (!dryRun) {
      await batch.commit();
      batchesCommitted += 1;
      await sleep(250);
    }
    batch = firestore.batch();
    batchCount = 0;
  };

  const snapshot = await firestore.collectionGroup('players').get();
  console.log(`[backfill] Found ${snapshot.size} player documents across all dynasties.`);

  for (const doc of snapshot.docs) {
    scanned += 1;
    const data = doc.data();
    const assetName = data.cfb27AssetName;

    if (!assetName) {
      noAssetName += 1;
      continue;
    }

    const freshUrl = buildPortraitUrl(assetName, baseUrl);

    if (!freshUrl) {
      notInManifest += 1;
      continue;
    }

    if (freshUrl === data.pictureUrl) {
      alreadyCorrect += 1;
      continue;
    }

    toUpdate += 1;
    if (!dryRun) {
      batch.update(doc.ref, { pictureUrl: freshUrl });
      batchCount += 1;
      if (batchCount >= 450) {
        await commitBatch();
      }
    }

    if (scanned % 2000 === 0) {
      console.log(`[backfill] ...scanned ${scanned}/${snapshot.size}, ${toUpdate} updated so far`);
    }
  }

  await commitBatch();

  console.log('[backfill] Done.');
  console.log(`[backfill]   Scanned:              ${scanned}`);
  console.log(`[backfill]   No cfb27AssetName:    ${noAssetName} (never CFB27-synced, untouched)`);
  console.log(`[backfill]   Already correct:      ${alreadyCorrect}`);
  console.log(`[backfill]   Not in portrait pack: ${notInManifest} (falls back to team logo, unchanged)`);
  console.log(`[backfill]   ${dryRun ? 'Would update' : 'Updated'}:           ${toUpdate}`);
  if (!dryRun) console.log(`[backfill]   Batches committed:    ${batchesCommitted}`);
})().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
