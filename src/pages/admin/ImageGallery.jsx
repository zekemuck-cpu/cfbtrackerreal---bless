import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { auth } from '../../config/firebase'
import { compressImageBlob } from '../../utils/imageUpload'

// Admin-only live feed of every image uploaded to R2 across all users.
// The server endpoint (api/admin/list-images) enforces the same admin
// allowlist, so a non-admin who reached this route gets nothing back.

const API_BASE = import.meta.env.VITE_API_BASE || ''

function formatBytes(n) {
  const b = Number(n) || 0
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Settings defaults
const DEFAULT_SETTINGS = {
  minSizeKB: 0,    // 0 = no minimum (compress all)
  quality: 0.72,   // WebP quality (0.70–0.95) — matches the upload-time default
  maxDim: 1600,    // max image dimension in px — matches the upload-time default
}

const MIN_SIZE_PRESETS = [
  { label: 'all sizes', value: 0 },
  { label: '> 100 KB', value: 100 },
  { label: '> 500 KB', value: 500 },
  { label: '> 1 MB', value: 1024 },
  { label: '> 2 MB', value: 2048 },
]

const QUALITY_PRESETS = [
  { label: 'Low (0.70)', value: 0.70 },
  { label: 'Default (0.72)', value: 0.72 },
  { label: 'Medium (0.80)', value: 0.80 },
  { label: 'High (0.90)', value: 0.90 },
  { label: 'Max (0.95)', value: 0.95 },
]

const MAX_DIM_PRESETS = [
  { label: '1280 px', value: 1280 },
  { label: '1600 px (default)', value: 1600 },
  { label: '1920 px', value: 1920 },
  { label: '2560 px', value: 2560 },
]

export default function ImageGallery() {
  const { isAdmin } = useAuth()
  const [state, setState] = useState({ status: 'idle', images: [], count: 0, totalBytes: 0, uploaders: 0, capped: false, error: null })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Not signed in')
      const token = await user.getIdToken()
      const res = await fetch(`${API_BASE}/api/admin/list-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      })
      if (!res.ok) {
        const info = await res.json().catch(() => ({}))
        throw new Error(info?.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      setState({
        status: 'ready',
        images: data.images || [],
        count: data.count || 0,
        totalBytes: data.totalBytes || 0,
        uploaders: data.uploaders || 0,
        capped: !!data.capped,
        error: null,
      })
    } catch (err) {
      setState((s) => ({ ...s, status: 'error', error: err.message || 'Failed to load' }))
    }
  }, [])

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  // ---- Settings panel ----
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  const setSetting = (key, value) => setSettings((s) => ({ ...s, [key]: value }))

  // Images that pass the min-size filter
  const compressibleImages = state.images.filter(img => img.size >= settings.minSizeKB * 1024)

  // ---- Recompress existing images in place ----
  const [recompress, setRecompress] = useState({ running: false, done: 0, total: 0, savedBytes: 0, skipped: 0, failed: 0 })
  const cancelRef = useRef(false)

  // Per-image compress state: key → 'running' | 'done:N' | 'skipped' | 'failed'
  const [imgStatus, setImgStatus] = useState({})

  // ---- Multi-select (Ctrl+click / Shift+click) ----
  const [selected, setSelected] = useState(() => new Set())
  const anchorRef = useRef(null) // last clicked key, anchor for shift-range

  // ---- Full-screen viewer (plain click on a tile) ----
  const [lightbox, setLightbox] = useState(null) // the img being viewed, or null
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // ---- Per-user collapse (click a uploader header to minimize its grid) ----
  const [collapsed, setCollapsed] = useState(() => new Set())
  const toggleCollapsed = (uid) => setCollapsed((prev) => {
    const next = new Set(prev)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    return next
  })

  const recompressOneImg = useCallback(async (img, opts = {}) => {
    const quality = opts.quality ?? settings.quality
    const maxDim = opts.maxDim ?? settings.maxDim

    const resp = await fetch(img.url, { cache: 'no-store' })
    if (!resp.ok) throw new Error(`fetch ${resp.status}`)
    const blob = await resp.blob()

    // Re-encode with the given settings
    const out = await compressImageBlob(blob, { quality, maxDim })

    // Only overwrite if meaningfully smaller
    if (!out || out.size >= img.size * 0.9) return { saved: 0, skipped: true }

    const user = auth.currentUser
    if (!user) throw new Error('Not signed in')
    const token = await user.getIdToken()
    const presign = await fetch(`${API_BASE}/api/admin/reupload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ key: img.key, contentType: out.type || 'image/webp' }),
    })
    if (!presign.ok) {
      const info = await presign.json().catch(() => ({}))
      throw new Error(info?.error || `presign ${presign.status}`)
    }
    const { uploadUrl, headers } = await presign.json()
    const put = await fetch(uploadUrl, { method: 'PUT', body: out, headers })
    if (!put.ok) throw new Error(`put ${put.status}`)
    return { saved: img.size - out.size, skipped: false }
  }, [settings.quality, settings.maxDim])

  // Compress a single image (triggered from the per-image button)
  const compressSingle = useCallback(async (img) => {
    setImgStatus((s) => ({ ...s, [img.key]: 'running' }))
    try {
      const r = await recompressOneImg(img)
      setImgStatus((s) => ({ ...s, [img.key]: r.skipped ? 'skipped' : `done:${r.saved}` }))
    } catch {
      setImgStatus((s) => ({ ...s, [img.key]: 'failed' }))
    }
  }, [recompressOneImg])

  const recompressAll = useCallback(async () => {
    const images = compressibleImages
    if (!images.length || recompress.running) return

    const filterNote = settings.minSizeKB > 0
      ? ` (only images > ${formatBytes(settings.minSizeKB * 1024)})`
      : ''
    if (!window.confirm(
      `Recompress ${images.length} images in place${filterNote}?\n\nEach file is overwritten with a smaller version at quality=${settings.quality}, max ${settings.maxDim}px. URLs stay the same — nothing in your dynasties breaks.`
    )) return

    cancelRef.current = false
    setRecompress({ running: true, done: 0, total: images.length, savedBytes: 0, skipped: 0, failed: 0 })

    let next = 0, done = 0, savedBytes = 0, skipped = 0, failed = 0
    const CONCURRENCY = 2
    async function worker() {
      while (true) {
        if (cancelRef.current) return
        const i = next++
        if (i >= images.length) return
        try {
          const r = await recompressOneImg(images[i])
          if (r.skipped) skipped++
          savedBytes += r.saved || 0
        } catch {
          failed++
        }
        done++
        setRecompress({ running: true, done, total: images.length, savedBytes, skipped, failed })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
    setRecompress((s) => ({ ...s, running: false }))
    load()
  }, [compressibleImages, recompress.running, recompressOneImg, settings, load])

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-bold text-txt-primary">Image Gallery</h1>
        <p className="text-txt-tertiary mt-2">Not authorized.</p>
      </div>
    )
  }

  const { status, images, count, totalBytes, uploaders, capped, error } = state

  // Group by uploader, preserving newest-first order within each group.
  const groups = []
  const indexByUid = new Map()
  for (const img of images) {
    let g = indexByUid.get(img.uid)
    if (!g) {
      g = { uid: img.uid, images: [] }
      indexByUid.set(img.uid, g)
      groups.push(g)
    }
    g.images.push(img)
  }

  // Flat key list in on-screen (top-to-bottom) order — used for shift-range.
  const orderedKeys = groups.flatMap((g) => g.images.map((i) => i.key))
  const imgByKey = new Map(images.map((i) => [i.key, i]))
  const selectedImgs = [...selected].map((k) => imgByKey.get(k)).filter(Boolean)
  const selectedBytes = selectedImgs.reduce((s, i) => s + (i.size || 0), 0)

  const onTileClick = (img, e) => {
    e.preventDefault()
    const key = img.key

    // Plain click opens the image full screen. Ctrl/Cmd-click and Shift-click
    // drive the multi-select workflow used by "Compress selected".
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setLightbox(img)
      return
    }

    setSelected((prev) => {
      const next = new Set(prev)
      if (e.shiftKey && anchorRef.current) {
        // Select everything between the anchor and this image (inclusive).
        const a = orderedKeys.indexOf(anchorRef.current)
        const b = orderedKeys.indexOf(key)
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          for (let i = lo; i <= hi; i++) next.add(orderedKeys[i])
        } else {
          next.add(key)
        }
      } else {
        // Ctrl/Cmd-click toggles a single tile (also the shift-with-no-anchor case).
        next.has(key) ? next.delete(key) : next.add(key)
        anchorRef.current = key
      }
      return next
    })
  }

  const compressSelected = async () => {
    if (!selectedImgs.length || recompress.running) return
    if (!window.confirm(`Recompress ${selectedImgs.length} selected images in place at quality=${settings.quality}, max ${settings.maxDim}px?`)) return
    cancelRef.current = false
    setRecompress({ running: true, done: 0, total: selectedImgs.length, savedBytes: 0, skipped: 0, failed: 0 })
    let next = 0, done = 0, savedBytes = 0, skipped = 0, failed = 0
    const CONCURRENCY = 2
    const run = async () => {
      while (true) {
        if (cancelRef.current) return
        const i = next++
        if (i >= selectedImgs.length) return
        const img = selectedImgs[i]
        setImgStatus((s) => ({ ...s, [img.key]: 'running' }))
        try {
          const r = await recompressOneImg(img)
          if (r.skipped) skipped++
          savedBytes += r.saved || 0
          setImgStatus((s) => ({ ...s, [img.key]: r.skipped ? 'skipped' : `done:${r.saved}` }))
        } catch {
          failed++
          setImgStatus((s) => ({ ...s, [img.key]: 'failed' }))
        }
        done++
        setRecompress({ running: true, done, total: selectedImgs.length, savedBytes, skipped, failed })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => run()))
    setRecompress((s) => ({ ...s, running: false }))
    load()
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-16">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-txt-primary">Image Gallery</h1>
          <p className="text-sm text-txt-tertiary mt-0.5">
            Every image uploaded to R2, newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold border border-surface-4 hover:bg-surface-2 ${showSettings ? 'text-txt-primary bg-surface-2' : 'text-txt-secondary'}`}
          >
            Settings
          </button>
          <button
            onClick={recompress.running ? () => { cancelRef.current = true } : recompressAll}
            disabled={status !== 'ready' || images.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-2 disabled:opacity-50"
            title="Re-encode stored images in place using current settings"
          >
            {recompress.running
              ? `Stop (${recompress.done}/${recompress.total})`
              : settings.minSizeKB > 0
                ? `Recompress ${compressibleImages.length} images`
                : 'Recompress all'}
          </button>
          <button
            onClick={load}
            disabled={status === 'loading' || recompress.running}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-2 disabled:opacity-50"
          >
            {status === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="mb-4 rounded-lg border border-surface-4 bg-surface-2 px-4 py-3">
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {/* Min size filter */}
            <label className="flex items-center gap-2">
              <span className="text-txt-secondary whitespace-nowrap">Compress</span>
              <select
                value={settings.minSizeKB}
                onChange={(e) => setSetting('minSizeKB', Number(e.target.value))}
                className="rounded px-2 py-1 text-xs bg-surface-3 border border-surface-4 text-txt-primary"
              >
                {MIN_SIZE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>

            {/* Quality */}
            <label className="flex items-center gap-2">
              <span className="text-txt-secondary whitespace-nowrap">Quality</span>
              <select
                value={settings.quality}
                onChange={(e) => setSetting('quality', Number(e.target.value))}
                className="rounded px-2 py-1 text-xs bg-surface-3 border border-surface-4 text-txt-primary"
              >
                {QUALITY_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>

            {/* Max dimension */}
            <label className="flex items-center gap-2">
              <span className="text-txt-secondary whitespace-nowrap">Max size</span>
              <select
                value={settings.maxDim}
                onChange={(e) => setSetting('maxDim', Number(e.target.value))}
                className="rounded px-2 py-1 text-xs bg-surface-3 border border-surface-4 text-txt-primary"
              >
                {MAX_DIM_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </label>

            {/* Affected count */}
            {status === 'ready' && (
              <span className="text-txt-tertiary self-center">
                {compressibleImages.length === images.length
                  ? `${images.length} images affected`
                  : `${compressibleImages.length} of ${images.length} images affected`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Recompress progress */}
      {(recompress.running || recompress.done > 0) && (
        <div className="mb-4 rounded-lg border border-surface-4 bg-surface-2 px-4 py-2.5 text-sm text-txt-secondary flex flex-wrap gap-x-5 gap-y-1">
          <span>{recompress.running ? 'Recompressing' : 'Recompressed'} <strong className="text-txt-primary">{recompress.done}/{recompress.total}</strong></span>
          <span>Saved <strong className="text-green-500">{formatBytes(recompress.savedBytes)}</strong></span>
          {recompress.skipped > 0 && <span className="text-txt-tertiary">{recompress.skipped} already small</span>}
          {recompress.failed > 0 && <span className="text-amber-500">{recompress.failed} failed</span>}
        </div>
      )}

      {/* Summary stats */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-txt-secondary mb-5">
        <span><strong className="text-txt-primary">{count.toLocaleString()}</strong> images</span>
        <span><strong className="text-txt-primary">{uploaders.toLocaleString()}</strong> uploaders</span>
        <span><strong className="text-txt-primary">{formatBytes(totalBytes)}</strong> stored</span>
        {capped && <span className="text-amber-500">Showing the first 5,000 (more exist)</span>}
      </div>

      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 rounded-lg border border-blue-500/60 bg-surface-2 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-txt-secondary">
            <strong className="text-txt-primary">{selected.size}</strong> selected · {formatBytes(selectedBytes)}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={compressSelected}
              disabled={recompress.running}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-3 disabled:opacity-50"
            >
              {recompress.running ? 'Compressing…' : 'Compress selected'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-surface-4 text-txt-tertiary hover:text-txt-primary"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && images.length > 0 && selected.size === 0 && (
        <p className="text-xs text-txt-tertiary mb-3">Tip: click an image to view it full screen. Ctrl/Cmd-click to select, or Shift-click another to select everything in between.</p>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-surface-4 bg-surface-2 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {status === 'ready' && images.length === 0 && (
        <div className="text-center text-txt-tertiary py-16 text-sm">No images uploaded yet.</div>
      )}

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.uid)
        return (
        <div key={g.uid} className="mb-8">
          <button
            type="button"
            onClick={() => toggleCollapsed(g.uid)}
            className="group w-full flex items-center gap-2 mb-2 sticky top-0 z-10 py-1 text-left hover:opacity-90"
            style={{ background: 'var(--surface-1)' }}
            title={isCollapsed ? 'Expand this uploader' : 'Collapse this uploader'}
          >
            <h2 className="text-sm font-semibold text-txt-primary font-mono break-all">{g.uid}</h2>
            <span className="text-xs text-txt-tertiary">({g.images.length})</span>
            <span className="ml-auto text-xs text-txt-tertiary group-hover:text-txt-primary shrink-0">
              {isCollapsed ? 'Show' : 'Hide'}
            </span>
          </button>
          {!isCollapsed && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {g.images.map((img) => {
              const st = imgStatus[img.key]
              const isBelowThreshold = settings.minSizeKB > 0 && img.size < settings.minSizeKB * 1024
              const isSel = selected.has(img.key)
              return (
                <div
                  key={img.key}
                  onClick={(e) => onTileClick(img, e)}
                  className={`relative rounded-md overflow-hidden border bg-surface-2 cursor-pointer select-none ${isSel ? 'border-blue-500 ring-2 ring-blue-500' : 'border-surface-4 hover:border-surface-5'}`}
                >
                  <div className="aspect-video bg-surface-3 overflow-hidden">
                    <img
                      src={img.url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  </div>
                  {isSel && <div className="absolute inset-0 bg-blue-500/20 pointer-events-none" />}

                  {/* Bottom bar: open · size · compress action */}
                  <div className="flex items-center justify-between px-1.5 py-1 text-[10px] text-txt-tertiary gap-1">
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="truncate hover:text-txt-primary hover:underline underline-offset-2"
                      title="Open full image in a new tab"
                    >{formatWhen(img.lastModified)}</a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={isBelowThreshold ? 'opacity-40' : ''}>{formatBytes(img.size)}</span>
                      {st === 'running' ? (
                        <span className="text-txt-tertiary">…</span>
                      ) : st?.startsWith('done:') ? (
                        <span className="text-green-500">-{formatBytes(Number(st.slice(5)))}</span>
                      ) : st === 'skipped' ? (
                        <span className="text-txt-tertiary">ok</span>
                      ) : st === 'failed' ? (
                        <span className="text-red-400">err</span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); compressSingle(img) }}
                          disabled={recompress.running}
                          className="text-txt-tertiary hover:text-txt-primary underline underline-offset-2 disabled:opacity-30"
                          title={isBelowThreshold ? 'Below size threshold — compress anyway' : 'Compress this image'}
                        >
                          compress
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
        )
      })}

      {/* Full-screen image viewer */}
      {lightbox && (
        <div
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.url}
            alt=""
            className="max-w-full max-h-full object-contain"
            style={{ boxShadow: '0 8px 60px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Close (also: click anywhere outside the image, or press Esc) */}
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-sm font-semibold bg-surface-2/80 border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-2"
          >
            Close
          </button>

          {/* Caption: timestamp, size, open original */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface-2/80 border border-surface-4 text-xs text-txt-secondary"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{formatWhen(lightbox.lastModified)}</span>
            <span className="text-txt-tertiary">{formatBytes(lightbox.size)}</span>
            <a
              href={lightbox.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-txt-primary underline underline-offset-2"
            >
              open original
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
