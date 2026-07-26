import { useState, useRef, useEffect } from 'react'
import { useDynasty, getRecordAsOfGame } from '../context/DynastyContext'
import { getMascotName, getTeamLogo } from '../data/teams'
import { getTeamLogoRobust } from '../utils/teamLogo'
import { getTeamColors } from '../data/teamColors'
import { getFullRecapPrompt } from '../services/geminiService'
import { buildGameSocialSection, gameSocialTagMap } from '../utils/socialPrompt'
import { extractSocialBlock, parseSocialLines, resolveSocialPosts, buildHandleIndex, getEffectiveCharacters, ensureUniverseLoaded } from '../data/socialModel'
import { uploadImages } from '../utils/imageUpload'
import { readClipboardImageAsFile } from '../utils/clipboardImage'
import { buildScoreGraphicPrompt } from '../utils/scoreGraphicPrompt'
import { GRAPHIC_SIDES } from '../utils/scoreGraphics'
import { Card, Button, Textarea, Modal, Select } from './ui'
import { useToast } from './ui/Toast'
import RecapSettingsModal from './RecapSettingsModal'
import GameSocialModal from './GameSocialModal'
import ImageUpload from './ImageUpload'

// Clean a pasted AI recap — same rule GameEdit.jsx uses: FormattedRecap
// renders markdown itself, so only the wrapping ```markdown … ``` fence
// the AI often adds gets stripped, not the formatting inside it.
function unwrapRecapFence(raw) {
  if (!raw) return ''
  let s = String(raw).replace(/\r\n/g, '\n')
  s = s.replace(/^[ \t]*```[a-zA-Z]*[ \t]*$/gm, '')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

function gameTitleFor(game) {
  if (game.isCFPChampionship) return 'National Championship'
  if (game.isCFPSemifinal) return game.bowlName || 'CFP Semifinal'
  if (game.isCFPQuarterfinal) return game.bowlName || 'CFP Quarterfinal'
  if (game.isCFPFirstRound) return 'CFP First Round'
  if (game.isConferenceChampionship) return `${game.conference || ''} Championship`
  if (game.isBowlGame || game.bowlName) return game.bowlName || 'Bowl Game'
  return `Week ${game.week}`
}

/**
 * Recap / Photos / Score Graphic content tools, lifted out of GameEdit.jsx
 * so a CFB27 (PC auto-sync) dynasty can generate/manage this game's AI
 * content directly from the read-only Gamecast view — score/stat/rank
 * editing is now automated by save-sync, but recap text, photos, socials,
 * and the score graphic are independent AI-content tools the user still
 * wants quick access to, without the rest of the (now mostly redundant)
 * score/stat editor.
 *
 * Unlike GameEdit.jsx's version — where every field only reaches the
 * dynasty once the page's big "Save" button runs — every action here
 * saves immediately via `updateGame` (a minimal `{ id, <field> }` patch;
 * `updateGame` already merges into the existing game, see
 * DynastyContext.jsx's `updateGame`), since this view has no separate
 * save step.
 */
export default function GameContentTools({ game }) {
  const { currentDynasty, updateGame, saveSocialPosts, loadSocial, isViewOnly } = useDynasty()
  const { toast } = useToast()
  const teams = currentDynasty?.teams || {}
  const dynastyId = currentDynasty?.id

  const team1Tid = game.team1Tid
  const team2Tid = game.team2Tid
  const team1Name = getMascotName(team1Tid, teams) || game.team1 || 'Team 1'
  const team2Name = getMascotName(team2Tid, teams) || game.team2 || 'Team 2'
  const team1Logo = getTeamLogoRobust(team1Name, teams) || getTeamLogo(team1Name, teams)
  const team2Logo = getTeamLogoRobust(team2Name, teams) || getTeamLogo(team2Name, teams)
  const gameTitle = gameTitleFor(game)
  const userTid = currentDynasty?.currentTid != null ? Number(currentDynasty.currentTid) : null
  const isTeam1UserTeam = userTid != null && Number(team1Tid) === userTid
  const isTeam2UserTeam = userTid != null && Number(team2Tid) === userTid

  const patchGame = (fields) => updateGame(dynastyId, { id: game.id, ...fields })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <GameRecapCard
        game={game}
        team1Name={team1Name}
        team2Name={team2Name}
        gameTitle={gameTitle}
        isViewOnly={isViewOnly}
        patchGame={patchGame}
        currentDynasty={currentDynasty}
        loadSocial={loadSocial}
        saveSocialPosts={saveSocialPosts}
        dynastyId={dynastyId}
        toast={toast}
      />
      <PhotosCard
        game={game}
        isViewOnly={isViewOnly}
        patchGame={patchGame}
        toast={toast}
      />
      <ScoreGraphicCard
        game={game}
        team1Tid={team1Tid}
        team2Tid={team2Tid}
        team1Name={team1Name}
        team2Name={team2Name}
        team1Logo={team1Logo}
        team2Logo={team2Logo}
        gameTitle={gameTitle}
        isTeam1UserTeam={isTeam1UserTeam}
        isTeam2UserTeam={isTeam2UserTeam}
        isViewOnly={isViewOnly}
        patchGame={patchGame}
        currentDynasty={currentDynasty}
      />
    </div>
  )
}

// ─────────────────────────── Game Recap ───────────────────────────

function GameRecapCard({ game, team1Name, team2Name, gameTitle, isViewOnly, patchGame, currentDynasty, loadSocial, saveSocialPosts, dynastyId, toast }) {
  const [showRecapSettings, setShowRecapSettings] = useState(false)
  const [showRecapEditModal, setShowRecapEditModal] = useState(false)
  const [showSocialModal, setShowSocialModal] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [recapPasteFeedback, setRecapPasteFeedback] = useState(null)
  const [recapDraft, setRecapDraft] = useState(game.aiRecap || '')

  const [recapPerspective, setRecapPerspective] = useState(() => {
    try { return localStorage.getItem('gameRecapPerspective') || 'neutral' } catch { return 'neutral' }
  })
  const [recapDepth, setRecapDepth] = useState(() => {
    try { return localStorage.getItem('gameRecapDepth') || 'medium' } catch { return 'medium' }
  })
  const [recapSocial, setRecapSocial] = useState(() => {
    try { return localStorage.getItem('gameRecapSocial') === '1' } catch { return false }
  })
  const [recapSocialCount, setRecapSocialCount] = useState(() => {
    try { return Number(localStorage.getItem('gameRecapSocialCount')) || 8 } catch { return 8 }
  })
  useEffect(() => { try { localStorage.setItem('gameRecapPerspective', recapPerspective) } catch { /* ignored */ } }, [recapPerspective])
  useEffect(() => { try { localStorage.setItem('gameRecapDepth', recapDepth) } catch { /* ignored */ } }, [recapDepth])
  useEffect(() => { try { localStorage.setItem('gameRecapSocial', recapSocial ? '1' : '0') } catch { /* ignored */ } }, [recapSocial])
  useEffect(() => { try { localStorage.setItem('gameRecapSocialCount', String(recapSocialCount)) } catch { /* ignored */ } }, [recapSocialCount])

  const wordCount = (game.aiRecap || '').trim().split(/\s+/).filter(Boolean).length

  const perspectiveOptions = [
    { key: 'team1Fan', label: `${team1Name} fan`, blurb: `Blog-style, first-person plural ("we" / "our ${team1Name}"). Emotional. Pro-${team1Name}.` },
    { key: 'team1Reporter', label: `${team1Name} reporter`, blurb: `Hometown beat writer for ${team1Name}. News-forward, third-person, but ${team1Name}-led framing.` },
    { key: 'neutral', label: 'Neutral national media', blurb: 'ESPN.com beat writer. Inverted-pyramid news, balanced coverage of both teams.' },
    { key: 'team2Reporter', label: `${team2Name} reporter`, blurb: `Hometown beat writer for ${team2Name}. News-forward, third-person, but ${team2Name}-led framing.` },
    { key: 'team2Fan', label: `${team2Name} fan`, blurb: `Blog-style, first-person plural ("we" / "our ${team2Name}"). Emotional. Pro-${team2Name}.` },
  ]

  const handleCopyPrompt = async () => {
    try {
      const gameForRecap = { ...game, team1: team1Name, team2: team2Name, gameLabel: gameTitle }
      let fullPrompt = getFullRecapPrompt(currentDynasty, gameForRecap, { perspective: recapPerspective, depth: recapDepth })
      if (recapSocial && currentDynasty) {
        const socialSection = buildGameSocialSection(currentDynasty, gameForRecap, Number(recapSocialCount) || 8)
        fullPrompt = `${fullPrompt}\n\nIMPORTANT: After your recap, ALSO output the SOCIAL POSTS block described below as a SEPARATE \`\`\`cfb-social fence (two sibling fenced blocks, recap first).\n\n${socialSection}`
      }
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullPrompt)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = fullPrompt
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy prompt: ' + error.message)
    }
  }

  const handlePasteRecap = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) {
        setRecapPasteFeedback('Clipboard is empty.')
        setTimeout(() => setRecapPasteFeedback(null), 2500)
        return
      }
      const { found: hasSocial, body: socialBody, recapWithoutBlock } = extractSocialBlock(text)
      const recapText = hasSocial ? recapWithoutBlock : text
      await patchGame({ aiRecap: unwrapRecapFence(recapText) })

      let msg = 'Pasted.'
      if (hasSocial && game.id) {
        try {
          await loadSocial(dynastyId)
          await ensureUniverseLoaded()
          const cmap = getEffectiveCharacters(currentDynasty)
          const { posts, newCharacters } = resolveSocialPosts({
            lines: parseSocialLines(socialBody),
            year: Number(game.year), week: Number(game.week),
            gameTagMap: gameSocialTagMap(game),
            handleIndex: buildHandleIndex(cmap), charactersById: cmap,
            teamsById: currentDynasty.teams || {}, now: () => Date.now(),
          })
          const attached = posts.map(p => ({ ...p, gameId: game.id }))
          if (attached.length) {
            await saveSocialPosts(dynastyId, Number(game.year), Number(game.week), attached, newCharacters)
            msg = `Pasted. Added ${attached.length} social posts.`
          }
        } catch (e) { console.warn('[GameContentTools] social parse failed', e) }
      }
      setRecapPasteFeedback(msg)
      setTimeout(() => setRecapPasteFeedback(null), 2500)
    } catch {
      setRecapPasteFeedback('Browser blocked clipboard. Try again or paste manually.')
      setTimeout(() => setRecapPasteFeedback(null), 3500)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="min-w-0">
          <h3 className="label-sm text-txt-primary">Game Recap</h3>
          <p className="text-xs text-txt-tertiary mt-0.5 tabular-nums">
            {recapPasteFeedback
              ? recapPasteFeedback
              : wordCount > 0
              ? `${wordCount} ${wordCount === 1 ? 'word' : 'words'} saved`
              : 'No recap yet — Copy AI Prompt, run it, then Paste the result.'}
          </p>
        </div>
        {!isViewOnly && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <div className="flex items-stretch rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-5)' }}>
              <button
                type="button"
                onClick={() => setShowRecapSettings(true)}
                title="Recap perspective and length"
                className="px-2.5 flex items-center justify-center transition-colors text-txt-secondary hover:text-txt-primary hover:bg-surface-3"
                style={{ background: 'var(--surface-2)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <div style={{ width: '1px', background: 'var(--surface-5)', flexShrink: 0 }} />
              <button
                type="button"
                onClick={handleCopyPrompt}
                disabled={!game.team1Score && game.team1Score !== 0}
                title="Copy the full prompt to paste into ChatGPT, Claude, or another AI"
                className="px-3 py-1.5 text-sm font-semibold transition-colors text-txt-primary hover:bg-surface-3 disabled:opacity-40"
                style={{ background: 'var(--surface-2)' }}
              >
                {promptCopied ? 'Copied!' : 'Copy AI Prompt'}
              </button>
            </div>
            <div className="flex items-stretch rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-5)' }}>
              <button
                type="button"
                onClick={handlePasteRecap}
                title="Paste recap text from clipboard"
                className="px-3 py-1.5 text-sm font-semibold transition-colors text-txt-primary hover:bg-surface-3"
                style={{ background: 'var(--surface-2)' }}
              >
                Paste
              </button>
              <div style={{ width: '1px', background: 'var(--surface-5)', flexShrink: 0 }} />
              <button
                type="button"
                onClick={() => { setRecapDraft(game.aiRecap || ''); setShowRecapEditModal(true) }}
                title="Open the recap in a larger editor"
                className="px-2.5 flex items-center justify-center transition-colors text-txt-secondary hover:text-txt-primary hover:bg-surface-3"
                style={{ background: 'var(--surface-2)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17L17 7" />
                  <path d="M8 7h9v9" />
                </svg>
              </button>
            </div>
            {game.id && (
              <button
                type="button"
                onClick={() => setShowSocialModal(true)}
                disabled={!game.team1Score && game.team1Score !== 0}
                title="Generate or edit social posts about this game"
                className="px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors text-txt-primary hover:bg-surface-3 disabled:opacity-40"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--surface-5)' }}
              >
                Edit socials
              </button>
            )}
          </div>
        )}
      </div>

      <RecapSettingsModal
        isOpen={showRecapSettings}
        onClose={() => setShowRecapSettings(false)}
        perspectiveOptions={perspectiveOptions}
        perspective={recapPerspective}
        onPerspectiveChange={setRecapPerspective}
        depth={recapDepth}
        onDepthChange={setRecapDepth}
        socialEnabled={recapSocial}
        onSocialEnabledChange={setRecapSocial}
        socialCount={recapSocialCount}
        onSocialCountChange={setRecapSocialCount}
      />

      <Modal isOpen={showRecapEditModal} onClose={() => setShowRecapEditModal(false)} title="Edit Game Recap" size="xl">
        <p className="text-xs text-txt-tertiary mb-3">
          Paste, edit, or write the game recap by hand. Saves when you click Done.
        </p>
        <Textarea
          value={recapDraft}
          onChange={(e) => setRecapDraft(e.target.value)}
          rows={18}
          placeholder="Paste the AI-generated recap here (or write your own)..."
          autoFocus
        />
        <div className="flex items-center justify-between mt-3 text-xs text-txt-tertiary">
          <span className="tabular-nums">{recapDraft.trim().split(/\s+/).filter(Boolean).length} words</span>
          <Button variant="primary" size="sm" onClick={async () => { await patchGame({ aiRecap: recapDraft }); setShowRecapEditModal(false) }}>
            Done
          </Button>
        </div>
      </Modal>

      {showSocialModal && game.id && (
        <GameSocialModal
          isOpen={showSocialModal}
          onClose={() => setShowSocialModal(false)}
          game={game}
        />
      )}
    </Card>
  )
}

// ─────────────────────────── Photos ───────────────────────────

function PhotosCard({ game, isViewOnly, patchGame, toast }) {
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const photos = game.photos || []

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="label-sm text-txt-primary">Photos</h3>
            <p className="text-xs text-txt-tertiary mt-0.5 tabular-nums">
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'} uploaded
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowPhotosModal(true)}>
            Manage photos
          </Button>
        </div>
      </Card>
      <PhotosModal
        isOpen={showPhotosModal}
        onClose={() => setShowPhotosModal(false)}
        game={game}
        isViewOnly={isViewOnly}
        patchGame={patchGame}
        toast={toast}
      />
    </>
  )
}

