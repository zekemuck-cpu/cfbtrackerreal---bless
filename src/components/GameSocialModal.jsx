import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty } from '../context/DynastyContext'
import { useToast } from './ui/Toast'
import { buildGameSocialPrompt, gameSocialTagMap } from '../utils/socialPrompt'
import {
  extractSocialBlock, parseSocialLines, resolveSocialPosts, buildHandleIndex,
  getEffectiveCharacters, ensureUniverseLoaded, mergePosts, postId,
} from '../data/socialModel'

/**
 * Per-game social manager. Copy the deep-dive prompt, paste the AI response
 * (clipboard, one click), then manage the resulting posts inline: edit the
 * text, change the poster, delete, or add one by hand.
 */

function initials(name) {
  const parts = String(name || '').replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ c, size = 30 }) {
  return (
    <div className="rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, background: c?.avatar ? 'transparent' : (c?.color || '#657786'), color: '#fff', fontWeight: 700, fontSize: 11 }}>
      {c?.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> : initials(c?.displayName)}
    </div>
  )
}

// Searchable character chooser for editing/adding a post's poster.
function CharacterPicker({ charactersById, value, onChange }) {
  const [q, setQ] = useState('')
  const cur = charactersById[value]
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return Object.values(charactersById)
      .filter(c => `${c.displayName} ${c.handle}`.toLowerCase().includes(s))
      .sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0))
      .slice(0, 12)
  }, [q, charactersById])
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {cur ? <><Avatar c={cur} size={22} /><span className="text-xs text-txt-secondary truncate">{cur.displayName} <span className="text-txt-tertiary">{cur.handle}</span></span></>
          : <span className="text-xs text-txt-tertiary">No poster selected</span>}
      </div>
      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Change poster — search name or @handle…"
        className="w-full rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-xs p-1.5 focus:outline-none focus:ring-2 focus:ring-surface-5"
      />
      {matches.length > 0 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-surface-4 bg-surface-1">
          {matches.map(c => (
            <button key={c.id} onClick={() => { onChange(c.id); setQ('') }} className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-3 text-left">
              <Avatar c={c} size={20} />
              <span className="text-xs text-txt-primary truncate">{c.displayName} <span className="text-txt-tertiary">{c.handle}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const editorBox = 'rounded-lg border border-surface-4 bg-surface-2/40 p-3 space-y-2'

export default function GameSocialModal({ isOpen, onClose, game }) {
  const { currentDynasty, loadSocial, replaceSocialWeek, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const loadedRef = useRef(false)

  const [count, setCount] = useState(() => { try { return Number(localStorage.getItem('gameSocialCount')) || 8 } catch { return 8 } })
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null)   // postId being edited | 'new' | null
  const [draftText, setDraftText] = useState('')
  const [draftChar, setDraftChar] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [showPasteArea, setShowPasteArea] = useState(false)
  const [pasteText, setPasteText] = useState('')

  useEffect(() => {
    if (!isOpen || !currentDynasty?.id || loadedRef.current) return
    loadedRef.current = true
    loadSocial(currentDynasty.id).catch(() => {})
  }, [isOpen, currentDynasty?.id, loadSocial])

  useEffect(() => { try { localStorage.setItem('gameSocialCount', String(count)) } catch { /* ignore */ } }, [count])

  const charactersById = useMemo(() => getEffectiveCharacters(currentDynasty), [currentDynasty])
  const yearN = Number(game?.year)
  const weekN = game?.week  // preserve string sentinels ('CCG', 'Bowl', 'NatChamp')

  const weekPosts = currentDynasty?.socialFeedByYear?.[yearN]?.[weekN] || []
  const gamePosts = useMemo(() => weekPosts.filter(p => p.gameId === game?.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)), [weekPosts, game?.id])
  const otherPosts = useMemo(() => weekPosts.filter(p => p.gameId !== game?.id), [weekPosts, game?.id])

  const persist = async (nextGamePosts) => {
    setBusy(true)
    try { await replaceSocialWeek(currentDynasty.id, yearN, weekN, [...otherPosts, ...nextGamePosts]) }
    catch (err) { toast.error(`Save failed: ${err?.message || 'error'}`) }
    finally { setBusy(false) }
  }

  const { prompt } = useMemo(() => {
    if (!currentDynasty || !game) return { prompt: '' }
    return buildGameSocialPrompt(currentDynasty, game, { count: Number(count) || 8 })
  }, [currentDynasty, game, count])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { toast.error('Could not copy.') }
  }

  const handleParseAndSave = async () => {
    if (isViewOnly) { toast.error('Read-only mode.'); return }
    const text = pasteText.trim()
    if (!text) { toast.error('Paste the AI response first.'); return }
    const { found, body } = extractSocialBlock(text, { allowBareLines: true })
    if (!found) { toast.error('No posts found. Paste the AI’s full response, or just the post lines (G1 | @handle | text).'); return }
    const lines = parseSocialLines(body)
    if (!lines.length) { toast.error('No valid post lines found. Each line should look like: G1 | @handle | text.'); return }
    setBusy(true)
    try {
      await ensureUniverseLoaded()
      const cmap = getEffectiveCharacters(currentDynasty)
      const { posts, newCharacters } = resolveSocialPosts({
        lines, year: yearN, week: weekN, gameTagMap: gameSocialTagMap(game),
        handleIndex: buildHandleIndex(cmap), charactersById: cmap, teamsById: currentDynasty.teams || {},
        now: () => Date.now(),
      })
      const attached = posts.map(p => ({ ...p, gameId: game.id }))
      if (!attached.length) { toast.error('No posts resolved (unknown handles / teams).'); return }
      const merged = mergePosts(gamePosts, attached)
      await replaceSocialWeek(currentDynasty.id, yearN, weekN, [...otherPosts, ...merged], newCharacters)
      toast.success(`Added ${attached.length} ${attached.length === 1 ? 'post' : 'posts'}.`)
      setPasteText('')
      setShowPasteArea(false)
    } catch (err) {
      console.error('[GameSocialModal] parse/save failed:', err)
      toast.error(`Could not save: ${err?.message || 'error'}`)
    } finally { setBusy(false) }
  }

  const startEdit = (p) => { setEditing(p.id); setDraftChar(p.charId); setDraftText(p.text) }
  const startNew = () => {
    setEditing('new'); setDraftText('')
    setDraftChar(gamePosts[0]?.charId || Object.keys(charactersById)[0] || '')
  }
  const cancelEdit = () => { setEditing(null); setDraftText(''); setDraftChar('') }

  const saveEdit = async () => {
    if (!draftChar || !draftText.trim()) { toast.error('Pick a poster and write some text.'); return }
    if (editing === 'new') {
      const trimmed = draftText.trim()
      const np = { id: postId(yearN, weekN, draftChar, game.id, trimmed), charId: draftChar, gameId: game.id, year: yearN, week: weekN, text: trimmed, createdAt: Date.now() }
      await persist([...gamePosts, np])
    } else {
      await persist(gamePosts.map(p => p.id === editing ? { ...p, charId: draftChar, text: draftText.trim() } : p))
    }
    cancelEdit()
  }

  const deletePost = async (id) => { await persist(gamePosts.filter(p => p.id !== id)) }

  const toggleSel = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = gamePosts.length > 0 && gamePosts.every(p => selected.has(p.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(gamePosts.map(p => p.id)))
  const deleteSelected = async () => {
    if (!selected.size) return
    await persist(gamePosts.filter(p => !selected.has(p.id)))
    setSelected(new Set())
  }

  if (!isOpen) return null

  const renderEditor = () => (
    <div className={editorBox}>
      <CharacterPicker charactersById={charactersById} value={draftChar} onChange={setDraftChar} />
      <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder="Post text…" className="w-full h-20 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm p-2 resize-y focus:outline-none focus:ring-2 focus:ring-surface-5" />
      <div className="flex gap-2 justify-end">
        <button onClick={cancelEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-4 text-txt-secondary">Cancel</button>
        <button onClick={saveEdit} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>Save</button>
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[10001] py-8 px-4 sm:p-4" style={{ margin: 0 }} onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
      <div className="card-elevated w-full sm:w-[min(680px,95vw)] max-h-[calc(100dvh-4rem)] sm:max-h-[88vh] flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-4">
          <div className="min-w-0">
            <span className="label-xs text-txt-tertiary">Game Social</span>
            <h2 className="text-lg font-bold text-txt-primary truncate">Posts about this game</h2>
          </div>
          <button aria-label="Close" onClick={onClose} className="text-txt-tertiary hover:text-txt-primary p-1.5 rounded-md hover:bg-surface-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Generate controls */}
        {!isViewOnly && (
          <div className="border-b border-surface-4">
            <div className="px-5 py-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-txt-secondary">Generate</label>
              <input type="number" min="1" max="60" value={count} onChange={(e) => setCount(e.target.value)} className="w-16 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm p-1.5 focus:outline-none" />
              <span className="text-xs text-txt-tertiary">posts</span>
              <button onClick={handleCopy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}>{copied ? 'Copied!' : 'Copy prompt'}</button>
              <button
                onClick={() => { setShowPasteArea(v => !v); setPasteText('') }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showPasteArea ? 'border-surface-5 bg-surface-3 text-txt-primary' : 'border-surface-4 text-txt-primary hover:bg-surface-3'}`}
              >
                {showPasteArea ? 'Cancel paste' : 'Paste response'}
              </button>
              <span className="text-[11px] text-txt-tertiary ml-auto">Copy → run in your AI → Paste. Digs into the game's stats &amp; scoring.</span>
            </div>
            {showPasteArea && (
              <div className="px-5 pb-3 space-y-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  className="w-full h-44 rounded-md border border-surface-4 bg-surface-2 text-txt-primary text-sm font-mono p-3 resize-y focus:outline-none focus:ring-2 focus:ring-surface-5"
                  placeholder="Paste the AI's full response, or just the post lines (G1 | @handle | text)."
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-txt-tertiary">Paste the whole response, or just the post lines — both work.</p>
                  <button
                    onClick={handleParseAndSave}
                    disabled={busy || !pasteText.trim()}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-1)' }}
                  >
                    {busy ? 'Adding…' : 'Add posts'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Post list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-2.5 flex items-center justify-between border-b border-surface-4 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-txt-primary">{gamePosts.length} {gamePosts.length === 1 ? 'post' : 'posts'}</span>
              {!isViewOnly && gamePosts.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-txt-secondary cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4" style={{ accentColor: 'var(--text-primary)' }} />
                  {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selected.size > 0 && !isViewOnly && (
                <button onClick={deleteSelected} disabled={busy} className="px-3 py-1 rounded-lg text-xs font-semibold text-red-400 border border-red-700/40 hover:bg-red-900/20 disabled:opacity-50">Delete {selected.size}</button>
              )}
              {!isViewOnly && <button onClick={startNew} className="px-3 py-1 rounded-lg text-xs font-semibold border border-surface-4 text-txt-secondary hover:text-txt-primary">+ Add post</button>}
            </div>
          </div>

          {editing === 'new' && <div className="px-5 py-3 border-b border-surface-4">{renderEditor()}</div>}

          {gamePosts.length === 0 && editing !== 'new' ? (
            <div className="px-5 py-10 text-center text-txt-tertiary text-sm">No posts yet. Copy the prompt, run it, and Paste — or add one by hand.</div>
          ) : gamePosts.map(p => {
            const c = charactersById[p.charId]
            if (editing === p.id) return <div key={p.id} className="px-5 py-3 border-b border-surface-4">{renderEditor()}</div>
            return (
              <div key={p.id} className="flex gap-3 px-5 py-3 border-b border-surface-4 group items-start">
                {!isViewOnly && (
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} className="w-4 h-4 mt-1.5 flex-shrink-0" style={{ accentColor: 'var(--text-primary)' }} />
                )}
                <Avatar c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-txt-primary truncate">{c?.displayName || p.charId}</span>
                    <span className="text-xs text-txt-tertiary truncate">{c?.handle}</span>
                  </div>
                  <div className="text-sm text-txt-primary whitespace-pre-wrap break-words mt-0.5" style={{ lineHeight: 1.45 }}>{p.text}</div>
                </div>
                {!isViewOnly && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(p)} className="text-xs text-txt-tertiary hover:text-txt-primary">Edit</button>
                    <button onClick={() => deletePost(p.id)} className="text-xs text-txt-tertiary hover:text-red-400">Delete</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-t border-surface-4 px-5 py-3 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-surface-4 text-txt-secondary hover:text-txt-primary bg-transparent">Close</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
