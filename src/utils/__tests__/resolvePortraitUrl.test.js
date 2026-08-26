import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolvePortraitUrl } from '../imageProxy'

// resolvePortraitUrl exists because pictureUrl is stored ABSOLUTE at save-import
// time, freezing whatever host was configured then. These cover the case that
// actually broke in production: a dynasty synced before the portrait CDN was
// set up, whose every player points at the app's own origin (where the ~800 MB
// pack is deliberately not deployed).

const setBase = (v) => {
  vi.stubEnv('VITE_CFB27_PORTRAIT_BASE', v)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolvePortraitUrl', () => {
  it('rebases a portrait stored against the app origin onto the configured CDN', () => {
    setBase('https://cdn.example.com')
    expect(resolvePortraitUrl('https://dynastytracker.app/cfb27-portraits/unique/1234.webp'))
      .toBe('https://cdn.example.com/cfb27-portraits/unique/1234.webp')
  })

  it('rebases coach portraits the same way', () => {
    setBase('https://cdn.example.com')
    expect(resolvePortraitUrl('https://dynastytracker.app/cfb27-portraits/coach-unique/7.webp'))
      .toBe('https://cdn.example.com/cfb27-portraits/coach-unique/7.webp')
  })

  it('strips a trailing slash on the configured base so the path never doubles up', () => {
    setBase('https://cdn.example.com/')
    expect(resolvePortraitUrl('https://old.host/cfb27-portraits/generic/abc.webp'))
      .toBe('https://cdn.example.com/cfb27-portraits/generic/abc.webp')
  })

  it('is idempotent — re-resolving an already-correct URL is a no-op', () => {
    setBase('https://cdn.example.com')
    const once = resolvePortraitUrl('https://old.host/cfb27-portraits/unique/1.webp')
    expect(resolvePortraitUrl(once)).toBe(once)
  })

  // The whole point is that user-supplied art must survive untouched — a
  // rebase that caught ImgBB links would break every manually-uploaded photo.
  it('leaves non-portrait URLs completely alone', () => {
    setBase('https://cdn.example.com')
    for (const url of [
      'https://i.ibb.co/abc/photo.jpg',
      'https://example.com/some/other/image.png',
      'data:image/png;base64,AAAA',
    ]) {
      expect(resolvePortraitUrl(url)).toBe(url)
    }
  })

  // The exact case scripts/backfill-portrait-urls.cjs was written to fix: a
  // player synced BEFORE the CDN existed, whose stored pictureUrl points at
  // the app's own origin where the pack was never deployed. Handled at render
  // time, which is why that backfill is redundant here — see the script's
  // own header. If this test is ever removed, re-read that header before
  // assuming the stored data is fine.
  it('fixes a pre-CDN player URL without any stored-data migration', () => {
    setBase('https://pub-abc123.r2.dev')
    expect(resolvePortraitUrl('https://dynastytracker.app/cfb27-portraits/unique/4821.webp'))
      .toBe('https://pub-abc123.r2.dev/cfb27-portraits/unique/4821.webp')
    // Coach portraits are recomputed live from the raw asset name rather than
    // stored, but a stored one must rebase identically.
    expect(resolvePortraitUrl('https://dynastytracker.app/cfb27-portraits/coach-generic/CoachA.webp'))
      .toBe('https://pub-abc123.r2.dev/cfb27-portraits/coach-generic/CoachA.webp')
  })

  it('passes through empty and non-string values unchanged', () => {
    setBase('https://cdn.example.com')
    expect(resolvePortraitUrl('')).toBe('')
    expect(resolvePortraitUrl(null)).toBe(null)
    expect(resolvePortraitUrl(undefined)).toBe(undefined)
  })
})
