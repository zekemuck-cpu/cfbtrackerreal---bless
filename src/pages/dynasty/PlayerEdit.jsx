import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useDynasty, getPlayerBoxScoreTotals } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { TEAMS, getTidFromAbbr } from '../../data/teamRegistry'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import { useToast } from '../../components/ui/Toast'
import ImageUpload from '../../components/ImageUpload'
import PlayerCards from '../../components/PlayerCards'
import { getPlayerCards } from '../../utils/playerCards'
import { uploadImage } from '../../utils/imageUpload'

// Helper to check if a stint reason indicates a transfer
const isTransferReason = (reason) => ['portal_in', 'transfer', 'juco_in'].includes(reason)

/**
 * PlayerEdit - Full page player editor with polished UI
 * Matches the app's team-colored design language
 */

// Position options
const POSITIONS = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P']

// Class options
const CLASSES = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

// Dev trait options
const DEV_TRAITS = ['Elite', 'Star', 'Impact', 'Normal']

// Transfer portal reasons — the 16 in-game reasons a player can enter the portal.
// Used for both "entered portal, transferred out" and "entered portal, returned (recommit)"
// as well as "encouraged to transfer". Kept in sync with LEAVING_REASONS in sheetsService.js.
const TRANSFER_REASONS = [
  'Playing Time',
  'Playing Style',
  'Proximity to Home',
  'Championship Contender',
  'Program Tradition',
  'Campus Lifestyle',
  'Stadium Atmosphere',
  'Pro Potential',
  'Brand Exposure',
  'Academic Prestige',
  'Conference Prestige',
  'Coach Stability',
  'Coach Prestige',
  'Athletic Facilities'
]

// States
const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']

