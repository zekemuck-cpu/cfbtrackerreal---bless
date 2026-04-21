import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const GRADE_POINTS = {
  'A+': 13, 'A': 12, 'A-': 11,
  'B+': 10, 'B': 9,  'B-': 8,
  'C+': 7,  'C': 6,  'C-': 5,
  'D+': 4,  'D': 3,  'D-': 2,
  'F': 1
}

const GRADE_ROWS = [
  { grades: ['A+', 'A', 'A-'] },
  { grades: ['B+', 'B', 'B-'] },
  { grades: ['C+', 'C', 'C-'] },
  { grades: ['D+', 'D', 'D-'] },
  { grades: [null, 'F', null] }
]

const GRADE_COLORS = {
  'A+': '#16a34a', 'A': '#16a34a', 'A-': '#22c55e',
  'B+': '#65a30d', 'B': '#84cc16', 'B-': '#a3b828',
  'C+': '#ca8a04', 'C': '#d97706', 'C-': '#c2541a',
  'D+': '#b84320', 'D': '#a0331a', 'D-': '#8f2a17',
  'F':  '#7a1f14'
}

const VERDICTS = {
  hardSell: { label: 'HARD SELL',      tone: 'good' },
  marginal: { label: 'HARD SELL',      tone: 'warn' },
  sendHouse:{ label: 'SEND THE HOUSE', tone: 'bad'  },
  empty:    { label: 'SELECT 3 GRADES',tone: 'none' }
}

const TONE_COLOR = {
  good: '#22c55e',
  warn: '#eab308',
  bad:  '#ef4444',
  none: '#52525b'
}

function getVerdict(selections) {
  if (selections.length < 3) return VERDICTS.empty
  const total = selections.reduce((sum, g) => sum + (GRADE_POINTS[g] || 0), 0)
  if (total >= 21) return VERDICTS.hardSell
  if (total >= 18) return VERDICTS.marginal
  return VERDICTS.sendHouse
}

export function SellVsSendButton({ onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Sell vs Send Calculator"
      aria-label="Open Sell vs Send Calculator"
      className={`inline-flex items-center justify-center h-8 sm:h-9 w-8 sm:w-9 rounded-md bg-surface-2 border border-surface-4 text-txt-secondary hover:bg-surface-3 hover:text-txt-primary transition-colors flex-shrink-0 ${className}`.trim()}
    >
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="2" strokeWidth="1.75" />
        <rect x="8" y="6" width="8" height="3" rx="0.5" strokeWidth="1.5" />
        <circle cx="9" cy="13" r="0.5" fill="currentColor" />
        <circle cx="12" cy="13" r="0.5" fill="currentColor" />
        <circle cx="15" cy="13" r="0.5" fill="currentColor" />
        <circle cx="9" cy="16.5" r="0.5" fill="currentColor" />
        <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
        <circle cx="15" cy="16.5" r="0.5" fill="currentColor" />
      </svg>
    </button>
  )
}

export default function SellVsSendCalculator({ isOpen, onClose }) {
  const [selections, setSelections] = useState([])

  const verdict = useMemo(() => getVerdict(selections), [selections])

  if (!isOpen) return null

  const addGrade = (g) => {
    if (selections.length >= 3) return
    setSelections([...selections, g])
  }

  const removeAt = (idx) => {
    setSelections(selections.filter((_, i) => i !== idx))
  }

  const clearAll = () => setSelections([])
  const undo = () => setSelections(selections.slice(0, -1))

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="relative bg-surface-1 border border-surface-4 rounded-lg w-full max-w-sm max-h-[95dvh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-surface-3 flex items-center justify-between gap-4 flex-shrink-0">
          <h2
            className="text-txt-primary leading-none"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem', letterSpacing: '1.5px' }}
          >
            SELL <span className="text-txt-tertiary">vs</span> SEND
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md text-txt-secondary hover:bg-surface-3 hover:text-txt-primary transition-colors flex items-center justify-center flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 min-h-0 overflow-hidden px-4 py-3 flex flex-col">
          <div className="flex items-center gap-2 flex-shrink-0" style={{ height: 'clamp(56px, 12dvh, 84px)' }}>
            {[0, 1, 2].map((idx) => {
              const g = selections[idx]
              const bg = g ? GRADE_COLORS[g] : null
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => g && removeAt(idx)}
                  disabled={!g}
                  className="flex-1 h-full rounded-md flex items-center justify-center"
                  style={g
                    ? { backgroundColor: bg, color: '#ffffff', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.5rem, 5vw, 2rem)', letterSpacing: '1px', lineHeight: 1 }
                    : { backgroundColor: 'transparent', border: '1px dashed var(--surface-4)', color: 'var(--text-muted, #52525b)', fontSize: '1.25rem' }}
                >
                  {g || '·'}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-4 my-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={undo}
              disabled={selections.length === 0}
              className="label-xs text-txt-secondary hover:text-txt-primary disabled:opacity-40 disabled:hover:text-txt-secondary transition-colors"
            >
              UNDO
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={selections.length === 0}
              className="label-xs text-txt-secondary hover:text-txt-primary disabled:opacity-40 disabled:hover:text-txt-secondary transition-colors"
            >
              CLEAR
            </button>
          </div>

          <div className="label-xs text-txt-tertiary mb-1.5 flex-shrink-0">GRADE</div>
          <div className="grid grid-rows-5 gap-1.5 flex-1 min-h-0">
            {GRADE_ROWS.map((row, ri) => (
              <div key={ri} className="grid grid-cols-3 gap-1.5 min-h-0">
                {row.grades.map((g, i) => {
                  if (!g) return <div key={i} aria-hidden="true" />
                  const disabled = selections.length >= 3
                  const bg = GRADE_COLORS[g]
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => addGrade(g)}
                      disabled={disabled}
                      className="w-full h-full rounded-md transition-opacity disabled:opacity-40"
                      style={{
                        backgroundColor: bg,
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#ffffff',
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 'clamp(1rem, 3.5vw, 1.35rem)',
                        letterSpacing: '1px',
                        minHeight: 0
                      }}
                    >
                      {g}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {selections.length === 3 && (
            <div
              className="verdict-pop absolute inset-0 flex flex-col items-center justify-center gap-4 cursor-pointer px-6"
              onClick={clearAll}
              role="button"
              aria-label="Tap to reset"
              style={{
                background: `radial-gradient(ellipse at center, color-mix(in srgb, ${TONE_COLOR[verdict.tone]} 25%, var(--surface-1)) 0%, var(--surface-1) 75%)`,
                backdropFilter: 'blur(2px)'
              }}
            >
              <div
                className="verdict-glow rounded-full"
                style={{
                  ['--verdict-glow-color']: `color-mix(in srgb, ${TONE_COLOR[verdict.tone]} 60%, transparent)`,
                  padding: '28px 44px',
                  backgroundColor: 'color-mix(in srgb, var(--surface-2) 80%, transparent)',
                  border: `2px solid ${TONE_COLOR[verdict.tone]}`
                }}
              >
                <div
                  className="leading-none text-center"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
                    letterSpacing: '3px',
                    color: TONE_COLOR[verdict.tone],
                    textShadow: `0 2px 30px color-mix(in srgb, ${TONE_COLOR[verdict.tone]} 40%, transparent)`
                  }}
                >
                  {verdict.label}
                </div>
              </div>
              <div
                className="label-xs text-txt-tertiary"
                style={{ letterSpacing: '2px' }}
              >
                TAP TO RESET
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
