#!/usr/bin/env node
'use strict';
/**
 * Local-only stand-in for /api/cfb27/save-upload-url and
 * /api/cfb27/save-parse.
 *
 * This project's Vercel account belongs to someone else, so `vercel login` /
 * `vercel link` / `vercel dev` aren't available on this machine. Without
 * those, `npm run dev` (plain Vite) never executes anything under api/ — any
 * fetch to /api/* just 404s. This server lets the CFB 27 save import feature
 * be developed and clicked through for real against `npm run dev`, using
 * local disk instead of Cloudflare R2 and with Firebase auth verification
 * skipped entirely.
 *
 * NEVER used in production: only vite.config.js's dev-only `server.proxy`
 * forwards requests here, and that config has zero effect on `vite build`
 * or the real deployed Vercel functions (api/_handlers/cfb27/save-upload-url.js /
 * api/_handlers/cfb27/save-parse.js), which still do the real R2 + Firebase-token
 * flow untouched.
 *
 * Run: node scripts/dev-cfb27-server.cjs [port=5051]
 * (or `npm run dev:cfb27-api`), alongside `npm run dev` in another terminal.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { extractFullSave } = require('../api/_lib/cfb27Extract/extractPlayers.cjs');

// This is a long-running process serving many requests across a dev
// session, unlike the real Vercel functions it stands in for (each of
// those runs in its own isolated invocation, so an unhandled rejection
// there only kills that one request). The Admin SDK's BulkWriter can
// surface a permanently-failed write as a rejection outside the awaited
// bulkWriter.close() call (a known gotcha, more likely against the
// emulator if it's still stabilizing right after startup) — without this
// handler that takes the whole server down and every subsequent request
// fails until it's manually restarted. Log and keep serving instead.
process.on('unhandledRejection', (err) => {
  console.error('[dev-cfb27-server] Unhandled rejection (server staying up):', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[dev-cfb27-server] Uncaught exception (server staying up):', err?.message || err);
});

// Minimal .env.local loader (this is a plain Node script, not part of
// Vite's build, so it doesn't get Vite's automatic env loading). Only cares
// about FIREBASE_SERVICE_ACCOUNT / VITE_USE_FIREBASE_EMULATOR — good enough
// for this dev-only tool, not a general-purpose parser.
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
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

// When VITE_USE_FIREBASE_EMULATOR=true, run the REAL production handler
// (api/_handlers/cfb27/bulk-seed-players.js) against the local Firestore/Auth
// emulators instead of stubbing it — same firebase-admin code path as
// prod, zero real credentials needed. Setting these env vars BEFORE the
// handler's first import is what makes firebase-admin redirect there.
const USE_EMULATOR = process.env.VITE_USE_FIREBASE_EMULATOR === 'true';
if (USE_EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
}

const PORT = Number(process.argv[2]) || 5051;
const UPLOAD_DIR = path.join(os.tmpdir(), 'cfb27-dev-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Adapts a plain Node (req, res) pair to the minimal Vercel-style API the
// real handler expects: req.body pre-parsed as JSON, res.status().json().
function toVercelStyle(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  return res;
}

let realBulkSeedHandler = null;
async function getRealBulkSeedHandler() {
  if (!realBulkSeedHandler) {
    const mod = await import('../api/_handlers/cfb27/bulk-seed-players.js');
    realBulkSeedHandler = mod.default;
  }
  return realBulkSeedHandler;
}

let realSyncPlayersHandler = null;
async function getRealSyncPlayersHandler() {
  if (!realSyncPlayersHandler) {
    const mod = await import('../api/_handlers/cfb27/save-sync-players.js');
    realSyncPlayersHandler = mod.default;
  }
  return realSyncPlayersHandler;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // Dev-only, localhost-only server — wildcard CORS is fine here.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // Mirrors api/_handlers/cfb27/save-upload-url.js's response shape, minus real R2
    // signing and minus the Firebase auth check.
    if (req.method === 'POST' && url.pathname === '/api/cfb27/save-upload-url') {
      const key = crypto.randomUUID();
      return sendJson(res, 200, {
        uploadUrl: `http://localhost:${PORT}/local-upload/${key}`,
        key,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }

    // Stands in for the R2 PUT the real uploadUrl would target.
    if (req.method === 'PUT' && url.pathname.startsWith('/local-upload/')) {
      const key = url.pathname.replace('/local-upload/', '');
      const bytes = await readRawBody(req);
      fs.writeFileSync(path.join(UPLOAD_DIR, key), bytes);
      return sendJson(res, 200, { ok: true });
    }

    // Mirrors api/_handlers/cfb27/save-parse.js's response shape, but reads the local
    // temp file instead of downloading from R2. Runs the REAL vendored
    // extractor (api/_lib/cfb27Extract) — this part is genuine production code.
    if (req.method === 'POST' && url.pathname === '/api/cfb27/save-parse') {
      const { key } = await readJsonBody(req);
      const filePath = path.join(UPLOAD_DIR, key || '');
      if (!key || !fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: 'Uploaded save not found (did the dev server restart?)' });
      }
      console.log(`[dev-cfb27-server] parsing ${filePath} ...`);
      const start = Date.now();
      const result = await extractFullSave(filePath);
      console.log(`[dev-cfb27-server] parsed ${result.players.length} players, ${result.conferences.length} conferences, ${result.games.length} games in ${Date.now() - start}ms`);
      fs.rm(filePath, { force: true }, () => {});
      return sendJson(res, 200, result);
    }

    // api/_handlers/cfb27/bulk-seed-players.js — the REAL production handler when
    // VITE_USE_FIREBASE_EMULATOR=true (runs against the local Firestore/Auth
    // emulators, exercising the actual firebase-admin BulkWriter code path
    // with zero real credentials). Falls back to a no-op stub otherwise, so
    // the create-dynasty flow can still be clicked through without the
    // emulators running — but that path never touches any real Firestore.
    if (req.method === 'POST' && url.pathname === '/api/cfb27/bulk-seed-players') {
      if (!USE_EMULATOR) {
        const { players } = await readJsonBody(req);
        console.log(`[dev-cfb27-server] (stub) would bulk-seed ${Array.isArray(players) ? players.length : 0} players — set VITE_USE_FIREBASE_EMULATOR=true + start the emulators to run the real handler`);
        return sendJson(res, 200, { written: Array.isArray(players) ? players.length : 0, failed: 0 });
      }

      const bodyJson = await readJsonBody(req);
      req.body = bodyJson;
      const handler = await getRealBulkSeedHandler();
      const start = Date.now();
      await handler(req, toVercelStyle(res));
      console.log(`[dev-cfb27-server] real bulk-seed handler ran in ${Date.now() - start}ms (against emulator)`);
      return;
    }

    // api/_handlers/cfb27/save-sync-players.js — the existing-dynasty sync's
    // players-subcollection delta writer. Same emulator-or-stub split as
    // cfb27-bulk-seed-players above.
    if (req.method === 'POST' && url.pathname === '/api/cfb27/save-sync-players') {
      if (!USE_EMULATOR) {
        const { creates, patches } = await readJsonBody(req);
        const n = (Array.isArray(creates) ? creates.length : 0) + (Array.isArray(patches) ? patches.length : 0);
        console.log(`[dev-cfb27-server] (stub) would sync-write ${n} player docs — set VITE_USE_FIREBASE_EMULATOR=true + start the emulators to run the real handler`);
        return sendJson(res, 200, { written: n, failed: 0 });
      }

      const bodyJson = await readJsonBody(req);
      req.body = bodyJson;
      const handler = await getRealSyncPlayersHandler();
      const start = Date.now();
      await handler(req, toVercelStyle(res));
      console.log(`[dev-cfb27-server] real sync-players handler ran in ${Date.now() - start}ms (against emulator)`);
      return;
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[dev-cfb27-server] error:', err);
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[dev-cfb27-server] listening on http://localhost:${PORT}`);
});
