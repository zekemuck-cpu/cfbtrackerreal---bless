import { AwsClient } from 'aws4fetch';
import { verifyAuth } from './_verifyAuth.js';
import { setCors } from './_cors.js';

/**
 * Mint a short-lived presigned PUT URL so the browser can upload a CFB 27
 * PC save file DIRECTLY to Cloudflare R2 (the bytes never pass through this
 * function) — same pattern as upload-url.js's image uploads, reused here so
 * a multi-megabyte save file never hits Vercel's request-body size limit.
 *
 * Flow:
 *   1. Client picks a DYNASTY-* save file and calls this endpoint with a
 *      Firebase ID token + the file's size.
 *   2. We verify the token, validate the size, and sign a PUT URL scoped to
 *      cfb27-saves/{uid}/{uuid}.bin.
 *   3. Client PUTs the raw save bytes straight to R2 using the returned URL.
 *   4. Client calls /api/cfb27-save-parse with the returned `key`, which
 *      downloads the object server-side, parses it, and deletes it — saves
 *      are never kept around or served publicly (unlike the image path,
 *      there is no publicUrl here).
 *
 * Auth: every upload requires a valid Firebase token. The uid is baked into
 * the object key so uploads are traceable and per-user cleanup stays possible.
 */

const MAX_BYTES = 150 * 1024 * 1024; // generous headroom over the ~10MB saves seen so far

function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
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

  const { size } = req.body || {};
  if (size != null && (typeof size !== 'number' || !(size > 0) || size > MAX_BYTES)) {
    return res.status(400).json({ error: `Invalid size (max ${MAX_BYTES} bytes)` });
  }

  const key = `cfb27-saves/${uid}/${newId()}.bin`;

  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  // Save files can be slow to upload on a home connection — give this a
  // longer window than the image upload URL (5 min). Bare PUT, no signed
  // Content-Type/Cache-Control headers (same reasoning as upload-url.js:
  // avoids brittle header-match 403s).
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key}?X-Amz-Expires=900`;
  const signed = await client.sign(
    new Request(endpoint, { method: 'PUT' }),
    { aws: { signQuery: true } }
  );

  return res.status(200).json({
    uploadUrl: signed.url,
    key,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}
