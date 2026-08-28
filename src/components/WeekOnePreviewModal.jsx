import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { buildWeekPreviewPrompt } from '../utils/recapPrompts'
import FormattedRecap from './FormattedRecap'

const WEEK_ONE = 1

/**
 * Single-screen modal for generating and saving the Week 1 Preview — same
 * copy-prompt/paste-back shell as PlayoffPreviewModal, but built from Week
 * 1's national schedule instead of the CFP bracket. Shown on Week 0's
 * dashboard task list (both PC and manual dynasties). Saved at
 * dynasty.weekOnePreviewByYear[year] = { generatedAt, text }.
 *
 * Props: isOpen, onClose, year, onSaved
 */
export default function WeekOnePreviewModal({ isOpen, onClose, year, onSaved }) {
  const { currentDynasty, saveWeekOnePreview, deleteWeekOnePreview, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const yearNum = Number(year)
  const promptTextareaRef = useRef(null)

  const existingPreview = currentDynasty?.weekOnePreviewByYear?.[yearNum]
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setDraft('')
    setCopied(false)
    setShowManual(false)
    setRegenerating(false)
  }, [isOpen, yearNum])

  const prompt = useMemo(
    () => (currentDynasty ? buildWeekPreviewPrompt(currentDynasty, yearNum, WEEK_ONE) : ''),
    [currentDynasty, yearNum]
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
      await saveWeekOnePreview(currentDynasty.id, yearNum, trimmed)
      toast.success('Week 1 preview saved.')
      onSaved?.(trimmed)
      onClose?.()
    } catch (err) {
      console.error('[WeekOnePreviewModal] save failed:', err)
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
    if (!window.confirm('Delete this saved Week 1 preview? You can regenerate it any time.')) return
    setSaving(true)
    try {
      await deleteWeekOnePreview(currentDynasty.id, yearNum)
      toast.success('Week 1 preview deleted.')
      onClose?.()
    } catch (err) {
      console.error('[WeekOnePreviewModal] delete failed:', err)
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
            <span className="label-xs text-txt-tertiary">Week 1 Preview</span>
            <h2 className="text-xl sm:text-2xl font-bold text-txt-primary tracking-tight truncate">{yearNum} Season Opener</h2>
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
          {!showGenerateFlow && existingPreview?.text ? (
            <section className="space-y-3">
              <FormattedRecap text={existingPreview.text} />
              <p className="text-xs text-txt-tertiary">
                Saved {existingPreview.generatedAt ? new Date(existingPreview.generatedAt).toLocaleString() : ''}
              </p>
            </section>
          ) : (
            <>
              <section>
                <label className="text-sm font-semibold text-txt-primary">AI Prompt</label>
                <p className="text-xs text-txt-tertiary mt-1">
                  Copy the prompt, run it in your AI, then copy the <strong className="text-txt-secondary">entire</strong> output and hit Paste &amp; save.
                </p>

                <textarea ref={promptTextareaRef} readOnly value={prompt} aria-hidden="true" tabIndex={-1}
                  style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
              </section>

              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
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
          )}
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
    </div>,
    document.body,
  )
}
