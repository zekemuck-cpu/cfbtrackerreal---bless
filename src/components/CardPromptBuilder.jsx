// Reusable prompt-builder for the player trading-card AI feature.
// Lives inside the PlayerEdit "Card" tab; receives player + dynasty as
// props rather than reading the URL, so it can be embedded anywhere.

import { useMemo, useState, useEffect, useRef } from 'react'
import { useTeamColors } from '../hooks/useTeamColors'
import { CARD_BRANDS, listBrandsAndStyles, getCardStyle } from '../data/cardStyles'
import { listPosesForPosition } from '../data/cardPoses'
import {
  buildCardPrompt,
  getDefaultCardSeason,
  getAvailableCardSeasons,
  getCardGameOptions,
} from '../utils/buildCardPrompt'

const CONTEXT_TYPES = [
  { value: 'game', label: 'Past game' },
  { value: 'award', label: 'Award presentation' },
  { value: 'none', label: 'No context (clean studio)' },
]

const MODE_OPTIONS = [
  { value: 'both', label: 'Front + Back' },
  { value: 'front', label: 'Front only' },
  { value: 'back', label: 'Back only' },
]

export default function CardPromptBuilder({ player, dynasty }) {
  const teamColors = useTeamColors(dynasty?.teamName, dynasty?.teams)
  const promptRef = useRef(null)

  const availableSeasons = useMemo(() => getAvailableCardSeasons(player, dynasty), [player, dynasty])
  const defaultSeason = useMemo(() => getDefaultCardSeason(player, dynasty), [player, dynasty])

  const [season, setSeason] = useState(defaultSeason)
  useEffect(() => { setSeason(defaultSeason) }, [defaultSeason])

  const [brandKey, setBrandKey] = useState('topps')
  const [styleKey, setStyleKey] = useState('stadium_club_1991')
  const [poseKey, setPoseKey] = useState(null)
  const [contextType, setContextType] = useState('none')
  const [gameId, setGameId] = useState(null)
  const [awardName, setAwardName] = useState('')
  const [customStyle, setCustomStyle] = useState('')
  const [mode, setMode] = useState('both')
  const [copied, setCopied] = useState(false)

  // Player likeness reference — preferred from player.pictureUrl so
  // existing portraits are reused. AI tools that support image-input
  // (Midjourney --cref, Sora image-ref) need this to keep the face
  // recognizable; without it the rendered player drifts.
  const referenceImageUrl = player?.pictureUrl || ''
  const hasReferenceImage = !!referenceImageUrl

  // Snap style to the brand's first style on brand change.
  useEffect(() => {
    const firstStyleKey = Object.keys(CARD_BRANDS[brandKey]?.styles || {})[0]
    if (firstStyleKey) setStyleKey(firstStyleKey)
  }, [brandKey])

  const positionForYear = player?.positionByYear?.[season] || player?.position || ''
  const poseOptions = useMemo(() => listPosesForPosition(positionForYear), [positionForYear])
  useEffect(() => {
    if (poseOptions.length > 0 && !poseOptions.find(p => p.key === poseKey)) {
      setPoseKey(poseOptions[0].key)
    }
  }, [poseOptions, poseKey])

  const poseEntry = useMemo(() => poseOptions.find(p => p.key === poseKey) || null, [poseOptions, poseKey])

  const gameOptions = useMemo(() => getCardGameOptions(player, dynasty, season), [player, dynasty, season])
  useEffect(() => {
    if (!gameOptions.find(g => g.gameId === gameId)) {
      setGameId(gameOptions[0]?.gameId || null)
    }
  }, [gameOptions, gameId])

  const selectedGame = useMemo(() => gameOptions.find(g => g.gameId === gameId) || null, [gameOptions, gameId])

  const prompt = useMemo(() => {
    if (!player || !season) return ''
    return buildCardPrompt({
      player, dynasty, year: season,
      brandKey, styleKey, poseEntry,
      gameContext: contextType === 'game' && selectedGame ? {
        game: selectedGame.raw,
        opponentName: selectedGame.opponentName,
        location: selectedGame.location,
        opponentColors: selectedGame.opponentColors,
        week: selectedGame.week,
        year: season,
      } : null,
      awardContext: contextType === 'award' && awardName ? { name: awardName, year: season } : null,
      customStylePrompt: customStyle,
      mode,
      referenceImageUrl,
    })
  }, [player, dynasty, season, brandKey, styleKey, poseEntry, contextType, selectedGame, awardName, customStyle, mode, referenceImageUrl])

  const brandsAndStyles = listBrandsAndStyles()
  const stylesForBrand = brandsAndStyles.find(b => b.brandKey === brandKey)?.styles || []
  const selectedStyle = getCardStyle(brandKey, styleKey)

  const handleCopy = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      promptRef.current?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
      {/* Settings panel */}
      <div className="space-y-5 p-5 rounded-xl bg-surface-2 border border-surface-4">
        {/* Reference-image status — required for usable likeness. */}
        <div
          className="flex items-start gap-3 p-3 rounded-md text-xs"
          style={{
            backgroundColor: hasReferenceImage ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            border: `1px solid ${hasReferenceImage ? 'rgba(34, 197, 94, 0.25)' : 'rgba(245, 158, 11, 0.3)'}`,
          }}
        >
          {hasReferenceImage && referenceImageUrl ? (
            <img
              src={referenceImageUrl}
              alt="Reference"
              className="w-10 h-10 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-surface-3 flex items-center justify-center flex-shrink-0 text-txt-tertiary">!</div>
          )}
          <div className="flex-1 min-w-0">
            {hasReferenceImage ? (
              <>
                <div className="font-semibold text-txt-primary">Player headshot will be used as a face reference</div>
                <div className="text-txt-tertiary mt-0.5">
                  When you submit the prompt to your AI image tool, also attach this headshot image so the rendered player looks like them.
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-amber-400">No headshot set on this player</div>
                <div className="text-txt-tertiary mt-0.5">
                  Open the <span className="font-semibold">Profile</span> tab and add a player picture for the AI to match the face. Without one, the rendered player won't look like them.
                </div>
              </>
            )}
          </div>
        </div>

        <Field label="What to generate" hint="Both produces two prompts — paste into your AI tool one at a time.">
          <div className="flex gap-2 flex-wrap">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                  mode === opt.value
                    ? 'border-transparent text-white'
                    : 'border-surface-4 text-txt-secondary hover:bg-surface-3'
                }`}
                style={mode === opt.value ? { backgroundColor: teamColors.primary } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Season" hint="Defaults to the player's most recent year on a team.">
          <select
            value={season ?? ''}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
          >
            {(availableSeasons.length > 0 ? availableSeasons : [season]).filter(Boolean).map(y => (
              <option key={y} value={y}>{y} season</option>
            ))}
          </select>
        </Field>

        <Field label="Card brand" hint="Choose the publisher whose look you're going for.">
          <select
            value={brandKey}
            onChange={(e) => setBrandKey(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
          >
            {brandsAndStyles.map(b => (
              <option key={b.brandKey} value={b.brandKey}>{b.brandLabel}</option>
            ))}
          </select>
        </Field>

        <Field label="Card style" hint={selectedStyle?.eraTag ? `${selectedStyle.eraTag} · ${selectedStyle.finish}` : null}>
          <select
            value={styleKey}
            onChange={(e) => setStyleKey(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
          >
            {stylesForBrand.map(s => (
              <option key={s.styleKey} value={s.styleKey}>
                {s.styleLabel}{s.year ? ` · ${s.year}` : ''}
              </option>
            ))}
          </select>
        </Field>

        {brandKey === 'custom' && (
          <Field label="Custom style description" hint="Describe the visual: cardstock, borders, typography, photo treatment.">
            <textarea
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm font-mono"
              placeholder="e.g. Matte cardstock, thick black border, glossy bevel, top-left team-color triangle..."
            />
          </Field>
        )}

        <Field label="Pose" hint={positionForYear ? `Filtered for ${positionForYear}` : 'No position recorded for this season — universal poses only.'}>
          <select
            value={poseKey ?? ''}
            onChange={(e) => setPoseKey(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
          >
            {poseOptions.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Context" hint="Whether the photo references a specific game, an award presentation, or just a clean studio shot.">
          <div className="flex gap-2 flex-wrap">
            {CONTEXT_TYPES.map(ct => (
              <button
                key={ct.value}
                type="button"
                onClick={() => setContextType(ct.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                  contextType === ct.value
                    ? 'border-transparent text-white'
                    : 'border-surface-4 text-txt-secondary hover:bg-surface-3'
                }`}
                style={contextType === ct.value ? { backgroundColor: teamColors.primary } : undefined}
              >
                {ct.label}
              </button>
            ))}
          </div>
        </Field>

        {contextType === 'game' && (
          <Field label="Game" hint="Pre-fills opponent, home/away, and crowd colors for the scene.">
            {gameOptions.length === 0 ? (
              <div className="text-xs text-txt-tertiary italic">
                No played games found for this player in {season}. Pick a different season or switch context to "No context".
              </div>
            ) : (
              <select
                value={gameId ?? ''}
                onChange={(e) => setGameId(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
              >
                {gameOptions.map(g => {
                  const loc = g.location === 'home' ? 'vs' : g.location === 'away' ? '@' : 'vs (neutral)'
                  const result = `${g.won ? 'W' : 'L'} ${g.playerScore}–${g.oppScore}`
                  return (
                    <option key={g.gameId} value={g.gameId}>
                      Wk {g.week ?? '?'} · {loc} {g.opponentAbbr || g.opponentName} · {result}
                    </option>
                  )
                })}
              </select>
            )}
          </Field>
        )}

        {contextType === 'award' && (
          <Field label="Award" hint="The card scene becomes a trophy presentation rather than a game.">
            <input
              type="text"
              value={awardName}
              onChange={(e) => setAwardName(e.target.value)}
              placeholder="e.g. Heisman Trophy, All-American, Conference Player of the Year"
              className="w-full px-3 py-2 rounded-md bg-surface-3 border border-surface-4 text-txt-primary text-sm"
            />
          </Field>
        )}
      </div>

      {/* Prompt preview */}
      <div className="p-5 rounded-xl bg-surface-2 border border-surface-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="label-sm text-txt-primary">Generated prompt</h4>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors hover:opacity-90"
            style={{ backgroundColor: teamColors.primary, color: '#fff' }}
            disabled={!prompt}
          >
            {copied ? 'Copied!' : 'Copy prompt'}
          </button>
        </div>
        <textarea
          ref={promptRef}
          value={prompt}
          readOnly
          rows={26}
          className="w-full px-3 py-3 rounded-md bg-surface-3 border border-surface-4 text-txt-secondary text-xs font-mono leading-relaxed"
        />
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block label-xs text-txt-tertiary mb-1.5" style={{ letterSpacing: '1.5px' }}>{label}</label>
      {children}
      {hint && <div className="text-[11px] text-txt-tertiary mt-1.5">{hint}</div>}
    </div>
  )
}
