import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { buildWeekRecapPrompt, buildPreseasonRecapPrompt } from '../utils/recapPrompts'

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
 *   week   — number; the week being recapped (use 0 for preseason)
 *   onSaved — optional callback fired with the saved text after a successful save
 */
export default function WeekRecapModal({ isOpen, onClose, year, week, onSaved }) {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const yearNum = Number(year)
  const weekNum = Number(week)
  const isPreseason = weekNum === 0
  const promptTextareaRef = useRef(null)

  const existingRecap = currentDynasty?.weekRecapsByYear?.[yearNum]?.[weekNum]
  const [draft, setDraft] = useState(existingRecap?.text || '')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Re-pull the existing recap whenever the modal re-opens or the (year, week)
  // changes — keeps the textarea in sync with persisted state and supports
  // re-editing without reloading the page.
  useEffect(() => {
    if (!isOpen) return
    setDraft(existingRecap?.text || '')
    setCopied(false)
  }, [isOpen, yearNum, weekNum, existingRecap?.text])

  const prompt = useMemo(() => {
    if (!currentDynasty) return ''
    return isPreseason
      ? buildPreseasonRecapPrompt(currentDynasty, yearNum)
      : buildWeekRecapPrompt(currentDynasty, yearNum, weekNum)
  }, [currentDynasty, yearNum, weekNum, isPreseason])

  const heading = isPreseason
    ? `${yearNum} Preseason Recap`
    : `${yearNum} Week ${weekNum} Recap`

  const handleCopyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prompt)
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

  const handleSave = async () => {
    if (isViewOnly) {
      toast.error('Read-only mode — cannot save.')
      return
    }
    const trimmed = draft.trim()
    if (!trimmed) {
      toast.error('Paste the recap first, then save.')
      return
    }
    if (!currentDynasty) return
    setSaving(true)
    try {
      // Merge into the existing year/week map. Build the full nested object so
      // local-storage and Firestore both get a clean replace at the parent.
      const cur = currentDynasty.weekRecapsByYear || {}
      const yr = { ...(cur[yearNum] || {}) }
      yr[weekNum] = { generatedAt: Date.now(), text: trimmed }
      const next = { ...cur, [yearNum]: yr }
      await updateDynasty(currentDynasty.id, { weekRecapsByYear: next })
      toast.success('Recap saved.')
      onSaved?.(trimmed)
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

  const handleDelete = async () => {
    if (isViewOnly || !currentDynasty || !existingRecap) return
    if (!window.confirm('Delete this saved recap? You can regenerate it any time.')) return
    setSaving(true)
    try {
      const cur = currentDynasty.weekRecapsByYear || {}
      const yr = { ...(cur[yearNum] || {}) }
      delete yr[weekNum]
      const next = { ...cur, [yearNum]: yr }
      await updateDynasty(currentDynasty.id, { weekRecapsByYear: next })
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
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[10000] py-8 px-4 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        className="card-elevated w-full sm:w-[min(880px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[88vh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: 'var(--surface-5)' }} aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-surface-4">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary truncate">{heading}</h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors flex-shrink-0 ml-3"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable. Stacks: prompt block, paste-back, preview. */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-txt-primary">AI Prompt</label>
              <button
                onClick={handleCopyPrompt}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
              >
                {copied ? 'Copied!' : 'Copy prompt'}
              </button>
            </div>
            <textarea
              ref={promptTextareaRef}
              readOnly
              value={prompt}
              className="w-full h-48 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-xs font-mono p-3 resize-none focus:outline-none focus:ring-2 focus:ring-surface-5"
            />
            <p className="text-xs text-txt-tertiary mt-1">
              Bundles every season fact we have. The guardrail tells the AI to skip anything it doesn't see in the data.
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-txt-primary">Paste the AI's recap</label>
              {existingRecap?.generatedAt && (
                <span className="text-xs text-txt-tertiary">
                  Last saved {new Date(existingRecap.generatedAt).toLocaleString()}
                </span>
              )}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full h-56 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm font-sans p-3 resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
              placeholder="Paste the recap text here. Markdown is supported."
            />
            <p className="text-xs text-txt-tertiary mt-1">
              Markdown (headings, bold, italic) renders when you save.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-surface-4 px-5 sm:px-6 py-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
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
          <div className="flex gap-2 items-stretch sm:items-center sm:justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary hover:border-surface-5 transition-colors bg-transparent"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !draft.trim() || isViewOnly}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              {saving ? 'Saving…' : 'Save recap'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
