import { useState, useEffect, useMemo, useCallback, startTransition } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import PasteEntrySteps from './ui/PasteEntrySteps'
import { buildWeekRecapPrompt, buildPreseasonRecapPrompt } from '../utils/recapPrompts'
import { socialGameTagMap } from '../utils/socialPrompt'
import { extractRecapBlock } from '../utils/recapText'
import {
  extractSocialBlock, parseSocialLines, resolveSocialPosts, buildHandleIndex,
  getEffectiveCharacters, ensureUniverseLoaded, DEFAULT_SOCIAL_SETTINGS,
} from '../data/socialModel'

/**
 * Single-screen modal for generating and saving a Week Recap. The user copies
 * a fully-data-bundled prompt, pastes it into their AI of choice, then pastes
 * the AI's narrative back here and saves.
 *
 * Recaps live at `dynasty.weekRecapsByYear[year][week] = { generatedAt, text }`.
 * Week 0 stores the preseason recap and uses the preseason prompt variant.
 *
 * Props:
 *   isOpen, onClose
 *   year   — number; the season being recapped
 *   week   — number; the week being recapped (use -1 for preseason preview)
 *   onSaved — optional callback fired with the saved text after a successful save
 */
export default function WeekRecapModal({ isOpen, onClose, year, week, onSaved }) {
  const { currentDynasty, saveWeekRecap, deleteWeekRecap, isViewOnly, loadSocial, saveSocialPosts, updateSocialSettings } = useDynasty()
  const { toast } = useToast()
  const yearNum = Number(year)
  const weekNum = Number(week)
  const isPreseason = weekNum === -1
  // Social is baked into the recap for regular-season weeks (two-in-one).
  const isRegularWeek = weekNum >= 0 && weekNum <= 15

  const existingRecap = currentDynasty?.weekRecapsByYear?.[yearNum]?.[weekNum]
  const [draft, setDraft] = useState(existingRecap?.text || '')
  const [saving, setSaving] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [includeSocial, setIncludeSocial] = useState(currentDynasty?.socialSettings?.enabled !== false)

  const socialSettings = useMemo(
    () => ({ ...DEFAULT_SOCIAL_SETTINGS, ...(currentDynasty?.socialSettings || {}) }),
    [currentDynasty?.socialSettings],
  )

  // Local string state so the user can backspace / type freely without the
  // value snapping back while the field is mid-edit. We commit on blur.
  const [perGameStr, setPerGameStr] = useState(String(socialSettings.postsPerGame ?? 1))
  const [nationalStr, setNationalStr] = useState(String(socialSettings.nationalCount ?? 50))

  // Keep local strings in sync when the stored setting changes from outside
  // (e.g. initial dynasty load while the modal is already open).
  useEffect(() => { setPerGameStr(String(socialSettings.postsPerGame ?? 1)) }, [socialSettings.postsPerGame])
  useEffect(() => { setNationalStr(String(socialSettings.nationalCount ?? 50)) }, [socialSettings.nationalCount])

  const setSocialSetting = (key, value) => {
    if (isViewOnly || !currentDynasty?.id) return
    // startTransition defers the Firestore write + the expensive prompt
    // useMemo rebuild so they don't block the UI while the user is typing.
    startTransition(() => {
      updateSocialSettings(currentDynasty.id, { [key]: value }).catch(() => {})
    })
  }

  // Compute the "current rank snapshot" for the saved-week's poll —
  // the slice of rankByWeek[weekNum] across all teams. We compare
  // this against the snapshot stored on the saved recap to flag
  // drift. If they diverge, the recap text references rank values
  // that no longer match the dynasty's current state.
  const currentRankSnapshot = useMemo(() => {
    if (!currentDynasty || !Number.isFinite(yearNum) || !Number.isFinite(weekNum)) return null
    const snap = {}
    const teams = currentDynasty.teams || {}
    for (const [tidKey, team] of Object.entries(teams)) {
      const rbw = team?.byYear?.[yearNum]?.rankByWeek
        ?? team?.byYear?.[String(yearNum)]?.rankByWeek
      if (!rbw) continue
      const v = rbw[weekNum] ?? rbw[String(weekNum)]
      if (typeof v !== 'number' || v < 1 || v > 25) continue
      snap[tidKey] = v
    }
    return snap
  }, [currentDynasty, yearNum, weekNum])

  const recapDrift = useMemo(() => {
    if (!existingRecap?.rankSnapshot || !currentRankSnapshot) return null
    const stored = existingRecap.rankSnapshot
    const changed = []
    const allKeys = new Set([...Object.keys(stored), ...Object.keys(currentRankSnapshot)])
    for (const k of allKeys) {
      if (stored[k] !== currentRankSnapshot[k]) changed.push(k)
    }
    if (changed.length === 0) return null
    return { count: changed.length }
  }, [existingRecap, currentRankSnapshot])

  // Re-pull the existing recap whenever the modal re-opens or the (year, week)
  // changes — keeps the textarea in sync with persisted state and supports
  // re-editing without reloading the page.
  useEffect(() => {
    if (!isOpen) return
    setDraft(existingRecap?.text || '')
    setShowManual(false)
  }, [isOpen, yearNum, weekNum, existingRecap?.text])

  // Load the social universe + this dynasty's characters when the modal opens
  // so the baked-in roster and the on-save parser resolve real @handles.
  useEffect(() => {
    if (!isOpen || !isRegularWeek || !currentDynasty?.id) return
    loadSocial(currentDynasty.id).catch(() => {})
    // loadSocial is intentionally omitted: it's rebuilt on every provider
    // render (the context value object is a fresh literal each time), so
    // depending on it re-ran this effect every render. For a local/free-tier
    // dynasty loadSocial always setStates, which re-rendered → new loadSocial
    // → effect re-ran → infinite loop that froze the whole recap modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isRegularWeek, currentDynasty?.id])

  // Built lazily — only when the user clicks "Copy prompt" (PasteEntrySteps
  // calls this getter). buildWeekRecapPrompt scans every team + every game, so
  // computing it eagerly on each render pegged the CPU (currentDynasty is a
  // fresh reference every render, defeating memoization). PasteEntrySteps
  // treats a function as "always copyable", which is what we want whenever a
  // dynasty is loaded.
  const buildPrompt = useCallback(() => {
    if (!currentDynasty) return ''
    // Strip saved recap text so the AI always generates fresh. weekRecapsByYear
    // holds previously generated recaps — including them would bias the output.
    // eslint-disable-next-line no-unused-vars
    const { weekRecapsByYear: _stripped, ...dynastyForPrompt } = currentDynasty
    return isPreseason
      ? buildPreseasonRecapPrompt(dynastyForPrompt, yearNum)
      : buildWeekRecapPrompt(dynastyForPrompt, yearNum, weekNum, { includeSocial })
  }, [currentDynasty, yearNum, weekNum, isPreseason, includeSocial])

  const weekLabel = weekNum === 16 ? 'Conference Championship Week'
    : weekNum === 17 ? 'Bowl Week 1'
    : weekNum === 18 ? 'Bowl Week 2'
    : weekNum === 19 ? 'Bowl Week 3 / CFP Semifinals'
    : weekNum === 20 ? 'National Championship'
    : `Week ${weekNum}`

  const heading = isPreseason
    ? `${yearNum} Preseason Recap`
    : `${yearNum} ${weekLabel} Recap`

  // Shared save: take the AI's full output (from the Paste button's clipboard
  // read or the manual textarea), split off any cfb-social block, save the
  // prose recap here and the posts to the Social tab.
  const saveOutput = async (text) => {
    if (isViewOnly) {
      toast.error('Read-only mode, cannot save.')
      return
    }
    const trimmed = (text || '').trim()
    if (!trimmed) {
      toast.error('Nothing to save — copy the AI output first.')
      return
    }
    if (!currentDynasty) return
    setSaving(true)
    try {
      // Two-in-one: if the pasted response carries a cfb-social block, strip it
      // out of the saved recap text and parse the posts. The recap stores the
      // prose-only text; the posts go to the social feed.
      const { found: hasSocial, body: socialBody, recapWithoutBlock } = extractSocialBlock(trimmed)
      // Pull the recap out of its ```markdown fence and drop anything outside it
      // (e.g. a leading heads-up note the AI added), so the saved recap is clean.
      const recapText = extractRecapBlock(hasSocial ? recapWithoutBlock : trimmed)

      // Merge into the existing year/week map. Build the full nested object so
      // local-storage and Firestore both get a clean replace at the parent.
      // Single-doc subcollection write — bypasses the 1 MB main-doc cap
      // that was breaking saves on long-running dynasties.
      await saveWeekRecap(currentDynasty.id, yearNum, weekNum, {
        generatedAt: Date.now(),
        text: recapText,
        // Snapshot of rankByWeek[weekNum] at save time. We compare
        // this against the live snapshot when the recap is re-opened
        // — if any team's rank has changed since save, we surface a
        // "stale" badge so the user knows the text references old
        // numbers. Cheap to store (one int per ranked team).
        rankSnapshot: currentRankSnapshot || {},
      })

      // Parse + save the social posts (if any). Failure here never blocks the
      // recap save — the recap is already persisted above.
      let socialAdded = 0
      if (hasSocial && isRegularWeek) {
        try {
          await ensureUniverseLoaded()
          const lines = parseSocialLines(socialBody)
          if (lines.length) {
            const charactersById = getEffectiveCharacters(currentDynasty)
            const { posts, newCharacters } = resolveSocialPosts({
              lines, year: yearNum, week: weekNum,
              gameTagMap: socialGameTagMap(currentDynasty, yearNum, weekNum),
              handleIndex: buildHandleIndex(charactersById),
              charactersById, teamsById: currentDynasty.teams || {},
              now: () => Date.now(),
            })
            if (posts.length) {
              await saveSocialPosts(currentDynasty.id, yearNum, weekNum, posts, newCharacters)
              socialAdded = posts.length
            }
          }
        } catch (e) {
          console.warn('[WeekRecapModal] social parse failed:', e)
        }
      }

      toast.success(socialAdded > 0 ? `Recap saved. Added ${socialAdded} social posts.` : 'Recap saved.')
      onSaved?.(recapText)
      onClose?.()
    } catch (err) {
      console.error('[WeekRecapModal] save failed:', err)
      // Surface the real failure (Firestore code + message) instead of a
      // generic "try again" toast — ALABAMA PRINCE was hitting this with
      // no diagnostic info, and the fix depends on which Firestore error
      // it actually is (permission-denied, resource-exhausted for >1MB
      // doc, unauthenticated for an expired token, etc.).
      const code = err?.code || err?.name
      const msg = err?.message || 'Unknown error'
      const detail = code ? `${code}: ${msg}` : msg
      toast.error(`Could not save: ${detail}`)
    } finally {
      setSaving(false)
    }
  }

  // Paste (step 3): drop the AI's reply into the VISIBLE draft box so the user
  // can see it landed, then Save. Reading the clipboard can be blocked (mobile
  // Safari especially) — on failure we open the box so they can paste by hand.
  const handlePasteFill = async () => {
    if (isViewOnly) { toast.error('Read-only mode, cannot save.'); return }
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      setShowManual(true)
      toast.error('Clipboard blocked — paste into the box below, then Save.')
      return
    }
    if (!text.trim()) {
      setShowManual(true)
      toast.error('Clipboard is empty — copy the AI\'s full reply first.')
      return
    }
    setDraft(text)
    setShowManual(true)
    toast.success('Pasted — review below and hit Save recap.')
  }

  const handleDelete = async () => {
    if (isViewOnly || !currentDynasty || !existingRecap) return
    if (!window.confirm('Delete this saved recap? You can regenerate it any time.')) return
    setSaving(true)
    try {
      await deleteWeekRecap(currentDynasty.id, yearNum, weekNum)
      toast.success('Recap deleted.')
      setDraft('')
      onClose?.()
    } catch (err) {
      console.error('[WeekRecapModal] delete failed:', err)
      const code = err?.code || err?.name
      const msg = err?.message || 'Unknown error'
      const detail = code ? `${code}: ${msg}` : msg
      toast.error(`Could not delete: ${detail}`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        className="card-elevated w-full sm:w-[min(880px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col min-w-0">
            <span className="label-xs text-txt-tertiary">Week Recap</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight truncate">{heading}</h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors -mr-1 p-1.5 rounded-md hover:bg-surface-2 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable. Stacks: prompt block, paste-back, preview. */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          <section>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-sm font-semibold text-txt-primary">AI Prompt</label>
              {isRegularWeek && (
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-txt-secondary">
                  <input
                    type="checkbox"
                    checked={includeSocial}
                    onChange={(e) => setIncludeSocial(e.target.checked)}
                    className="w-4 h-4"
                    style={{ accentColor: 'var(--text-primary)' }}
                  />
                  Include social posts
                </label>
              )}
            </div>
            <p className="text-xs text-txt-tertiary">
              Copy the prompt, run it in your AI, then copy the <strong className="text-txt-secondary">entire</strong> output and hit Paste &amp; save.{isRegularWeek && includeSocial ? ' The app splits it automatically — the recap saves here, and the social posts go to the Social tab.' : ''}
            </p>
            {isRegularWeek && includeSocial && (
              <div className="mt-3 rounded-md border border-surface-4 bg-surface-2/50 px-3 py-2.5">
                <span className="text-xs font-semibold text-txt-secondary">Social posts to generate</span>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-txt-tertiary">Per game</span>
                    <input
                      type="number" min={1} max={20} inputMode="numeric"
                      value={perGameStr}
                      disabled={isViewOnly}
                      onChange={(e) => setPerGameStr(e.target.value)}
                      onBlur={() => {
                        const v = Math.max(1, Math.min(20, parseInt(perGameStr) || 1))
                        setPerGameStr(String(v))
                        setSocialSetting('postsPerGame', v)
                      }}
                      className="w-full rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-surface-5"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-txt-tertiary">National (per week)</span>
                    <input
                      type="number" min={0} max={100} inputMode="numeric"
                      value={nationalStr}
                      disabled={isViewOnly}
                      onChange={(e) => setNationalStr(e.target.value)}
                      onBlur={() => {
                        const v = Math.max(0, Math.min(100, parseInt(nationalStr) || 0))
                        setNationalStr(String(v))
                        setSocialSetting('nationalCount', v)
                      }}
                      className="w-full rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-surface-5"
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            {/* Unified 3-step flow: Copy Prompt → Open your AI → Paste it back.
                Same system the data-entry modals use, tuned for recaps (no
                screenshot; the prompt already carries this week's context). */}
            <PasteEntrySteps
              aiPrompt={currentDynasty ? buildPrompt : ''}
              onPaste={handlePasteFill}
              showText={showManual}
              onToggleText={() => setShowManual(v => !v)}
              disabled={saving || isViewOnly}
              copyEmoji={null}
              labels={{ copy: 'Copy prompt', copyButton: 'Copy prompt', paste: 'Paste it back' }}
              hints={{
                screenshot: 'Tap Copy prompt — it already includes this week\'s scores, rankings, and context. No screenshot needed.',
                ai: 'Open your AI, paste the prompt, and it writes the recap.',
                paste: 'Copy the AI\'s ENTIRE reply, then tap Paste — it drops into the box below to review before you Save. Tap the arrow to type/paste by hand if the button is blocked.',
              }}
            />

            <div className="text-xs text-txt-tertiary text-center">
              {existingRecap?.generatedAt ? `Last saved ${new Date(existingRecap.generatedAt).toLocaleString()}` : 'Not saved yet'}
            </div>

            {recapDrift && (
              <div
                className="rounded-md px-3 py-2 text-xs flex items-start gap-2"
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.10)',
                  border: '1px solid rgba(251, 191, 36, 0.30)',
                  color: '#fcd34d',
                }}
              >
                <span className="font-bold flex-shrink-0">Stale:</span>
                <span>
                  Rankings have changed for {recapDrift.count}{' '}
                  team{recapDrift.count === 1 ? '' : 's'} since this recap was generated.
                  Regenerate to refresh the rank numbers.
                </span>
              </div>
            )}

            {showManual && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full h-44 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm font-sans p-3 resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
                  placeholder="Paste the AI's full output here, then Save. Markdown is supported."
                />
                <p className="text-xs text-txt-tertiary">
                  Markdown renders when you save.{isRegularWeek && includeSocial ? ' Any cfb-social block in the paste is split out to the Social tab automatically.' : ''}
                </p>
                <button
                  onClick={() => saveOutput(draft)}
                  disabled={saving || !draft.trim() || isViewOnly}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                >
                  {saving ? 'Saving…' : 'Save recap'}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-surface-4 px-5 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div>
            {existingRecap && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-xs text-txt-tertiary hover:text-red-400 transition-colors disabled:opacity-50"
              >
                Delete saved recap
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
