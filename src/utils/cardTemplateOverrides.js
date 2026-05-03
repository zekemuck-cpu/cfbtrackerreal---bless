/**
 * Card template zone overrides — local storage layer.
 *
 * The canonical zone coordinates live in src/data/cardTemplates.js and ship
 * with the bundle. While iterating on a template's layout, the visual zone
 * editor (CardZoneEditor.jsx) writes user-edited zone coordinates here so
 * the new positions persist across reloads without a code change. Once the
 * layout is dialed in, the user can copy the override block and paste it
 * back into cardTemplates.js to make it canonical for everyone.
 *
 * Storage shape:
 *   {
 *     [templateId]: { zones: [{ x, y, w, h, ... }, ...] }
 *   }
 *
 * The `zones` array is parallel-indexed to the template's zones[] array.
 * Each entry replaces the matching template zone's positional fields.
 */

const STORAGE_KEY = 'cardTemplateOverrides_v1'

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function loadOverrides() {
  if (!isBrowser()) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveOverrides(overrides) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides || {}))
  } catch {
    // Storage may be full or disabled — best-effort
  }
}

export function clearOverridesForTemplate(templateId) {
  const all = loadOverrides()
  if (!all[templateId]) return
  delete all[templateId]
  saveOverrides(all)
}

/**
 * Apply any saved zone overrides to a template object. Returns a new
 * template with merged zones; falls through unchanged if there are no
 * overrides for this template id.
 */
export function applyOverridesToTemplate(template, overrides = null) {
  if (!template) return template
  const ov = (overrides ?? loadOverrides())[template.id]
  if (!ov || !Array.isArray(ov.zones)) return template
  return {
    ...template,
    zones: template.zones.map((z, i) => {
      const patch = ov.zones[i]
      if (!patch) return z
      return { ...z, ...patch }
    }),
  }
}
