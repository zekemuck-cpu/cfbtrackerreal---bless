import { useState, useRef } from 'react'
import { useToast } from './ui/Toast'
import { uploadImage } from '../utils/imageUpload'

/**
 * Reusable image upload component (Firebase Storage backend)
 * Supports: file selection, drag & drop, and paste from clipboard
 *
 * Props:
 * - value: current image URL
 * - onChange: callback when image URL changes
 * - teamColors: { primary, secondary } for styling
 * - placeholder: placeholder text for input (optional)
 * - showPreview: whether to show image preview (default: true)
 * - compact: use compact layout (default: false)
 * - disabled: disable the component (default: false)
 */
export default function ImageUpload({
  value,
  onChange,
  teamColors = { primary: '#1f2937', secondary: '#f3f4f6' },
  placeholder = 'Paste image (Ctrl+V) or enter URL...',
  showPreview = true,
  compact = false,
  disabled = false
}) {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const primaryBgText = 'var(--surface-1)'
  const secondaryBgText = 'var(--surface-1)'

  // Upload image to Firebase Storage (replaces the imgbb path).
  const uploadToCloud = async (file) => {
    try {
      setUploading(true)
      return await uploadImage(file)
    } catch (error) {
      toast.error('Failed to upload image: ' + error.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  // Validate and upload file
  const handleFile = async (file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (max 32MB)
    if (file.size > 32 * 1024 * 1024) {
      toast.error('Image must be less than 32MB')
      return
    }

    const url = await uploadToCloud(file)
    if (url) {
      onChange(url)
    }
  }

  // Handle file selection
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    await handleFile(file)
    e.target.value = '' // Reset so same file can be selected again
  }

  // Try to pull an image URL out of a clipboard text/html payload
  // (typical when you "Copy image" from ChatGPT, Notion, Google Docs,
  // etc. — the clipboard gets an `<img src="…">` snippet, NOT an
  // actual image blob).
  const extractImageUrlFromHtml = (html) => {
    if (!html) return null
    // Use DOMParser when available so we don't have to ship a regex
    // that handles every weird quoting variation.
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const img = doc.querySelector('img')
      if (img && img.getAttribute('src')) return img.getAttribute('src')
    } catch {
      // Fall through to regex.
    }
    const m = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
    return m ? m[1] : null
  }

  // Does this string look like a URL we can fetch?
  const looksLikeUrl = (s) => {
    if (!s) return false
    const trimmed = s.trim()
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:image/')
  }

  // Convert a remote image URL (or data: URL) into an uploadable File.
  // Used when the user pastes "Copy image" content that's just a URL
  // wrapper rather than a real image blob — we fetch the bytes here
  // so we can re-upload to Firebase Storage (and own a permanent copy).
  const urlToImageFile = async (url) => {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Not an image (${blob.type || 'unknown'})`)
    }
    const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png'
    return new File([blob], `pasted.${ext}`, { type: blob.type })
  }

  // Some hosts gate their image content behind session cookies / auth
  // tokens — the URL only renders inside that host's own pages and
  // returns 401/403 from any other origin. Pasting such a URL would
  // silently produce a broken <img> icon, so we reject these upfront
  // with an actionable error. The list is the known-bad set we've hit
  // in the wild; other URLs go through the load-verification path
  // below as a generic safety net.
  const isKnownAuthGatedUrl = (url) => {
    try {
      const u = new URL(url)
      // ChatGPT backend serves images via session-authenticated routes
      // (chatgpt.com/backend-api/estuary/content?id=…). These never
      // load outside of a logged-in ChatGPT tab.
      if (/(^|\.)chatgpt\.com$/i.test(u.hostname) && /^\/backend-api\//i.test(u.pathname)) return true
      return false
    } catch {
      return false
    }
  }

  // Verify a URL actually renders as an image (not a broken link)
  // before we set it as the value. Uses an off-DOM <img> with onload /
  // onerror so we get a real answer regardless of CORS — the browser
  // can still display cross-origin images even when `fetch` is blocked.
  const verifyImageLoads = (url) => new Promise(resolve => {
    const probe = new window.Image()
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    probe.onload = () => finish(true)
    probe.onerror = () => finish(false)
    probe.src = url
    setTimeout(() => finish(false), 8000)
  })

  // Take a URL the user pasted (from HTML or plain text) and either
  // fetch+upload it (preferred) or fall back to using it as-is in the
  // value field. The "as-is" path is the safety net for hosts that
  // block CORS on their image CDN — the URL still works in an <img>
  // tag, just not for re-upload. Before accepting that fallback we
  // verify the URL actually loads so we don't silently produce a
  // broken-image icon (the ChatGPT backend-api failure mode).
  const handlePastedUrl = async (url) => {
    const cleanUrl = url.trim()

    if (isKnownAuthGatedUrl(cleanUrl)) {
      toast.error('That ChatGPT link needs login to load. Right-click the image and choose "Copy image" (not "Copy link"), or save it and upload the file.')
      return false
    }

    try {
      const file = await urlToImageFile(cleanUrl)
      await handleFile(file)
      return true
    } catch {
      // CORS blocked or wasn't an image — verify it actually renders
      // before we set it as-is. Without this check, broken auth-gated
      // URLs would slip through and show a broken-image icon.
      const ok = await verifyImageLoads(cleanUrl)
      if (!ok) {
        toast.error("That URL doesn't load as an image. Try right-click → \"Copy image\", or save the file and upload it.")
        return false
      }
      onChange(cleanUrl)
      toast.success('Image URL set. If it stops loading later, paste again — some hosts expire links.')
      return true
    }
  }

  // Handle paste event (Ctrl+V into the drop zone, prompt textarea, etc.)
  const handlePaste = async (e) => {
    const cd = e.clipboardData
    if (!cd) return

    // 1. Real image blob — best case.
    for (const item of cd.items || []) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) await handleFile(file)
        return
      }
    }

    // 2. text/html — pull out an <img src="…"> if present (ChatGPT,
    //    Notion, Google Docs all paste this shape when you copy an
    //    image rendered in the page).
    const html = cd.getData?.('text/html')
    const fromHtml = extractImageUrlFromHtml(html)
    if (fromHtml && looksLikeUrl(fromHtml)) {
      e.preventDefault()
      await handlePastedUrl(fromHtml)
      return
    }

    // 3. text/plain — bare URL.
    const text = cd.getData?.('text/plain') || cd.getData?.('text')
    if (text && looksLikeUrl(text)) {
      e.preventDefault()
      await handlePastedUrl(text)
      return
    }
    // No image content at all — let the default paste behavior run
    // (e.g. typing into the URL input field).
  }

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    if (disabled) return

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      await handleFile(files[0])
    }
  }

  // Handle clipboard button click (the explicit "Paste from
  // Clipboard" button — also the only path that works on most
  // mobile keyboards). Mirrors handlePaste's three-tier fallback:
  // image blob → HTML <img src> → plain-text URL.
  const handleClipboardPaste = async () => {
    // navigator.clipboard.readText() is a separate path that some
    // browsers grant access to even when read() is blocked. Cache
    // both attempts so we can use whichever succeeds.
    let clipboardItems = null
    let plainText = null
    try {
      clipboardItems = await navigator.clipboard.read()
    } catch {
      // read() is gated behind permissions on some platforms — fall
      // through and try readText() below.
    }
    try {
      plainText = await navigator.clipboard.readText()
    } catch {
      // readText() may also be denied. We'll surface a single error
      // at the bottom if every path failed.
    }

    // 1. Look for a real image blob in the structured clipboard items.
    if (clipboardItems) {
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (imageType) {
          try {
            const blob = await item.getType(imageType)
            const ext = (imageType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png'
            const file = new File([blob], `pasted.${ext}`, { type: imageType })
            await handleFile(file)
            return
          } catch {
            // fall through to text fallback
          }
        }
      }

      // 2. No image type — check if any item is text/html with an
      //    embedded <img src>. (This is the ChatGPT / Notion case.)
      for (const item of clipboardItems) {
        if (item.types.includes('text/html')) {
          try {
            const blob = await item.getType('text/html')
            const html = await blob.text()
            const url = extractImageUrlFromHtml(html)
            if (url && looksLikeUrl(url)) {
              await handlePastedUrl(url)
              return
            }
          } catch {
            // try next item type
          }
        }
      }
    }

    // 3. Plain-text URL — works whether we got it from clipboard.read()
    //    or had to fall back to clipboard.readText().
    if (plainText && looksLikeUrl(plainText)) {
      await handlePastedUrl(plainText)
      return
    }
    if (clipboardItems) {
      for (const item of clipboardItems) {
        if (item.types.includes('text/plain')) {
          try {
            const blob = await item.getType('text/plain')
            const text = await blob.text()
            if (text && looksLikeUrl(text)) {
              await handlePastedUrl(text)
              return
            }
          } catch {
            // give up
          }
        }
      }
    }

    if (clipboardItems == null && plainText == null) {
      toast.error('Browser blocked clipboard access. Try Ctrl+V/Cmd+V into the drop zone instead.')
      return
    }
    toast.error("Couldn't find an image in the clipboard. Try right-click → Save image, then click the drop zone to upload.")
  }

  if (compact) {
    // Compact layout - just input with paste support
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={uploading ? 'Uploading...' : placeholder}
          disabled={disabled || uploading}
          className="flex-1 px-3 py-2 rounded border focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            borderColor: 'var(--text-primary)',
            backgroundColor: '#fff',
            color: '#000'
          }}
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          className="hidden"
          disabled={disabled || uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="px-3 py-2 rounded font-medium hover:opacity-80 disabled:opacity-50"
          style={{
            backgroundColor: 'var(--text-primary)',
            color: primaryBgText
          }}
          title="Select file"
        >
          {uploading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    )
  }

  // Full layout with preview and all options
  return (
    <div className="space-y-3">
      {/* Preview */}
      {showPreview && value && (
        <div className="flex justify-center">
          <div className="relative">
            <img
              src={value}
              alt="Preview"
              className="w-24 h-24 object-cover rounded-lg border-2"
              style={{ borderColor: 'var(--text-primary)' }}
              onError={(e) => { e.target.style.display = 'none' }}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                title="Remove image"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Drop zone / Paste area */}
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
          dragOver ? 'border-surface-5 bg-surface-2' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{
          borderColor: dragOver ? 'var(--text-primary)' : 'var(--surface-5)',
          backgroundColor: dragOver ? 'var(--surface-2)' : 'transparent'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        onPaste={handlePaste}
        tabIndex={0}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 animate-spin" style={{ color: 'var(--text-primary)' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium" style={{ color: secondaryBgText }}>Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8" style={{ color: 'var(--text-primary)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div className="text-sm" style={{ color: secondaryBgText }}>
              <span className="font-medium">Click to select</span>, drag & drop, or <span className="font-medium">paste (Ctrl+V)</span>
            </div>
            <span className="text-xs" style={{ color: secondaryBgText, opacity: 0.6 }}>
              Supports JPG, PNG, GIF up to 32MB
            </span>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Mobile paste button */}
      <button
        type="button"
        onClick={handleClipboardPaste}
        disabled={disabled || uploading}
        className="w-full py-2 px-4 rounded-lg border-2 font-medium hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{
          borderColor: 'var(--text-primary)',
          color: 'var(--text-primary)',
          backgroundColor: 'transparent'
        }}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Paste from Clipboard
      </button>

      {/* URL input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder="Or enter image URL directly..."
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded border focus:outline-none focus:ring-2 text-sm"
          style={{
            borderColor: 'var(--surface-5)',
            backgroundColor: '#fff',
            color: '#000'
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-2 rounded bg-red-500 text-white hover:bg-red-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