function PhotosModal({ isOpen, onClose, game, isViewOnly, patchGame, toast }) {
  const [photoUploadCount, setPhotoUploadCount] = useState(0)
  const [photoUploadDone, setPhotoUploadDone] = useState(0)
  const [photoUploadFailed, setPhotoUploadFailed] = useState(0)
  const [photoPasteFeedback, setPhotoPasteFeedback] = useState(null)
  const photoUploadAbortRef = useRef(null)
  const photos = game.photos || []

  const runPhotoUpload = async (files) => {
    if (!files || files.length === 0) return
    const controller = new AbortController()
    photoUploadAbortRef.current = controller
    setPhotoUploadCount(files.length)
    setPhotoUploadDone(0)
    setPhotoUploadFailed(0)
    try {
      const { urls, errors } = await uploadImages(files, {
        signal: controller.signal,
        onProgress: ({ done, ok }) => {
          setPhotoUploadDone(done)
          if (!ok) setPhotoUploadFailed(prev => prev + 1)
        },
      })
      if (controller.signal.aborted) return
      if (urls.length > 0) {
        await patchGame({ photos: [...photos, ...urls] })
      }
      if (errors.length > 0) {
        toast.error(urls.length > 0
          ? `Uploaded ${urls.length}; ${errors.length} failed (${errors[0].error.message})`
          : `Upload failed: ${errors[0].error.message}`)
      } else if (urls.length > 0) {
        toast.success(`Uploaded ${urls.length} photo${urls.length === 1 ? '' : 's'}`)
      }
    } finally {
      photoUploadAbortRef.current = null
      setPhotoUploadCount(0)
      setPhotoUploadDone(0)
      setPhotoUploadFailed(0)
    }
  }

  const handlePastePhoto = async () => {
    if (photoUploadCount > 0) return
    setPhotoPasteFeedback(null)
    let result
    try { result = await readClipboardImageAsFile() } catch { result = { ok: false, reason: 'denied' } }
    if (!result?.ok) {
      const msg = result?.reason === 'auth_url'
        ? 'That image is behind a login — save it and use Click to select instead.'
        : result?.reason === 'fetch_failed'
          ? 'Could not fetch that image. Try copying the image itself.'
          : result?.reason === 'empty'
            ? 'No image found on the clipboard.'
            : 'Clipboard blocked. Copy an image, then try again.'
      setPhotoPasteFeedback(msg)
      setTimeout(() => setPhotoPasteFeedback(null), 3500)
      return
    }
    await runPhotoUpload([result.file])
  }

  const removePhoto = async (url) => {
    await patchGame({ photos: photos.filter(u => u !== url) })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Photos"
      size="xl"
      closeOnBackdrop={photoUploadCount === 0}
      closeOnEscape={photoUploadCount === 0}
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs text-txt-tertiary m-0">
          Upload one or many photos at once, or paste one from your clipboard.
        </p>
        <div className="flex items-center gap-2">
          <span className="label-xs text-txt-tertiary tabular-nums">
            {photoUploadCount > 0
              ? `${photoUploadDone} of ${photoUploadCount}${photoUploadFailed > 0 ? ` ${photoUploadFailed} failed` : ''}`
              : `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}
          </span>
          {photoUploadCount > 0 && (
            <button
              type="button"
              onClick={() => photoUploadAbortRef.current?.abort()}
              className="label-xs text-txt-tertiary hover:text-txt-primary underline"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {!isViewOnly && (
        <div className="flex items-stretch gap-2 mb-1">
          <label
            className="relative flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer transition-colors text-sm font-semibold overflow-hidden"
            style={{
              backgroundColor: 'var(--surface-3)',
              border: '1.5px dashed var(--surface-5)',
              color: 'var(--text-secondary)',
              opacity: photoUploadCount > 0 ? 0.85 : 1,
              pointerEvents: photoUploadCount > 0 ? 'none' : 'auto',
            }}
          >
            {photoUploadCount > 0 && (
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
                style={{ width: `${Math.round((photoUploadDone / photoUploadCount) * 100)}%`, backgroundColor: 'var(--text-primary)', opacity: 0.12 }}
                aria-hidden="true"
              />
            )}
            <span className="relative flex items-center gap-2">
              {photoUploadCount > 0 ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M12 3a9 9 0 1 1-6.36 2.64" />
                  </svg>
                  <span className="tabular-nums">
                    Uploading {photoUploadDone} of {photoUploadCount}
                    {photoUploadFailed > 0 && ` ${photoUploadFailed} failed`}…
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Click to select photo(s) — bulk upload supported
                </>
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={photoUploadCount > 0}
              onChange={async (e) => {
                const files = Array.from(e.target.files || [])
                e.target.value = ''
                e.target.blur()
                await runPhotoUpload(files)
              }}
            />
          </label>
          <button
            type="button"
            onClick={handlePastePhoto}
            disabled={photoUploadCount > 0}
            title="Paste an image from your clipboard (Ctrl+V)"
            className="flex-shrink-0 flex items-center justify-center px-5 rounded-lg transition-colors text-sm font-semibold disabled:opacity-50 hover:bg-surface-4"
            style={{ backgroundColor: 'var(--surface-3)', border: '1.5px dashed var(--surface-5)', color: 'var(--text-secondary)' }}
          >
            Paste image
          </button>
        </div>
      )}
      {photoPasteFeedback && <p className="text-xs text-txt-tertiary mb-3 mt-0">{photoPasteFeedback}</p>}
      {!photoPasteFeedback && <div className="mb-3" />}

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {photos.map((url) => {
            const thumb = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=240&output=webp`
            return (
              <div
                key={url}
                className="group relative aspect-square overflow-hidden rounded-md"
                style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}
              >
                <img
                  src={thumb}
                  alt="Game photo"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { if (e.currentTarget.src !== url) e.currentTarget.src = url }}
                />
                {!isViewOnly && (
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', color: '#f87171', border: '1px solid var(--surface-5)' }}
                    title="Remove photo"
                    aria-label="Remove photo"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-txt-tertiary italic text-center py-6">No photos uploaded yet.</p>
      )}
    </Modal>
  )
}

