import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { buildSocialPrompt } from '../utils/socialPrompt'
import {
  extractSocialBlock, parseSocialLines, resolveSocialPosts, buildHandleIndex, getEffectiveCharacters,
  DEFAULT_SOCIAL_SETTINGS,
} from '../data/socialModel'

/**
 * Generate Social Feed — copy/paste flow, decoupled from the Week Recap so the
 * recap stays light and this can run on a heavy model. The user tunes how many
 * posts to ask for, copies the prompt, then hits Paste to pull the AI's
 * `cfb-social` block straight off the clipboard. Multiple pastes merge/dedupe
 * for big 300+ weeks. No giant prompt/response text blocks on screen.
 */
export default function GenerateSocialModal({ isOpen, onClose, year, week }) {
  const { currentDynasty, loadSocial, saveSocialPosts, replaceSocialWeek, updateSocialSettings, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const yearNum = Number(year)
  const weekNum = week  // preserve string sentinels ('CCG', 'Bowl', 'NatChamp')
  const loadedFor = useRef(null)

  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addedThisSession, setAddedThisSession] = useState(0)
  const [showManual, setShowManual] = useState(false)
  const [draft, setDraft] = useState('')

  const settings = useMemo(
    () => ({ ...DEFAULT_SOCIAL_SETTINGS, ...(currentDynasty?.socialSettings || {}) }),
    [currentDynasty?.socialSettings],
  )

  // Lazy-load the social data (characters + feed) when the modal opens, so the
  // prompt roster and the parser's handle index are populated.
  useEffect(() => {
    if (!isOpen || !currentDynasty?.id) return
    const key = `${currentDynasty.id}:${yearNum}:${weekNum}`
    if (loadedFor.current === key) return
    loadedFor.current = key
    setDraft('')
    setShowManual(false)
    setAddedThisSession(0)
    loadSocial(currentDynasty.id).catch(() => {})
  }, [isOpen, currentDynasty?.id, yearNum, weekNum, loadSocial])

  const { prompt, gameTagMap, gameCount } = useMemo(() => {
    if (!currentDynasty) return { prompt: '', gameTagMap: {}, gameCount: 0 }
    return buildSocialPrompt(currentDynasty, yearNum, weekNum)
  }, [currentDynasty, yearNum, weekNum])

  const existingWeekCount = useMemo(() => {
    const wk = currentDynasty?.socialFeedByYear?.[yearNum]?.[weekNum]
    return Array.isArray(wk) ? wk.length : 0
  }, [currentDynasty?.socialFeedByYear, yearNum, weekNum])

  const setSetting = (key, value) => {
    if (isViewOnly || !currentDynasty?.id) return
    updateSocialSettings(currentDynasty.id, { [key]: value }).catch(() => {})
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Use "Paste manually" to work without clipboard access.')
      setShowManual(true)
    }
  }

  // Shared ingest: pull the cfb-social block out of arbitrary text and save.
  const ingest = async (text) => {
    if (isViewOnly) { toast.error('Read-only mode, cannot save.'); return }
    const trimmed = (text || '').trim()
    if (!trimmed) { toast.error('Nothing to read — copy the AI response first.'); return }
    const { found, body } = extractSocialBlock(trimmed, { allowBareLines: true })
    if (!found) { toast.error('No posts found. Paste the AI’s full response, or just the post lines (G1 | @handle | text).'); return }
    const lines = parseSocialLines(body)
    if (!lines.length) { toast.error('No valid post lines found. Each line should look like: G1 | @handle | text.'); return }

    setBusy(true)
    try {
      const charactersById = getEffectiveCharacters(currentDynasty)
      const handleIndex = buildHandleIndex(charactersById)
      const { posts, newCharacters } = resolveSocialPosts({
        lines, year: yearNum, week: weekNum, gameTagMap,
        handleIndex, charactersById, teamsById: currentDynasty.teams || {},
        now: () => Date.now(),
      })
      if (!posts.length) {
        toast.error('Could not resolve any posts (unknown handles / teams).')
        return
      }
      const total = await saveSocialPosts(currentDynasty.id, yearNum, weekNum, posts, newCharacters)
      setAddedThisSession(c => c + posts.length)
      setDraft('')
      toast.success(`Added ${posts.length} ${posts.length === 1 ? 'post' : 'posts'} (week total: ${total}).`)
    } catch (err) {
      console.error('[GenerateSocialModal] parse/save failed:', err)
      const detail = err?.code ? `${err.code}: ${err.message}` : (err?.message || 'Unknown error')
      toast.error(`Could not save: ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  const handlePasteButton = async () => {
    if (isViewOnly) { toast.error('Read-only mode, cannot save.'); return }
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      toast.error('Clipboard access blocked — use "Paste manually" below.')
      setShowManual(true)
      return
    }
    await ingest(text)
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        className="card-elevated w-full sm:w-[min(560px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-surface-4">
          <div className="flex flex-col min-w-0">
            <span className="label-xs text-txt-tertiary">Social Feed</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight truncate">
              Generate {yearNum} Week {weekNum} Social
            </h2>
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

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* How many posts to ask for */}
          <section>
            <label className="text-sm font-semibold text-txt-primary">How many posts</label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-txt-tertiary">Per game</span>
                <input
                  type="number" min={1} max={20} inputMode="numeric"
                  value={settings.postsPerGame}
                  disabled={isViewOnly}
                  onChange={(e) => setSetting('postsPerGame', Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-surface-5"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-txt-tertiary">National (per week)</span>
                <input
                  type="number" min={0} max={100} inputMode="numeric"
                  value={settings.nationalCount}
                  disabled={isViewOnly}
                  onChange={(e) => setSetting('nationalCount', Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-surface-5"
                />
              </label>
            </div>
            <p className="text-xs text-txt-tertiary mt-2">
              Covers {gameCount} {gameCount === 1 ? 'game' : 'games'} this week
              {' '}(~{gameCount * (Number(settings.postsPerGame) || 0) + (Number(settings.nationalCount) || 0)} posts).
              Big weeks need a strong model. Paste more than once if the reply gets cut off — duplicates are ignored.
            </p>
          </section>

          {/* Copy / Paste actions */}
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                {copied ? 'Copied!' : 'Copy prompt'}
              </button>
              <button
                onClick={handlePasteButton}
                disabled={busy || isViewOnly}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-surface-4 text-txt-primary hover:border-surface-5 hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Adding…' : 'Paste response'}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-txt-tertiary">
              <span>
                {existingWeekCount} saved this week{addedThisSession > 0 ? ` (+${addedThisSession} just now)` : ''}
              </span>
              <button
                onClick={() => setShowManual(v => !v)}
                className="underline hover:text-txt-secondary"
              >
                {showManual ? 'Hide manual paste' : 'Paste manually'}
              </button>
            </div>

            {showManual && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full h-40 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm font-mono p-3 resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
                  placeholder="Paste the AI's full response, or just the post lines (G1 | @handle | text). Then Add posts."
                />
                <button
                  onClick={() => ingest(draft)}
                  disabled={busy || !draft.trim() || isViewOnly}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                >
                  {busy ? 'Adding…' : 'Add posts'}
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-surface-4 px-5 sm:px-6 py-4 flex gap-2 items-center justify-between">
          {!isViewOnly && existingWeekCount > 0 ? (
            <button
              onClick={async () => {
                if (!window.confirm(`Delete all ${existingWeekCount} social posts this week? This cannot be undone.`)) return
                try { await replaceSocialWeek(currentDynasty.id, yearNum, weekNum, []) } catch (e) { console.error('clear social failed', e) }
              }}
              className="px-3 py-2 rounded-lg text-sm font-semibold border border-red-700/40 text-red-400 hover:bg-red-900/20"
            >
              Delete all
            </button>
          ) : <span />}
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
