import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty, getPlayerBoxScoreTotals } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { TEAMS } from '../../data/teamRegistry'
import { getTeamLogoByTid, getMascotName } from '../../data/teams'
import PlayerTimelineEditor from '../../components/PlayerTimelineEditor'

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
const AWARD_OPTIONS = [
  { value: 'heisman', label: 'Heisman Trophy', tier: 'elite' },
  { value: 'heismanFinalist', label: 'Heisman Finalist', tier: 'elite' },
  { value: 'cfpChampMVP', label: 'CFP Championship MVP', tier: 'elite' },
  { value: 'allAm1st', label: 'All-American 1st Team', tier: 'major' },
  { value: 'allAm2nd', label: 'All-American 2nd Team', tier: 'major' },
  { value: 'allAmFr', label: 'Freshman All-American', tier: 'major' },
  { value: 'bowlMVP', label: 'Bowl Game MVP', tier: 'major' },
  { value: 'confPOY', label: 'Conference Player of the Year', tier: 'conf' },
  { value: 'confOffPOY', label: 'Conference Offensive POY', tier: 'conf' },
  { value: 'confDefPOY', label: 'Conference Defensive POY', tier: 'conf' },
  { value: 'allConf1st', label: 'All-Conference 1st Team', tier: 'conf' },
  { value: 'allConf2nd', label: 'All-Conference 2nd Team', tier: 'conf' },
  { value: 'weeklyHonor', label: 'Player of the Week', tier: 'weekly' },
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
    rushAtt: rushing.att ?? rushing.carries ?? '',
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
    // Defense
    tackles: defense.tackles ?? defense.tkl ?? '',
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
    // General
    gamesPlayed: yearStats.gamesPlayed ?? yearStats.games ?? '',
    snapsPlayed: yearStats.snapsPlayed ?? yearStats.snaps ?? '',
  }
}

// Convert flat form fields back to nested stats structure
const flatStatsToNested = (flatStats) => {
  if (!flatStats) return {}

  const num = (v) => (v !== '' && v !== null && v !== undefined) ? parseInt(v) : undefined

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
  if (flatStats.rushAtt !== '') rushing.att = num(flatStats.rushAtt)
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
  if (flatStats.tackles !== '') defense.tackles = num(flatStats.tackles)
  if (flatStats.tfl !== '') defense.tfl = num(flatStats.tfl)
  if (flatStats.sacks !== '') defense.sacks = num(flatStats.sacks)
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

  // General stats at top level
  if (flatStats.gamesPlayed !== '') result.gamesPlayed = num(flatStats.gamesPlayed)
  if (flatStats.snapsPlayed !== '') result.snapsPlayed = num(flatStats.snapsPlayed)

  return result
}