// ─────────────────────────── Score Graphic ───────────────────────────

function ScoreGraphicCard({ game, team1Tid, team2Tid, team1Name, team2Name, team1Logo, team2Logo, gameTitle, isTeam1UserTeam, isTeam2UserTeam, isViewOnly, patchGame, currentDynasty }) {
  const [graphicFeaturedSide, setGraphicFeaturedSide] = useState(null)
  const [graphicPromptCopied, setGraphicPromptCopied] = useState(false)

  const hasScores = game.team1Score != null && game.team2Score != null
  const autoSide = isTeam1UserTeam ? 'team1' : isTeam2UserTeam ? 'team2' : 'team1'
  const activeSide = graphicFeaturedSide ?? autoSide
  const featuredTeamNum = activeSide === 'neutral' ? 0 : activeSide === 'team2' ? 2 : 1

  const sgMap = game.scoreGraphics || {}
  const uploadedSides = GRAPHIC_SIDES.filter(s => sgMap[s])
  const shownSide = (game.scoreGraphicShown && sgMap[game.scoreGraphicShown]) ? game.scoreGraphicShown : (uploadedSides[0] || '')
  const sideLabel = { team1: team1Name || 'Team 1', neutral: 'Neutral', team2: team2Name || 'Team 2' }

  const t1Colors = getTeamColors(team1Name)
  const t2Colors = getTeamColors(team2Name)

  const rec1Obj = team1Tid != null ? getRecordAsOfGame(currentDynasty, game, team1Tid) : null
  const rec2Obj = team2Tid != null ? getRecordAsOfGame(currentDynasty, game, team2Tid) : null
  const rec1 = rec1Obj?.overall || ''
  const rec2 = rec2Obj?.overall || ''

  const uploadedScreenshots = Array.isArray(game.photos) ? game.photos.filter(Boolean).length : 0
  const homeTeamNum = game.homeTeamTid != null
    ? (Number(game.homeTeamTid) === Number(team1Tid) ? 1 : Number(game.homeTeamTid) === Number(team2Tid) ? 2 : null)
    : null

  const prompt = hasScores ? buildScoreGraphicPrompt({
    team1Name,
    team1Score: game.team1Score,
    team1Rank: game.team1Rank || null,
    team1Record: rec1 || null,
    team1Colors: t1Colors || undefined,
    team2Name,
    team2Score: game.team2Score,
    team2Rank: game.team2Rank || null,
    team2Record: rec2 || null,
    team2Colors: t2Colors || undefined,
    gameLabel: gameTitle,
    year: game.year,
    featuredTeam: featuredTeamNum,
    homeTeam: homeTeamNum,
    screenshotCount: uploadedScreenshots,
    gameType: game.gameType || 'regular',
    bowlName: game.bowlName || null,
    conference: game.conference || null,
  }) : ''

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="label-sm text-txt-primary">Score Graphic</h3>
        <a
          href="https://chatgpt.com/images/"
          target="_blank"
          rel="noopener noreferrer"
          title="Generate in ChatGPT"
          aria-label="Open ChatGPT image tools"
          className="flex-shrink-0 text-txt-tertiary hover:text-txt-primary transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
          </svg>
        </a>
      </div>

      {hasScores && (
        <label className="flex items-center gap-2 mb-2 min-w-0">
          <span className="label-xs text-txt-tertiary whitespace-nowrap">Shown in overview</span>
          <Select
            size="sm"
            value={shownSide}
            onChange={(e) => patchGame({ scoreGraphicShown: e.target.value })}
            className="flex-1 min-w-0"
          >
            {uploadedSides.length === 0 && <option value="">None uploaded</option>}
            {GRAPHIC_SIDES.map(s => (
              <option key={s} value={s} disabled={!sgMap[s]}>
                {sideLabel[s]}{sgMap[s] ? '' : ' (none)'}
              </option>
            ))}
          </Select>
        </label>
      )}

      {!hasScores ? (
        <p className="text-xs text-txt-muted italic">No scores yet — the graphic prompt needs a final score.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="label-xs text-txt-tertiary mb-1.5">Featured team</p>
            <div className="flex gap-2">
              {[
                { side: 'team1', logo: team1Logo, name: team1Name },
                { side: 'neutral', logo: null, name: 'Neutral' },
                { side: 'team2', logo: team2Logo, name: team2Name },
              ].map(({ side, logo, name }) => {
                const isActive = activeSide === side
                const hasGraphic = !!sgMap[side]
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setGraphicFeaturedSide(side)}
                    className="relative flex-1 flex items-center justify-center py-1.5 rounded transition-colors"
                    style={{
                      backgroundColor: isActive ? 'var(--text-primary)' : 'var(--surface-3)',
                      color: isActive ? 'var(--surface-1)' : 'var(--text-secondary)',
                      border: '1px solid var(--surface-4)',
                      minHeight: '2rem',
                    }}
                  >
                    {logo ? <img src={logo} alt={name} className="w-6 h-6 object-contain" /> : <span className="text-xs font-semibold">{name}</span>}
                    {hasGraphic && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22c55e' }} title="Graphic uploaded" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(prompt).catch(() => {})
              setGraphicPromptCopied(true)
              setTimeout(() => setGraphicPromptCopied(false), 1500)
            }}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150"
            style={{
              backgroundColor: graphicPromptCopied ? '#16a34a' : 'var(--text-primary)',
              color: graphicPromptCopied ? '#fff' : 'var(--surface-1)',
              transform: graphicPromptCopied ? 'scale(0.98)' : 'scale(1)',
            }}
          >
            {graphicPromptCopied ? 'Copied!' : 'Copy prompt'}
          </button>

          <div>
            <p className="label-xs text-txt-tertiary mb-2">
              Upload generated image <span className="text-txt-muted">· {sideLabel[activeSide]}</span>
            </p>
            <ImageUpload
              key={activeSide}
              value={sgMap[activeSide] || ''}
              disabled={isViewOnly}
              onChange={(url) => {
                const next = { ...sgMap }
                if (url) next[activeSide] = url
                else delete next[activeSide]
                let shown = game.scoreGraphicShown
                if (url && (!shown || !next[shown])) shown = activeSide
                if (!shown || !next[shown]) shown = GRAPHIC_SIDES.find(s => next[s]) || ''
                patchGame({ scoreGraphics: next, scoreGraphicShown: shown })
              }}
              teamColors={{ primary: 'var(--text-primary)', secondary: 'var(--surface-1)' }}
              placeholder="Paste image or URL..."
              showPreview={false}
              hideDropzone={false}
            />
          </div>
        </div>
      )}
    </Card>
  )
}
