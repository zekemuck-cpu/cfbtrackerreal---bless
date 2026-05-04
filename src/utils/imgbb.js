// Shared ImgBB upload helper — used by ImageUpload (single image)
// and GameEdit's Photos section (bulk multi-upload). Same endpoint
// as the image-upload component, just hoisted here so we don't have
// to duplicate the fetch + key logic.

const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload'

function getApiKey() {
  return import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
}

/**
 * Upload a single File or Blob to ImgBB. Returns the hosted image URL
 * on success, throws on failure (caller decides how to surface).
 */
export async function uploadImageToImgBB(file) {
  if (!file) throw new Error('No file provided')
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Image upload not configured (missing VITE_IMGBB_API_KEY)')
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error(`Not an image (${file.type || 'unknown type'})`)
  }
  if (file.size > 32 * 1024 * 1024) {
    throw new Error('Image must be ≤ 32MB (ImgBB limit)')
  }

  const formData = new FormData()
  formData.append('image', file)
  formData.append('key', apiKey)

  const response = await fetch(IMGBB_ENDPOINT, {
    method: 'POST',
    body: formData,
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok || !data?.success) {
    throw new Error(data?.error?.message || `Upload failed (${response.status})`)
  }
  return data.data?.url || data.data?.display_url || ''
}

/**
 * Upload many files in parallel. Returns:
 *   { urls: string[], errors: { file: File, error: Error }[] }
 * — partial successes are kept (the urls array is always whatever
 * succeeded), failures are reported back to the caller so the UI can
 * show a per-file error if needed.
 */
export async function uploadImagesToImgBB(files) {
  const list = Array.from(files || [])
  if (list.length === 0) return { urls: [], errors: [] }

  const results = await Promise.allSettled(list.map(f => uploadImageToImgBB(f)))
  const urls = []
  const errors = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) urls.push(r.value)
    else errors.push({ file: list[i], error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) })
  })
  return { urls, errors }
}
