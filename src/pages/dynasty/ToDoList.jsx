import { useState } from 'react'
import { useDynasty } from '../../context/DynastyContext'
import { Card, SectionHeader, EmptyState } from '../../components/ui'

// A single rolling list, not a fresh list per week — an item you don't check
// off just keeps showing up on the Active list every week automatically
// (nothing "transfers" it forward; it simply isn't filtered out until it's
// done). Checking one off stamps it with the dynasty's CURRENT year/week and
// files it into the Completed section grouped by that week, building a
// running history of what got done when.
function newItem(text, dynasty) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    done: false,
    createdYear: dynasty?.currentYear ?? null,
    createdWeek: dynasty?.currentWeek ?? null,
    completedYear: null,
    completedWeek: null,
  }
}

function weekLabel(year, week) {
  if (year == null || week == null) return 'Unknown week'
  return `${year} Week ${week}`
}

export default function ToDoList() {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const [text, setText] = useState('')

  const items = currentDynasty?.todoItems || []
  const active = items
    .filter(i => !i.done)
    .sort((a, b) => (a.createdYear - b.createdYear) || (a.createdWeek - b.createdWeek))

  // Completed items grouped by the week they were actually checked off,
  // most recently completed week first.
  const completedGroups = (() => {
    const byWeek = new Map()
    for (const i of items) {
      if (!i.done) continue
      const key = `${i.completedYear}-${i.completedWeek}`
      if (!byWeek.has(key)) byWeek.set(key, { year: i.completedYear, week: i.completedWeek, items: [] })
      byWeek.get(key).items.push(i)
    }
    return Array.from(byWeek.values()).sort((a, b) => (b.year - a.year) || (b.week - a.week))
  })()

  const save = (next) => updateDynasty(currentDynasty.id, { todoItems: next })

  const handleAdd = (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isViewOnly) return
    save([...items, newItem(trimmed, currentDynasty)])
    setText('')
  }

  const toggleDone = (id) => {
    if (isViewOnly) return
    save(items.map(i => {
      if (i.id !== id) return i
      if (i.done) return { ...i, done: false, completedYear: null, completedWeek: null }
      return { ...i, done: true, completedYear: currentDynasty?.currentYear ?? null, completedWeek: currentDynasty?.currentWeek ?? null }
    }))
  }

  const removeItem = (id) => {
    if (isViewOnly) return
    save(items.filter(i => i.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <SectionHeader
        title="To-Do List"
        subtitle="Anything you don't check off stays on the list until it's done."
      />

      {!isViewOnly && (
        <Card variant="bordered">
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add something to do…"
              className="flex-1 min-w-0 bg-surface-3 border border-surface-4 rounded-md px-3 py-2 text-sm text-txt-primary placeholder-txt-tertiary focus:outline-none focus:border-surface-5"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="flex-shrink-0 px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
            >
              Add
            </button>
          </form>
        </Card>
      )}

      <Card variant="bordered" padding="none">
        <div className="px-4 py-3 border-b border-surface-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-txt-tertiary">
            Active {active.length > 0 && `(${active.length})`}
          </h3>
        </div>
        {active.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState title="Nothing on your list" message="Add something above to get started." />
          </div>
        ) : (
          <div>
            {active.map((item, idx) => (
              <div
                key={item.id}
                className="px-4 py-3 flex items-center gap-3"
                style={idx > 0 ? { borderTop: '1px solid var(--surface-4)' } : undefined}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleDone(item.id)}
                  disabled={isViewOnly}
                  className="flex-shrink-0 w-4 h-4"
                />
                <span className="flex-1 min-w-0 text-sm text-txt-primary break-words">{item.text}</span>
                <span className="flex-shrink-0 text-xs text-txt-tertiary">{weekLabel(item.createdYear, item.createdWeek)}</span>
                {!isViewOnly && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="flex-shrink-0 text-xs font-semibold text-txt-tertiary hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {completedGroups.length > 0 && (
        <Card variant="bordered" padding="none">
          <div className="px-4 py-3 border-b border-surface-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-txt-tertiary">Completed</h3>
          </div>
          {completedGroups.map((group, gIdx) => (
            <div key={`${group.year}-${group.week}`} style={gIdx > 0 ? { borderTop: '1px solid var(--surface-4)' } : undefined}>
              <div className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-txt-tertiary">
                {weekLabel(group.year, group.week)} ({group.items.length})
              </div>
              {group.items.map((item) => (
                <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => toggleDone(item.id)}
                    disabled={isViewOnly}
                    className="flex-shrink-0 w-4 h-4"
                  />
                  <span className="flex-1 min-w-0 text-sm text-txt-tertiary line-through break-words">{item.text}</span>
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="flex-shrink-0 text-xs font-semibold text-txt-tertiary hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
