/**
 * CardZoneEditor — visual layout editor for trading-card templates.
 *
 * Renders the template PNG with each zone overlaid as a draggable + resizable
 * rectangle. The user clicks a zone to select it, drags the body to move,
 * and drags any of the eight handles (4 corners + 4 edge midpoints) to
 * resize. Coordinate updates are pixel→percentage so they survive any
 * preview size and feed straight back into the template registry.
 *
 * Save flow:
 *   1. User drags zones to taste.
 *   2. Click "Save layout" → writes per-template overrides to localStorage,
 *      fires `cardLayoutOverridesUpdated` so live previews re-read.
 *   3. Click "Copy registry code" → copies the new zones[] block as JSON
 *      so the user can paste it into cardTemplates.js for a permanent ship.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCardTemplate } from '../data/cardTemplates'
import {
  applyOverridesToTemplate,
  clearOverridesForTemplate,
  loadOverrides,
  saveOverrides,
} from '../utils/cardTemplateOverrides'

const round1 = (n) => Math.round(n * 10) / 10

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

// Returns the zone fields we want to persist as overrides — anything the
// user can edit through the visual editor. Other fields (slot, color,
// container, etc.) stay locked to the canonical template.
function pickOverrideFields(zone) {
  const out = {}
  if (typeof zone.x === 'number') out.x = round1(zone.x)
  if (typeof zone.y === 'number') out.y = round1(zone.y)
  if (typeof zone.w === 'number') out.w = round1(zone.w)
  if (typeof zone.h === 'number') out.h = round1(zone.h)
  if (typeof zone.rotate === 'number') out.rotate = zone.rotate
  return out
}

export default function CardZoneEditor({ templateId, isOpen, onClose }) {
  // Re-derive the working zones whenever the modal opens. The base
  // template + its current saved overrides become our starting point.
  const baseTemplate = useMemo(() => getCardTemplate(templateId), [templateId])
  const initialZones = useMemo(() => {
    if (!baseTemplate) return []
    const merged = applyOverridesToTemplate(baseTemplate)
    return merged.zones.map(z => ({ ...z }))
  }, [baseTemplate, isOpen])

  const [zones, setZones] = useState(initialZones)
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [copyMessage, setCopyMessage] = useState('')
  const wrapRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    setZones(initialZones)
    setSelectedIdx(null)
  }, [initialZones])

  if (!isOpen || !baseTemplate) return null

  const updateZone = (idx, patch) => {
    setZones(prev => prev.map((z, i) => i === idx ? { ...z, ...patch } : z))
  }

  // mode: 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  const onHandleDown = (e, idx, mode) => {
    e.preventDefault()
    e.stopPropagation()
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      mode,
      idx,
      startX: e.clientX,
      startY: e.clientY,
      width: rect.width,
      height: rect.height,
      original: { ...zones[idx] },
    }
    setSelectedIdx(idx)
  }

  const onHandleMove = (e) => {
    const s = dragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    const dxPct = ((e.clientX - s.startX) / s.width) * 100
    const dyPct = ((e.clientY - s.startY) / s.height) * 100
    const o = s.original
    let { x, y, w, h } = o

    switch (s.mode) {
      case 'move': {
        x = clamp(o.x + dxPct, 0, 100 - o.w)
        y = clamp(o.y + dyPct, 0, 100 - o.h)
        break
      }
      // Edges
      case 'n': {
        const newY = clamp(o.y + dyPct, 0, o.y + o.h - 1)
        h = o.y + o.h - newY
        y = newY
        break
      }
      case 's': {
        h = clamp(o.h + dyPct, 1, 100 - o.y)
        break
      }
      case 'w': {
        const newX = clamp(o.x + dxPct, 0, o.x + o.w - 1)
        w = o.x + o.w - newX
        x = newX
        break
      }
      case 'e': {
        w = clamp(o.w + dxPct, 1, 100 - o.x)
        break
      }
      // Corners (combine two edges)
      case 'nw': {
        const newX = clamp(o.x + dxPct, 0, o.x + o.w - 1)
        const newY = clamp(o.y + dyPct, 0, o.y + o.h - 1)
        w = o.x + o.w - newX
        h = o.y + o.h - newY
        x = newX
        y = newY
        break
      }
      case 'ne': {
        const newY = clamp(o.y + dyPct, 0, o.y + o.h - 1)
        h = o.y + o.h - newY
        y = newY
        w = clamp(o.w + dxPct, 1, 100 - o.x)
        break
      }
      case 'sw': {
        const newX = clamp(o.x + dxPct, 0, o.x + o.w - 1)
        w = o.x + o.w - newX
        x = newX
        h = clamp(o.h + dyPct, 1, 100 - o.y)
        break
      }
      case 'se': {
        w = clamp(o.w + dxPct, 1, 100 - o.x)
        h = clamp(o.h + dyPct, 1, 100 - o.y)
        break
      }
      default:
        break
    }
    updateZone(s.idx, {
      x: round1(x),
      y: round1(y),
      w: round1(w),
      h: round1(h),
    })
  }

  const onHandleUp = (e) => {
    const s = dragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }

  const handleSave = () => {
    const overrides = loadOverrides()
    overrides[templateId] = {
      zones: zones.map(pickOverrideFields),
    }
    saveOverrides(overrides)
    window.dispatchEvent(new CustomEvent('cardLayoutOverridesUpdated'))
    setCopyMessage('Saved.')
    setTimeout(() => setCopyMessage(''), 1200)
  }

  const handleResetDefaults = () => {
    clearOverridesForTemplate(templateId)
    window.dispatchEvent(new CustomEvent('cardLayoutOverridesUpdated'))
    const fresh = getCardTemplate(templateId)
    setZones(fresh ? fresh.zones.map(z => ({ ...z })) : [])
    setSelectedIdx(null)
    setCopyMessage('Reset to defaults.')
    setTimeout(() => setCopyMessage(''), 1200)
  }

  const handleCopyCode = () => {
    // Format the zones[] array as JS source code, ready to paste into the
    // template registry. We preserve every original zone field and patch
    // only the positional ones we own.
    const merged = zones.map((z, i) => ({ ...baseTemplate.zones[i], ...pickOverrideFields(z) }))
    const lines = []
    lines.push('zones: [')
    merged.forEach((z, i) => {
      const pairs = []
      const order = ['slot', 'x', 'y', 'w', 'h', 'rotate', 'objectFit', 'radius', 'textAlign', 'color', 'fontWeight', 'fontFamily', 'letterSpacing']
      order.forEach(k => {
        if (z[k] !== undefined) {
          const v = typeof z[k] === 'string' ? `'${z[k].replace(/'/g, "\\'")}'` : z[k]
          pairs.push(`${k}: ${v}`)
        }
      })
      // Container blob (kept as-is)
      if (z.container) {
        pairs.push(`container: ${JSON.stringify(z.container)}`)
      }
      lines.push(`  { ${pairs.join(', ')} },`)
    })
    lines.push(']')
    const code = lines.join('\n')
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code)
      setCopyMessage('Registry code copied — paste into cardTemplates.js.')
    } else {
      setCopyMessage('Clipboard unavailable.')
    }
    setTimeout(() => setCopyMessage(''), 2500)
  }

  // The modal portal target; render to document.body so the editor isn't
  // clipped by any ancestor's overflow:hidden.
  const portalTarget = typeof document !== 'undefined' ? document.body : null
  if (!portalTarget) return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="bg-surface-1 rounded-xl border border-surface-4 shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-surface-4 bg-surface-3">
          <div>
            <div className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px', fontSize: '10px' }}>
              EDIT LAYOUT
            </div>
            <h2 className="text-base font-bold text-txt-primary">{baseTemplate.label}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-surface-4 text-txt-secondary hover:text-txt-primary transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          <div className="p-5 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5">
            {/* Card with zone overlays */}
            <div className="flex justify-center">
              <div
                ref={wrapRef}
                className="relative select-none"
                style={{
                  width: 'min(420px, 70vw)',
                  aspectRatio: String(baseTemplate.aspectRatio || 5 / 7),
                  backgroundColor: 'var(--surface-2)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  touchAction: 'none',
                }}
              >
                {baseTemplate.imageUrl && (
                  <img
                    src={baseTemplate.imageUrl}
                    alt={baseTemplate.label}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />
                )}
                {zones.map((zone, idx) => (
                  <ZoneOverlay
                    key={idx}
                    zone={zone}
                    idx={idx}
                    selected={selectedIdx === idx}
                    onSelect={() => setSelectedIdx(idx)}
                    onHandleDown={onHandleDown}
                    onHandleMove={onHandleMove}
                    onHandleUp={onHandleUp}
                  />
                ))}
              </div>
            </div>

            {/* Side panel — zone list + numeric coordinate inputs */}
            <div className="min-w-0">
              <div className="label-xs text-txt-tertiary mb-2" style={{ letterSpacing: '1.5px', fontSize: '10px' }}>
                ZONES · {zones.length}
              </div>
              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                {zones.map((zone, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedIdx(idx)}
                    className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                      selectedIdx === idx ? 'ring-2 ring-blue-500' : ''
                    }`}
                    style={{
                      backgroundColor: selectedIdx === idx ? 'var(--surface-3)' : 'var(--surface-2)',
                      border: '1px solid var(--surface-4)',
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-bold text-txt-primary tabular-nums">
                        {idx + 1}. {zone.slot}
                      </span>
                      <span className="text-[10px] tabular-nums text-txt-tertiary">
                        {round1(zone.x)},{round1(zone.y)} · {round1(zone.w)}×{round1(zone.h)}
                      </span>
                    </div>
                    {selectedIdx === idx && (
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {(['x', 'y', 'w', 'h']).map(field => (
                          <label key={field} className="block">
                            <span className="text-[9px] text-txt-tertiary uppercase tracking-wider">{field}</span>
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              max={field === 'x' || field === 'w' ? 100 : 100}
                              value={zone[field]}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value)
                                if (Number.isFinite(val)) {
                                  updateZone(idx, { [field]: round1(val) })
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-1.5 py-1 rounded bg-surface-1 border border-surface-4 text-txt-primary text-xs tabular-nums focus:border-blue-500 focus:outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-txt-tertiary leading-relaxed">
                Drag a zone to move; drag a corner or edge handle to resize. Numeric inputs accept decimals (e.g. 12.5). Coordinates are percentages of the card's width / height.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-4 bg-surface-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-txt-secondary tabular-nums min-h-[1.25em]">
            {copyMessage}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-colors"
            >
              Reset to defaults
            </button>
            <button
              onClick={handleCopyCode}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-surface-3 border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-colors"
            >
              Copy registry code
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-md text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              Save layout
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  )
}

/**
 * Single zone overlay with 8 resize handles + body drag. Pointer-capture
 * keeps drags coherent even when the cursor leaves the zone bounds.
 */
function ZoneOverlay({ zone, idx, selected, onSelect, onHandleDown, onHandleMove, onHandleUp }) {
  const baseStyle = {
    position: 'absolute',
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    width: `${zone.w}%`,
    height: `${zone.h}%`,
    transform: zone.rotate ? `rotate(${zone.rotate}deg)` : undefined,
    transformOrigin: 'center center',
    border: selected ? '2px solid #3b82f6' : '1.5px dashed rgba(255,255,255,0.65)',
    backgroundColor: selected ? 'rgba(59, 130, 246, 0.18)' : 'rgba(0, 0, 0, 0.18)',
    cursor: 'move',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#ffffff',
    textShadow: '0 0 3px rgba(0,0,0,0.9)',
    userSelect: 'none',
    touchAction: 'none',
  }

  const labelStyle = {
    pointerEvents: 'none',
    padding: '1px 4px',
    backgroundColor: selected ? 'rgba(59, 130, 246, 0.85)' : 'rgba(0, 0, 0, 0.55)',
    borderRadius: 3,
    textTransform: 'uppercase',
    fontSize: '9px',
  }

  // Handle layout: 8 handles around the zone — 4 corners + 4 edge midpoints.
  // size in absolute pixels so handles stay grabbable on tiny zones.
  const handles = [
    { mode: 'nw', style: { top: -5, left: -5, cursor: 'nwse-resize' } },
    { mode: 'n', style: { top: -5, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } },
    { mode: 'ne', style: { top: -5, right: -5, cursor: 'nesw-resize' } },
    { mode: 'e', style: { top: '50%', right: -5, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
    { mode: 'se', style: { bottom: -5, right: -5, cursor: 'nwse-resize' } },
    { mode: 's', style: { bottom: -5, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' } },
    { mode: 'sw', style: { bottom: -5, left: -5, cursor: 'nesw-resize' } },
    { mode: 'w', style: { top: '50%', left: -5, transform: 'translateY(-50%)', cursor: 'ew-resize' } },
  ]

  return (
    <div
      style={baseStyle}
      onPointerDown={(e) => {
        onSelect()
        onHandleDown(e, idx, 'move')
      }}
      onPointerMove={onHandleMove}
      onPointerUp={onHandleUp}
      onPointerCancel={onHandleUp}
    >
      <span style={labelStyle}>{zone.slot}</span>
      {selected && handles.map(h => (
        <div
          key={h.mode}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSelect()
            onHandleDown(e, idx, h.mode)
          }}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          style={{
            position: 'absolute',
            width: 11,
            height: 11,
            backgroundColor: '#3b82f6',
            border: '1.5px solid #ffffff',
            borderRadius: 2,
            zIndex: 2,
            ...h.style,
          }}
        />
      ))}
    </div>
  )
}
