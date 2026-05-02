// Live composer — renders a card template with the player's photo,
// team logo, and demographic data overlaid into each mapped zone.
// No image export step; the card is just an HTML/CSS layered render
// so it stays sharp at any size and reflects live data instantly.
//
// Slot resolution is driven by `template.zones[]` from the template
// registry. Each zone declares which slot it represents (photo,
// team_logo, last_name, jersey, …) plus its bounding box and any
// styling hints. The composer renders a child per zone at absolute
// positioning over the template image.

import { useMemo, useRef, useEffect, useState } from 'react'
import { getCardTemplate } from '../data/cardTemplates'
import { stripMascotFromName, getTeamLogo } from '../data/teams'

export default function CardComposer({
  card,
  player,
  dynasty,
  width = '100%',
  className = '',
}) {
  const template = useMemo(() => getCardTemplate(card?.templateId), [card?.templateId])

  const slotValues = useMemo(() => {
    if (!template || !player) return {}
    return resolveSlotValues({ card, player, dynasty })
  }, [template, card, player, dynasty])

  if (!template) {
    return (
      <div
        className={`relative bg-surface-3 rounded-xl flex items-center justify-center text-xs text-txt-tertiary ${className}`}
        style={{ width, aspectRatio: '5 / 7' }}
      >
        No template
      </div>
    )
  }

  return (
    <div
      className={`relative ${className}`}
      style={{
        width,
        aspectRatio: String(template.aspectRatio || 5 / 7),
      }}
    >
      {/* Template background */}
      <img
        src={template.imageUrl}
        alt={template.label}
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        draggable={false}
      />

      {/* Per-zone overlays */}
      {template.zones.map((zone, idx) => (
        <ZoneRender key={idx} zone={zone} value={slotValues[zone.slot]} />
      ))}
    </div>
  )
}

/**
 * Render a single zone. Image slots (photo, team_logo) get an
 * `<img>`; everything else is treated as a text slot with auto-fit
 * size and the styling hints from the registry entry.
 */
function ZoneRender({ zone, value }) {
  const isImage = zone.slot === 'photo' || zone.slot === 'team_logo'

  const baseStyle = {
    position: 'absolute',
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    width: `${zone.w}%`,
    height: `${zone.h}%`,
    transform: zone.rotate ? `rotate(${zone.rotate}deg)` : undefined,
    transformOrigin: 'center center',
    overflow: 'hidden',
  }

  if (isImage) {
    if (!value) return null
    return (
      <div style={baseStyle}>
        <img
          src={value}
          alt=""
          className="w-full h-full select-none pointer-events-none"
          style={{
            objectFit: zone.objectFit || 'cover',
            borderRadius: zone.radius != null ? `${zone.radius}px` : undefined,
          }}
          draggable={false}
        />
      </div>
    )
  }

  // Text slot
  if (value == null || value === '') return null
  return (
    <div
      style={{
        ...baseStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: zone.textAlign === 'left' ? 'flex-start'
          : zone.textAlign === 'right' ? 'flex-end'
          : 'center',
        padding: '0 4%',
      }}
    >
      <FittedText
        text={String(value)}
        color={zone.color}
        fontFamily={zone.fontFamily}
        fontWeight={zone.fontWeight}
        letterSpacing={zone.letterSpacing}
        textAlign={zone.textAlign || 'center'}
      />
    </div>
  )
}

/**
 * Auto-shrinks text until it fits its container. Uses ResizeObserver
 * + a binary-step iteration so the text always lands at the largest
 * size that doesn't overflow the zone.
 */
