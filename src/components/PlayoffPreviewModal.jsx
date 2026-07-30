import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { buildPlayoffPreviewPrompt, PLAYOFF_PREVIEW_DEPTH_OPTIONS } from '../utils/playoffPreviewPrompt'
import FormattedRecap from './FormattedRecap'
import RecapSettingsModal from './RecapSettingsModal'
import {
  extractSocialBlock, parseSocialLines, resolveSocialPosts,
  getEffectiveCharacters, ensureUniverseLoaded,
} from '../data/socialModel'

// Fixed week tag for playoff-preview social posts — the preview itself is a
// once-per-year artifact that lives on the Conference Championship week's
// page (16), the same week its own tab/content lives on in WeeklyScores.jsx —
// NOT Bowl Week 1, since that week's own recap/social hasn't started yet at
// the point this preview gets generated. There's no played game to tag posts
// to; resolveSocialPosts treats any non-game tag as national, which is all
// this prompt ever asks for.
const PLAYOFF_PREVIEW_SOCIAL_WEEK = 16

/**
 * Single-screen modal for generating and saving the CFP Playoff Preview —
 * same copy-prompt/paste-back shell as WeekRecapModal, but built from the
 * locked 12-team bracket (dynasty.cfpSeedsByYear[year]) instead of a played
 * week's games. Saved at dynasty.playoffPreviewByYear[year] = { generatedAt, text }.
 *
 * Props: isOpen, onClose, year, onSaved
 */
