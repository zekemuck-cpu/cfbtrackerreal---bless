import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Build-time version stamp — YYYY.MM.DD.NNNN.
//
// MANUAL_BUILD must be bumped on every commit that ships code. Format
// is a 4-digit zero-padded sequence (no letter suffixes — user
// requirement). The auto-derived version this used to be —
// `git log --since="today"` — undercounts on Vercel because Vercel
// ships shallow clones. Result: the footer would stick on the same
// number across multiple deploys and there was no reliable signal that
// "my fix actually shipped." Manual constant is a small tax for a
// guaranteed signal.
//
// IMPORTANT: MANUAL_BUILD RESETS DAILY. On the FIRST commit of each
// new UTC date, reset MANUAL_BUILD to '0001'. Every subsequent commit
// that day increments by one. The date prefix is auto-derived from
// `new Date().toISOString().slice(0, 10)` below, so the date itself
// flips automatically at UTC midnight — only the counter needs the
// manual reset.
const MANUAL_BUILD = '0031'

function buildAppVersion() {
  const today = new Date().toISOString().slice(0, 10)
  const todayDots = today.replace(/-/g, '.')
  return `${todayDots}.${MANUAL_BUILD}`
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(buildAppVersion()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@assets': path.resolve(__dirname, './attached_assets')
    }
  },
  esbuild: {
    // Mark console.log/info/debug as side-effect-free in production
    // so esbuild's minifier tree-shakes them out of the bundle.
    // Keeps console.warn / console.error intact — those flag real
    // problems we want surfaced in user devtools when debugging.
    // The cumulative impact is meaningful: hot paths log per render
    // / per save, and in dev we ship hundreds of these per session.
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
    // The CFB27 portrait library is ~19,000 individual static image files
    // that never change at runtime — no reason for Vite's file watcher
    // (chokidar) to track them alongside actual source files. On Windows
    // specifically, an untracked folder this size can make local dev
    // noticeably slower (every watched file is also a target for realtime
    // antivirus scanning) — production is unaffected either way, since
    // Vercel serves these as plain static assets, not through this dev
    // server or its watcher at all.
    watch: {
      ignored: ['**/public/cfb27-portraits/**'],
    },
    // Dev-only: the ScoutScore proxy is a Vercel serverless function that
    // doesn't run under plain `npm run dev`. Forward that path straight to
    // MaxPlaysCFB's API so the feature is fully testable locally (server-side
    // hop, so no browser CORS). Production uses the real function instead.
    proxy: {
      '/api/scoutscore-preview': {
        target: 'https://maxplayscfb.com',
        changeOrigin: true,
        rewrite: () => '/api/recruit-percentiles/preview',
      },
      // Dev-only: the CFB 27 save import endpoints are real Vercel serverless
      // functions (R2 upload + Firebase-token-gated parse) that don't run
      // under plain `npm run dev`. Forward to a local stand-in server
      // (scripts/dev-cfb27-server.cjs — run it separately, or via
      // `npm run dev:cfb27-api`) that uses local disk instead of R2 and skips
      // auth, so the feature is fully clickable locally. Production still
      // uses the real functions untouched. Paths match the client's actual
      // /api/cfb27/* calls (the single [action] dispatcher — see
      // api/cfb27/[action].js) even though this dev stand-in isn't itself
      // that dispatcher.
      '/api/cfb27/save-upload-url': { target: 'http://localhost:5051', changeOrigin: true },
      '/api/cfb27/save-parse': { target: 'http://localhost:5051', changeOrigin: true },
      '/api/cfb27/bulk-seed-players': { target: 'http://localhost:5051', changeOrigin: true },
      '/api/cfb27/save-sync-players': { target: 'http://localhost:5051', changeOrigin: true },
    },
  }
})