export default function PlayerEdit() {
  const { id: dynastyId, pid } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { dynasties, currentDynasty, updatePlayer, isViewOnly } = useDynasty()

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
  const currentYear = dynasty?.currentYear
  const playerTeamTid = useMemo(() => {
    if (!player) return null
    // Check teamsByYear first, then fall back to player.team
    return (currentYear && player?.teamsByYear?.[currentYear]) ||
           (currentYear && player?.teamsByYear?.[String(currentYear)]) ||
           player?.team ||
           player?.teams?.[0] ||
           dynasty?.currentTid
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
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedStatsYear, setSelectedStatsYear] = useState(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
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

    // Add years from player's team history (when they were on a roster)
    if (player?.teamHistory) {
      player.teamHistory.forEach(stint => {
        if (stint.fromYear) yearsSet.add(stint.fromYear)
        if (stint.toYear) yearsSet.add(stint.toYear)
      })
    }

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
    // Try current year first
    if (byYear[currentYear]) return byYear[currentYear]
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

      // Background
      hometown: player.hometown || '',
      state: player.state || player.homeState || '',
      height: player.height || '',
      weight: player.weight || '',

      // Recruiting Info
      stars: player.stars || '',
      nationalRank: player.nationalRank || '',
      stateRank: player.stateRank || '',
      positionRank: player.positionRank || '',
      gemBust: player.gemBust || '',
      isPortal: player.isPortal || false,
      previousTeam: player.previousTeam || '',

      // Tenure
      entryYear: player.entryYear || player.recruitYear || '',
      entryClass: player.entryClass || '',
      redshirtYear: player.redshirtYear || '',
      teamHistory: player.teamHistory || [],
      // Normalize classByYear keys to numbers
      classByYear: Object.entries(player.classByYear || {}).reduce((acc, [k, v]) => {
        acc[parseInt(k)] = v
        return acc
      }, {}),
      // Normalize overallByYear keys to numbers, fall back to player.overall for current year
      overallByYear: (() => {
        const normalized = Object.entries(player.overallByYear || {}).reduce((acc, [k, v]) => {
          acc[parseInt(k)] = v
          return acc
        }, {})
        // If current year has no overall but player.overall exists, use it
        if (player.overall && currentYear && !normalized[currentYear]) {
          normalized[currentYear] = player.overall
        }
        return normalized
      })(),

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

  // Upload image to ImgBB
  const uploadToImgBB = async (file) => {
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
    const formDataUpload = new FormData()
    formDataUpload.append('image', file)
    formDataUpload.append('key', apiKey)

    try {
      setUploading(true)
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formDataUpload
      })
      const data = await response.json()
      if (data.success) {
        setFormData(prev => ({ ...prev, pictureUrl: data.data.url }))
        setShowImageUpload(false)
      } else {
        alert('Upload failed: ' + (data.error?.message || 'Unknown error'))
      }
    } catch (error) {
      alert('Upload failed: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  // Handle file input change
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (file) await uploadToImgBB(file)
  }

  // Handle paste for image upload (in URL input or from clipboard button)
  const handlePaste = async (e) => {
    const items = e?.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) await uploadToImgBB(file)
        return
      }
    }
  }

  // Handle paste from clipboard button
  const handlePasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            await uploadToImgBB(blob)
            return
          }
        }
      }
      alert('No image found in clipboard')
    } catch (error) {
      alert('Could not access clipboard. Try pasting directly into the URL field.')
    }
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
  const handleSave = async () => {
    if (!player || saving) return
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
      // Tenure
      entryYear: num(formData.entryYear),
      entryClass: formData.entryClass,
      redshirtYear: formData.redshirtYear ? num(formData.redshirtYear) : null,
      teamHistory: formData.teamHistory || [],
      classByYear: formData.classByYear || {},
      overallByYear: formData.overallByYear || {},
      // Generate teamsByYear from teamHistory for legacy compatibility
      teamsByYear: (() => {
        const teamsByYear = { ...(player.teamsByYear || {}) }
        const teamHistory = formData.teamHistory || []
        teamHistory.forEach(stint => {
          if (stint.teamTid && stint.fromYear) {
            // Add entry for each year the player was on this team
            const toYear = stint.toYear || dynasty?.currentYear || new Date().getFullYear()
            for (let year = stint.fromYear; year <= toYear; year++) {
              teamsByYear[year] = stint.teamTid
            }
          }
        })
        return teamsByYear
      })(),
      accolades: (formData.accolades || []).filter(a => a.year && a.award),
      notes: formData.notes,
      isHonorOnly: false,
    }

    // Update stats for selected year (convert flat form fields back to nested structure)
    const statsYear = selectedStatsYear || dynasty?.currentYear
    if (statsYear) {
      updatedPlayer.statsByYear = {
        ...player.statsByYear,
        [statsYear]: flatStatsToNested(formData.stats)
      }
    }

    try {
      await updatePlayer(player.pid, updatedPlayer)
      navigate(`${pathPrefix}/player/${pid}`)
    } catch (error) {
      console.error('Error saving player:', error)
    } finally {
      setSaving(false)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    navigate(`${pathPrefix}/player/${pid}`)
  }

  // Loading state
  if (!dynasty) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Loading...</div>
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
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-yellow-800 mb-2">View Only Mode</h2>
          <p className="text-yellow-600 mb-4">You cannot edit players in view-only mode.</p>
          <Link to={`${pathPrefix}/player/${pid}`} className="text-yellow-600 hover:underline">
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
  ]

  return (
    <div className="min-h-screen pb-40" style={{ backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-30 shadow-lg"
        style={{ backgroundColor: teamColors.primary, borderBottom: `4px solid ${teamColors.secondary}` }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            {/* Player Image or Placeholder - Clickable to edit */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowImageUpload(!showImageUpload)}
                className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden group"
                style={{
                  backgroundColor: `${teamColors.secondary}40`,
                  border: `2px solid ${teamColors.secondary}`
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
                    className="text-2xl font-bold"
                    style={{ color: primaryText, opacity: 0.5 }}
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
                  <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">Player Photo</h4>
                      <button
                        type="button"
                        onClick={() => setShowImageUpload(false)}
                        className="text-gray-400 hover:text-gray-600"
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
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 mb-3"
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
                        className="flex-1 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-1"
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
                        className="w-full px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 flex items-center justify-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Remove Photo
                      </button>
                    )}

                    {uploading && (
                      <div className="mt-2 text-xs text-center text-blue-600">Uploading...</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <h1
                className="text-xl font-bold truncate"
                style={{ color: primaryText }}
              >
                {formData.firstName} {formData.lastName}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {teamLogo && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.9)', padding: '2px' }}
                  >
                    <img src={teamLogo} alt="" className="w-full h-full object-contain" />
                  </div>
                )}
                <span
                  className="text-sm font-medium"
                  style={{ color: primaryText, opacity: 0.85 }}
                >
                  #{formData.jerseyNumber || '?'} {formData.position || 'N/A'} | {formData.year || 'N/A'}
                </span>
                {currentOverall && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: teamColors.secondary,
                      color: secondaryText
                    }}
                  >
                    {currentOverall} OVR
                  </span>
                )}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity flex-shrink-0"
              style={{ color: primaryText }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 rounded-t-lg text-sm font-semibold transition-all whitespace-nowrap"
                style={{
                  backgroundColor: activeTab === tab.id ? teamColors.secondary : 'transparent',
                  color: activeTab === tab.id ? secondaryText : primaryText,
                  opacity: activeTab === tab.id ? 1 : 0.7
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Basic Info Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Basic Information
                </h2>
              </div>

              <div className="p-5 space-y-5">
                {/* Name Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="Smith"
                    />
                  </div>
                </div>

                {/* Position, Class, Jersey, OVR Row */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Position
                    </label>
                    <select
                      value={formData.position || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value, archetype: '' }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">--</option>
                      {POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Class
                    </label>
                    <select
                      value={formData.year || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">--</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Jersey #
                    </label>
                    <input
                      type="text"
                      value={formData.jerseyNumber || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, jerseyNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Overall
                    </label>
                    <div
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 bg-gray-50 text-gray-900 font-bold text-center cursor-default"
                      title="Edit in Career tab"
                    >
                      {currentOverall || '--'}
                    </div>
                  </div>
                </div>

                {/* Archetype, Dev Trait Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Archetype
                    </label>
                    <select
                      value={formData.archetype || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, archetype: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                      disabled={!formData.position}
                    >
                      <option value="">Select archetype</option>
                      {getArchetypesForPosition(formData.position).map(arch => (
                        <option key={arch} value={arch}>{arch}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Dev Trait
                    </label>
                    <select
                      value={formData.devTrait || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, devTrait: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Background
                </h2>
              </div>

              <div className="p-5 space-y-5">
                {/* Hometown Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Hometown
                    </label>
                    <input
                      type="text"
                      value={formData.hometown || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, hometown: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="Dallas"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      State
                    </label>
                    <select
                      value={formData.state || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Height
                    </label>
                    <input
                      type="text"
                      value={formData.height || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="6'2&quot;"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Weight (lbs)
                    </label>
                    <input
                      type="number"
                      value={formData.weight || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="220"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Card */}
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-200"
            >
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Notes
                </h2>
              </div>

              <div className="p-5">
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 resize-none"
                  placeholder="Add notes about this player..."
                />
              </div>
            </div>
          </div>
        )}

        {/* Career Tab */}
        {activeTab === 'career' && (
          <div className="space-y-6">
            {/* Recruiting & Entry Information Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Recruiting Information
                </h2>
              </div>

              <div className="p-5 space-y-5">
                {/* Stars and Rankings Row */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Stars
                    </label>
                    <select
                      value={formData.stars || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, stars: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
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
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      National Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.nationalRank || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, nationalRank: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="#1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Position Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.positionRank || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, positionRank: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="#1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      State Rank
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.stateRank || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, stateRank: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="#1"
                    />
                  </div>
                </div>

                {/* Entry Info Row */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Entry Year
                    </label>
                    <input
                      type="number"
                      value={formData.entryYear || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, entryYear: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="2024"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Entry Class
                    </label>
                    <select
                      value={formData.entryClass || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, entryClass: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">--</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Redshirt Year
                    </label>
                    <input
                      type="number"
                      value={formData.redshirtYear || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, redshirtYear: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="None"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Gem/Bust
                    </label>
                    <select
                      value={formData.gemBust || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, gemBust: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">Normal</option>
                      <option value="gem">Gem</option>
                      <option value="bust">Bust</option>
                    </select>
                  </div>
                </div>

                {/* Portal Transfer Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Portal Transfer
                    </label>
                    <select
                      value={formData.isPortal ? 'yes' : 'no'}
                      onChange={(e) => setFormData(prev => ({ ...prev, isPortal: e.target.value === 'yes' }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Previous Team
                    </label>
                    <input
                      type="text"
                      value={formData.previousTeam || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, previousTeam: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="Ohio State"
                      disabled={!formData.isPortal}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Career Timeline Card */}
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-200"
            >
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Career Timeline
                </h2>
              </div>

              <div className="p-5">
                <PlayerTimelineEditor
                  teamHistory={formData.teamHistory || []}
                  onChange={(newHistory) => setFormData(prev => ({ ...prev, teamHistory: newHistory }))}
                  teams={dynasty?.teams || TEAMS}
                  currentYear={dynasty?.currentYear}
                  classByYear={formData.classByYear || {}}
                  overallByYear={formData.overallByYear || {}}
                  onOverallChange={updateOverallForYear}
                  playerName={player?.name}
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* Year Selector */}
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-200"
            >
              <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Season Stats
                </h2>
                <select
                  value={selectedStatsYear || ''}
                  onChange={(e) => {
                    const year = parseInt(e.target.value)
                    setSelectedStatsYear(year)
                    const yearStats = player.statsByYear?.[year] || {}
                    setFormData(prev => ({ ...prev, stats: { ...yearStats } }))
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="p-5">
                {boxScoreTotals && (
                  <div className="mb-5 p-4 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Box Score Totals (Auto-calculated)
                    </div>
                    <div className="text-sm text-gray-600">
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
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Passing</h3>
                    <div className="grid grid-cols-4 gap-3">
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
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rushing */}
                {['QB', 'HB', 'FB', 'WR', 'TE'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Rushing</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'rushAtt', label: 'Carries' },
                        { key: 'rushYds', label: 'Yards' },
                        { key: 'rushTD', label: 'TD' },
                        { key: 'rushLong', label: 'Long' },
                        { key: 'fumbles', label: 'Fumbles' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Receiving */}
                {['HB', 'FB', 'WR', 'TE'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Receiving</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'receptions', label: 'Rec' },
                        { key: 'recYds', label: 'Yards' },
                        { key: 'recTD', label: 'TD' },
                        { key: 'recLong', label: 'Long' },
                        { key: 'drops', label: 'Drops' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Defense */}
                {['LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Defense</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'tackles', label: 'Tackles' },
                        { key: 'tfl', label: 'TFL' },
                        { key: 'sacks', label: 'Sacks' },
                        { key: 'ints', label: 'INT' },
                        { key: 'pd', label: 'Pass Def' },
                        { key: 'ff', label: 'Forced Fum' },
                        { key: 'fr', label: 'Fum Rec' },
                        { key: 'defTD', label: 'Def TD' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kicking */}
                {['K', 'P'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                      {formData.position === 'K' ? 'Kicking' : 'Punting'}
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
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
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Games Played */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">General</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Games</label>
                      <input
                        type="number"
                        value={formData.stats?.gamesPlayed || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          stats: { ...prev.stats, gamesPlayed: e.target.value ? parseInt(e.target.value) : '' }
                        }))}
                        className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Snaps</label>
                      <input
                        type="number"
                        value={formData.stats?.snapsPlayed || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          stats: { ...prev.stats, snapsPlayed: e.target.value ? parseInt(e.target.value) : '' }
                        }))}
                        className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
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
          <div className="space-y-6">
            <div
              className="bg-white rounded-xl shadow-sm border border-gray-200"
            >
              <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
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
                    <p className="text-gray-500 mb-4">No awards yet</p>
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
                        className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200"
                      >
                        <div className="w-20">
                          <input
                            type="number"
                            value={accolade.year || ''}
                            onChange={(e) => updateAccolade(index, 'year', e.target.value)}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                            placeholder="Year"
                          />
                        </div>
                        <div className="flex-1">
                          <select
                            value={accolade.award || ''}
                            onChange={(e) => updateAccolade(index, 'award', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
                          >
                            <option value="">Select award</option>
                            <optgroup label="Elite Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'elite').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Major Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'major').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Conference Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'conf').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Weekly Honors">
                              {AWARD_OPTIONS.filter(a => a.tier === 'weekly').map(award => (
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
      </div>

      {/* Fixed Footer - positioned above ticker (48px) */}
      <div
        className="fixed bottom-12 left-0 right-0 z-40 shadow-2xl"
        style={{
          backgroundColor: teamColors.secondary,
          borderTop: `3px solid ${teamColors.primary}`
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              color: secondaryText,
              border: `2px solid ${secondaryText}40`
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 rounded-lg text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: teamColors.primary,
              color: primaryText,
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
