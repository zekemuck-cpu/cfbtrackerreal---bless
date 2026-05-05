import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

// Build-time version stamp — date + short git SHA so every deploy moves
// the footer string. Vercel sets VERCEL_GIT_COMMIT_SHA at build time;
// locally we shell out to git. Falls back to "dev" if neither is
// available (e.g. tarball without .git). The format intentionally
// changes every commit so users can confirm a deploy landed.
function buildAppVersion() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
  let sha = ''
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    sha = process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  } else {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      sha = 'dev'
    }
  }
  return `${today}-${sha}`
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
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: true,
    hmr: false
  }
})