function FittedText({ text, color, fontFamily, fontWeight, letterSpacing, textAlign }) {
  const containerRef = useRef(null)
  const textRef = useRef(null)
  const [fontSize, setFontSize] = useState(48)

  useEffect(() => {
    const fit = () => {
      const container = containerRef.current
      const text = textRef.current
      if (!container || !text) return
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (cw === 0 || ch === 0) return

      // Start from container height and shrink. Cap at the height
      // since text-leading at very tall sizes blows past the box.
      let size = Math.min(ch * 0.95, cw * 0.4)
      const minSize = 8
      const maxIters = 14
      let iter = 0
      while (iter < maxIters) {
        text.style.fontSize = `${size}px`
        if (text.scrollWidth <= cw && text.scrollHeight <= ch) break
        size = Math.max(minSize, size * 0.88)
        if (size <= minSize) break
        iter++
      }
      setFontSize(size)
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [text])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'inherit' }}
    >
      <span
        ref={textRef}
        style={{
          fontSize: `${fontSize}px`,
          color: color || '#0f172a',
          fontFamily: fontFamily || "'Bebas Neue', sans-serif",
          fontWeight: fontWeight || 800,
          letterSpacing: letterSpacing || 'normal',
          textAlign: textAlign || 'center',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {text}
      </span>
    </div>
  )
}

/**
 * Resolve every slot the composer might render to a concrete value
 * — photo URL, logo URL, name string, etc. Pulls from the saved
 * card record first, then falls through to the player + dynasty
 * for everything that's auto-derived.
 */
function resolveSlotValues({ card, player, dynasty }) {
  const year = card?.year || latestYearForPlayer(player) || dynasty?.currentYear
  const teamTid = resolveTeamForYear(player, dynasty, year)
  const team = teamTid != null ? dynasty?.teams?.[teamTid] : null
  const teamName = team?.name || ''
  const teamLogo = team?.logo || (teamName ? getTeamLogo(teamName, dynasty?.teams) : null)
  const schoolName = teamName ? (stripMascotFromName(teamName) || teamName) : ''

  const cls = player?.classByYear?.[year] || player?.class || ''
  const positionForYear = player?.positionByYear?.[year] || player?.position || ''
  const jersey = player?.jerseyNumber || player?.jersey || ''
  const firstName = (player?.firstName || (player?.name || '').split(' ')[0] || '').toUpperCase()
  const lastName = (player?.lastName || (player?.name || '').split(' ').slice(-1)[0] || '').toUpperCase()
  const fullName = (player?.name || `${player?.firstName || ''} ${player?.lastName || ''}`).trim().toUpperCase()

  return {
    photo: card?.photoUrl || '',
    team_logo: teamLogo || '',
    player_name: fullName,
    first_name: firstName,
    last_name: lastName,
    jersey: jersey ? `#${jersey}` : '',
    position: positionForYear,
    class: cls,
    school: (schoolName || '').toUpperCase(),
    team_full: teamName.toUpperCase(),
    year: year ? String(year) : '',
    label: card?.label || '',
  }
}

function resolveTeamForYear(player, dynasty, year) {
  if (!player || !year) return null
  const yr = Number(year)
  if (Array.isArray(player.teamHistory) && player.teamHistory.length > 0) {
    for (const stint of player.teamHistory) {
      const from = Number(stint.fromYear)
      const to = stint.toYear == null ? Infinity : Number(stint.toYear)
      if (yr >= from && yr <= to) return Number(stint.teamTid)
    }
  }
  if (player.teamsByYear) {
    const t = player.teamsByYear[yr] ?? player.teamsByYear[String(yr)]
    if (t != null) return Number(t)
  }
  return null
}

function latestYearForPlayer(player) {
  if (!player) return null
  const candidates = []
  if (Array.isArray(player.teamHistory)) {
    for (const s of player.teamHistory) {
      if (Number.isFinite(Number(s.toYear))) candidates.push(Number(s.toYear))
      if (Number.isFinite(Number(s.fromYear))) candidates.push(Number(s.fromYear))
    }
  }
  if (player.teamsByYear) {
    for (const k of Object.keys(player.teamsByYear)) {
      const y = Number(k)
      if (Number.isFinite(y)) candidates.push(y)
    }
  }
  if (player.statsByYear) {
    for (const k of Object.keys(player.statsByYear)) {
      const y = Number(k)
      if (Number.isFinite(y)) candidates.push(y)
    }
  }
  return candidates.length === 0 ? null : Math.max(...candidates)
}
