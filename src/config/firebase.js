import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCR0ahCPS5vZQbuRgRzh0EI5HNe6e2E-2Y",
  authDomain: "cfbtracker-200ab.firebaseapp.com",
  projectId: "cfbtracker-200ab",
  storageBucket: "cfbtracker-200ab.firebasestorage.app",
  messagingSenderId: "406010526116",
  appId: "1:406010526116:web:7be6a63fb683b1dd7ba931",
  measurementId: "G-P3PV4K9TYW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Add scope for Google Drive file access (files created by or opened with the app)
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

// Use IndexedDB-backed persistent cache so cold reopens (especially on
// mobile) can serve dynasty docs and subcollection reads from local
// cache instead of waiting on a network round-trip. Without this every
// app reopen had to do a fresh Firestore handshake before "Loading
// dynasties..." could clear, which on flaky cellular stretched into
// minutes.
//
// A previous comment here claimed memory-only caching was needed to
// keep stint migration data from getting lost. That was a misdiagnosis:
// persistent cache writes through to the server, and migration safety
// is enforced by the persisted migration flags in applyMigrations and
// processMigrationPersistence (DynastyContext.jsx). Those guards keep
// stint data correct regardless of cache mode.
//
// `persistentMultipleTabManager` coordinates ALL open tabs behind a single
// leader tab that owns the one sync connection to Firestore and proxies
// reads/writes for every other tab. This replaces `persistentSingleTabManager
// ({ forceOwnership: false })`, which was the root cause of a "saves never
// finish" bug: under single-tab, only the lease-owning tab actually syncs, so
// a SECOND tab (or a tab that couldn't reclaim a stale lease left by a crashed/
// backgrounded tab) would durably cache its writes locally but NEVER get a
// server ack — the write spun "Saving…" forever (see settleOrProceed). The
// multi-tab manager elects a leader and recovers from stale leases, so writes
// sync no matter how many tabs are open. The old multi-tab "acquisition race"
// warning applied to the deprecated enableMultiTabIndexedDbPersistence API;
// persistentMultipleTabManager is the current, stable, Firebase-recommended
// manager for exactly this multi-tab case.
// If IndexedDB isn't available (Safari private browsing, blocked
// storage), Firebase silently falls back to memory cache.
// experimentalForceLongPolling: FORCE long-polling (plain XHR POSTs) instead of
// the streaming WebChannel. We previously used experimentalAutoDetectLongPolling,
// but auto-detect judges the connection healthy when READS work (served from the
// local cache) while the streaming WRITE channel is silently dead — which is
// exactly the Safari/iOS failure we hit: reads look fine, every write times out
// and never reaches the server, so a user's edits pile up only in local cache
// and never sync (data-loss risk). Safari's WebChannel handling (plus ITP,
// carrier networks, captive portals, corporate proxies, and privacy extensions)
// breaks the streaming channel far more often than the long-poll transport, and
// auto-detect doesn't reliably rescue it. Forcing long-polling trades a small
// latency bump for a connection that actually delivers writes across the board.
// If IndexedDB isn't available (Safari private browsing, blocked storage),
// Firebase silently falls back to memory cache.
// No cacheSizeBytes here previously means Firestore's own default (40MB)
// applied, silently LRU-evicting older cached documents once a dynasty's
// data (a full PC roster + 800+ games, some carrying embedded box scores,
// easily exceeds that) grew past it — so "the tracker's most recent
// picture" wasn't actually guaranteed to still be in cache on a later
// visit, even for a dynasty just looked at. CACHE_SIZE_UNLIMITED removes
// that eviction pressure entirely; the only remaining ceiling is the
// browser's own IndexedDB storage quota, which is far larger.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  }),
  experimentalForceLongPolling: true,
});

// Local Firebase emulator opt-in — lets the REAL Admin SDK code (e.g.
// api/cfb27-bulk-seed-players.js, run via scripts/dev-cfb27-server.cjs) be
// tested against a real local Firestore/Auth implementation, with zero
// dependency on production credentials. `import.meta.env.DEV` is a
// build-time constant Vite hard-replaces to `false` in production builds —
// this whole block is dead-code-eliminated from anything actually shipped,
// so there is no way for a deployed app to connect to an emulator. The
// second gate (an explicit opt-in env var) keeps NORMAL local dev — which
// talks to the real cloud project — unaffected unless deliberately flipped.
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  console.warn('[firebase] Connected to LOCAL EMULATORS (Firestore :8080, Auth :9099) — not the real cloud project.')
}

// Firebase Storage — used for player card art, profile pictures, and
// game/box-score photo uploads. Replaces the previous imgbb dependency,
// which was a free image host with no SLA: outages and silent pruning
// of hosted images would leave broken card tiles in user dynasties.
// Storage objects live at the bucket configured in firebaseConfig
// (cfbtracker-200ab.firebasestorage.app).
export const storage = getStorage(app);

export default app;
