import { AwsClient } from 'aws4fetch';
import { verifyAdmin } from '../../_verifyAuth.js';
import { setCors } from '../../_cors.js';

/**
 * Admin-only: mint a presigned PUT URL for an EXISTING object key, so the
 * recompress tool can overwrite a stored image in place with smaller bytes.
 * Overwriting the same key keeps the public URL identical, so every saved
 * reference (player cards, game photos, social avatars) keeps working — only
 * the stored bytes shrink.
 *
 * Gated to ADMIN_EMAILS (verifyAdmin). The key must live under images/ and
 * contain no path traversal.
 */

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function r2Env() {
  const {
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_HOST,
  } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_HOST) {
    return null;
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_HOST };
}

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const env = r2Env();
  if (!env) return res.status(501).json({ error: 'R2 storage not configured' });

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return; // verifyAdmin already sent 401/403

  const { key, contentType } = req.body || {};
  if (!key || typeof key !== 'string' || !key.startsWith('images/') || key.includes('..')) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  if (!contentType || !/^image\//.test(contentType)) {
    return res.status(400).json({ error: 'Invalid contentType' });
  }

  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}?X-Amz-Expires=300`;
  const signed = await client.sign(
    new Request(endpoint, { method: 'PUT' }),
    { aws: { signQuery: true } }
  );

  return res.status(200).json({
    uploadUrl: signed.url,
    headers: { 'Content-Type': contentType, 'Cache-Control': CACHE_CONTROL },
  });
}
