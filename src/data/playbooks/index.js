// Registry of all official playbooks.
// Each entry lazy-loads its data file only when needed.

const LOADERS = {
  'Kansas State': () => import('./kansas_state').then(m => m.default),
  'Oregon':       () => import('./oregon').then(m => m.default),
  'Utah':         () => import('./utah').then(m => m.default),
}

// Returns Promise<formation[]> for a known official playbook name, or null.
export function loadPlaybook(name) {
  const fn = LOADERS[name]
  if (!fn) return Promise.resolve(null)
  return fn()
}

// Set of playbook names that have data files loaded.
export const AVAILABLE_PLAYBOOKS = new Set(Object.keys(LOADERS))

// ─── Defense playbooks ────────────────────────────────────────────────────────

const DEF_LOADERS = {
  '4-3 Multiple': () => import('./defense_4_3_multiple').then(m => m.default),
  'Multiple D':   () => import('./defense_multiple_d').then(m => m.default),
}

export function loadDefensePlaybook(name) {
  const fn = DEF_LOADERS[name]
  if (!fn) return Promise.resolve(null)
  return fn()
}

export const AVAILABLE_DEFENSE_PLAYBOOKS = new Set(Object.keys(DEF_LOADERS))
