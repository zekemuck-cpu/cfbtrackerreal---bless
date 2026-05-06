import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

// Build-time version stamp — date + 4-digit build counter so every
// deploy moves the footer string. The counter is the number of commits
// in the repo today (resets at midnight UTC), matching the original
// YYYY.MM.DD.NNNN convention the hardcoded version used. Falls back to
// total commits modded to 4 digits if shallow-clone limits today's
// query (Vercel sometimes ships a depth-1 clone), and finally to
// "0001" if neither works (e.g. a tarball without .git).
function buildAppVersion() {
  const today = new Date().toISOString().slice(0, 10)
  const todayDots = today.replace(/-/g, '.')
  let buildNum = 1
  try {
    const out = execSync(
      `git log --since="${today} 00:00:00" --format=%H`,
      { stdio: ['ignore', 'pipe', 'ignore'] },
    ).toString().trim()
    if (out) {
      buildNum = out.split('\n').filter(Boolean).length
    }
  } catch {
    try {
      const total = execSync('git rev-list --count HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
      buildNum = (parseInt(total, 10) || 0) % 10000 || 1
    } catch {
      buildNum = 1
    }
  }
  return `${todayDots}.${String(buildNum).padStart(4, '0')}`
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
