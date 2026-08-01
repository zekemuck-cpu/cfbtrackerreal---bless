import { AwsClient } from 'aws4fetch';
import { verifyAdmin } from '../../_verifyAuth.js';
import { setCors } from '../../_cors.js';

/**
 * Admin-only: list every uploaded image in the R2 bucket so the in-app gallery
 * can show a live feed across all users. Gated to ADMIN_EMAILS (verifyAdmin).
 *
 * Lists under the images/ prefix, paginating through R2 up to a safety cap,
 * then sorts newest-first and returns each object's public URL + the uploader's
 * uid (parsed from the key, which is images/{uid}/{yyyymm}/{uuid}.{ext}).
 */

const MAX_OBJECTS = 5000; // safety cap so one call can't pull an unbounded list
const MAX_PAGES = 10;     // 10 pages * 1000 keys = MAX_OBJECTS

function r2Env() {
  const {
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_HOST,
  } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_HOST) {
    return null;
  }
  return { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_HOST };
}

// Minimal parse of S3 ListObjectsV2 XML — the format is fixed and simple, so a
// targeted regex sweep is enough (avoids pulling in an XML parser dependency).
function parseListXml(xml) {
  const items = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const key = (block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1];
    const lastModified = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1];
    const size = Number((block.match(/<Size>([\s\S]*?)<\/Size>/) || [])[1] || 0);
    if (key) items.push({ key, lastModified, size });
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml);
  const nextToken = (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) || [])[1] || null;
  return { items, truncated, nextToken };
}

export default async function handler(req, res) {
  setCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const env = r2Env();
  if (!env) return res.status(501).json({ error: 'R2 storage not configured' });

  const decoded = await verifyAdmin(req, res);
  if (!decoded) return; // verifyAdmin already sent 401/403

  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`;

  const all = [];
  let token = null;
  let capped = false;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ 'list-type': '2', prefix: 'images/', 'max-keys': '1000' });
      if (token) params.set('continuation-token', token);

      const resp = await client.fetch(`${base}?${params.toString()}`, { method: 'GET' });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        console.error('[list-images] R2 list failed', resp.status, text.slice(0, 300));
        return res.status(502).json({ error: `R2 list failed (${resp.status})` });
      }

      const { items, truncated, nextToken } = parseListXml(await resp.text());
      all.push(...items);

      if (all.length >= MAX_OBJECTS) { capped = true; break; }
      if (!truncated || !nextToken) break;
      token = nextToken;
    }
  } catch (e) {
    console.error('[list-images] error:', e.message);
    return res.status(500).json({ error: 'Failed to list images' });
  }

  all.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

  const images = all.map((o) => ({
    key: o.key,
    url: `https://${env.R2_PUBLIC_HOST}/${o.key}`,
    size: o.size,
    lastModified: o.lastModified,
    uid: o.key.split('/')[1] || 'unknown',
  }));

  const totalBytes = images.reduce((sum, i) => sum + (i.size || 0), 0);
  const uploaders = new Set(images.map((i) => i.uid)).size;

  return res.status(200).json({ images, count: images.length, totalBytes, uploaders, capped });
}
