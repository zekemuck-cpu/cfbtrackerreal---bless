import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, pointerWithin, closestCenter, useDroppable,
} from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DEPTH_CHART_CATALOG, resolveDepthLayout, defaultLayoutForSide } from '../utils/outlookBoard'

const SIDES = [
  { key: 'offense', label: 'Offense' },
  { key: 'defense', label: 'Defense' },
  { key: 'st', label: 'Special Teams' },
]

const labelFor = (side, id) => (DEPTH_CHART_CATALOG[side] || []).find(s => s.id === id)?.label || id

// Same container resolver the depth chart uses: a key is a container id, else
// find the container whose item list holds the id.
const findIn = (map, id) => (id in map ? id : Object.keys(map).find(c => map[c].includes(id)))

const isContainerId = (id) => id === 'available' || (typeof id === 'string' && /^r\d+$/.test(id))

// Pointer-driven collisions so the tile tracks the cursor exactly and any
// area under it (including the far-down Available tray) registers. Tiles are
// preferred over their wrapping container so reordering lands precisely.
function collisionDetection(args) {
  const hits = pointerWithin(args)
  const resolved = hits.length ? hits : closestCenter(args)
  return [...resolved].sort((a, b) => (isContainerId(a.id) ? 1 : 0) - (isContainerId(b.id) ? 1 : 0))
}

// Build the container map + render order for a side: one container per row
// (stable minted ids), a trailing empty row that acts as the "add row" target,
// and an `available` tray of columns not on the chart (catalog order).
function buildContainers(side, rows, mintRowId) {
  const containers = {}
  const order = []
  for (const r of rows) { const id = mintRowId(); containers[id] = [...r]; order.push(id) }
  const emptyId = mintRowId(); containers[emptyId] = []; order.push(emptyId)
  const placed = new Set(rows.flat())
  containers.available = (DEPTH_CHART_CATALOG[side] || []).map(s => s.id).filter(id => !placed.has(id))
  order.push('available')
  return { containers, order }
}

// After a drag: drop empty rows, keep exactly one trailing empty "add row",
// and keep the available tray last. Row ids are preserved so React/DnD identity
// stays stable across the gesture.
function normalize({ containers, order }, mintRowId) {
  const rowKeys = order.filter(k => k !== 'available')
  const newContainers = {}
  const newOrder = []
  for (const k of rowKeys) {
    if (containers[k] && containers[k].length) { newContainers[k] = containers[k]; newOrder.push(k) }
  }
  const emptyId = mintRowId()
  newContainers[emptyId] = []
  newOrder.push(emptyId)
  newContainers.available = containers.available || []
  newOrder.push('available')
  return { containers: newContainers, order: newOrder }
}

/**
 * DepthChartPositionsModal — per-dynasty drag editor for the depth-chart
 * layout, using the same dnd-kit model as the depth chart itself (container map
 * + live onDragOver moves + onDragEnd reorder). Drag position tiles between
 * rows / into the trailing "add row" / into the Available tray to hide them.
 * Saving writes { offense, defense, st } row layouts to the dynasty.
 */
