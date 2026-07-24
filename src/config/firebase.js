import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
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
// `persistentSingleTabManager` is the conservative tab manager — each
// tab keeps its own cache (no cross-tab coordination), which avoids the
// multi-tab acquisition race that has bitten other Firebase apps.
// If IndexedDB isn't available (Safari private browsing, blocked
// storage), Firebase silently falls back to memory cache.
// experimentalAutoDetectLongPolling: WebSocket-based Firestore connections
// frequently get blocked or stuck on mobile carrier networks, captive
// portals, and corporate proxies. When that happens, the SDK normally
// waits ~30s for the WebSocket to time out before falling back to
// long-polling — that's the dominant cause of the "sometimes the app
// loads in milliseconds, sometimes it takes minutes" pattern users have
// reported when swiping the app in/out of background. Auto-detect
// triggers the fallback as soon as it sees the connection misbehaving,
// so cold reopens stay snappy on misbehaving networks.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({ forceOwnership: false }),
  }),
  experimentalAutoDetectLongPolling: true,
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
