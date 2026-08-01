import { useState } from 'react'
import { createPortal } from 'react-dom'
import ImageUpload from './ImageUpload'
import { getContrastTextColor } from '../utils/colorUtils'
import { proxyImageUrl } from '../utils/imageProxy'

// Per-recruit commitment graphic (Hayes-Fawcett-style). Shows the uploaded
// graphic if there is one, lets the user upload/replace it, and offers a
// ready-made AI prompt + a link to ChatGPT to generate one.
const CHATGPT_URL = 'https://chatgpt.com/images/'

const OpenAILogo = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.1419.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
)

function buildGraphicPrompt({ name, position, stars, school }) {
  const s = Number(stars) || 0
  const starText = s > 0 ? `${s}-star ` : ''
  const pos = position || 'ATH'
  return `Create a college football recruiting commitment announcement graphic for ${name}, a ${starText}${pos} who has committed to ${school}.

Make it look like the polished commitment graphics Hayes Fawcett posts on X/Twitter: bold, clean, modern sports-media style. Prominently feature:
- the player's full name: ${name}
- their star rating${s > 0 ? ` (${s} stars)` : ''}
- their position: ${pos}
- the school they committed to: ${school}

Use ${school}'s team colors, leave a clean space to drop in the player's photo, and make it high-resolution and shareable.`
}

export default function CommitGraphicModal({
  isOpen,
  onClose,
  recruit,
  headshot,
  schoolName,
  graphicUrl,
  onSave,
  canEdit = true,
  accent = '#1f2937',
}) {
  const [copied, setCopied] = useState(false)
  if (!isOpen || !recruit) return null

  const accentText = getContrastTextColor(accent)
  const prompt = buildGraphicPrompt({
    name: recruit.name || 'the player',
    position: recruit.position,
    stars: recruit.stars,
    school: schoolName || 'the school',
  })

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = prompt
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* noop */ }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="card-elevated w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-surface-4">
          <div className="flex items-center gap-3 min-w-0">
            {headshot ? (
              <img
                src={proxyImageUrl(headshot, 120)}
                alt={recruit.name || 'Recruit'}
                className="w-11 h-11 rounded-md object-cover flex-shrink-0"
                style={{ border: `2px solid ${accent}` }}
              />
            ) : (
              <div
                className="w-11 h-11 rounded-md flex-shrink-0 flex items-center justify-center font-display font-black text-sm"
                style={{ backgroundColor: accent, color: accentText }}
              >
                {(recruit.position || 'ATH').slice(0, 3)}
              </div>
            )}
            <div className="min-w-0">
              <div className="display-md text-txt-primary truncate">{recruit.name || 'Recruit'}</div>
              <div className="label-xs text-txt-tertiary tracking-widest" style={{ letterSpacing: '1.5px' }}>
                Commit Graphic
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1.5 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Generate row — copy the prompt, then open ChatGPT to make the image. */}
          {canEdit && (
            <div className="rounded-lg border border-surface-4 bg-surface-2/50 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="h-9 px-3 rounded-md text-sm font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                >
                  {copied ? 'Copied!' : 'Copy Prompt'}
                </button>
                <a
                  href={CHATGPT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open ChatGPT image generator"
                  title="Open ChatGPT image generator"
                  className="h-9 w-11 inline-flex items-center justify-center rounded-md border border-surface-5 text-txt-primary hover:bg-surface-3 transition-colors"
                >
                  <OpenAILogo className="w-5 h-5" />
                </a>
              </div>
            </div>
          )}

          {/* The graphic itself */}
          {canEdit ? (
            <div>
              <span className="label-sm text-txt-secondary mb-2 block">Graphic</span>
              <ImageUpload
                value={graphicUrl || ''}
                onChange={(url) => onSave(url || '')}
                teamColors={{ primary: accent, secondary: accentText }}
              />
            </div>
          ) : graphicUrl ? (
            <img src={graphicUrl} alt={`${recruit.name} commit graphic`} className="w-full rounded-lg" />
          ) : (
            <p className="text-sm text-txt-tertiary text-center py-6">No commit graphic yet.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-surface-4 bg-surface-2 flex items-center justify-between gap-3">
          {canEdit && graphicUrl ? (
            <button
              type="button"
              onClick={() => onSave('')}
              className="text-sm font-semibold text-txt-tertiary hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold transition-colors press"
            style={{ backgroundColor: accent, color: accentText }}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
