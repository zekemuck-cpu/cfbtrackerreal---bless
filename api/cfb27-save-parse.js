import { AwsClient } from 'aws4fetch';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { verifyAuth } from './_verifyAuth.js';
import { setCors } from './_cors.js';
import { extractFullSave } from './_lib/cfb27Extract/extractPlayers.cjs';

/**
 * Parse a CFB 27 PC save file that the client already uploaded to R2 via
 * /api/cfb27-save-upload-url (see that file for the upload flow/rationale).
 *
 * This function downloads the save server-side (the binary format needs
 * Node's fs/zlib to parse — see api/_lib/cfb27Extract), extracts everything
 * the app's preseason checklist needs (players for every team, team ratings
 * + coaching staff, conference alignment, current season year/week/phase,
 * and the full schedule), deletes the temp file and the R2 object (a save is
 * a full personal game-state dump; there's no reason to retain it once
 * parsed), and returns the raw extracted data for the client to map into the
 * app's schema (src/data/cfb27SaveImport.js does that mapping).
 *
 * Verified end-to-end against a real 9.4MB DYNASTY-* save: ~2s to parse.
 *
 * BUNDLING NOTE (see vercel.json "functions"): madden-franchise (pulled in via
 * extractFullSave) resolves its reference data at RUNTIME —
 * fs.readFileSync(path.join(__dirname, `../data/interned-strings/${dir}/${name}`))
 * and friends. @vercel/nft traces module specifiers, including dynamic
 * import(), but it cannot follow an fs read built from interpolated strings,
 * so none of those JSON files get bundled by default. The build and the
 * deploy both succeed; it fails only when someone actually parses a save,
 * as "ENOENT ... slotsLookup.json". vercel.json force-includes
 * node_modules/madden-franchise/data/** to cover all four directories it
 * reads (lookup-files, schemas, interned-strings, zstd-dicts).
 */

export const config = {
  // Parsing a ~10 MB binary save will not reliably finish inside a shorter
  // default; also set via vercel.json's "functions" key for this file, which
  // takes precedence — kept in sync here so this isn't the only place to look.
  maxDuration: 60,
};

function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!r2Configured()) {
    return res.status(501).json({ error: 'R2 storage not configured' });
  }

  const decoded = await verifyAuth(req, res);
  if (!decoded) return; // verifyAuth already sent 401
  const uid = decoded.uid;

  const { key, alreadySyncedYear, alreadySyncedThroughWeek } = req.body || {};
  // The key must be one this same user's upload endpoint minted for them —
  // prevents parsing (and deleting) another user's uploaded save via a
  // guessed/leaked key.
  if (typeof key !== 'string' || !key.startsWith(`cfb27-saves/${uid}/`)) {
    return res.status(400).json({ error: 'Invalid or missing key' });
  }

  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const objectUrl = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key}`;

  const tmpPath = path.join(os.tmpdir(), `cfb27-save-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.bin`);

  try {
    const getReq = await client.sign(new Request(objectUrl, { method: 'GET' }), { aws: { signQuery: true } });
    const download = await fetch(getReq.url);
    if (!download.ok) {
      return res.status(404).json({ error: `Could not read uploaded save (${download.status})` });
    }

    const bytes = Buffer.from(await download.arrayBuffer());
    await fs.writeFile(tmpPath, bytes);

    // alreadySyncedYear/alreadySyncedThroughWeek are optional — the calling
    // dynasty's own last-known season position (see CFB27SyncModal.jsx),
    // used only to skip redundantly re-resolving box-score stats for
    // regular-season weeks already fully synced. See extractFullSave's own
    // comment for the (deliberately narrow) safety conditions.
    const result = await extractFullSave(tmpPath, { alreadySyncedYear, alreadySyncedThroughWeek });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[cfb27-save-parse] Failed:', err);
    return res.status(500).json({ error: `Failed to parse save: ${err.message}` });
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    // Best-effort cleanup of the uploaded save — don't fail the response over it.
    try {
      const delReq = await client.sign(new Request(objectUrl, { method: 'DELETE' }), { aws: { signQuery: true } });
      await fetch(delReq.url, { method: 'DELETE' });
    } catch (cleanupErr) {
      console.error('[cfb27-save-parse] R2 cleanup failed:', cleanupErr);
    }
  }
}
