import { createPortal } from 'react-dom'
import { GRAPHIC_STYLE_OPTIONS, GRAPHIC_EMPHASIS_OPTIONS } from '../utils/scoreGraphicPrompt'

/**
 * Graphic Settings — the score-graphic analog of RecapSettingsModal. Sliders
 * that adjust how the copied image prompt is written: overall Design style plus
 * Rankings and Records emphasis. Values are stored as option keys (per-user
 * localStorage in the caller) and fed into buildScoreGraphicPrompt.
 */
export default function GraphicSettingsModal({
  isOpen,
  onClose,
  designStyle,
  onDesignStyleChange,
  rankEmphasis,
  onRankEmphasisChange,
  recordEmphasis,
  onRecordEmphasisChange,
}) {
  if (!isOpen) return null

  const styleIdx = Math.max(0, GRAPHIC_STYLE_OPTIONS.findIndex(o => o.key === designStyle))
  const currentStyle = GRAPHIC_STYLE_OPTIONS[styleIdx] || GRAPHIC_STYLE_OPTIONS[2]
  const rankIdx = Math.max(0, GRAPHIC_EMPHASIS_OPTIONS.findIndex(o => o.key === rankEmphasis))
  const currentRank = GRAPHIC_EMPHASIS_OPTIONS[rankIdx] || GRAPHIC_EMPHASIS_OPTIONS[1]
  const recordIdx = Math.max(0, GRAPHIC_EMPHASIS_OPTIONS.findIndex(o => o.key === recordEmphasis))
  const currentRecord = GRAPHIC_EMPHASIS_OPTIONS[recordIdx] || GRAPHIC_EMPHASIS_OPTIONS[1]

  const sectionLabel = { fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-tertiary)' }

  const Slider = ({ label, options, idx, current, onPick }) => (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span style={sectionLabel}>{label}</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{current.label}</span>
      </div>
      <input type="range" min={0} max={options.length - 1} step={1} value={idx}
        onChange={(e) => onPick(options[Number(e.target.value)].key)} className="w-full" />
      <div className="flex justify-between mt-1" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
        <span>{options[0].label}</span>
        <span>{options[options.length - 1].label}</span>
      </div>
    </div>
  )

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center z-[10001] p-4"
      style={{ margin: 0, backgroundColor: 'rgba(0,0,0,0.65)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-5)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid var(--surface-4)' }}>
          <span className="font-bold" style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Graphic Settings</span>
          <button type="button" aria-label="Close" onClick={onClose} className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-surface-3" style={{ color: 'var(--text-tertiary)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Slider label="Design style" options={GRAPHIC_STYLE_OPTIONS} idx={styleIdx} current={currentStyle} onPick={onDesignStyleChange} />
          <Slider label="Rankings" options={GRAPHIC_EMPHASIS_OPTIONS} idx={rankIdx} current={currentRank} onPick={onRankEmphasisChange} />
          <Slider label="Records" options={GRAPHIC_EMPHASIS_OPTIONS} idx={recordIdx} current={currentRecord} onPick={onRecordEmphasisChange} />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            These tune the copied image prompt. Rankings/records only appear when a team is ranked or has a record.
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}
