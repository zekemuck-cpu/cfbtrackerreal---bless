// Single serverless function fronting every /api/admin/* endpoint.
//
// Collapsed from four separate files for the same reason as api/cfb27/
// [action].js: Vercel counts FILES under /api as serverless functions and the
// Hobby plan caps a deployment at 12. A dynamic route counts as one function
// regardless of how many actions it serves.
//
// URLs are UNCHANGED — /api/admin/grant-premium, /api/admin/list-images,
// /api/admin/recover-orphan and /api/admin/reupload-url all still resolve
// exactly as before, because [action] matches the same path segment the old
// per-file routes did. No client change was needed for these.
//
// The real handlers live in api/_handlers/admin/. Anything under /api whose
// path starts with `_` is not deployed as a function.
//
// Each handler keeps its OWN authorization (verifyAdmin / verifyBetaGrant) —
// this dispatcher intentionally performs no auth, so the admin allowlist is
// enforced in exactly one place per endpoint and can't be weakened by a
// dispatcher-level shortcut.
// Lazy per-request imports, same rationale as api/cfb27/[action].js: a static
// import list makes every handler's dependencies (and failures) shared by all
// four routes.
const ROUTES = {
  'grant-premium': () => import('../_handlers/admin/grant-premium.js'),
  'list-images': () => import('../_handlers/admin/list-images.js'),
  'recover-orphan': () => import('../_handlers/admin/recover-orphan.js'),
  'reupload-url': () => import('../_handlers/admin/reupload-url.js'),
}

export default async function handler(req, res) {
  const raw = req.query?.action
  const action = Array.isArray(raw) ? raw[0] : raw

  const load = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null
  if (!load) {
    res.status(404).json({ error: `Unknown endpoint: admin/${action ?? '(none)'}` })
    return
  }
  let mod
  try {
    mod = await load()
  } catch (err) {
    console.error(`[api/admin/${action}] handler failed to load:`, err)
    res.status(500).json({ error: `Endpoint unavailable (${action}): ${err?.message || 'load failed'}` })
    return
  }
  return mod.default(req, res)
}
