import { useState, useCallback } from 'react'

// Max players the Compare Players page shows side by side. MUST stay in sync
// with MAX_COLUMNS in src/pages/dynasty/ComparePlayers.jsx.
export const MAX_COMPARE = 6

// Two-arrow "compare / swap" glyph (top arrow right, bottom arrow left) — the
// same icon used by the Compare button on the player page. Shared so every
// entry point reads identically.
export const COMPARE_ICON_PATH = 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4'

// Selection state for the multi-select "compare players" flow used on the
// Roster and Depth Chart tabs. Selected players are an ordered list of pid
// strings (the order becomes the column order on the Compare page), capped at
// MAX_COMPARE. `active` gates whether clicking a player selects vs. navigates.
export function useCompareSelection() {
  const [active, setActive] = useState(false)
  const [selected, setSelected] = useState([])

  const start = useCallback(() => { setSelected([]); setActive(true) }, [])
  const cancel = useCallback(() => { setActive(false); setSelected([]) }, [])
  const isSelected = useCallback((pid) => selected.includes(String(pid)), [selected])
  const toggle = useCallback((pid) => {
    if (pid == null) return
    const key = String(pid)
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((p) => p !== key)
      if (prev.length >= MAX_COMPARE) return prev // capped — ignore extra picks
      return [...prev, key]
    })
  }, [])

  return {
    active,
    selected,
    count: selected.length,
    atMax: selected.length >= MAX_COMPARE,
    start,
    cancel,
    toggle,
    isSelected,
  }
}

// Build the Compare Players deep link for a set of pids all viewed in `year`.
// Tokens are `pid-year`, comma-joined — the format ComparePlayers.parseSlots
// expects. Capped at MAX_COMPARE.
export function buildCompareUrl(pathPrefix, pids, year) {
  const tokens = pids.slice(0, MAX_COMPARE).map((pid) => `${pid}-${year}`)
  return `${pathPrefix}/compare?players=${tokens.join(',')}`
}
