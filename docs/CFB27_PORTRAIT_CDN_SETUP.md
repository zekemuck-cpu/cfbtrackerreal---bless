# CFB27 Portrait Pack — CDN Setup

Player/coach headshots for CFB27 (PC) dynasties come from a bundled image
pack (`public/cfb27-portraits/`, ~863 MB, ~25,500 files) that's too large to
commit to the repo (see `.gitignore`) or deploy as part of the Vercel build.
It's served from a separate host instead, pointed to by the
`VITE_CFB27_PORTRAIT_BASE` env var (see `mapPortraitUrl`/`mapCoachPortraitUrl`
in `src/data/cfb27SaveImport.js`).

**Symptom if this isn't set up (or is stale):** every player photo falls back
to the team logo/silhouette in production, even though it works perfectly in
local dev — locally, Vite just serves the folder straight off disk, so there's
nothing to configure there.

## How to check whether this is already done

1. Open a synced CFB27 dynasty on the live site, right-click a player photo
   (or a broken-image placeholder) → **Open image in new tab** (or check the
   Network tab in DevTools for a request to `/cfb27-portraits/...`).
2. If the URL's host is `dynastytracker.app` (the app's own domain) — the env
   var isn't set, so it's falling back to the app's own origin, which doesn't
   have the files. This setup hasn't been done yet.
3. If the URL's host is something else (an R2/CDN domain) but still 404s —
   the CDN exists but is missing files, most likely because it was uploaded
   before a recent manifest update added more portrait IDs (see "keeping it
   in sync" below).

## Setup (Cloudflare R2 — recommended, matches the pattern already used
elsewhere in this app for user-uploaded images, see `docs/R2_IMAGE_SETUP.md`)

### 1. Create a bucket

Cloudflare dashboard → R2 → Create bucket. A separate bucket from the
existing user-uploads one is cleaner (e.g. `cfb27-portraits`), since this is
static, publicly-readable, developer-managed content — not per-user data.

### 2. Make it publicly readable

Bucket → Settings → enable the **r2.dev** managed public URL for a quick
start (e.g. `pub-xxxx.r2.dev`), or connect a custom domain
(e.g. `portraits.dynastytracker.app`) for production — same tradeoffs as
described in `docs/R2_IMAGE_SETUP.md` step 3.

No CORS policy is needed here (unlike the presigned-upload flow) — these are
plain `<img src>` loads from a public bucket, not browser-side PUTs.

### 3. Upload the pack

863 MB across tens of thousands of small files — don't use the dashboard's
drag-and-drop for this. Use `rclone` (R2 is S3-compatible):

```bash
# One-time: configure a remote pointed at R2
rclone config
# type: s3, provider: Cloudflare, get Access Key ID / Secret from
# R2 → Manage R2 API Tokens → Create API Token (Object Read & Write)

# Upload (run from the repo root, on whichever machine has the full pack —
# it's gitignored, so this has to be the machine it was originally built on)
rclone copy public/cfb27-portraits r2remote:cfb27-portraits --progress
```

Preserve the folder structure exactly as-is (`unique/`, `generic/`,
`coach-unique/`, `coach-generic/`) — `mapPortraitUrl`/`mapCoachPortraitUrl`
build paths like `/cfb27-portraits/unique/{id}.webp` and append them
directly onto `VITE_CFB27_PORTRAIT_BASE`.

### 4. Set the env var

**Vercel → Project → Settings → Environment Variables** (Production +
Preview):

| Name | Value |
|---|---|
| `VITE_CFB27_PORTRAIT_BASE` | `https://pub-xxxx.r2.dev` or `https://portraits.dynastytracker.app` (no trailing slash) |

This is build-time (`VITE_` prefix) — **Vercel must redeploy** after setting
or changing it for the change to take effect.

### 5. Verify

Redeploy, open a synced dynasty, confirm player/coach photos load. Re-run
the "check whether this is already done" steps above — the image URL's host
should now match `VITE_CFB27_PORTRAIT_BASE`, and it should actually load.

## Keeping it in sync

`src/data/cfb27UniquePortraitIds.json` / `cfb27GenericPortraitKeys.json` (and
their coach counterparts) are the manifest of which portrait IDs the app
will look up — these get expanded over time as more of the pack gets mapped.
**Whenever those manifest files change, the CDN needs a matching re-upload**
(`rclone copy` again is idempotent — it only transfers new/changed files) —
otherwise the app will correctly *try* to resolve a portrait ID the manifest
now knows about, but the CDN won't have that file yet, and it'll silently
fall back to the team logo again for exactly those newly-added players.
