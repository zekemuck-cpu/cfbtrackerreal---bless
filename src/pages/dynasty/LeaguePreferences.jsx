import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { isPcAutoDynasty, editionHasFeature } from '../../editions'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useToast } from '../../components/ui/Toast'
import { getEffectiveCharacters, isRealAccount, SOCIAL_UNIVERSE_VERSION } from '../../data/socialModel'
import SocialCharacterEditModal from '../../components/SocialCharacterEditModal'
import { readClipboardImageAsFile } from '../../utils/clipboardImage'
import { uploadImage } from '../../utils/imageUpload'

/**
 * League Preferences — dynasty-wide settings. First section: Social Media
 * Universe customization (edit a specific account, or mass-edit many at once).
 */

const PAGE_SIZE = 40

function initials(name) {
  const parts = String(name || '').replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ c, size = 36 }) {
  return (
    <div className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, background: c.avatar ? 'transparent' : (c.color || '#657786'), color: '#fff', fontWeight: 700, fontSize: 12 }}>
      {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : initials(c.displayName)}
    </div>
  )
}

const inputCls = 'rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm p-2 focus:outline-none focus:ring-2 focus:ring-surface-5'

export default function LeaguePreferences() {
  const { currentDynasty, loadSocial, saveSocialCharacters, deleteSocialCharacters, importSocialUniverse, upgradeSocialUniverseToLatest, updateDynasty, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const pathPrefix = usePathPrefix()
  const fileRef = useRef(null)

  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')      // all | national | team | conference
  const [teamFilter, setTeamFilter] = useState('all')
  const [realFilter, setRealFilter] = useState('all') // all | real | fake
  const [pfpFilter, setPfpFilter] = useState('all')   // all | has | none
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(() => new Set())
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)

  // Bulk-edit fields (only applied when set)
  const [bulkVerified, setBulkVerified] = useState('')  // '' | 'yes' | 'no'
  const [bulkColorOn, setBulkColorOn] = useState(false)
  const [bulkColor, setBulkColor] = useState('#1d9bf0')
  const [bulkPersonality, setBulkPersonality] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (!currentDynasty?.id) return
    let alive = true
    loadSocial(currentDynasty.id).then(() => alive && setReady(true)).catch(() => alive && setReady(true))
    return () => { alive = false }
  }, [currentDynasty?.id, loadSocial])

  const characters = useMemo(() => getEffectiveCharacters(currentDynasty), [currentDynasty, ready])

  const teamOptions = useMemo(() => {
    const teams = currentDynasty?.teams || {}
    return Object.values(teams)
      .filter(t => t && !t.isFCS && t.abbr && t.name)
      .map(t => ({ tid: Number(t.tid), name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [currentDynasty?.teams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = Object.values(characters).filter(c => {
      if (kind !== 'all' && c.kind !== kind) return false
      if (teamFilter !== 'all' && Number(c.teamTid) !== Number(teamFilter)) return false
      if (realFilter === 'real' && !isRealAccount(c)) return false
      if (realFilter === 'fake' && isRealAccount(c)) return false
      const hasPfp = !!(c.avatar && String(c.avatar).trim())
      if (pfpFilter === 'has' && !hasPfp) return false
      if (pfpFilter === 'none' && hasPfp) return false
      if (q && !(`${c.displayName} ${c.handle} ${c.category} ${c.role}`.toLowerCase().includes(q))) return false
      return true
    })
    list.sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0))
    return list
  }, [characters, search, kind, teamFilter, realFilter, pfpFilter])

  // Reset to page 0 whenever the filter set changes.
  useEffect(() => { setPage(0) }, [search, kind, teamFilter, realFilter, pfpFilter])

  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAllFiltered = () => setSelected(new Set(filtered.map(c => c.id)))
  const clearSelection = () => setSelected(new Set())

  const editingChar = editingId ? characters[editingId] : null

  // Per-row "paste image from clipboard" — same resolution + upload path as the
  // editor's paste button, written straight into avatar/bannerImage so photos
  // can be mass-entered without opening each account. `pasting` holds the key
  // `${id}:${field}` of the row+slot currently uploading.
  const [pasting, setPasting] = useState(null)
  const pasteImageInto = async (c, field) => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (pasting) return
    const key = `${c.id}:${field}`
    setPasting(key)
    try {
      const result = await readClipboardImageAsFile()
      if (!result.ok) {
        if (result.reason === 'denied') toast.error('Browser blocked clipboard access. Open Edit and use the drop zone instead.')
        else if (result.reason === 'auth_url') toast.error('That link needs login to load. Save the image and use the editor to upload.')
        else if (result.reason === 'fetch_failed') { console.error('Clipboard URL fetch failed:', result.error); toast.error("Couldn't fetch that image. Save it and use the editor.") }
        else toast.error('Nothing image-like in the clipboard.')
        return
      }
      const url = await uploadImage(result.file)
      const base = characters[c.id]
      if (!base) { toast.error('Account not found.'); return }
      await saveSocialCharacters(currentDynasty.id, { [c.id]: { ...base, [field]: url, customized: true } })
      toast.success(`${field === 'avatar' ? 'Profile photo' : 'Cover photo'} set for ${base.displayName}.`)
    } catch (err) {
      console.error('[LeaguePreferences] paste image failed:', err)
      toast.error(`Could not set image: ${err?.message || 'Unknown error'}`)
    } finally {
      setPasting(null)
    }
  }

  const deleteOne = async (c) => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (!window.confirm(`Delete ${c.displayName} (${c.handle})? This removes the account from your universe.`)) return
    try {
      await deleteSocialCharacters(currentDynasty.id, [c.id])
      setSelected(prev => { const n = new Set(prev); n.delete(c.id); return n })
      toast.success(`Deleted ${c.displayName}.`)
    } catch (err) {
      console.error('[LeaguePreferences] delete failed:', err)
      toast.error(`Could not delete: ${err?.message || 'Unknown error'}`)
    }
  }

  const deleteSelected = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} selected account${ids.length === 1 ? '' : 's'}? This removes them from your universe.`)) return
    try {
      await deleteSocialCharacters(currentDynasty.id, ids)
      clearSelection()
      toast.success(`Deleted ${ids.length} account${ids.length === 1 ? '' : 's'}.`)
    } catch (err) {
      console.error('[LeaguePreferences] bulk delete failed:', err)
      toast.error(`Could not delete: ${err?.message || 'Unknown error'}`)
    }
  }

  // Offer an upgrade only to dynasties on an OLDER imported universe. New
  // dynasties (socialUniverseReplaced false) already use the live bundled
  // default, so they're always current.
  const showUpgrade = currentDynasty?.socialUniverseReplaced === true
    && Number(currentDynasty?.socialUniverseVersion || 0) < SOCIAL_UNIVERSE_VERSION
  const [upgrading, setUpgrading] = useState(false)
  const handleUpgradeUniverse = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (!window.confirm('Upgrade to the latest social universe?\n\nThis replaces your current accounts with the updated set (real media accounts, fleshed-out fictional accounts, and unique AI profile-picture prompts) and clears in-app overrides and deletions. Export first if you want a backup of your current universe.')) return
    setUpgrading(true)
    try {
      await upgradeSocialUniverseToLatest(currentDynasty.id)
      toast.success('Upgraded to the latest social universe.')
    } catch (err) {
      console.error('[LeaguePreferences] upgrade failed:', err)
      toast.error(`Upgrade failed: ${err?.message || 'Unknown error'}`)
    } finally {
      setUpgrading(false)
    }
  }

  // Build a fallback PFP prompt from account metadata when avatarPrompt is empty.
  function buildFallbackPfpPrompt(c) {
    const name = c.displayName || c.handle || 'CFB account'
    const role = [c.role, c.category].filter(Boolean).join(' / ') || 'college football social media account'
    const colorHint = c.color ? `, accent color ${c.color}` : ''
    const personalityHint = c.personality ? ` ${c.personality.slice(0, 100).replace(/\.$/, '')}.` : ''
    return `Social media profile picture for "${name}", a ${role}${colorHint}.${personalityHint} Clean, modern, square format, instantly readable as a small circular avatar.`.replace(/\s{2,}/g, ' ').trim()
  }

  // Copy a fictional account's AI image-gen prompt so the user can paste it
  // into an image generator, then paste the result back via "Paste PFP".
  // Falls back to a generated prompt when avatarPrompt is empty.
  const copyPfpPrompt = async (c) => {
    const prompt = (c.avatarPrompt || '').trim() || buildFallbackPfpPrompt(c)
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success(`PFP prompt copied for ${c.displayName}.`)
    } catch {
      toast.error('Could not copy — clipboard blocked by the browser.')
    }
  }

  const applyBulk = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (selected.size === 0) return
    const hasChange = bulkVerified || bulkColorOn || bulkPersonality.trim() || bulkCategory.trim()
    if (!hasChange) { toast.error('Set at least one field to apply.'); return }
    setApplying(true)
    try {
      const map = {}
      for (const id of selected) {
        const base = characters[id]
        if (!base) continue
        const rec = { ...base, customized: true }
        if (bulkVerified) rec.verified = bulkVerified === 'yes'
        if (bulkColorOn) rec.color = bulkColor
        if (bulkCategory.trim()) rec.category = bulkCategory.trim()
        if (bulkPersonality.trim()) {
          rec.personality = (base.personality ? base.personality.trim() + ' ' : '') + bulkPersonality.trim()
        }
        map[id] = rec
      }
      await saveSocialCharacters(currentDynasty.id, map)
      toast.success(`Updated ${Object.keys(map).length} accounts.`)
      clearSelection()
      setBulkVerified(''); setBulkColorOn(false); setBulkPersonality(''); setBulkCategory('')
    } catch (err) {
      console.error('[LeaguePreferences] bulk apply failed:', err)
      toast.error(`Could not apply: ${err?.message || 'Unknown error'}`)
    } finally {
      setApplying(false)
    }
  }

  const handleExport = async () => {
    const json = JSON.stringify(Object.values(getEffectiveCharacters(currentDynasty)), null, 2)
    const filename = `social-universe-${String(currentDynasty.name || currentDynasty.id || 'dynasty').replace(/\s+/g, '-')}.json`
    // Prefer a native "Save As" dialog so the user picks the location.
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        return
      } catch (err) {
        if (err?.name === 'AbortError') return // user cancelled the dialog
        // any other error → fall through to the download fallback
      }
    }
    // Fallback (browsers without the File System Access API).
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || isViewOnly) return
    let arr
    try { arr = JSON.parse(await file.text()) } catch { toast.error('That file is not valid JSON.'); return }
    if (!Array.isArray(arr)) { toast.error('Expected a JSON array of accounts.'); return }
    if (!window.confirm(`Import ${arr.length} accounts? This REPLACES this dynasty's entire social universe.`)) return
    try {
      const res = await importSocialUniverse(currentDynasty.id, arr)
      setSelected(new Set())
      toast.success(`Imported ${res.count} accounts${res.skipped ? `, skipped ${res.skipped}` : ''}.`)
    } catch (err) {
      console.error('[LeaguePreferences] import failed:', err)
      toast.error(`Import failed: ${err?.message || 'error'}`)
    }
  }

  // Scout Staff mode — opt-in replacement for the MaxPlaysCFB ScoutScore tools.
  // Default OFF: when off, nothing about MaxPlaysCFB changes. When on, the
  // Recruiting "Targets" tab becomes the Scout Staff hub and the MaxPlaysCFB
  // ScoutScore surfaces are hidden. Fully reversible — toggling back off
  // restores the normal MaxPlaysCFB behavior.
  const scoutStaffEnabled = !!currentDynasty?.scoutStaffEnabled
  const [savingScoutStaff, setSavingScoutStaff] = useState(false)
  const toggleScoutStaff = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (savingScoutStaff) return
    const next = !scoutStaffEnabled
    setSavingScoutStaff(true)
    try {
      await updateDynasty(currentDynasty.id, { scoutStaffEnabled: next })
      toast.success(next ? 'Scout Staff enabled. The Recruiting tab now uses Scout Staff.' : 'Scout Staff disabled — back to MaxPlaysCFB ScoutScore.')
    } catch (err) {
      console.error('[LeaguePreferences] scout staff toggle failed:', err)
      toast.error(`Could not update: ${err?.message || 'Unknown error'}`)
    } finally {
      setSavingScoutStaff(false)
    }
  }

  // Hide Dynasty Blueprint — presentational only. When on, every Blueprint
  // surface (nav, panel/tab, dashboard budget/support-staff/facility to-dos,
  // Dynasty Points framing on coach salaries) is hidden. Never deletes any
  // recorded data — flip it back and everything returns. CFB 27+ only (that's
  // where Blueprint exists), so the toggle hides itself on CFB 26.
  const blueprintHidden = !!currentDynasty?.hideDynastyBlueprint
  const [savingBlueprint, setSavingBlueprint] = useState(false)
  const toggleBlueprint = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (savingBlueprint) return
    const next = !blueprintHidden
    setSavingBlueprint(true)
    try {
      await updateDynasty(currentDynasty.id, { hideDynastyBlueprint: next })
      toast.success(next ? 'Dynasty Blueprint hidden.' : 'Dynasty Blueprint shown.')
    } catch (err) {
      console.error('[LeaguePreferences] blueprint toggle failed:', err)
      toast.error(`Could not update: ${err?.message || 'Unknown error'}`)
    } finally {
      setSavingBlueprint(false)
    }
  }

  // Hide all ratings — turn off full per-player attribute (rating) tracking.
  // When on: the Training Results / Recruit Overalls entry flows capture Overall
  // only, and the player Attributes tab + Compare Players ratings are hidden.
  // Recruit scouting (the 10 attributes from the recruiting flow / ScoutScore)
  // is untouched. Never deletes stored ratings — flip back to see them again.
  const ratingsHidden = !!currentDynasty?.hideAllRatings
  const [savingRatings, setSavingRatings] = useState(false)
  const toggleRatings = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (savingRatings) return
    const next = !ratingsHidden
    setSavingRatings(true)
    try {
      await updateDynasty(currentDynasty.id, { hideAllRatings: next })
      toast.success(next ? 'Ratings hidden — players track Overall only.' : 'Ratings shown.')
    } catch (err) {
      console.error('[LeaguePreferences] hide ratings toggle failed:', err)
      toast.error(`Could not update: ${err?.message || 'Unknown error'}`)
    } finally {
      setSavingRatings(false)
    }
  }

  // Hide Weekly Install / Scouting Report — PC-only (Sync from Save) rows on
  // the Dashboard to-do list. Default ON (rows shown); toggling hides them.
  // Presentational only, nothing recorded is affected.
  const weeklyInstallScoutingHidden = !!currentDynasty?.hideWeeklyInstallScouting
  const [savingWeeklyInstallScouting, setSavingWeeklyInstallScouting] = useState(false)
  const toggleWeeklyInstallScouting = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    if (savingWeeklyInstallScouting) return
    const next = !weeklyInstallScoutingHidden
    setSavingWeeklyInstallScouting(true)
    try {
      await updateDynasty(currentDynasty.id, { hideWeeklyInstallScouting: next })
      toast.success(next ? 'Weekly Install / Scouting Report rows hidden.' : 'Weekly Install / Scouting Report rows shown.')
    } catch (err) {
      console.error('[LeaguePreferences] weekly install/scouting toggle failed:', err)
      toast.error(`Could not update: ${err?.message || 'Unknown error'}`)
    } finally {
      setSavingWeeklyInstallScouting(false)
    }
  }

  if (!currentDynasty) return null

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-display-md text-txt-primary m-0">League Preferences</h1>
      </div>

      {/* Scout Staff — opt-in alternative to MaxPlaysCFB ScoutScore. PC
          (save-sync) dynasties ONLY: its recruiting database is populated by
          Sync from Save, so on a console dynasty it's manual entry into a
          store nothing else fills. The toggle is hidden entirely on console
          and on CFB 26 / untagged dynasties. Default OFF. */}
      {isPcAutoDynasty(currentDynasty) && (
      <section className="rounded-xl border border-surface-4 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        <div className="px-4 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-txt-primary">Use Scout Staff instead of MaxPlaysCFB ScoutScore</div>
            <p className="text-xs text-txt-tertiary mt-1 leading-relaxed m-0">
              <span className="text-txt-secondary font-medium">Scout Staff</span> hires a scout and analyst to grade recruits A+–F and build a recruiting database from the players you scout.{' '}
              <span className="text-txt-secondary font-medium">ScoutScore</span> benchmarks a recruit's visible ratings against a community data pool. Off keeps ScoutScore.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={scoutStaffEnabled}
            onClick={toggleScoutStaff}
            disabled={isViewOnly || savingScoutStaff}
            className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
            style={{
              width: 46,
              height: 26,
              backgroundColor: scoutStaffEnabled ? 'var(--text-primary)' : 'var(--surface-4)',
            }}
            title={scoutStaffEnabled ? 'Disable Scout Staff' : 'Enable Scout Staff'}
          >
            <span
              className="inline-block rounded-full transition-transform"
              style={{
                width: 20,
                height: 20,
                background: 'var(--surface-1)',
                transform: scoutStaffEnabled ? 'translateX(23px)' : 'translateX(3px)',
              }}
            />
          </button>
        </div>
      </section>
      )}

      {/* Hide Dynasty Blueprint — CFB 27+ only (Blueprint doesn't exist on CFB
          26). Presentational; never deletes the recorded data. Removed for PC
          (Sync from Save) dynasties — Blueprint is always relevant there, so
          there's nothing to hide; isDynastyBlueprintEnabled ignores a stale
          hideDynastyBlueprint left over from before this removal. */}
      {editionHasFeature(currentDynasty, 'dynastyPoints') && !isPcAutoDynasty(currentDynasty) && (
      <section className="rounded-xl border border-surface-4 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        <div className="px-4 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-txt-primary">Hide Dynasty Blueprint</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={blueprintHidden}
            onClick={toggleBlueprint}
            disabled={isViewOnly || savingBlueprint}
            className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
            style={{
              width: 46,
              height: 26,
              backgroundColor: blueprintHidden ? 'var(--text-primary)' : 'var(--surface-4)',
            }}
            title={blueprintHidden ? 'Show Dynasty Blueprint' : 'Hide Dynasty Blueprint'}
          >
            <span
              className="inline-block rounded-full transition-transform"
              style={{
                width: 20,
                height: 20,
                background: 'var(--surface-1)',
                transform: blueprintHidden ? 'translateX(23px)' : 'translateX(3px)',
              }}
            />
          </button>
        </div>
      </section>
      )}

      {/* Hide all ratings — CFB 27+ only (that's where full attribute tracking
          exists). Overalls, recruit scouting, and everything else stay.
          Removed for PC (Sync from Save) dynasties — ratings are always
          synced there, so there's nothing to hide; arePlayerAttributesEnabled/
          areRatingsHiddenForDisplay ignore a stale hideAllRatings left over
          from before this removal. */}
      {editionHasFeature(currentDynasty, 'attributes') && !isPcAutoDynasty(currentDynasty) && (
      <section className="rounded-xl border border-surface-4 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        <div className="px-4 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-txt-primary">Hide all ratings</div>
            <p className="text-xs text-txt-tertiary mt-1 leading-relaxed m-0">
              Track Overall only for players — skips the full attribute set in Training Results / Recruit Overalls and hides the player Attributes tab. Recruit scouting is unaffected. Nothing entered is deleted.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ratingsHidden}
            onClick={toggleRatings}
            disabled={isViewOnly || savingRatings}
            className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
            style={{
              width: 46,
              height: 26,
              backgroundColor: ratingsHidden ? 'var(--text-primary)' : 'var(--surface-4)',
            }}
            title={ratingsHidden ? 'Show ratings' : 'Hide all ratings'}
          >
            <span
              className="inline-block rounded-full transition-transform"
              style={{
                width: 20,
                height: 20,
                background: 'var(--surface-1)',
                transform: ratingsHidden ? 'translateX(23px)' : 'translateX(3px)',
              }}
            />
          </button>
        </div>
      </section>
      )}

      {/* Use Weekly Install / Scouting Report — PC (Sync from Save) dynasties
          only; these rows don't exist for manual-entry dynasties. Default ON.
          Label reads "Use" (not "Hide") since the toggle's ON state already
          means "shown, in use" — the old "Hide ..." label read backwards
          against its own ON/OFF position. */}
      {isPcAutoDynasty(currentDynasty) && (
      <section className="rounded-xl border border-surface-4 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        <div className="px-4 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-txt-primary">Use Weekly Install / Scouting Report</div>
            <p className="text-xs text-txt-tertiary mt-1 leading-relaxed m-0">
              Removes the Weekly Install and Scouting Report rows from the Dashboard to-do list for each week's game.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!weeklyInstallScoutingHidden}
            onClick={toggleWeeklyInstallScouting}
            disabled={isViewOnly || savingWeeklyInstallScouting}
            className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
            style={{
              width: 46,
              height: 26,
              backgroundColor: !weeklyInstallScoutingHidden ? 'var(--text-primary)' : 'var(--surface-4)',
            }}
            title={weeklyInstallScoutingHidden ? 'Enable Weekly Install / Scouting Report' : 'Disable Weekly Install / Scouting Report'}
          >
            <span
              className="inline-block rounded-full transition-transform"
              style={{
                width: 20,
                height: 20,
                background: 'var(--surface-1)',
                transform: !weeklyInstallScoutingHidden ? 'translateX(23px)' : 'translateX(3px)',
              }}
            />
          </button>
        </div>
      </section>
      )}

      <section className="rounded-xl border border-surface-4 overflow-hidden" style={{ background: 'var(--surface-1)' }}>
        <div className="px-4 py-3 border-b border-surface-4 flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-bold text-txt-primary m-0">Social Media Universe</h2>
          </div>
          {/* flex-wrap + min-w-0 (not flex-shrink-0): with four buttons this
              row is wider than a phone screen — without wrapping the last
              button clips off the card edge. */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {!isViewOnly && (
              <button onClick={() => setCreating(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>+ New account</button>
            )}
            <button onClick={handleExport} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary">Export</button>
            {!isViewOnly && (
              <>
                <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary">Import</button>
                <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
                {/* Deleting an account only tombstones its id (socialDeletedIds)
                    — the character data itself is never removed. This clears
                    the tombstone list, instantly restoring every account
                    deleted from this page. */}
                {(currentDynasty?.socialDeletedIds?.length > 0) && (
                  <button
                    onClick={async () => {
                      const n = currentDynasty.socialDeletedIds.length
                      if (!window.confirm(`Restore ${n} deleted account${n === 1 ? '' : 's'}?\n\nEvery account removed from this page comes back. Nothing else changes.`)) return
                      try {
                        await updateDynasty(currentDynasty.id, { socialDeletedIds: [], socialUpdatedAt: Date.now() })
                        toast.success(`Restored ${n} account${n === 1 ? '' : 's'}.`)
                      } catch (err) {
                        console.error('[LeaguePreferences] restore deleted accounts failed:', err)
                        toast.error('Could not restore accounts — try again.')
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary"
                  >
                    Restore deleted ({currentDynasty.socialDeletedIds.length})
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Upgrade prompt — shown only when this dynasty is on an older universe */}
        {showUpgrade && !isViewOnly && (
          <div className="px-4 py-3 border-b border-surface-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)' }}>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-txt-primary">A newer social universe is available</div>
              <div className="text-xs text-txt-tertiary mt-0.5">Now with real media accounts, fleshed-out fictional accounts, and a unique AI profile-picture prompt for every fake account.</div>
            </div>
            <button
              onClick={handleUpgradeUniverse}
              disabled={upgrading}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0 disabled:opacity-50"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              {upgrading ? 'Upgrading…' : 'Upgrade'}
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-surface-4">
          <input className={`${inputCls} flex-1 min-w-[160px]`} placeholder="Search name, handle, role…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All kinds</option>
            <option value="national">National</option>
            <option value="team">Team</option>
            <option value="conference">Conference</option>
          </select>
          <select className={inputCls} value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            {teamOptions.map(t => <option key={t.tid} value={t.tid}>{t.name}</option>)}
          </select>
          <select className={inputCls} value={realFilter} onChange={(e) => setRealFilter(e.target.value)}>
            <option value="all">Real &amp; fictional</option>
            <option value="real">Real only</option>
            <option value="fake">Fictional only</option>
          </select>
          <select className={inputCls} value={pfpFilter} onChange={(e) => setPfpFilter(e.target.value)}>
            <option value="all">Any PFP</option>
            <option value="has">Has PFP</option>
            <option value="none">No PFP</option>
          </select>
        </div>

        {/* Selection / bulk bar */}
        {!isViewOnly && (
          <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-surface-4 text-xs">
            <button onClick={selectAllFiltered} className="px-2 py-1 rounded border border-surface-4 text-txt-secondary hover:text-txt-primary">Select all {filtered.length}</button>
            {selected.size > 0 && <button onClick={clearSelection} className="px-2 py-1 rounded border border-surface-4 text-txt-secondary hover:text-txt-primary">Clear</button>}
            <span className="text-txt-tertiary">{selected.size} selected</span>
            {selected.size > 0 && (
              <button onClick={deleteSelected} className="px-2 py-1 rounded border border-red-500/60 text-red-400 hover:bg-red-500/10 ml-auto">Delete {selected.size}</button>
            )}
          </div>
        )}

        {selected.size > 0 && !isViewOnly && (
          <div className="px-4 py-3 border-b border-surface-4 bg-surface-2/40 space-y-2">
            <div className="text-xs font-semibold text-txt-secondary">Mass edit {selected.size} accounts — only set fields are applied</div>
            <div className="flex flex-wrap items-center gap-2">
              <select className={inputCls} value={bulkVerified} onChange={(e) => setBulkVerified(e.target.value)}>
                <option value="">Verified: no change</option>
                <option value="yes">Set verified</option>
                <option value="no">Set not verified</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-txt-secondary">
                <input type="checkbox" checked={bulkColorOn} onChange={(e) => setBulkColorOn(e.target.checked)} className="w-4 h-4" style={{ accentColor: 'var(--text-primary)' }} />
                Color
                <input type="color" value={bulkColor} onChange={(e) => setBulkColor(e.target.value)} disabled={!bulkColorOn} className="w-8 h-7 rounded bg-transparent border border-surface-4" />
              </label>
              <input className={`${inputCls} w-40`} placeholder="Set category…" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} />
            </div>
            <input className={`${inputCls} w-full`} placeholder="Append to personality (e.g. 'Always uses ALL CAPS.')" value={bulkPersonality} onChange={(e) => setBulkPersonality(e.target.value)} />
            <button onClick={applyBulk} disabled={applying} className="px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>
              {applying ? 'Applying…' : `Apply to ${selected.size}`}
            </button>
          </div>
        )}

        {/* List */}
        <div>
          {pageItems.length === 0 ? (
            <div className="px-4 py-10 text-center text-txt-tertiary text-sm">{ready ? 'No accounts match.' : 'Loading…'}</div>
          ) : pageItems.map(c => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b border-surface-4">
              {!isViewOnly && (
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 flex-shrink-0" style={{ accentColor: 'var(--text-primary)' }} />
              )}
              <Link to={`${pathPrefix}/social/${encodeURIComponent(c.id)}`} className="flex items-center gap-3 min-w-0 flex-1 group">
                <Avatar c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-txt-primary truncate group-hover:underline">{c.displayName}</span>
                    {c.verified && <span className="text-[10px]" style={{ color: '#1d9bf0' }}>✓</span>}
                    {c.customized && <span className="text-[9px] px-1 rounded flex-shrink-0" style={{ background: 'var(--surface-3)', color: 'var(--text-tertiary)' }}>edited</span>}
                  </div>
                  <div className="text-xs text-txt-tertiary truncate">{c.handle} · {c.category || c.role || c.kind}</div>
                </div>
              </Link>
              {/* Actions — wrap to their own full-width line on mobile, stay
                  inline on sm+. Prevents the buttons overlapping the name. */}
              <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0 w-full sm:w-auto">
                {c.xUrl && (
                  <a href={c.xUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="px-3 py-1 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary flex-shrink-0">X</a>
                )}
                {/* Dev-only tooling: Paste PFP / Copy PFP Prompt are local
                    authoring helpers. import.meta.env.DEV is true under `npm run
                    dev` and false in the production `vite build`, so users on the
                    deployed site never see these. */}
                {import.meta.env.DEV && !isViewOnly && (
                  <button
                    onClick={() => pasteImageInto(c, 'avatar')}
                    disabled={!!pasting}
                    title="Paste profile photo from clipboard and upload"
                    className="px-3 py-1 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary flex-shrink-0 disabled:opacity-50"
                  >
                    {pasting === `${c.id}:avatar` ? 'Uploading…' : 'Paste PFP'}
                  </button>
                )}
                {import.meta.env.DEV && (
                  <button
                    onClick={() => copyPfpPrompt(c)}
                    title={c.avatarPrompt ? "Copy this account's AI PFP-generation prompt" : 'Copy a generated PFP prompt based on account details'}
                    className="px-3 py-1 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary flex-shrink-0"
                  >
                    Copy PFP Prompt
                  </button>
                )}
                {!isViewOnly && (
                  <button onClick={() => setEditingId(c.id)} className="px-3 py-1 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary flex-shrink-0">Edit</button>
                )}
                {!isViewOnly && (
                  <button onClick={() => deleteOne(c)} title="Delete this account" className="px-3 py-1 rounded-lg text-xs font-semibold border border-red-500/50 text-red-400 hover:bg-red-500/10 flex-shrink-0">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (() => {
          const goToPage = (val) => {
            const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10)
            if (!Number.isFinite(n)) return
            setPage(Math.min(totalPages - 1, Math.max(0, n - 1)))
          }
          return (
            <div className="px-4 py-3 flex items-center justify-between gap-3 text-sm flex-wrap">
              <span className="text-txt-tertiary text-xs flex items-center gap-1.5">
                {filtered.length.toLocaleString()} results · page
                {/* key={page} remounts the input with a fresh value when the
                    page changes via Prev/Next, so it always reflects reality. */}
                <input
                  key={page}
                  type="text"
                  inputMode="numeric"
                  defaultValue={page + 1}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goToPage(e.target.value); e.target.blur() } }}
                  onBlur={(e) => goToPage(e.target.value)}
                  aria-label="Go to page"
                  title="Type a page number and press Enter"
                  className="w-12 px-1.5 py-0.5 rounded border border-surface-4 bg-surface-2 text-txt-primary text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-surface-5"
                />
                of {totalPages.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded border border-surface-4 text-txt-secondary disabled:opacity-40">Prev</button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded border border-surface-4 text-txt-secondary disabled:opacity-40">Next</button>
              </div>
            </div>
          )
        })()}
      </section>

      {editingChar && (
        <SocialCharacterEditModal isOpen={!!editingChar} onClose={() => setEditingId(null)} character={editingChar} />
      )}
      {creating && (
        <SocialCharacterEditModal isOpen={creating} onClose={() => setCreating(false)} character={{}} />
      )}
    </div>
  )
}
