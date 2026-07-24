#!/usr/bin/env node
'use strict';
/**
 * One-time helper: grants premium status (in the LOCAL EMULATOR's Firestore
 * only — never touches the real database) to every user currently signed in
 * against the local Auth emulator. Lets a fresh emulator test account behave
 * like a real premium user so the CFB27 cloud-import path can be exercised
 * end-to-end.
 *
 * Run AFTER signing in once through the app (with the emulators running and
 * VITE_USE_FIREBASE_EMULATOR=true, so the app's Google sign-in popup is the
 * emulator's fake account picker, not real Google).
 *
 * Usage: node scripts/seed-emulator-premium.cjs
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

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

(async () => {
  const { initAdmin, adminAuth } = await import('../api/_firebaseAdmin.js');
  const firestore = initAdmin();
  const auth = adminAuth();

  const list = await auth.listUsers(1000);
  if (list.users.length === 0) {
    console.log('No users found in the Auth emulator yet — sign in through the app first, then re-run this.');
    return;
  }

  for (const u of list.users) {
    await firestore.collection('users').doc(u.uid).set({
      tier: 'premium',
      subscriptionStatus: 'active',
    }, { merge: true });
    console.log(`Granted emulator-premium to ${u.email || u.uid} (${u.uid})`);
  }
  console.log(`Done — ${list.users.length} user(s) updated.`);
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