// Archetype options grouped by position type
const ARCHETYPES = {
  QB: ['Dual Threat', 'Pocket Passer', 'Backfield Creator'],
  HB: ['Backfield Threat', 'Contact Seeker', 'East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'Pure Runner'],
  FB: ['Blocking', 'Utility'],
  WR: ['Contested Specialist', 'Elusive Route Runner', 'Gadget', 'Gritty Possession', 'Physical Route Runner', 'Route Artist', 'Speedster'],
  TE: ['Possession', 'Pure Blocker', 'Pure Possession', 'Vertical Threat'],
  OL: ['Agile', 'Pass Protector', 'Raw Strength', 'Ground and Pound', 'Well Rounded'],
  DL: ['Edge Setter', 'Gap Specialist', 'Power Rusher', 'Pure Power', 'Speed Rusher'],
  LB: ['Lurker', 'Signal Caller', 'Thumper'],
  CB: ['Boundary', 'Bump and Run', 'Field', 'Zone'],
  S: ['Box Specialist', 'Coverage Specialist', 'Hybrid'],
  K: ['Accurate', 'Power'],
  P: ['Accurate', 'Power'],
}

// Award options
// AWARD_OPTIONS — kept in sync with what the app actually tracks:
//   • Honor teams (All-American / All-Conference, 1st/2nd/Freshman) —
//     populated via Dashboard's All-Americans / All-Conference imports.
//   • Offseason individual awards — the same list as the Awards Sheet
//     in src/services/sheetsService.js's AWARDS_LIST and rendered by
//     Awards.jsx's AWARD_DISPLAY map.
//
// Coach awards (Bear Bryant, Broyles) live on the coaching staff
// record, not on player records, so they're intentionally excluded.
const AWARD_OPTIONS = [
  // Honor teams
  { value: 'allAm1st',          label: 'All-American 1st Team',     tier: 'honor' },
  { value: 'allAm2nd',          label: 'All-American 2nd Team',     tier: 'honor' },
  { value: 'allAmFr',           label: 'Freshman All-American',     tier: 'honor' },
  { value: 'allConf1st',        label: 'All-Conference 1st Team',   tier: 'honor' },
  { value: 'allConf2nd',        label: 'All-Conference 2nd Team',   tier: 'honor' },
  { value: 'allConfFr',         label: 'Freshman All-Conference',   tier: 'honor' },

  // Offseason individual awards — order matches Awards.jsx AWARD_ORDER
  // (offense → defense → lineman → special teams).
  { value: 'heisman',           label: 'Heisman Trophy',            tier: 'award' },
  { value: 'maxwell',           label: 'Maxwell Award',             tier: 'award' },
  { value: 'walterCamp',        label: 'Walter Camp Award',         tier: 'award' },
  { value: 'daveyObrien',       label: "Davey O'Brien Award",       tier: 'award' },
  { value: 'doakWalker',        label: 'Doak Walker Award',         tier: 'award' },
  { value: 'fredBiletnikoff',   label: 'Fred Biletnikoff Award',    tier: 'award' },
  { value: 'johnMackey',        label: 'John Mackey Award',         tier: 'award' },
  { value: 'unitasGoldenArm',   label: 'Unitas Golden Arm Award',   tier: 'award' },
  { value: 'chuckBednarik',     label: 'Chuck Bednarik Award',      tier: 'award' },
  { value: 'broncoNagurski',    label: 'Bronco Nagurski Trophy',    tier: 'award' },
  { value: 'jimThorpe',         label: 'Jim Thorpe Award',          tier: 'award' },
  { value: 'dickButkus',        label: 'Dick Butkus Award',         tier: 'award' },
  { value: 'edgeRusherOfTheYear', label: 'Edge Rusher of the Year', tier: 'award' },
  { value: 'outland',           label: 'Outland Trophy',            tier: 'award' },
  { value: 'lombardi',          label: 'Lombardi Award',            tier: 'award' },
  { value: 'rimington',         label: 'Rimington Trophy',          tier: 'award' },
  { value: 'louGroza',          label: 'Lou Groza Award',           tier: 'award' },
  { value: 'rayGuy',            label: 'Ray Guy Award',             tier: 'award' },
  { value: 'returnerOfTheYear', label: 'Returner of the Year',      tier: 'award' },
]

// Convert nested stats structure to flat form fields
const nestedStatsToFlat = (yearStats) => {
  if (!yearStats) return {}
  const passing = yearStats.passing || {}
  const rushing = yearStats.rushing || {}
  const receiving = yearStats.receiving || {}
  const defense = yearStats.defense || {}
  const kicking = yearStats.kicking || {}
  const punting = yearStats.punting || {}
  const kickReturn = yearStats.kickReturn || {}
  const puntReturn = yearStats.puntReturn || {}
  const blocking = yearStats.blocking || {}

  return {
    // Passing
    passComp: passing.cmp ?? passing.comp ?? '',
    passAtt: passing.att ?? '',
    passYds: passing.yds ?? '',
    passTD: passing.td ?? '',
    passInt: passing.int ?? '',
    passLong: passing.lng ?? passing.long ?? '',
    sacked: passing.sacks ?? passing.sacked ?? '',
    // Rushing
    rushAtt: rushing.car ?? rushing.att ?? rushing.carries ?? '',
    rushYds: rushing.yds ?? '',
    rushTD: rushing.td ?? '',
    rushLong: rushing.lng ?? rushing.long ?? '',
    fumbles: rushing.fum ?? rushing.fumbles ?? '',
    // Receiving
    receptions: receiving.rec ?? receiving.receptions ?? '',
    recYds: receiving.yds ?? '',
    recTD: receiving.td ?? '',
    recLong: receiving.lng ?? receiving.long ?? '',
    drops: receiving.drops ?? '',
    // Defense - combine soloTkl + astTkl for display
    tackles: (defense.soloTkl || 0) + (defense.astTkl || 0) || defense.tackles || defense.tkl || '',
    tfl: defense.tfl ?? '',
    sacks: defense.sacks ?? '',
    ints: defense.int ?? defense.ints ?? '',
    pd: defense.pd ?? defense.passDeflections ?? '',
    ff: defense.ff ?? defense.forcedFumbles ?? '',
    fr: defense.fr ?? defense.fumbleRecoveries ?? '',
    defTD: defense.td ?? defense.defTD ?? '',
    // Kicking
    fgm: kicking.fgm ?? '',
    fga: kicking.fga ?? '',
    fgLong: kicking.lng ?? kicking.long ?? '',
    xpm: kicking.xpm ?? '',
    xpa: kicking.xpa ?? '',
    // Punting
    punts: punting.punts ?? '',
    puntYds: punting.yds ?? '',
    puntLong: punting.lng ?? punting.long ?? '',
    puntIn20: punting.in20 ?? '',
    touchbacks: punting.tb ?? punting.touchbacks ?? '',
    // Kick Return
    krRet: kickReturn.ret ?? '',
    krYds: kickReturn.yds ?? '',
    krTD: kickReturn.td ?? '',
    krLong: kickReturn.lng ?? kickReturn.long ?? '',
    // Punt Return
    prRet: puntReturn.ret ?? '',
    prYds: puntReturn.yds ?? '',
    prTD: puntReturn.td ?? '',
    prLong: puntReturn.lng ?? puntReturn.long ?? '',
    // Blocking
    pancakes: blocking.pancakes ?? '',
    sacksAllowed: blocking.sacksAllowed ?? '',
    // General
    gamesPlayed: yearStats.gamesPlayed ?? yearStats.games ?? '',
    snapsPlayed: yearStats.snapsPlayed ?? yearStats.snaps ?? '',
  }
}

// Convert flat form fields back to nested stats structure.
// existingYearStats lets us preserve the solo/ast tackle breakdown when the
// combined tackle input is unchanged — the form only exposes a single combined
// number, so a blind write would zero out astTkl on every defender save.
const flatStatsToNested = (flatStats, existingYearStats = {}) => {
  if (!flatStats) return {}

  const num = (v) => (v !== '' && v !== null && v !== undefined) ? parseInt(v) : undefined
  // numF: allows half-credit decimals (e.g. "1.5") for stats like defensive sacks/TFL.
  // Rounded to one decimal place to avoid float drift.
  const numF = (v) => {
    if (v === '' || v === null || v === undefined) return undefined
    const n = parseFloat(v)
    if (isNaN(n)) return undefined
    return Math.round(n * 10) / 10
  }

  const result = {}

  // Only include categories that have at least one value
  const passing = {}
  if (flatStats.passComp !== '') passing.cmp = num(flatStats.passComp)
  if (flatStats.passAtt !== '') passing.att = num(flatStats.passAtt)
  if (flatStats.passYds !== '') passing.yds = num(flatStats.passYds)
  if (flatStats.passTD !== '') passing.td = num(flatStats.passTD)
  if (flatStats.passInt !== '') passing.int = num(flatStats.passInt)
  if (flatStats.passLong !== '') passing.lng = num(flatStats.passLong)
  if (flatStats.sacked !== '') passing.sacks = num(flatStats.sacked)
  if (Object.keys(passing).length > 0) result.passing = passing

  const rushing = {}
  if (flatStats.rushAtt !== '') rushing.car = num(flatStats.rushAtt)
  if (flatStats.rushYds !== '') rushing.yds = num(flatStats.rushYds)
  if (flatStats.rushTD !== '') rushing.td = num(flatStats.rushTD)
  if (flatStats.rushLong !== '') rushing.lng = num(flatStats.rushLong)
  if (flatStats.fumbles !== '') rushing.fum = num(flatStats.fumbles)
  if (Object.keys(rushing).length > 0) result.rushing = rushing

  const receiving = {}
  if (flatStats.receptions !== '') receiving.rec = num(flatStats.receptions)
  if (flatStats.recYds !== '') receiving.yds = num(flatStats.recYds)
  if (flatStats.recTD !== '') receiving.td = num(flatStats.recTD)
  if (flatStats.recLong !== '') receiving.lng = num(flatStats.recLong)
  if (flatStats.drops !== '') receiving.drops = num(flatStats.drops)
  if (Object.keys(receiving).length > 0) result.receiving = receiving

  const defense = {}
  const existingDefense = existingYearStats.defense || {}
  if (flatStats.tackles !== '') {
    const newTotal = num(flatStats.tackles)
    const existingSolo = existingDefense.soloTkl || 0
    const existingAst = existingDefense.astTkl || 0
    const existingTotal = existingSolo + existingAst
    if (newTotal === existingTotal && existingTotal > 0) {
      defense.soloTkl = existingSolo
      defense.astTkl = existingAst
    } else {
      defense.soloTkl = newTotal
      defense.astTkl = 0
    }
  }
  if (flatStats.tfl !== '') defense.tfl = numF(flatStats.tfl)
  if (flatStats.sacks !== '') defense.sacks = numF(flatStats.sacks)
  if (flatStats.ints !== '') defense.int = num(flatStats.ints)
  if (flatStats.pd !== '') defense.pd = num(flatStats.pd)
  if (flatStats.ff !== '') defense.ff = num(flatStats.ff)
  if (flatStats.fr !== '') defense.fr = num(flatStats.fr)
  if (flatStats.defTD !== '') defense.td = num(flatStats.defTD)
  if (Object.keys(defense).length > 0) result.defense = defense

  const kicking = {}
  if (flatStats.fgm !== '') kicking.fgm = num(flatStats.fgm)
  if (flatStats.fga !== '') kicking.fga = num(flatStats.fga)
  if (flatStats.fgLong !== '') kicking.lng = num(flatStats.fgLong)
  if (flatStats.xpm !== '') kicking.xpm = num(flatStats.xpm)
  if (flatStats.xpa !== '') kicking.xpa = num(flatStats.xpa)
  if (Object.keys(kicking).length > 0) result.kicking = kicking

  const punting = {}
  if (flatStats.punts !== '') punting.punts = num(flatStats.punts)
  if (flatStats.puntYds !== '') punting.yds = num(flatStats.puntYds)
  if (flatStats.puntLong !== '') punting.lng = num(flatStats.puntLong)
  if (flatStats.puntIn20 !== '') punting.in20 = num(flatStats.puntIn20)
  if (flatStats.touchbacks !== '') punting.tb = num(flatStats.touchbacks)
  if (Object.keys(punting).length > 0) result.punting = punting

  const kickReturn = {}
  if (flatStats.krRet !== '') kickReturn.ret = num(flatStats.krRet)
  if (flatStats.krYds !== '') kickReturn.yds = num(flatStats.krYds)
  if (flatStats.krTD !== '') kickReturn.td = num(flatStats.krTD)
  if (flatStats.krLong !== '') kickReturn.lng = num(flatStats.krLong)
  if (Object.keys(kickReturn).length > 0) result.kickReturn = kickReturn

  const puntReturn = {}
  if (flatStats.prRet !== '') puntReturn.ret = num(flatStats.prRet)
  if (flatStats.prYds !== '') puntReturn.yds = num(flatStats.prYds)
  if (flatStats.prTD !== '') puntReturn.td = num(flatStats.prTD)
  if (flatStats.prLong !== '') puntReturn.lng = num(flatStats.prLong)
  if (Object.keys(puntReturn).length > 0) result.puntReturn = puntReturn

  const blocking = {}
  if (flatStats.pancakes !== '') blocking.pancakes = num(flatStats.pancakes)
  if (flatStats.sacksAllowed !== '') blocking.sacksAllowed = num(flatStats.sacksAllowed)
  if (Object.keys(blocking).length > 0) result.blocking = blocking

  // General stats at top level
  if (flatStats.gamesPlayed !== '') result.gamesPlayed = num(flatStats.gamesPlayed)
  if (flatStats.snapsPlayed !== '') result.snapsPlayed = num(flatStats.snapsPlayed)

  return result
}

export default function PlayerEdit() {
  const { id: dynastyId, pid } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { dynasties, currentDynasty, updatePlayer, deletePlayer, isViewOnly } = useDynasty()
  const { toast } = useToast()

  // Get the correct dynasty (handle both direct access and view mode)
  const dynasty = useMemo(() => {
    if (dynastyId) {
      return currentDynasty?.id === dynastyId ? currentDynasty : dynasties?.find(d => d.id === dynastyId)
    }
    return currentDynasty
  }, [dynastyId, currentDynasty, dynasties])

  // Find player - try both string and number pid matching
  const player = useMemo(() => {
    if (!dynasty?.players) return null
    // Try exact match first, then try parseInt for numeric pids
    return dynasty.players.find(p => p.pid === pid) ||
           dynasty.players.find(p => p.pid === parseInt(pid))
  }, [dynasty?.players, pid])

  // Get player's team for colors (not dynasty's current team)
  // Use the most recent year in teamsByYear to correctly reflect transfers
  const currentYear = dynasty?.currentYear
  const playerTeamTid = useMemo(() => {
    if (!player) return null
    const tby = player?.teamsByYear
    if (tby) {
      // First try currentYear
      const currentYearTeam = tby[currentYear] || tby[String(currentYear)]
      if (currentYearTeam) return currentYearTeam
      // Otherwise use the most recent year in teamsByYear
      const years = Object.keys(tby).map(Number).filter(y => !isNaN(y)).sort((a, b) => b - a)
      if (years.length > 0) return tby[years[0]] || tby[String(years[0])]
    }
    return player?.team || dynasty?.currentTid
  }, [player, currentYear, dynasty?.currentTid])

  // Get team info for colors - use player's team, not dynasty's current team
  const playerTeamName = useMemo(() => {
    if (!playerTeamTid) return null
    // playerTeamTid could be a tid (number) or abbr (string)
    return getMascotName(playerTeamTid, dynasty?.teams) || dynasty?.teamName || ''
  }, [playerTeamTid, dynasty?.teams, dynasty?.teamName])

  const teamColors = useTeamColors(playerTeamName, dynasty?.teams)
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // State
  // Honour ?tab=<id> from the URL so deep-links into a specific tab
  // (e.g. the player page's "Trading Card" button → edit?tab=card) land
  // the user there without an extra click.
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'profile'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedStatsYear, setSelectedStatsYear] = useState(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const initializedRef = useRef(null)
  const fileInputRef = useRef(null)

  // Get available years for stats - only years relevant to this player
  const availableYears = useMemo(() => {
    const yearsSet = new Set()

    // Add years where player has stats
    if (player?.statsByYear) {
      Object.keys(player.statsByYear).forEach(year => yearsSet.add(parseInt(year)))
    }

    // Add current year (for adding new stats)
    if (dynasty?.currentYear) yearsSet.add(dynasty.currentYear)

    // Add years from teamsByYear
    if (player?.teamsByYear) {
      Object.keys(player.teamsByYear).forEach(year => yearsSet.add(parseInt(year)))
    }

    return Array.from(yearsSet).sort((a, b) => b - a)
  }, [dynasty, player])

  // Get box score totals for sync comparison
  const boxScoreTotals = useMemo(() => {
    if (!player?.name || !dynasty) return null
    const year = selectedStatsYear || dynasty.currentYear
    return getPlayerBoxScoreTotals(player.name, dynasty.games || [], year)
  }, [player, dynasty, selectedStatsYear])

  // Derive current overall from overallByYear (source of truth)
  const currentOverall = useMemo(() => {
    const byYear = formData.overallByYear || {}
    const currentYear = dynasty?.currentYear || new Date().getFullYear()
    // If current year has an entry (even if null/cleared), respect it
    if (currentYear in byYear) return byYear[currentYear]
    // Fall back to most recent year with an overall
    const years = Object.keys(byYear).map(Number).filter(y => byYear[y]).sort((a, b) => b - a)
    return years.length > 0 ? byYear[years[0]] : formData.overall
  }, [formData.overallByYear, formData.overall, dynasty?.currentYear])

  // Initialize form data when player changes
  useEffect(() => {
    if (!player || initializedRef.current === player.pid) return
    initializedRef.current = player.pid

    // Find the best year to show stats for:
    // 1. Current year if it has stats
    // 2. Most recent year with stats
    // 3. Fall back to current year
    const currentYear = dynasty?.currentYear || new Date().getFullYear()
    let statsYear = currentYear

    if (player.statsByYear) {
      const yearsWithStats = Object.keys(player.statsByYear)
        .map(y => parseInt(y))
        .filter(y => {
          // Check both number and string keys
          const s = player.statsByYear[y] || player.statsByYear[String(y)]
          // Check if this year actually has any stats data
          return s && Object.keys(s).some(k => s[k] !== null && s[k] !== undefined && s[k] !== '')
        })
        .sort((a, b) => b - a) // Most recent first

      if (yearsWithStats.length > 0) {
        // Use current year if it has stats, otherwise most recent year with stats
        statsYear = yearsWithStats.includes(currentYear) ? currentYear : yearsWithStats[0]
      }
    }

    // Check both number and string keys for stats
    const yearStats = player.statsByYear?.[statsYear] || player.statsByYear?.[String(statsYear)] || player.stats || {}

    setFormData({
      // Basic Info
      firstName: player.firstName || player.name?.split(' ')[0] || '',
      lastName: player.lastName || player.name?.split(' ').slice(1).join(' ') || '',
      position: player.position || '',
      year: player.year || '',
      overall: player.overall || '',
      archetype: player.archetype || '',
      jerseyNumber: player.jerseyNumber || '',
      devTrait: player.devTrait || '',
      pictureUrl: player.pictureUrl || '',

      // Highlights — array of URLs (YouTube clips, Imgur albums, direct
      // image links). Stored verbatim so the renderer can auto-detect
      // and embed each provider. Edited via a one-URL-per-line textarea
      // so users can paste a list in one shot.
      highlights: Array.isArray(player.highlights)
        ? player.highlights.filter(Boolean)
        : (typeof player.highlights === 'string'
          ? player.highlights.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
          : []),

      // Trading-card collection — array of card records. Migrated
      // from legacy single-card fields (cardFront/cardBack/cardGameId)
      // on first edit so existing cards aren't lost.
      cards: getPlayerCards(player),

      // Background
      hometown: player.hometown || '',
      state: player.state || player.homeState || '',
      height: player.height || '',
      weight: player.weight || '',

      // Draft
      draftRound: player.draftRound || '',

      // Recruiting Info
      stars: player.stars || '',
      nationalRank: player.nationalRank || '',
      stateRank: player.stateRank || '',
      positionRank: player.positionRank || '',
      gemBust: player.gemBust || '',
      isPortal: player.isPortal || false,
      previousTeam: player.previousTeam || '',
      // Normalize classByYear and teamsByYear keys to numbers
      classByYear: Object.entries(player.classByYear || {}).reduce((acc, [k, v]) => {
        acc[parseInt(k)] = v
        return acc
      }, {}),
      teamsByYear: Object.entries(player.teamsByYear || {}).reduce((acc, [k, v]) => {
        acc[parseInt(k)] = v
        return acc
      }, {}),
      // Normalize overallByYear keys to numbers, fall back to player.overall for current year
      overallByYear: (() => {
        const normalized = Object.entries(player.overallByYear || {}).reduce((acc, [k, v]) => {
          acc[parseInt(k)] = v
          return acc
        }, {})
        // Only inject player.overall for currentYear if the player is actually on a roster that year
        const hasRosterEntry = currentYear && (player.teamsByYear?.[currentYear] || player.teamsByYear?.[String(currentYear)])
        if (player.overall && currentYear && !normalized[currentYear] && hasRosterEntry) {
          normalized[currentYear] = player.overall
        }
        return normalized
      })(),
      devTraitByYear: Object.entries(player.devTraitByYear || {}).reduce((acc, [k, v]) => {
        acc[parseInt(k)] = v
        return acc
      }, {}),
      entryReason: player.entryReason || '',
      movementByYear: Object.entries(player.movementByYear || {}).reduce((acc, [k, v]) => {
        acc[parseInt(k)] = v
        return acc
      }, {}),

      // Awards
      accolades: player.accolades || [],

      // Stats for current year (converted from nested to flat)
      stats: nestedStatsToFlat(yearStats),

      // Notes
      notes: player.notes || '',
    })

    setSelectedStatsYear(statsYear)
  }, [player, dynasty?.currentYear])

  // Helper to get archetypes for current position
  const getArchetypesForPosition = (pos) => {
    if (!pos) return []
    if (['LT', 'LG', 'C', 'RG', 'RT'].includes(pos)) return ARCHETYPES.OL
    if (['LEDG', 'REDG', 'DT'].includes(pos)) return ARCHETYPES.DL
    if (['SAM', 'MIKE', 'WILL'].includes(pos)) return ARCHETYPES.LB
    if (['FS', 'SS'].includes(pos)) return ARCHETYPES.S
    return ARCHETYPES[pos] || []
  }

  // Compress and normalize an image file via canvas (handles HEIC, reduces size)
  const compressImage = (file, maxDimension = 800) => {
    return new Promise((resolve, reject) => {
      setUploadStatus('Reading image...')
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.onload = () => {
        setUploadStatus('Processing image...')
        const img = new Image()
        img.onerror = () => {
          resolve(reader.result.split(',')[1])
        }
        img.onload = () => {
          try {
            setUploadStatus('Compressing...')
            let { width, height } = img
            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width)
                width = maxDimension
              } else {
                width = Math.round((width * maxDimension) / height)
                height = maxDimension
              }
            }

            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, width, height)

            const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
            const base64 = dataUrl.split(',')[1]
            resolve(base64)
          } catch (e) {
            resolve(reader.result.split(',')[1])
          }
        }
        img.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }

  // Compress and upload to Firebase Storage. compressImage returns a
  // base64 string (no data: prefix) — uploadImage handles that input
  // shape and returns a public download URL.
  const uploadToCloud = async (file) => {
    try {
      setUploading(true)
      const base64 = await compressImage(file)
      setUploadStatus('Uploading...')
      const url = await uploadImage(base64)
      setFormData(prev => ({ ...prev, pictureUrl: url }))
      setShowImageUpload(false)
    } catch (error) {
      toast.error('Upload failed: ' + error.message)
    } finally {
      setUploading(false)
      setUploadStatus('')
    }
  }

  // Handle file input change
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (file) await uploadToCloud(file)
  }

  // Handle paste for image upload (in URL input or from clipboard button)
  const handlePaste = async (e) => {
    const items = e?.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) await uploadToCloud(file)
        return
      }
    }
  }

  // Handle paste from clipboard button
  const handlePasteFromClipboard = async () => {
    // Try reading image data from clipboard (works on desktop, limited on iOS)
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type)
              await uploadToCloud(blob)
              return
            }
          }
        }
      }
    } catch (e) {
      // Clipboard.read() failed (common on iOS) - fall through to text fallback
    }

    // Fallback: check if clipboard has a text URL pointing to an image
    try {
      if (navigator.clipboard?.readText) {
        const text = (await navigator.clipboard.readText()).trim()
        if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
          setFormData(prev => ({ ...prev, pictureUrl: text }))
          setShowImageUpload(false)
          return
        }
      }
    } catch (e) {
      // readText also failed
    }

    toast.error('No image found in clipboard. On iOS, tap the URL field above and use Paste from the keyboard instead.')
  }

  // Update overall for a specific year
  const updateOverallForYear = (year, newOverall) => {
    setFormData(prev => ({
      ...prev,
      overallByYear: {
        ...prev.overallByYear,
        [year]: newOverall ? parseInt(newOverall) : null
      }
    }))
  }

  // Add accolade
  const addAccolade = () => {
    setFormData(prev => ({
      ...prev,
      accolades: [...(prev.accolades || []), { year: dynasty?.currentYear || '', award: '' }]
    }))
  }

  // Remove accolade
  const removeAccolade = (index) => {
    setFormData(prev => ({
      ...prev,
      accolades: prev.accolades.filter((_, i) => i !== index)
    }))
  }

  // Update accolade
  const updateAccolade = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      accolades: prev.accolades.map((a, i) => i === index ? { ...a, [field]: value } : a)
    }))
  }

  // Handle save
  const handleSave = (opts) => doSave(
    // Guard: when used as a button onClick, the first arg is a SyntheticEvent;
    // treat that as no-overrides. Only honor a real options object.
    (opts && typeof opts === 'object' && !opts.nativeEvent && !opts.target) ? opts : {}
  )

  const doSave = async ({ cardsOverride, navigateTo } = {}) => {
    if (!player || saving) return
    // Block saves before the form has been seeded for this player — otherwise
    // empty default formData would clobber player fields on an immediate save.
    if (initializedRef.current !== player.pid) return
    setSaving(true)

    const num = (v) => v ? parseInt(v) : null

    // Derive overall from overallByYear (source of truth)
    // Use current year's overall, or most recent year with an overall
    const currentYear = dynasty?.currentYear || new Date().getFullYear()
    const overallFromByYear = (() => {
      const byYear = formData.overallByYear || {}
      // Try current year first
      if (byYear[currentYear]) return num(byYear[currentYear])
      // Fall back to most recent year with an overall
      const years = Object.keys(byYear).map(Number).filter(y => byYear[y]).sort((a, b) => b - a)
      return years.length > 0 ? num(byYear[years[0]]) : num(formData.overall)
    })()

    const cardsSource = cardsOverride !== undefined ? cardsOverride : formData.cards

    const updatedPlayer = {
      ...player,
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
      position: formData.position,
      year: formData.year,
      overall: overallFromByYear, // Derived from overallByYear (source of truth)
      archetype: formData.archetype,
      jerseyNumber: formData.jerseyNumber,
      devTrait: formData.devTrait,
      pictureUrl: formData.pictureUrl,
      // Highlights — persist as a deduped, trimmed array of URLs.
      highlights: Array.isArray(formData.highlights)
        ? Array.from(new Set(formData.highlights.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)))
        : [],
      // New canonical storage — array of card records. Two shapes coexist:
      // legacy (templateId + photoUrl) and prompt-driven (styleId +
      // frontImageUrl/backImageUrl). Prune empty scaffolds under either
      // shape so unsaved blank "Add card" rows don't pile up.
      cards: Array.isArray(cardsSource)
        ? cardsSource.filter(c => {
            if (!c) return false
            if (c.styleId !== undefined && c.templateId === undefined) {
              return !!(c.frontImageUrl || c.backImageUrl)
            }
            return !!(c.photoUrl || c.front || c.back)
          })
        : [],
      // Clear legacy single-card fields once the array is the truth.
      cardFront: '',
      cardBack: '',
      cardGameId: '',
      hometown: formData.hometown,
      state: formData.state,
      height: formData.height,
      weight: num(formData.weight),
      // Recruiting info
      stars: num(formData.stars),
      nationalRank: num(formData.nationalRank),
      stateRank: num(formData.stateRank),
      positionRank: num(formData.positionRank),
      gemBust: formData.gemBust || null,
      isPortal: formData.isPortal || false,
      previousTeam: formData.previousTeam || null,
      classByYear: formData.classByYear || {},
      overallByYear: formData.overallByYear || {},
      teamsByYear: formData.teamsByYear || player.teamsByYear || {},
      devTraitByYear: formData.devTraitByYear || {},
      entryReason: formData.entryReason || null,
      movementByYear: formData.movementByYear || {},
      draftRound: formData.draftRound || null,
      accolades: (formData.accolades || []).filter(a => a.year && a.award),
      notes: formData.notes,
      isHonorOnly: false,
    }

    // Update stats for selected year (convert flat form fields back to nested structure).
    // Field-level merge within each emitted category: the form only exposes a
    // subset of fields per category (e.g. rushing shows car/yds/td/lng/fum but
    // NOT twentyPlus/brokenTackles/yAC, which come from box-score aggregation).
    // A blind category-level replace would zero out those advanced stats every
    // time the user saved the player — the bug that left "20+" stuck at 0.
    // Categories the form didn't touch at all stay untouched.
    const statsYear = selectedStatsYear || dynasty?.currentYear
    if (statsYear) {
      const existingYearStats = player.statsByYear?.[statsYear] || {}
      const emittedCategories = flatStatsToNested(formData.stats, existingYearStats)
      const mergedCategories = {}
      for (const [cat, fields] of Object.entries(emittedCategories)) {
        mergedCategories[cat] = { ...(existingYearStats[cat] || {}), ...fields }
      }
      updatedPlayer.statsByYear = {
        ...player.statsByYear,
        [statsYear]: {
          ...existingYearStats,
          ...mergedCategories,
        }
      }
    }

    try {
      // Use dynastyId from URL params, or fall back to dynasty.id
      const targetDynastyId = dynastyId || dynasty?.id
      await updatePlayer(targetDynastyId, updatedPlayer)
      navigate(navigateTo || `${pathPrefix}/player/${pid}`)
    } catch (error) {
      console.error('Error saving player:', error)
    } finally {
      setSaving(false)
    }
  }

  // Card-modal save short-circuit: persist the player with the new card
  // list and drop the user on the player page's Cards tab. Saves them a
  // second click on the page-level "Save Changes" button.
  const handleCommitCardsAndNavigate = (nextCards) =>
    doSave({
      cardsOverride: nextCards,
      navigateTo: `${pathPrefix}/player/${pid}?tab=card`,
    })

  // Handle cancel
  const handleCancel = () => {
    navigate(`${pathPrefix}/player/${pid}`)
  }

  // Handle delete — permanent, no recovery
  const handleDelete = async () => {
    if (!player || deleting) return
    setDeleting(true)
    try {
      await deletePlayer(dynasty.id, player.pid)
      navigate(`${pathPrefix}/players`)
    } catch (err) {
      console.error('Failed to delete player:', err)
      setDeleting(false)
    }
  }

  // Loading state
  if (!dynasty) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-txt-muted">Loading...</div>
      </div>
    )
  }

  // Player not found
  if (!player) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-red-800 mb-2">Player Not Found</h2>
          <p className="text-red-600 mb-4">The player you're looking for doesn't exist.</p>
          <Link to={`${pathPrefix}/players`} className="text-red-600 hover:underline">
            Back to Players
          </Link>
        </div>
      </div>
    )
  }

  // View only mode
  if (isViewOnly) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div
          className="rounded-xl p-6 text-center"
          style={{ backgroundColor: 'var(--surface-2)', borderLeft: '3px solid var(--accent-warning)' }}
        >
          <h2 className="display-md text-txt-primary m-0 mb-2">View Only Mode</h2>
          <p className="text-txt-secondary mb-4 m-0">You cannot edit players in view-only mode.</p>
          <Link to={`${pathPrefix}/player/${pid}`} className="text-sm underline" style={{ color: 'var(--team-primary)' }}>
            Back to Player
          </Link>
        </div>
      </div>
    )
  }

  // Get team logo using tid
  const teamLogo = getTeamLogoByTid(playerTeamTid, dynasty?.teams)

  // Tab configuration
  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'career', label: 'Career' },
    { id: 'stats', label: 'Stats' },
    { id: 'awards', label: 'Awards' },
    { id: 'card', label: 'Card' },
  ]

  return (
    <div className="min-h-dvh pb-24 -mx-4 sm:-mx-6 lg:-mx-8 -my-4 sm:-my-6">
      {/* Header */}
      <div
        className="sticky top-0 z-30 bg-surface-2 border-b border-surface-4 shadow-lg"
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center gap-5">
            {/* Player Image or Placeholder - Clickable to edit */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowImageUpload(!showImageUpload)}
                className="w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden group"
                style={{
                  backgroundColor: 'var(--surface-3)',
                  border: `2px solid ${teamColors.primary}`
                }}
              >
                {formData.pictureUrl ? (
                  <img
                    src={formData.pictureUrl}
                    alt={player.name}
                    className="w-full h-full object-cover group-hover:opacity-70 transition-opacity"
                  />
                ) : (
                  <span
                    className="text-2xl font-bold text-txt-tertiary"
                  >
                    {(formData.firstName?.[0] || '') + (formData.lastName?.[0] || '')}
                  </span>
                )}
                {/* Edit overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </button>

              {/* Image Upload Dropdown */}
              {showImageUpload && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowImageUpload(false)} />
                  <div className="absolute top-full left-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] card-elevated z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-txt-primary">Player Photo</h4>
                      <button aria-label="Close"
                        type="button"
                        onClick={() => setShowImageUpload(false)}
                        className="text-txt-muted hover:text-txt-tertiary"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* URL Input */}
                    <input
                      type="text"
                      value={formData.pictureUrl || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, pictureUrl: e.target.value }))}
                      onPaste={handlePaste}
                      placeholder="Paste image URL or Ctrl+V to paste image..."
                      className="w-full px-3 py-2 text-sm border border-surface-4 rounded-lg focus:outline-none focus:border-blue-400 mb-3"
                    />

                    {/* Action Buttons */}
                    <div className="flex gap-2 mb-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex-1 px-3 py-2 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        disabled={uploading}
                        className="flex-1 px-3 py-2 text-xs font-medium bg-surface-3 text-txt-secondary rounded-lg hover:bg-surface-4 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Paste
                      </button>
                    </div>

                    {/* Remove button */}
                    {formData.pictureUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, pictureUrl: '' }))
                          setShowImageUpload(false)
                        }}
                        className="w-full px-3 py-2 text-xs font-medium text-red-400 bg-surface-3 border border-surface-4 rounded-lg hover:bg-surface-4 hover:text-red-300 transition-colors flex items-center justify-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove Photo
                      </button>
                    )}

                    {uploading && (
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-blue-600">{uploadStatus || 'Uploading...'}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <div className="label-xs text-txt-tertiary mb-1">Edit Player</div>
              <h1 className="display-md text-txt-primary truncate m-0 leading-tight">
                {formData.firstName} {formData.lastName}
              </h1>
              <div className="flex items-center gap-2 mt-1.5">
                {teamLogo && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-3"
                    style={{ padding: '2px' }}
                  >
                    <img src={teamLogo} alt="" className="w-full h-full object-contain" />
                  </div>
                )}
                <span className="text-sm font-medium text-txt-secondary tabular-nums">
                  #{formData.jerseyNumber || '?'} · {formData.position || 'N/A'} · {formData.year || 'N/A'}
                </span>
                {currentOverall && (
                  <span
                    className="px-2 py-0.5 rounded-md text-xs font-bold tabular-nums"
                    style={{
                      backgroundColor: `${teamColors.primary}22`,
                      color: 'var(--text-primary)',
                      border: `1px solid ${teamColors.primary}55`
                    }}
                  >
                    {currentOverall} OVR
                  </span>
                )}
              </div>
            </div>

            {/* Header Actions */}
            {!isViewOnly && (
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting || saving}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-surface-3 border border-surface-4 text-red-400 hover:bg-surface-4 hover:text-red-300 disabled:opacity-50 transition-colors"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving || deleting}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || deleting}
                  className="px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: teamColors.primary, color: primaryText }}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          {/* Tabs - editorial underline */}
          <div className="flex mt-4 -mb-px overflow-x-auto no-scrollbar border-b border-surface-4">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-4 py-2.5 label-sm whitespace-nowrap transition-colors ${isActive ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'}`}
                >
                  {tab.label}
                  {isActive && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ backgroundColor: teamColors.primary }} />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-4">

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            {/* Basic Info Card */}
            <div className="card">
              <div className="px-5 py-3 border-b border-surface-4 bg-surface-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Basic Information
                </h2>
              </div>

              <div className="p-5 space-y-4">
                {/* Name Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="Smith"
                    />
                  </div>
                </div>

                {/* Position, Class, Jersey, OVR Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Position
                    </label>
                    <select
                      value={formData.position || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value, archetype: '' }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="">--</option>
                      {POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Class
                    </label>
                    <select
                      value={formData.year || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="">--</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Jersey #
                    </label>
                    <input
                      type="text"
                      value={formData.jerseyNumber || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, jerseyNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Overall
                    </label>
                    <input
                      type="number"
                      min="40"
                      max="99"
                      value={currentOverall ?? ''}
                      onChange={(e) => {
                        const value = e.target.value ? parseInt(e.target.value) : null
                        const year = dynasty?.currentYear || new Date().getFullYear()
                        updateOverallForYear(year, value)
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary font-bold text-center"
                      placeholder="--"
                    />
                  </div>
                </div>

                {/* Archetype, Dev Trait Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Archetype
                    </label>
                    <select
                      value={formData.archetype || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, archetype: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                      disabled={!formData.position}
                    >
                      <option value="">Select archetype</option>
                      {getArchetypesForPosition(formData.position).map(arch => (
                        <option key={arch} value={arch}>{arch}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Dev Trait
                    </label>
                    <select
                      value={formData.devTrait || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, devTrait: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="">Select trait</option>
                      {DEV_TRAITS.map(trait => (
                        <option key={trait} value={trait}>{trait}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Card */}
            <div className="card">
              <div className="px-5 py-3 border-b border-surface-4 bg-surface-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Background
                </h2>
              </div>

              <div className="p-5 space-y-4">
                {/* Hometown Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Hometown
                    </label>
                    <input
                      type="text"
                      value={formData.hometown || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, hometown: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="Dallas"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      State
                    </label>
                    <select
                      value={formData.state || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="">Select state</option>
                      {STATES.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Physical Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Height
                    </label>
                    <input
                      type="text"
                      value={formData.height || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="6'2&quot;"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Weight (lbs)
                    </label>
                    <input
                      type="number"
                      value={formData.weight || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="220"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Card */}
            <div
              className="card"
            >
              <div className="px-5 py-3 border-b border-surface-4 bg-surface-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Notes
                </h2>
              </div>

              <div className="p-5">
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary resize-none"
                  placeholder="Add notes about this player..."
                />
              </div>
            </div>

            {/* Highlights — paste any mix of YouTube clips, Imgur albums,
                or direct image URLs (one per line). The Player profile
                renders a "Highlights" tab that auto-embeds each link. */}
            <div className="bg-surface-2 rounded-xl border border-surface-4 overflow-hidden">
              <div className="px-5 py-3 bg-surface-1 border-b border-surface-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Highlights
                </h2>
                <p className="mt-1 text-xs text-txt-tertiary">
                  One URL per line — YouTube clips, Imgur albums, or direct image links. They'll auto-embed on the Highlights tab of the player page.
                </p>
              </div>
              <div className="p-5">
                <textarea
                  value={(formData.highlights || []).join('\n')}
                  onChange={(e) => {
                    const lines = e.target.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
                    setFormData(prev => ({ ...prev, highlights: lines }))
                  }}
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary resize-none font-mono text-xs"
                  placeholder={`https://youtu.be/abc123\nhttps://imgur.com/a/xyz789\nhttps://i.imgur.com/clip.mp4`}
                />
                {(formData.highlights || []).length > 0 && (
                  <div className="mt-2 text-[11px] tabular-nums text-txt-tertiary">
                    {(formData.highlights || []).length} highlight{(formData.highlights || []).length === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Career Tab */}
        {activeTab === 'career' && (
          <div className="space-y-4">

            {/* Season-by-Season History */}
            {(() => {
              const teams = dynasty?.teams || TEAMS
              const dynCurrentYear = dynasty?.currentYear || new Date().getFullYear()

              // Build sorted team list for dropdown
              const teamOptions = Object.entries(teams)
                .filter(([, t]) => t && t.name)
                .map(([tid, t]) => ({ tid: Number(tid), name: t.name }))
                .sort((a, b) => a.name.localeCompare(b.name))

              // Collect all years from per-year data
              const yearsSet = new Set()
              Object.keys(formData.teamsByYear || {}).forEach(y => yearsSet.add(Number(y)))
              Object.keys(formData.classByYear || {}).forEach(y => yearsSet.add(Number(y)))
              Object.keys(formData.overallByYear || {}).forEach(y => yearsSet.add(Number(y)))
              Object.keys(formData.devTraitByYear || {}).forEach(y => yearsSet.add(Number(y)))
              const activeYears = Array.from(yearsSet).filter(y => !isNaN(y)).sort((a, b) => a - b)

              const updateYearField = (field, year, value) => {
                setFormData(prev => ({
                  ...prev,
                  [field]: { ...(prev[field] || {}), [year]: value }
                }))
              }

              const removeYear = (year) => {
                setFormData(prev => {
                  const next = { ...prev }
                  const removeFromObj = (obj) => {
                    if (!obj) return {}
                    const copy = { ...obj }
                    delete copy[year]
                    delete copy[String(year)]
                    return copy
                  }
                  next.teamsByYear = removeFromObj(prev.teamsByYear)
                  next.classByYear = removeFromObj(prev.classByYear)
                  next.overallByYear = removeFromObj(prev.overallByYear)
                  next.devTraitByYear = removeFromObj(prev.devTraitByYear)
                  next.movementByYear = removeFromObj(prev.movementByYear)
                  return next
                })
              }

              const addYear = () => {
                const nextYear = activeYears.length > 0
                  ? Math.max(...activeYears) + 1
                  : dynCurrentYear
                const lastYear = activeYears.length > 0 ? activeYears[activeYears.length - 1] : null
                setFormData(prev => ({
                  ...prev,
                  teamsByYear: {
                    ...(prev.teamsByYear || {}),
                    [nextYear]: lastYear ? (prev.teamsByYear?.[lastYear] || '') : (dynasty?.currentTid || '')
                  },
                  classByYear: { ...(prev.classByYear || {}), [nextYear]: '' },
                  overallByYear: { ...(prev.overallByYear || {}), [nextYear]: '' },
                  devTraitByYear: { ...(prev.devTraitByYear || {}), [nextYear]: '' },
                }))
              }

              const changeYear = (oldYear, newYear) => {
                if (newYear === oldYear || isNaN(newYear)) return
                // Don't allow duplicate years
                if (activeYears.includes(newYear)) return
                setFormData(prev => {
                  const next = { ...prev }
                  const fields = ['teamsByYear', 'classByYear', 'overallByYear', 'devTraitByYear', 'movementByYear']
                  fields.forEach(f => {
                    if (next[f]) {
                      const copy = { ...next[f] }
                      copy[newYear] = copy[oldYear]
                      delete copy[oldYear]
                      delete copy[String(oldYear)]
                      next[f] = copy
                    }
                  })
                  return next
                })
              }

              const getOvrChange = (year, idx) => {
                if (idx === 0) return null
                const prevYears = activeYears.slice(0, idx).reverse()
                for (const py of prevYears) {
                  const prevOvr = formData.overallByYear?.[py]
                  const curOvr = formData.overallByYear?.[year]
                  if (prevOvr && curOvr) return parseInt(curOvr) - parseInt(prevOvr)
                }
                return null
              }

              const updateMovement = (year, patch) => {
                setFormData(prev => {
                  const next = { ...prev }
                  const movements = { ...(prev.movementByYear || {}) }
                  const current = movements[year] || movements[String(year)] || {}
                  const merged = { ...current, ...patch }
                  if (!merged.type) {
                    delete movements[year]
                    delete movements[String(year)]
                  } else {
                    // Drop fields that don't apply to the current type.
                    // `transferred_out` (origin: Players Leaving sheet) carries
                    // both a destination tid and a portal reason — preserve both.
                    const toTeamTypes = ['encouraged_to_transfer', 'transferred_out']
                    if (!toTeamTypes.includes(merged.type)) {
                      delete merged.toTeamTid
                    }
                    const reasonTypes = ['entered_portal', 'encouraged_to_transfer', 'transferred_out']
                    if (!reasonTypes.includes(merged.type)) {
                      delete merged.reason
                    }
                    movements[year] = merged
                  }
                  next.movementByYear = movements
                  // Auto-populate next season's team if forced out to a specific school
                  if (merged.type === 'encouraged_to_transfer' && merged.toTeamTid) {
                    const yearIdx = activeYears.indexOf(year)
                    if (yearIdx >= 0 && yearIdx < activeYears.length - 1) {
                      const nextYear = activeYears[yearIdx + 1]
                      next.teamsByYear = { ...(prev.teamsByYear || {}), [nextYear]: Number(merged.toTeamTid) }
                    }
                  }
                  return next
                })
              }

              // Map both LEGACY types and CANONICAL v2 shapes onto the
              // legacy enum the dropdown uses. Without this branch,
              // canonical entries (m.type === 'departure' /
              // 'recommit' / 'arrival', with the variant in
              // m.departure / m.arrival) wouldn't match any dropdown
              // option, so the dropdown read empty even when the
              // player had a saved movement for that year.
              const normalizeMovementType = (t, m) => {
                // Canonical v2 shapes — pull the variant out of the
                // movement object and map it to the closest legacy enum
                // the dropdown understands.
                if (t === 'departure' && m) {
                  if (m.departure === 'graduated') return 'graduated'
                  if (m.departure === 'pro_draft') return 'declared_for_draft'
                  if (m.departure === 'transfer_out') return 'entered_portal'
                  return 'entered_portal'
                }
                if (t === 'recommit') return 'entered_portal'
                if (t === 'arrival') return ''
                if (t === 'transferred_out' || t === 'recommitted') return 'entered_portal'
                return t
              }

              // Connector component for entry/movement between seasons
              const TransitionConnector = ({ year, isEntry }) => {
                if (isEntry) {
                  const val = formData.entryReason || ''
                  return (
                    <div className="flex items-center gap-1.5 px-4 py-1 group">
                      <div className="flex-1 border-t border-dashed border-surface-4 group-hover:border-surface-4 transition-colors"></div>
                      <select
                        value={val}
                        onChange={(e) => setFormData(prev => ({ ...prev, entryReason: e.target.value }))}
                        className={`text-[10px] bg-transparent border-none focus:outline-none cursor-pointer px-1 py-0 rounded hover:bg-surface-3 transition-colors ${val ? 'text-txt-tertiary font-medium' : 'text-txt-muted'}`}
                      >
                        <option value="">—</option>
                        <option value="recruited">Recruited</option>
                        <option value="transfer_in">Transferred In</option>
                        <option value="walk_on">Walk-On</option>
                        <option value="juco_in">JUCO Transfer</option>
                        <option value="created">Created</option>
                      </select>
                      {val === 'transfer_in' && (
                        <>
                          <span className="text-[10px] text-txt-muted">from</span>
                          <select
                            value={formData.previousTeam || ''}
                            onChange={(e) => {
                              const prevTid = e.target.value ? Number(e.target.value) : ''
                              setFormData(prev => {
                                const next = { ...prev, previousTeam: prevTid, isPortal: !!prevTid }
                                // Auto-backfill a prior-year row so the player's career shows A → B
                                if (prevTid && activeYears.length > 0) {
                                  const firstYear = activeYears[0]
                                  const priorYear = firstYear - 1
                                  if (!activeYears.includes(priorYear)) {
                                    next.teamsByYear = { ...(prev.teamsByYear || {}), [priorYear]: prevTid }
                                    next.classByYear = { ...(prev.classByYear || {}), [priorYear]: '' }
                                    next.overallByYear = { ...(prev.overallByYear || {}), [priorYear]: '' }
                                    next.devTraitByYear = { ...(prev.devTraitByYear || {}), [priorYear]: '' }
                                    const curTeamTid = prev.teamsByYear?.[firstYear] || dynasty?.currentTid
                                    next.movementByYear = {
                                      ...(prev.movementByYear || {}),
                                      [priorYear]: { type: 'transferred_out', toTeamTid: curTeamTid ? Number(curTeamTid) : null }
                                    }
                                  }
                                }
                                return next
                              })
                            }}
                            className="text-[10px] text-txt-muted bg-transparent border-none focus:outline-none cursor-pointer px-1 py-0 rounded hover:bg-surface-3"
                          >
                            <option value="">Team...</option>
                            {teamOptions.map(t => <option key={t.tid} value={t.tid}>{t.name}</option>)}
                          </select>
                        </>
                      )}
                      <div className="flex-1 border-t border-dashed border-surface-4 group-hover:border-surface-4 transition-colors"></div>
                    </div>
                  )
                }

                // Movement after a season
                const movement = formData.movementByYear?.[year] || formData.movementByYear?.[String(year)] || {}
                const rawType = movement.type || ''
                const movementType = normalizeMovementType(rawType, movement)
                // Canonical 'departure/transfer_out' uses .toTid; legacy
                // 'transferred_out'/'encouraged_to_transfer' uses
                // .toTeamTid. Read both so the dropdown shows the
                // destination regardless of which shape is stored.
                const toTeamTid = movement.toTeamTid ?? movement.toTid ?? ''
                const reason = movement.reason || ''
                const needsTeam = movementType === 'encouraged_to_transfer'
                const showsPortalReason = ['entered_portal', 'encouraged_to_transfer'].includes(movementType)

                return (
                  <div className="flex flex-wrap items-center gap-1.5 px-4 py-1 group">
                    <div className="flex-1 min-w-[20px] border-t border-dashed border-surface-4 group-hover:border-surface-4 transition-colors"></div>
                    <select
                      value={movementType}
                      onChange={(e) => updateMovement(year, { type: e.target.value })}
                      className={`text-[10px] bg-transparent border-none focus:outline-none cursor-pointer px-1 py-0 rounded hover:bg-surface-3 transition-colors ${movementType ? 'text-txt-tertiary font-medium' : 'text-txt-muted'}`}
                    >
                      <option value="">—</option>
                      <option value="entered_portal">Entered Portal</option>
                      <option value="encouraged_to_transfer">Encouraged to Transfer</option>
                      <option value="declared_for_draft">Declared for Draft</option>
                      <option value="graduated">Graduated</option>
                    </select>
                    {needsTeam && (
                      <>
                        <span className="text-[10px] text-txt-muted">to</span>
                        <select
                          value={toTeamTid}
                          onChange={(e) => updateMovement(year, { toTeamTid: e.target.value ? Number(e.target.value) : null })}
                          className="text-[10px] text-txt-muted bg-transparent border-none focus:outline-none cursor-pointer px-1 py-0 rounded hover:bg-surface-3"
                        >
                          <option value="">Team...</option>
                          {teamOptions.map(t => <option key={t.tid} value={t.tid}>{t.name}</option>)}
                        </select>
                      </>
                    )}
                    {showsPortalReason && (
                      <>
                        <span className="text-[10px] text-txt-muted">·</span>
                        <select
                          value={reason}
                          onChange={(e) => updateMovement(year, { reason: e.target.value })}
                          className={`text-[10px] bg-transparent border-none focus:outline-none cursor-pointer px-1 py-0 rounded hover:bg-surface-3 ${reason ? 'text-txt-tertiary' : 'text-txt-muted'}`}
                        >
                          <option value="">Reason...</option>
                          {TRANSFER_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </>
                    )}
                    {movementType === 'declared_for_draft' && (
                      <>
                        <span className="text-[10px] text-txt-muted">Rd</span>
                        <select
                          value={formData.draftRound || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, draftRound: e.target.value }))}
                          className={`text-[10px] bg-transparent border-none focus:outline-none cursor-pointer px-1 py-0 rounded hover:bg-surface-3 ${formData.draftRound ? 'text-txt-tertiary font-medium' : 'text-txt-muted'}`}
                        >
                          <option value="">--</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                          <option value="6">6</option>
                          <option value="7">7</option>
                          <option value="UDFA">UDFA</option>
                        </select>
                      </>
                    )}
                    <div className="flex-1 border-t border-dashed border-surface-4 group-hover:border-surface-4 transition-colors"></div>
                  </div>
                )
              }

              return (
                <div className="card">
                  <div className="px-5 py-3 border-b border-surface-4 bg-surface-3 flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                      Season History
                    </h2>
                    <button
                      type="button"
                      onClick={addYear}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      style={{ backgroundColor: teamColors.primary + '20', color: teamColors.primary }}
                    >
                      + Add Season
                    </button>
                  </div>

                  {activeYears.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-txt-muted text-sm mb-3">No seasons recorded yet</p>
                      <button
                        type="button"
                        onClick={addYear}
                        className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        style={{ backgroundColor: teamColors.primary, color: primaryText }}
                      >
                        Add First Season
                      </button>
                    </div>
                  ) : (
                    <div>
                      {/* Entry reason connector */}
                      <TransitionConnector isEntry />

                      {/* Desktop header */}
                      <div className="hidden sm:grid grid-cols-[68px_1fr_100px_70px_100px_36px] gap-2 px-4 py-2 border-b border-surface-4 bg-surface-3/50">
                        <span className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Year</span>
                        <span className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Team</span>
                        <span className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Class</span>
                        <span className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">OVR</span>
                        <span className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Dev Trait</span>
                        <span></span>
                      </div>

                      {activeYears.map((year, idx) => {
                        const teamTid = formData.teamsByYear?.[year]
                        const playerClass = formData.classByYear?.[year] || ''
                        const ovr = formData.overallByYear?.[year] ?? ''
                        const devTrait = formData.devTraitByYear?.[year] || ''
                        const ovrChange = getOvrChange(year, idx)
                        const teamName = teamTid ? getMascotName(teamTid, teams) : null
                        const logoUrl = teamTid ? getTeamLogoByTid(teamTid, teams) : null

                        // Derive a "how did they get here this year" status chip
                        const prevYear = idx > 0 ? activeYears[idx - 1] : null
                        const prevMovement = prevYear ? (formData.movementByYear?.[prevYear] || formData.movementByYear?.[String(prevYear)] || {}) : null
                        const prevType = normalizeMovementType(prevMovement?.type, prevMovement)
                        const prevTeamTid = prevYear ? formData.teamsByYear?.[prevYear] : null
                        const sameTeamAsPrev = prevTeamTid && teamTid && Number(prevTeamTid) === Number(teamTid)
                        const statusChip = (() => {
                          if (idx === 0) {
                            const er = formData.entryReason
                            if (er === 'recruited') return { text: 'Recruited', color: '#22c55e' }
                            if (er === 'transfer_in') {
                              const prevTid = formData.previousTeam
                              const prevName = prevTid ? getMascotName(prevTid, teams) : null
                              return { text: prevName ? `Portal from ${prevName}` : 'Portal Transfer', color: '#3b82f6' }
                            }
                            if (er === 'juco_in') return { text: 'JUCO Transfer', color: '#3b82f6' }
                            if (er === 'walk_on') return { text: 'Walk-On', color: '#a78bfa' }
                            if (er === 'created') return { text: 'Created', color: '#6b7280' }
                            return null
                          }
                          if (prevType === 'entered_portal') {
                            if (sameTeamAsPrev) return { text: 'Returned from Portal', color: '#8b5cf6' }
                            const prevName = prevTeamTid ? getMascotName(prevTeamTid, teams) : null
                            return { text: prevName ? `Portal from ${prevName}` : 'Portal Transfer In', color: '#3b82f6' }
                          }
                          if (prevType === 'encouraged_to_transfer' && prevTeamTid) {
                            const prevName = getMascotName(prevTeamTid, teams)
                            return { text: prevName ? `Transferred from ${prevName}` : 'Transferred In', color: '#3b82f6' }
                          }
                          return { text: 'Returning', color: '#22c55e' }
                        })()

                        // Post-season exit chip — for portal, infer outcome from next year's team
                        const curMovement = formData.movementByYear?.[year] || formData.movementByYear?.[String(year)] || {}
                        const curType = normalizeMovementType(curMovement.type, curMovement)
                        const nextYear = idx < activeYears.length - 1 ? activeYears[idx + 1] : null
                        const nextTeamTid = nextYear ? formData.teamsByYear?.[nextYear] : null
                        const sameTeamAsNext = teamTid && nextTeamTid && Number(teamTid) === Number(nextTeamTid)
                        const exitChip = (() => {
                          if (curType === 'entered_portal') {
                            if (!nextYear) return { text: 'Entered Portal', color: '#f59e0b', reason: curMovement.reason }
                            if (sameTeamAsNext) return { text: 'Entered Portal · Returned', color: '#8b5cf6', reason: curMovement.reason }
                            const toName = nextTeamTid ? getMascotName(nextTeamTid, teams) : null
                            return { text: toName ? `Entered Portal → ${toName}` : 'Entered Portal · Transferred', color: '#f59e0b', reason: curMovement.reason }
                          }
                          if (curType === 'encouraged_to_transfer') {
                            const toName = curMovement.toTeamTid ? getMascotName(curMovement.toTeamTid, teams) : null
                            return { text: toName ? `Encouraged Out → ${toName}` : 'Encouraged Out', color: '#f59e0b', reason: curMovement.reason }
                          }
                          if (curType === 'declared_for_draft') {
                            return { text: curMovement.draftRound ? `Draft · Rd ${curMovement.draftRound}` : 'Declared for Draft', color: '#ef4444' }
                          }
                          if (curType === 'graduated') {
                            return { text: 'Graduated', color: '#ef4444' }
                          }
                          return null
                        })()

                        return (
                          <div key={year} className="border-b border-surface-4 last:border-b-0">
                            {/* Desktop row */}
                            <div className="hidden sm:grid grid-cols-[68px_1fr_100px_70px_100px_36px] gap-2 px-4 py-2.5 items-center hover:bg-surface-2/50">
                              <input
                                type="number"
                                value={year}
                                onChange={(e) => {
                                  const newYear = parseInt(e.target.value)
                                  if (newYear && newYear > 1900 && newYear < 2100) changeYear(year, newYear)
                                }}
                                className="w-full px-1 py-1.5 text-sm font-bold rounded-lg border border-transparent hover:border-surface-4 focus:border-blue-500 focus:outline-none text-txt-primary text-center bg-transparent"
                              />
                              <select
                                value={teamTid || ''}
                                onChange={(e) => updateYearField('teamsByYear', year, e.target.value ? Number(e.target.value) : '')}
                                className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none bg-surface-2 text-txt-primary"
                              >
                                <option value="">--</option>
                                {teamOptions.map(t => (
                                  <option key={t.tid} value={t.tid}>{t.name}</option>
                                ))}
                              </select>
                              <select
                                value={playerClass}
                                onChange={(e) => updateYearField('classByYear', year, e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none bg-surface-2 text-txt-primary"
                              >
                                <option value="">--</option>
                                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <div className="relative flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="99"
                                  value={ovr}
                                  onChange={(e) => updateYearField('overallByYear', year, e.target.value ? parseInt(e.target.value) : '')}
                                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none text-txt-primary text-center"
                                  placeholder="--"
                                />
                                {ovrChange !== null && ovrChange !== 0 && (
                                  <span
                                    className="absolute -top-2 -right-1 text-[10px] font-bold px-1 rounded"
                                    style={{
                                      backgroundColor: ovrChange > 0 ? '#dcfce7' : '#fee2e2',
                                      color: ovrChange > 0 ? '#16a34a' : '#dc2626'
                                    }}
                                  >
                                    {ovrChange > 0 ? '+' : ''}{ovrChange}
                                  </span>
                                )}
                              </div>
                              <select
                                value={devTrait}
                                onChange={(e) => updateYearField('devTraitByYear', year, e.target.value)}
                                className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none bg-surface-2 text-txt-primary"
                              >
                                <option value="">--</option>
                                {DEV_TRAITS.map(d => <option key={d} value={d}>{d}</option>)}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeYear(year)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>

                            {/* Desktop chip strip */}
                            {(statusChip || exitChip) && (
                              <div className="hidden sm:flex items-center gap-2 px-4 pb-2 -mt-1 flex-wrap">
                                {statusChip && (
                                  <span
                                    className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded"
                                    style={{ backgroundColor: `${statusChip.color}22`, color: statusChip.color, border: `1px solid ${statusChip.color}44` }}
                                  >
                                    {statusChip.text}
                                  </span>
                                )}
                                {exitChip && (
                                  <>
                                    <span className="text-txt-muted text-[10px]">→ end of season</span>
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded"
                                      style={{ backgroundColor: `${exitChip.color}22`, color: exitChip.color, border: `1px solid ${exitChip.color}44` }}
                                    >
                                      {exitChip.text}
                                      {exitChip.reason && <span className="italic font-normal opacity-80">· {exitChip.reason}</span>}
                                    </span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Mobile card */}
                            <div className="sm:hidden px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={year}
                                    onChange={(e) => {
                                      const newYear = parseInt(e.target.value)
                                      if (newYear && newYear > 1900 && newYear < 2100) changeYear(year, newYear)
                                    }}
                                    className="w-16 px-1 py-0.5 font-bold text-txt-primary rounded-lg border border-transparent hover:border-surface-4 focus:border-blue-500 focus:outline-none text-center bg-transparent"
                                  />
                                  {logoUrl && (
                                    <img src={logoUrl} alt="" className="w-5 h-5 object-contain" />
                                  )}
                                  {teamName && <span className="text-xs text-txt-muted">{teamName}</span>}
                                  {ovrChange !== null && ovrChange !== 0 && (
                                    <span
                                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                      style={{
                                        backgroundColor: ovrChange > 0 ? '#dcfce7' : '#fee2e2',
                                        color: ovrChange > 0 ? '#16a34a' : '#dc2626'
                                      }}
                                    >
                                      {ovrChange > 0 ? '+' : ''}{ovrChange}
                                    </span>
                                  )}
                                </div>
                                <button aria-label="Close"
                                  type="button"
                                  onClick={() => removeYear(year)}
                                  className="text-txt-muted hover:text-red-500 p-1"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-txt-muted uppercase mb-0.5">Team</label>
                                  <select
                                    value={teamTid || ''}
                                    onChange={(e) => updateYearField('teamsByYear', year, e.target.value ? Number(e.target.value) : '')}
                                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none bg-surface-2 text-txt-primary"
                                  >
                                    <option value="">--</option>
                                    {teamOptions.map(t => (
                                      <option key={t.tid} value={t.tid}>{t.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-txt-muted uppercase mb-0.5">Class</label>
                                  <select
                                    value={playerClass}
                                    onChange={(e) => updateYearField('classByYear', year, e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none bg-surface-2 text-txt-primary"
                                  >
                                    <option value="">--</option>
                                    {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-txt-muted uppercase mb-0.5">OVR</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="99"
                                    value={ovr}
                                    onChange={(e) => updateYearField('overallByYear', year, e.target.value ? parseInt(e.target.value) : '')}
                                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none text-txt-primary text-center"
                                    placeholder="--"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-txt-muted uppercase mb-0.5">Dev Trait</label>
                                  <select
                                    value={devTrait}
                                    onChange={(e) => updateYearField('devTraitByYear', year, e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm rounded-lg border border-surface-4 focus:border-blue-500 focus:outline-none bg-surface-2 text-txt-primary"
                                  >
                                    <option value="">--</option>
                                    {DEV_TRAITS.map(d => <option key={d} value={d}>{d}</option>)}
                                  </select>
                                </div>
                              </div>
                              {(statusChip || exitChip) && (
                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                  {statusChip && (
                                    <span
                                      className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded"
                                      style={{ backgroundColor: `${statusChip.color}22`, color: statusChip.color, border: `1px solid ${statusChip.color}44` }}
                                    >
                                      {statusChip.text}
                                    </span>
                                  )}
                                  {exitChip && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded"
                                      style={{ backgroundColor: `${exitChip.color}22`, color: exitChip.color, border: `1px solid ${exitChip.color}44` }}
                                    >
                                      {exitChip.text}
                                      {exitChip.reason && <span className="italic font-normal opacity-80">· {exitChip.reason}</span>}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Movement connector after this season */}
                            <TransitionConnector year={year} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Recruiting & Entry Information Card */}
            <div className="card">
              <div className="px-5 py-3 border-b border-surface-4 bg-surface-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Recruiting Information
                </h2>
              </div>

              <div className="p-5 space-y-4">
                {/* Stars and Rankings Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Stars
                    </label>
                    <select
                      value={formData.stars || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, stars: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="">--</option>
                      <option value="5">5-Star</option>
                      <option value="4">4-Star</option>
                      <option value="3">3-Star</option>
                      <option value="2">2-Star</option>
                      <option value="1">1-Star</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      National Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.nationalRank || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, nationalRank: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="#1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Position Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.positionRank || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, positionRank: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="#1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      State Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.stateRank || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, stateRank: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary"
                      placeholder="#1"
                    />
                  </div>
                </div>

                {/* Gem/Bust */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Gem/Bust
                    </label>
                    <select
                      value={formData.gemBust || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, gemBust: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="">Normal</option>
                      <option value="gem">Gem</option>
                      <option value="bust">Bust</option>
                    </select>
                  </div>
                </div>

                {/* Portal Transfer Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Portal Transfer
                    </label>
                    <select
                      value={formData.isPortal ? 'yes' : 'no'}
                      onChange={(e) => {
                        const isPortal = e.target.value === 'yes'
                        setFormData(prev => ({
                          ...prev,
                          isPortal,
                          previousTeam: isPortal ? prev.previousTeam : ''
                        }))
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-txt-muted uppercase tracking-wide mb-1.5">
                      Previous Team
                    </label>
                    <select
                      value={formData.previousTeam || ''}
                      onChange={(e) => {
                        const tid = e.target.value ? Number(e.target.value) : null
                        setFormData(prev => ({ ...prev, previousTeam: tid }))
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none transition-colors text-txt-primary bg-surface-2"
                      disabled={!formData.isPortal}
                    >
                      <option value="">Select team...</option>
                      {Object.entries(dynasty?.teams || TEAMS).map(([tid, team]) => (
                        team && team.name && (
                          <option key={tid} value={tid}>
                            {team.name}
                          </option>
                        )
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            {/* Year Selector */}
            <div
              className="card"
            >
              <div className="px-5 py-3 flex items-center justify-between border-b border-surface-4 bg-surface-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Season Stats
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const yearToSync = selectedStatsYear || dynasty?.currentYear

                      // Get box score totals for this player
                      const totals = getPlayerBoxScoreTotals(player.name, dynasty?.games || [], yearToSync)

                      if (!totals) {
                        toast.error('No box score data found for this player in ' + yearToSync)
                        return
                      }

                      // Map internal format to form field format
                      const newStats = {
                        gamesPlayed: totals.gamesPlayed || 0,
                        // Passing
                        passComp: totals.passing?.cmp || '',
                        passAtt: totals.passing?.att || '',
                        passYds: totals.passing?.yds || '',
                        passTD: totals.passing?.td || '',
                        passInt: totals.passing?.int || '',
                        passLong: totals.passing?.lng || '',
                        sacked: totals.passing?.sacks || '',
                        // Rushing
                        rushAtt: totals.rushing?.car || '',
                        rushYds: totals.rushing?.yds || '',
                        rushTD: totals.rushing?.td || '',
                        rushLong: totals.rushing?.lng || '',
                        fumbles: totals.rushing?.fum || '',
                        // Receiving
                        receptions: totals.receiving?.rec || '',
                        recYds: totals.receiving?.yds || '',
                        recTD: totals.receiving?.td || '',
                        recLong: totals.receiving?.lng || '',
                        drops: totals.receiving?.drops || '',
                        // Defense - tackles = soloTkl + astTkl
                        tackles: (totals.defense?.soloTkl || 0) + (totals.defense?.astTkl || 0) || '',
                        tfl: totals.defense?.tfl || '',
                        sacks: totals.defense?.sacks || '',
                        ints: totals.defense?.int || '',
                        pd: totals.defense?.pd || '',
                        ff: totals.defense?.ff || '',
                        fr: totals.defense?.fr || '',
                        defTD: totals.defense?.td || '',
                        // Kicking
                        fgm: totals.kicking?.fgm || '',
                        fga: totals.kicking?.fga || '',
                        fgLong: totals.kicking?.lng || '',
                        xpm: totals.kicking?.xpm || '',
                        xpa: totals.kicking?.xpa || '',
                        // Punting
                        punts: totals.punting?.punts || '',
                        puntYds: totals.punting?.yds || '',
                        puntLong: totals.punting?.lng || '',
                        puntIn20: totals.punting?.in20 || '',
                        touchbacks: totals.punting?.tb || '',
                        // Kick Return
                        krRet: totals.kickReturn?.ret || '',
                        krYds: totals.kickReturn?.yds || '',
                        krTD: totals.kickReturn?.td || '',
                        krLong: totals.kickReturn?.lng || '',
                        // Punt Return
                        prRet: totals.puntReturn?.ret || '',
                        prYds: totals.puntReturn?.yds || '',
                        prTD: totals.puntReturn?.td || '',
                        prLong: totals.puntReturn?.lng || '',
                        // Blocking
                        pancakes: totals.blocking?.pancakes || '',
                        sacksAllowed: totals.blocking?.sacksAllowed || '',
                      }

                      setFormData(prev => ({ ...prev, stats: newStats }))
                      toast.error(`Synced stats from ${totals.gamesPlayed} games for ${yearToSync}`)
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-blue-500 text-blue-600 hover:bg-blue-50 flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync from Box Scores
                  </button>
                  <select
                    value={selectedStatsYear || ''}
                    onChange={(e) => {
                      const year = parseInt(e.target.value)
                      setSelectedStatsYear(year)
                      const yearStats = player.statsByYear?.[year] || {}
                      setFormData(prev => ({ ...prev, stats: nestedStatsToFlat(yearStats) }))
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-surface-4 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface-2 text-txt-primary"
                  >
                    {availableYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-5">
                {boxScoreTotals && (
                  <div className="mb-5 p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-xs font-semibold text-txt-muted uppercase tracking-wide mb-2">
                      Box Score Totals (Auto-calculated)
                    </div>
                    <div className="text-sm text-txt-tertiary">
                      {boxScoreTotals.gamesPlayed} games played
                      {boxScoreTotals.passing?.yds > 0 && ` | ${boxScoreTotals.passing.yds} pass yds`}
                      {boxScoreTotals.rushing?.yds > 0 && ` | ${boxScoreTotals.rushing.yds} rush yds`}
                      {boxScoreTotals.receiving?.yds > 0 && ` | ${boxScoreTotals.receiving.yds} rec yds`}
                    </div>
                  </div>
                )}

                {/* Stat Input Grid - Passing */}
                {['QB'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Passing</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { key: 'passComp', label: 'Comp' },
                        { key: 'passAtt', label: 'Att' },
                        { key: 'passYds', label: 'Yards' },
                        { key: 'passTD', label: 'TD' },
                        { key: 'passInt', label: 'INT' },
                        { key: 'passLong', label: 'Long' },
                        { key: 'sacked', label: 'Sacked' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rushing */}
                {['QB', 'HB', 'FB', 'WR', 'TE'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Rushing</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { key: 'rushAtt', label: 'Carries' },
                        { key: 'rushYds', label: 'Yards' },
                        { key: 'rushTD', label: 'TD' },
                        { key: 'rushLong', label: 'Long' },
                        { key: 'fumbles', label: 'Fumbles' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Receiving */}
                {['HB', 'FB', 'WR', 'TE'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Receiving</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { key: 'receptions', label: 'Rec' },
                        { key: 'recYds', label: 'Yards' },
                        { key: 'recTD', label: 'TD' },
                        { key: 'recLong', label: 'Long' },
                        { key: 'drops', label: 'Drops' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Defense */}
                {['LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Defense</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { key: 'tackles', label: 'Tackles' },
                        { key: 'tfl', label: 'TFL', allowHalf: true },
                        { key: 'sacks', label: 'Sacks', allowHalf: true },
                        { key: 'ints', label: 'INT' },
                        { key: 'pd', label: 'Pass Def' },
                        { key: 'ff', label: 'Forced Fum' },
                        { key: 'fr', label: 'Fum Rec' },
                        { key: 'defTD', label: 'Def TD' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                          <input
                            type="number"
                            step={stat.allowHalf ? '0.5' : '1'}
                            value={formData.stats?.[stat.key] ?? ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: {
                                ...prev.stats,
                                [stat.key]: e.target.value === ''
                                  ? ''
                                  : (stat.allowHalf
                                      ? Math.round(parseFloat(e.target.value) * 10) / 10
                                      : parseInt(e.target.value))
                              }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Blocking — OL only */}
                {['LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Blocking</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { key: 'pancakes', label: 'Pancakes' },
                        { key: 'sacksAllowed', label: 'Sacks Allowed' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Returns — any skill or DB position can be a returner */}
                {['HB', 'FB', 'WR', 'TE', 'CB', 'FS', 'SS'].includes(formData.position) && (
                  <>
                    <div className="mb-6">
                      <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Kick Returns</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { key: 'krRet', label: 'Returns' },
                          { key: 'krYds', label: 'Yards' },
                          { key: 'krTD', label: 'TD' },
                          { key: 'krLong', label: 'Long' },
                        ].map(stat => (
                          <div key={stat.key}>
                            <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                            <input
                              type="number"
                              value={formData.stats?.[stat.key] || ''}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                              }))}
                              className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mb-6">
                      <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">Punt Returns</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { key: 'prRet', label: 'Returns' },
                          { key: 'prYds', label: 'Yards' },
                          { key: 'prTD', label: 'TD' },
                          { key: 'prLong', label: 'Long' },
                        ].map(stat => (
                          <div key={stat.key}>
                            <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                            <input
                              type="number"
                              value={formData.stats?.[stat.key] || ''}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                              }))}
                              className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Kicking */}
                {['K', 'P'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">
                      {formData.position === 'K' ? 'Kicking' : 'Punting'}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {formData.position === 'K' ? [
                        { key: 'fgm', label: 'FG Made' },
                        { key: 'fga', label: 'FG Att' },
                        { key: 'fgLong', label: 'FG Long' },
                        { key: 'xpm', label: 'XP Made' },
                        { key: 'xpa', label: 'XP Att' },
                      ] : [
                        { key: 'punts', label: 'Punts' },
                        { key: 'puntYds', label: 'Yards' },
                        { key: 'puntLong', label: 'Long' },
                        { key: 'puntIn20', label: 'In 20' },
                        { key: 'touchbacks', label: 'TB' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-txt-muted mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Games Played */}
                <div>
                  <h3 className="text-sm font-bold text-txt-secondary uppercase tracking-wide mb-3">General</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-txt-muted mb-1">Games</label>
                      <input
                        type="number"
                        value={formData.stats?.gamesPlayed || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          stats: { ...prev.stats, gamesPlayed: e.target.value ? parseInt(e.target.value) : '' }
                        }))}
                        className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-txt-muted mb-1">Snaps</label>
                      <input
                        type="number"
                        value={formData.stats?.snapsPlayed || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          stats: { ...prev.stats, snapsPlayed: e.target.value ? parseInt(e.target.value) : '' }
                        }))}
                        className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Awards Tab */}
        {activeTab === 'awards' && (
          <div className="space-y-4">
            <div
              className="card"
            >
              <div className="px-5 py-3 flex items-center justify-between border-b border-surface-4 bg-surface-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary">
                  Awards & Accolades
                </h2>
                <button
                  onClick={addAccolade}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-blue-500 text-white hover:bg-blue-600"
                >
                  + Add Award
                </button>
              </div>

              <div className="p-5">
                {(formData.accolades || []).length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-txt-muted mb-4">No awards yet</p>
                    <button
                      onClick={addAccolade}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-blue-500 text-white hover:bg-blue-600"
                    >
                      Add First Award
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.accolades.map((accolade, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-surface-4"
                      >
                        <div className="w-20">
                          <input
                            type="number"
                            value={accolade.year || ''}
                            onChange={(e) => updateAccolade(index, 'year', e.target.value)}
                            className="w-full px-2 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-center text-txt-primary"
                            placeholder="Year"
                          />
                        </div>
                        <div className="flex-1">
                          <select
                            value={accolade.award || ''}
                            onChange={(e) => updateAccolade(index, 'award', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-surface-4 focus:border-blue-500 focus:outline-none text-txt-primary bg-surface-2"
                          >
                            <option value="">Select award</option>
                            <optgroup label="Honor Teams">
                              {AWARD_OPTIONS.filter(a => a.tier === 'honor').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Offseason Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'award').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                        <button
                          onClick={() => removeAccolade(index)}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Card Tab — multi-card collection editor backed by templates */}
        {activeTab === 'card' && (() => {
          // Cheap dirty check vs. the saved-on-player array. Shallow
          // JSON compare is fine here — cards have a small surface
          // area and recompute only when this tab renders.
          const savedCards = Array.isArray(player?.cards) ? player.cards : []
          const liveCards = Array.isArray(formData.cards) ? formData.cards : []
          const cardsDirty = JSON.stringify(savedCards) !== JSON.stringify(liveCards)
          return (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wide text-txt-secondary mb-1" style={{ letterSpacing: '1.5px' }}>
                  Trading Cards
                </h2>
                <p className="text-xs text-txt-tertiary leading-relaxed max-w-3xl">
                  Build a trading-card collection. Pick a real-world brand and year (1952 Bowman, 1989 Score, 2012 Prizm, etc.), the app fills the AI image-gen prompt with this player's data, you generate the front and back externally, and upload them here.
                </p>
              </div>
              <PlayerCards
                cards={formData.cards || []}
                onChange={(next) => setFormData(prev => ({ ...prev, cards: next }))}
                onCommitCards={handleCommitCardsAndNavigate}
                player={player}
                dynasty={dynasty}
                teamColors={teamColors}
                onSave={handleSave}
                saving={saving}
                dirty={cardsDirty}
                autoOpenNew={searchParams.get('newCard') === '1'}
              />
            </div>
          )
        })()}
      </div>

      {/* Mobile action bar */}
      {!isViewOnly && (
        <div
          className="sm:hidden fixed bottom-10 left-0 right-0 z-[60] bg-surface-2 border-t border-surface-4 shadow-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="h-[3px] w-full" style={{ backgroundColor: teamColors.primary }} aria-hidden="true" />
          <div className="px-4 py-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting || saving}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-surface-3 border border-surface-4 text-red-400 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || deleting}
              className="btn btn-secondary flex-1 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: teamColors.primary, color: primaryText }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
          style={{ margin: 0 }}
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="bg-surface-1 border border-surface-4 rounded-xl max-w-md w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[3px] w-full bg-red-500" aria-hidden="true" />
            <div className="p-6">
              <h3 className="text-lg font-bold text-txt-primary mb-2">Delete Player</h3>
              <p className="text-sm text-txt-secondary mb-2">
                Are you sure you want to delete <span className="font-semibold text-txt-primary">{player?.name}</span>?
              </p>
              <p className="text-sm text-red-400 font-medium mb-6">
                This action cannot be undone. The player will be permanently deleted and cannot be recovered.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