export default function PlayoffPreviewModal({ isOpen, onClose, year, onSaved }) {
  const { currentDynasty, savePlayoffPreview, deletePlayoffPreview, isViewOnly, loadSocial, saveSocialPosts } = useDynasty()
  const { toast } = useToast()
  const yearNum = Number(year)
  const promptTextareaRef = useRef(null)

  const existingPreview = currentDynasty?.playoffPreviewByYear?.[yearNum]
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [depth, setDepth] = useState('standard')
  const [includeSocial, setIncludeSocial] = useState(currentDynasty?.socialSettings?.enabled !== false)
  const [socialCount, setSocialCount] = useState(8)

  useEffect(() => {
    if (!isOpen) return
    setDraft('')
    setCopied(false)
    setShowManual(false)
    setRegenerating(false)
  }, [isOpen, yearNum])

  // Load the social universe so the prompt can list real @handles when
  // "Generate social posts" is on, and so the paste-back parser resolves them.
  useEffect(() => {
    if (!isOpen || !currentDynasty?.id) return
    loadSocial(currentDynasty.id).catch(() => {})
  }, [isOpen, currentDynasty?.id, loadSocial])

  const charactersById = useMemo(() => getEffectiveCharacters(currentDynasty), [currentDynasty])

  const prompt = useMemo(
    () => buildPlayoffPreviewPrompt(currentDynasty, yearNum, { depth, includeSocial, socialCount, charactersById }),
    [currentDynasty, yearNum, depth, includeSocial, socialCount, charactersById]
  )

  const handleCopyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt || '')
      } else if (promptTextareaRef.current) {
        promptTextareaRef.current.select()
        document.execCommand('copy')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
      toast.error('Could not copy. Select the text and copy manually.')
    }
  }

  const saveOutput = async (text) => {
    if (isViewOnly) { toast.error('Read-only mode, cannot save.'); return }
    const trimmed = (text || '').trim()
    if (!trimmed) { toast.error('Nothing to save — copy the AI output first.'); return }
    if (!currentDynasty) return
    setSaving(true)
    try {
      const { found: hasSocial, body: socialBody, recapWithoutBlock } = extractSocialBlock(trimmed)
      const previewText = hasSocial ? recapWithoutBlock : trimmed

      await savePlayoffPreview(currentDynasty.id, yearNum, previewText)

      let socialAdded = 0
      if (hasSocial && includeSocial) {
        try {
          await ensureUniverseLoaded()
          const lines = parseSocialLines(socialBody)
          if (lines.length) {
            const { posts, newCharacters } = resolveSocialPosts({
              lines, year: yearNum, week: PLAYOFF_PREVIEW_SOCIAL_WEEK,
              gameTagMap: {},
              handleIndex: Object.fromEntries(Object.values(charactersById).map(c => [c.handle.toLowerCase(), c.id])),
              charactersById, teamsById: currentDynasty.teams || {},
              now: () => Date.now(),
            })
            if (posts.length) {
              await saveSocialPosts(currentDynasty.id, yearNum, PLAYOFF_PREVIEW_SOCIAL_WEEK, posts, newCharacters)
              socialAdded = posts.length
            }
          }
        } catch (e) {
          console.warn('[PlayoffPreviewModal] social parse failed:', e)
        }
      }

      toast.success(socialAdded > 0 ? `Playoff preview saved. Added ${socialAdded} social posts.` : 'Playoff preview saved.')
      onSaved?.(previewText)
      onClose?.()
    } catch (err) {
      console.error('[PlayoffPreviewModal] save failed:', err)
      const code = err?.code || err?.name
      const msg = err?.message || 'Unknown error'
      toast.error(`Could not save: ${code ? `${code}: ${msg}` : msg}`)
    } finally {
      setSaving(false)
    }
  }

  const handlePasteSave = async () => {
    if (isViewOnly) { toast.error('Read-only mode, cannot save.'); return }
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      toast.error('Clipboard access blocked — use "Paste manually" below.')
      setShowManual(true)
      return
    }
    await saveOutput(text)
  }

  const handleDelete = async () => {
    if (isViewOnly || !currentDynasty || !existingPreview) return
    if (!window.confirm('Delete this saved playoff preview? You can regenerate it any time.')) return
    setSaving(true)
    try {
      await deletePlayoffPreview(currentDynasty.id, yearNum)
      toast.success('Playoff preview deleted.')
      onClose?.()
    } catch (err) {
      console.error('[PlayoffPreviewModal] delete failed:', err)
      const code = err?.code || err?.name
      const msg = err?.message || 'Unknown error'
      toast.error(`Could not delete: ${code ? `${code}: ${msg}` : msg}`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const showGenerateFlow = regenerating || !existingPreview?.text

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
            <span className="label-xs text-txt-tertiary">Playoff Preview</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight truncate">{yearNum} College Football Playoff</h2>
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
          {!prompt && (
            <div className="rounded-md border border-surface-4 bg-surface-2/50 px-3 py-2.5 text-sm text-txt-secondary">
              The 12-team CFP bracket isn't locked in yet — sync your save (or enter CFP seeds) once the field is set, then come back here.
            </div>
          )}

          {!showGenerateFlow && existingPreview?.text ? (
            <section className="space-y-3">
              <FormattedRecap text={existingPreview.text} />
              <p className="text-xs text-txt-tertiary">
                Saved {existingPreview.generatedAt ? new Date(existingPreview.generatedAt).toLocaleString() : ''}
              </p>
            </section>
          ) : prompt ? (
            <>
              <section>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <label className="text-sm font-semibold text-txt-primary">AI Prompt</label>
                </div>
                <p className="text-xs text-txt-tertiary">
                  Copy the prompt, run it in your AI, then copy the <strong className="text-txt-secondary">entire</strong> output and hit Paste &amp; save.{includeSocial ? ' The app splits it automatically — the preview saves here, and the social posts go to the Social tab.' : ''}
                </p>

                <textarea ref={promptTextareaRef} readOnly value={prompt} aria-hidden="true" tabIndex={-1}
                  style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
              </section>

              <section className="space-y-3">
                <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    title="Preview length and social posts"
                    className="px-3 rounded-lg border border-surface-4 text-txt-secondary hover:text-txt-primary hover:bg-surface-2 transition-colors flex items-center justify-center"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleCopyPrompt}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                  >
                    {copied ? 'Copied!' : 'Copy prompt'}
                  </button>
                  <button
                    onClick={handlePasteSave}
                    disabled={saving || isViewOnly}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-surface-4 text-txt-primary hover:border-surface-5 hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving…' : 'Paste & save'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs text-txt-tertiary">
                  <span>{existingPreview?.generatedAt ? `Last saved ${new Date(existingPreview.generatedAt).toLocaleString()}` : 'Not saved yet'}</span>
                  <button onClick={() => setShowManual(v => !v)} className="underline hover:text-txt-secondary">
                    {showManual ? 'Hide manual paste' : 'Paste manually'}
                  </button>
                </div>

                {showManual && (
                  <div className="space-y-2 pt-1">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-full h-44 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm font-sans p-3 resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
                      placeholder="Paste the AI's full output here, then Save. Markdown is supported."
                    />
                    <button
                      onClick={() => saveOutput(draft)}
                      disabled={saving || !draft.trim() || isViewOnly}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                    >
                      {saving ? 'Saving…' : 'Save preview'}
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>

        <div className="border-t border-surface-4 px-5 sm:px-6 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            {existingPreview?.text && !showGenerateFlow && (
              <button
                onClick={() => setRegenerating(true)}
                className="text-xs text-txt-tertiary hover:text-txt-primary transition-colors"
              >
                Regenerate
              </button>
            )}
            {existingPreview && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-xs text-txt-tertiary hover:text-red-400 transition-colors disabled:opacity-50"
              >
                Delete saved preview
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

      <RecapSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        depthOptions={PLAYOFF_PREVIEW_DEPTH_OPTIONS}
        depth={depth}
        onDepthChange={setDepth}
        socialEnabled={includeSocial}
        onSocialEnabledChange={setIncludeSocial}
        socialCount={socialCount}
        onSocialCountChange={setSocialCount}
        socialLabel="posts about the playoff bracket, in the same response"
      />
    </div>,
    document.body,
  )
}
