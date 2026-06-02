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
const MANUAL_BUILD = '0055'

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
    hmr: false
  }
})