export default function DepthChartPositionsModal({ layoutMap, positionsMap, onSave, onClose }) {
  const rowSeq = useRef(0)
  const mintRowId = () => 'r' + (rowSeq.current++)

  const [bySide, setBySide] = useState(() => {
    const out = {}
    for (const { key } of SIDES) {
      out[key] = buildContainers(key, resolveDepthLayout(key, layoutMap, positionsMap), mintRowId)
    }
    return out
  })
  const [side, setSide] = useState('offense')
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const { containers, order } = bySide[side]
  const rowKeys = order.filter(k => k !== 'available')

  const resetSide = () => setBySide(prev => ({
    ...prev, [side]: buildContainers(side, defaultLayoutForSide(side), mintRowId),
  }))

  const onDragStart = ({ active }) => setActiveId(active.id)
  const onDragCancel = () => setActiveId(null)

  const onDragOver = ({ active, over }) => {
    if (!over) return
    setBySide(prev => {
      const cur = prev[side]
      const cs = cur.containers
      const a = findIn(cs, active.id)
      const o = findIn(cs, over.id)
      if (!a || !o || a === o) return prev
      const overIsContainer = over.id in cs
      const oItems = cs[o]
      const overIndex = overIsContainer ? oItems.length : oItems.indexOf(over.id)
      const insertAt = overIndex < 0 ? oItems.length : overIndex
      const next = {
        ...cs,
        [a]: cs[a].filter(id => id !== active.id),
        [o]: [...oItems.slice(0, insertAt), active.id, ...oItems.slice(insertAt)],
      }
      return { ...prev, [side]: { ...cur, containers: next } }
    })
  }

  const onDragEnd = ({ active, over }) => {
    setActiveId(null)
    setBySide(prev => {
      const cur = prev[side]
      let cs = cur.containers
      const a = findIn(cs, active.id)
      if (!a) return prev
      if (over) {
        const o = findIn(cs, over.id)
        if (o && a === o) {
          const items = cs[a]
          const oldIndex = items.indexOf(active.id)
          const overIsContainer = over.id in cs
          const newIndex = overIsContainer ? items.length - 1 : items.indexOf(over.id)
          if (oldIndex !== newIndex && newIndex >= 0) cs = { ...cs, [a]: arrayMove(items, oldIndex, newIndex) }
        }
      }
      return { ...prev, [side]: normalize({ containers: cs, order: cur.order }, mintRowId) }
    })
  }

  const save = () => {
    const out = {}
    for (const { key } of SIDES) {
      const { containers: cs, order: ord } = bySide[key]
      out[key] = ord.filter(k => k !== 'available').map(k => cs[k]).filter(r => r.length)
    }
    onSave(out)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-xl overflow-hidden"
        style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)', boxShadow: '0 28px 80px rgba(0,0,0,0.7)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--surface-4)' }}
        >
          <h2 className="text-base font-bold text-txt-primary leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Depth Chart Positions
          </h2>
          <button
            type="button"
            onClick={resetSide}
            className="text-[11px] font-semibold text-txt-tertiary hover:text-txt-primary transition-colors"
          >
            Reset {SIDES.find(s => s.key === side)?.label} to default
          </button>
        </header>

        {/* Side tabs */}
        <div className="flex gap-1 px-5 pt-3 flex-shrink-0">
          {SIDES.map(sd => {
            const active = sd.key === side
            return (
              <button
                key={sd.key}
                type="button"
                onClick={() => setSide(sd.key)}
                className="text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
                style={{
                  backgroundColor: active ? 'var(--surface-3)' : 'transparent',
                  color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {sd.label}
              </button>
            )
          })}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-2">
            {rowKeys.map((rowId, idx) => {
              const items = containers[rowId]
              const isAddRow = idx === rowKeys.length - 1 && items.length === 0
              return (
                <DropArea
                  key={rowId}
                  id={rowId}
                  className={`rounded-lg px-2 py-2 ${isAddRow ? 'border border-dashed' : ''}`}
                  style={isAddRow
                    ? { borderColor: 'var(--surface-5)' }
                    : { backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}
                >
                  <SortableContext items={items} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap gap-1.5 items-center justify-center min-h-[2.25rem]">
                      {items.length
                        ? items.map(id => <Tile key={id} side={side} id={id} />)
                        : (
                          <span className="text-[11px] font-semibold text-txt-tertiary px-1 py-1.5 w-full text-center">
                            Drag a tile here to add a row
                          </span>
                        )}
                    </div>
                  </SortableContext>
                </DropArea>
              )
            })}

            <div className="pt-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-txt-tertiary mb-1.5">
                Available — drag here to hide
              </div>
              <DropArea
                id="available"
                className="rounded-lg px-2 py-2"
                style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--surface-4)' }}
              >
                <SortableContext items={containers.available} strategy={horizontalListSortingStrategy}>
                  <div className="flex flex-wrap gap-1.5 items-center min-h-[2.25rem]">
                    {containers.available.length
                      ? containers.available.map(id => <Tile key={id} side={side} id={id} />)
                      : <span className="text-xs text-txt-tertiary px-1">All positions are on the chart.</span>}
                  </div>
                </SortableContext>
              </DropArea>
            </div>
          </div>

          {createPortal(
            <DragOverlay dropAnimation={null}>
              {activeId ? <TileFace label={labelFor(side, activeId)} dragging /> : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>

        <footer
          className="flex items-center justify-end gap-2 px-5 py-3 flex-shrink-0"
          style={{ backgroundColor: 'var(--surface-2)', borderTop: '1px solid var(--surface-4)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 rounded border border-surface-5 text-txt-secondary hover:text-txt-primary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="text-xs font-bold px-4 py-1.5 rounded text-white transition-colors"
            style={{ backgroundColor: 'var(--accent-info)' }}
          >
            Save
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

// A droppable wrapper so empty rows / trays still register as drop targets.
// No per-hover outline — with pointer collisions isOver toggles constantly as
// you cross rows, which read as a flashing border. The sibling gap + the drag
// overlay already show where the tile will land.
function DropArea({ id, children, className = '', style }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={className} style={style}>
      {children}
    </div>
  )
}

// Static tile face — shared by the sortable tile and the drag overlay.
function TileFace({ label, dragging }) {
  return (
    <div
      className="px-2.5 py-1.5 rounded text-sm font-semibold whitespace-nowrap select-none"
      style={{
        backgroundColor: 'var(--surface-3)',
        color: 'var(--text-primary)',
        border: '1px solid var(--surface-5)',
        boxShadow: dragging ? '0 8px 24px rgba(0,0,0,0.5)' : 'none',
        cursor: dragging ? 'grabbing' : 'grab',
      }}
    >
      {label}
    </div>
  )
}

function Tile({ side, id }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  // touchAction:'none' lets the TouchSensor own the gesture once it activates,
  // matching the depth-chart tiles.
  // Hide the in-place tile while dragging so the only thing the eye follows is
  // the drag overlay (which tracks the cursor); the empty slot it leaves shows
  // where it sits.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    touchAction: 'none',
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TileFace label={labelFor(side, id)} />
    </div>
  )
}
