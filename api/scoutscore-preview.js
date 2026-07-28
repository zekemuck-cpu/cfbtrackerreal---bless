// Proxy to MaxPlaysCFB's ScoutScore percentile API.
//
// Runs as a Vercel Edge Function (V8 isolate, not Node.js Lambda). Edge
// functions have different IP reputation and TLS fingerprinting than the
// Lambda pool, which MaxPlaysCFB's CDN blocks. The edge runtime is the same
// engine Cloudflare Workers use, so it's treated differently by Cloudflare-
// based bot protection.
//
// Used (with permission) so the browser can fetch recruit benchmarks without
// a cross-origin CORS dance, and so the upstream URL stays server-side.

export const config = { runtime: 'edge' };

const UPSTREAM = 'https://maxplayscfb.com/api/recruit-percentiles/preview';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Forward only the fields ScoutScore expects, coerced to safe types.
function buildUpstreamBody(b) {
  const attributes = {};
  if (b && typeof b.attributes === 'object' && b.attributes) {
    for (const [k, v] of Object.entries(b.attributes)) {
      const n = Number(v);
      if (typeof k === 'string' && Number.isFinite(n)) attributes[k] = n;
    }
  }
  return {
    position: typeof b?.position === 'string' ? b.position : '',
    star: b?.star == null ? null : Number(b.star),
    gemStatus: typeof b?.gemStatus === 'string' ? b.gemStatus : '',
    archetype: typeof b?.archetype === 'string' ? b.archetype : '',
    devTrait: typeof b?.devTrait === 'string' && b.devTrait ? b.devTrait : null,
    isAthlete: !!b?.isAthlete,
    attributes,
    usedImageUpload: false,
    confirmedOutlierKeys: [],
    // Which recruit cohort to benchmark against — "cfb26" (the default) or
    // "cfb27". Verified directly against MaxPlaysCFB's own frontend request
    // payload; their upstream API silently ignores an unrecognized/missing
    // value and falls back to cfb26, so this is safe to always include.
    sourceGame: b?.sourceGame === 'cfb27' ? 'cfb27' : 'cfb26',
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    let raw = {};
    try { raw = await req.json(); } catch { /* leave empty */ }
    const body = buildUpstreamBody(raw);

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://maxplayscfb.com',
        'Referer': 'https://maxplayscfb.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Dest': 'empty',
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      const msg = text.replace(/<[^>]+>/g, '').trim().slice(0, 300) || `HTTP ${upstream.status}`;
      return json({ ok: false, error: `upstream_${upstream.status}`, message: msg }, upstream.status);
    }

    return new Response(text, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch {
    return json({ ok: false, error: 'scoutscore_upstream_unavailable' }, 502);
  }
}
