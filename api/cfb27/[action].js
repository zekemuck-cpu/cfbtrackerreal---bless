// Single serverless function fronting every CFB 27 save-sync endpoint.
//
// WHY ONE FUNCTION INSTEAD OF FOUR FILES: Vercel counts FILES under /api as
// serverless functions, and the Hobby plan caps a deployment at 12. This
// project was already sitting at exactly 12, so adding the four CFB 27
// endpoints as their own files pushed the deployment to 16 and it failed at
// the "Deploying outputs" step (the build itself succeeds, which makes it
// look like a code error — it isn't). A dynamic route counts as ONE function
// no matter how many actions it serves, so all four live here.
//
// The real handlers live in api/_handlers/cfb27/. Anything under /api whose
// path starts with `_` is NOT deployed as a function — it's ordinary code
// that gets bundled into whatever imports it. That's what makes this work.
//
// Routes served (unchanged in shape, just nested one level deeper than the
// old flat `/api/cfb27-*` names):
//   POST /api/cfb27/save-upload-url    → presigned R2 PUT for the save file
//   POST /api/cfb27/save-parse         → server-side binary parse of the save
//   POST /api/cfb27/bulk-seed-players  → Admin-SDK bulk write, new dynasty
//   POST /api/cfb27/save-sync-players  → Admin-SDK bulk write, existing dynasty
//
// Each handler still does its OWN auth (verifyPremium) and CORS — this file
// deliberately adds no auth of its own, so there's exactly one place per
// endpoint where access is decided and no chance of a dispatcher-level
// shortcut silently weakening it.
// Handlers are imported LAZILY, per request. Static top-level imports would
// pull save-parse's dependency chain — madden-franchise (~25 MB) plus a
// CommonJS extractor and its schema JSON — into EVERY request to this route,
// including the tiny presign call that needs none of it. That is both a slow
// cold start and a shared failure domain: anything wrong in the parse chain
// takes down uploading too, and the client only sees a platform-level 500
// with no JSON body, which reads as the generic "Could not start upload".
// Loading on demand keeps each action's failures to itself.
const ROUTES = {
  'save-upload-url': () => import('../_handlers/cfb27/save-upload-url.js'),
  'save-parse': () => import('../_handlers/cfb27/save-parse.js'),
  'bulk-seed-players': () => import('../_handlers/cfb27/bulk-seed-players.js'),
  'save-sync-players': () => import('../_handlers/cfb27/save-sync-players.js'),
}

export default async function handler(req, res) {
  // `action` is the [action] path segment. Vercel gives it as a string, but
  // hands back an array if the segment repeats — normalize both.
  const raw = req.query?.action
  const action = Array.isArray(raw) ? raw[0] : raw

  const load = Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action] : null
  if (!load) {
    res.status(404).json({ error: `Unknown endpoint: cfb27/${action ?? '(none)'}` })
    return
  }

  // Surface an import/boot failure as JSON with an `error` key. Letting it
  // throw yields Vercel's HTML 500, which the client cannot parse, so the
  // real cause is replaced by a generic message and the report is undebuggable.
  let mod
  try {
    mod = await load()
  } catch (err) {
    console.error(`[api/cfb27/${action}] handler failed to load:`, err)
    res.status(500).json({ error: `Endpoint unavailable (${action}): ${err?.message || 'load failed'}` })
    return
  }
  return mod.default(req, res)
}
