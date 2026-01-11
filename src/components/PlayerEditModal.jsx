import { useState, useEffect, useRef, useMemo } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { getTeamAbbreviationsList } from '../data/teamAbbreviations'
import { getCurrentTeamAbbr, getTidFromAbbr } from '../data/teamRegistry'
import { getPlayerBoxScoreTotals } from '../context/DynastyContext'
// Stats are read directly from player.statsByYear (single source of truth)

export default function PlayerEditModal({ isOpen, onClose, player, teamColors, onSave, onSyncAllPlayers, defaultSchool, dynasty }) {
  const [formData, setFormData] = useState({})
  const [expandedSections, setExpandedSections] = useState([])
  const [selectedStatsYear, setSelectedStatsYear] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showQuickImageModal, setShowQuickImageModal] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [justSyncedThisPlayer, setJustSyncedThisPlayer] = useState(false)
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(null) // 'this' or 'all' or null
  const fileInputRef = useRef(null)
  const quickFileInputRef = useRef(null)
  const initializedForPlayerRef = useRef(null) // Track which player we've initialized for

  // Upload image to ImgBB
  const uploadToImgBB = async (file) => {
    // Try env var first, fallback to hardcoded key for Replit compatibility
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
    if (!apiKey) {
      alert('Image upload not configured. Please add VITE_IMGBB_API_KEY to environment variables.')
      return null
    }

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
        return data.data.url
      } else {
        alert('Failed to upload image: ' + (data.error?.message || 'Unknown error'))
        return null
      }
    } catch (error) {
      alert('Failed to upload image: ' + error.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size (max 32MB for ImgBB)
    if (file.size > 32 * 1024 * 1024) {
      alert('Image must be less than 32MB')
      return
    }

    const url = await uploadToImgBB(file)
    if (url) {
      setFormData(prev => ({ ...prev, pictureUrl: url }))
    }

    // Reset file input so same file can be selected again
    e.target.value = ''
  }

  // Handle paste event for image upload
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        // Validate file size (max 32MB for ImgBB)
        if (file.size > 32 * 1024 * 1024) {
          alert('Image must be less than 32MB')
          return
        }

        const url = await uploadToImgBB(file)
        if (url) {
          setFormData(prev => ({ ...prev, pictureUrl: url }))
        }
        return
      }
    }
  }

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Get available years for stats (years this player has data, plus current year)
  const getAvailableYears = () => {
    if (!dynasty) return []
    const yearsSet = new Set()

    // Add current dynasty year
    if (dynasty.currentYear) yearsSet.add(dynasty.currentYear)

    // Add years from player's own statsByYear
    if (player?.statsByYear) {
      Object.keys(player.statsByYear).forEach(year => {
        yearsSet.add(parseInt(year))
      })
    }

    // Add years from box scores where this player appears
    if (dynasty.games && player?.name) {
      dynasty.games.forEach(game => {
        if (!game.boxScore || !game.year) return
        const checkCategory = (side) => {
          if (!game.boxScore[side]) return false
          return Object.values(game.boxScore[side]).some(category =>
            Array.isArray(category) && category.some(p =>
              p.playerName?.toLowerCase().trim() === player.name.toLowerCase().trim()
            )
          )
        }
        if (checkCategory('home') || checkCategory('away')) {
          yearsSet.add(Number(game.year))
        }
      })
    }

    return Array.from(yearsSet).sort((a, b) => b - a) // Most recent first
  }

  // Calculate box score totals for this player for the selected year
  const userTeamAbbr = dynasty ? (getCurrentTeamAbbr(dynasty) || dynasty.teamName) : null
  const boxScoreTotals = useMemo(() => {
    if (!player?.name || !dynasty?.games || !selectedStatsYear || !userTeamAbbr) return null
    return getPlayerBoxScoreTotals(player.name, dynasty.games, selectedStatsYear, userTeamAbbr)
  }, [player?.name, dynasty?.games, selectedStatsYear, userTeamAbbr])

  // Check if current stats are out of sync with box score totals
  const statsOutOfSync = useMemo(() => {
    if (!boxScoreTotals) return false

    const currentStats = player?.statsByYear?.[selectedStatsYear] || {}

    // Check games played
    if ((currentStats.gamesPlayed || 0) !== (boxScoreTotals.gamesPlayed || 0)) return true

    // Check key stats in each category
    const checkCategory = (cat, fields) => {
      const current = currentStats[cat] || {}
      const boxScore = boxScoreTotals[cat] || {}
      return fields.some(f => (current[f] || 0) !== (boxScore[f] || 0))
    }

    if (checkCategory('passing', ['cmp', 'att', 'yds', 'td', 'int'])) return true
    if (checkCategory('rushing', ['car', 'yds', 'td'])) return true
    if (checkCategory('receiving', ['rec', 'yds', 'td'])) return true
    if (checkCategory('defense', ['tkl', 'tfl', 'sacks', 'int'])) return true
    if (checkCategory('kicking', ['fgm', 'fga', 'xpm', 'xpa'])) return true
    if (checkCategory('punting', ['punts', 'yds'])) return true
    if (checkCategory('kickReturn', ['ret', 'yds', 'td'])) return true
    if (checkCategory('puntReturn', ['ret', 'yds', 'td'])) return true

    return false
  }, [boxScoreTotals, player?.statsByYear, selectedStatsYear])

  // Check if detailed stats were entered via the end-of-season sheet for the selected year
  const detailedStatsEntered = useMemo(() => {
    if (!dynasty || !selectedStatsYear) return false
    return dynasty.detailedStatsCompletedByYear?.[selectedStatsYear] ||
           dynasty.detailedStatsCompletedByYear?.[String(selectedStatsYear)]
  }, [dynasty, selectedStatsYear])

  // Handle sync button click - show confirmation if detailed stats were entered
  const handleSyncThisPlayerClick = () => {
    if (detailedStatsEntered) {
      setShowSyncConfirmation('this')
    } else {
      handleSyncThisPlayer()
    }
  }

  const handleSyncAllPlayersClick = () => {
    if (detailedStatsEntered) {
      setShowSyncConfirmation('all')
    } else {
      performSyncAllPlayers()
    }
  }

  const performSyncAllPlayers = async () => {
    setSyncingAll(true)
    try {
      await onSyncAllPlayers(selectedStatsYear)
      alert(`All players synced for ${selectedStatsYear}!`)
      onClose() // Close modal so user sees fresh data when they reopen
    } catch (err) {
      console.error('Sync failed:', err)
      alert('Sync failed: ' + err.message)
    } finally {
      setSyncingAll(false)
    }
  }

  // Sync this player's stats to box score totals
  const handleSyncThisPlayer = () => {
    if (!boxScoreTotals) return

    // Update form data with box score totals
    setFormData(prev => ({
      ...prev,
      gamesPlayed: boxScoreTotals.gamesPlayed || 0,
      // Passing
      passing_completions: boxScoreTotals.passing?.cmp || 0,
      passing_attempts: boxScoreTotals.passing?.att || 0,
      passing_yards: boxScoreTotals.passing?.yds || 0,
      passing_touchdowns: boxScoreTotals.passing?.td || 0,
      passing_interceptions: boxScoreTotals.passing?.int || 0,
      passing_passingLong: boxScoreTotals.passing?.lng || 0,
      passing_sacksTaken: boxScoreTotals.passing?.sacks || 0,
      // Rushing
      rushing_carries: boxScoreTotals.rushing?.car || 0,
      rushing_yards: boxScoreTotals.rushing?.yds || 0,
      rushing_touchdowns: boxScoreTotals.rushing?.td || 0,
      rushing_rushingLong: boxScoreTotals.rushing?.lng || 0,
      rushing_fumbles: boxScoreTotals.rushing?.fumbles || 0,
      // Receiving
      receiving_receptions: boxScoreTotals.receiving?.rec || 0,
      receiving_yards: boxScoreTotals.receiving?.yds || 0,
      receiving_touchdowns: boxScoreTotals.receiving?.td || 0,
      receiving_receivingLong: boxScoreTotals.receiving?.lng || 0,
      // Defense
      defensive_tackles: boxScoreTotals.defense?.tkl || 0,
      defensive_tfl: boxScoreTotals.defense?.tfl || 0,
      defensive_sacks: boxScoreTotals.defense?.sacks || 0,
      defensive_forcedFumbles: boxScoreTotals.defense?.ff || 0,
      defensive_interceptions: boxScoreTotals.defense?.int || 0,
      defensive_defensiveTds: boxScoreTotals.defense?.td || 0,
      // Kicking
      kicking_fgm: boxScoreTotals.kicking?.fgm || 0,
      kicking_fga: boxScoreTotals.kicking?.fga || 0,
      kicking_fgLong: boxScoreTotals.kicking?.lng || 0,
      kicking_xpm: boxScoreTotals.kicking?.xpm || 0,
      kicking_xpa: boxScoreTotals.kicking?.xpa || 0,
      // Punting
      punting_punts: boxScoreTotals.punting?.punts || 0,
      punting_puntYards: boxScoreTotals.punting?.yds || 0,
      punting_puntLong: boxScoreTotals.punting?.lng || 0,
      punting_inside20: boxScoreTotals.punting?.in20 || 0,
      // Returns
      kickReturn_returns: boxScoreTotals.kickReturn?.ret || 0,
      kickReturn_yards: boxScoreTotals.kickReturn?.yds || 0,
      kickReturn_touchdowns: boxScoreTotals.kickReturn?.td || 0,
      kickReturn_long: boxScoreTotals.kickReturn?.lng || 0,
      puntReturn_returns: boxScoreTotals.puntReturn?.ret || 0,
      puntReturn_yards: boxScoreTotals.puntReturn?.yds || 0,
      puntReturn_touchdowns: boxScoreTotals.puntReturn?.td || 0,
      puntReturn_long: boxScoreTotals.puntReturn?.lng || 0,
    }))
    // Mark as synced so warning disappears
    setJustSyncedThisPlayer(true)
  }

  // Helper to get stats for a specific year
  // Reads stats from player.statsByYear (single source of truth)
  const getYearStats = (year) => {
    const yearStr = year?.toString()

    // Get player's stored stats for this year (internal format) - SINGLE SOURCE OF TRUTH
    const playerYearStats = player?.statsByYear?.[year] || player?.statsByYear?.[yearStr] || {}

    // Helper to get category stats from player.statsByYear (internal format)
    const getCategoryStats = (internalCatName, fieldMap) => {
      const result = {}
      Object.keys(fieldMap).forEach(key => result[key] = 0)

      const categoryData = playerYearStats[internalCatName]
      if (categoryData) {
        Object.entries(fieldMap).forEach(([formKey, internalKey]) => {
          result[formKey] = categoryData[internalKey] || 0
        })
      }
      return result
    }

    // Get stats from player.statsByYear (internal format keys)
    const passing = getCategoryStats('passing', {
      completions: 'cmp', attempts: 'att', yards: 'yds',
      touchdowns: 'td', interceptions: 'int',
      passingLong: 'lng', sacksTaken: 'sacks'
    })
    const rushing = getCategoryStats('rushing', {
      carries: 'car', yards: 'yds', touchdowns: 'td',
      rushingLong: 'lng', fumbles: 'fum', brokenTackles: 'bt'
    })
    const receiving = getCategoryStats('receiving', {
      receptions: 'rec', yards: 'yds', touchdowns: 'td',
      receivingLong: 'lng', drops: 'drops'
    })
    const blocking = getCategoryStats('blocking', { sacksAllowed: 'sacksAllowed', pancakes: 'pancakes' })
    const defensive = getCategoryStats('defense', {
      soloTackles: 'soloTkl', assistedTackles: 'astTkl',
      tacklesForLoss: 'tfl', sacks: 'sacks', interceptions: 'int',
      intReturnYards: 'intYds', defensiveTDs: 'td',
      deflections: 'pd', forcedFumbles: 'ff', fumbleRecoveries: 'fr'
    })
    const kicking = getCategoryStats('kicking', {
      fgMade: 'fgm', fgAttempted: 'fga', fgLong: 'lng',
      xpMade: 'xpm', xpAttempted: 'xpa'
    })
    const punting = getCategoryStats('punting', {
      punts: 'punts', puntingYards: 'yds',
      puntsInside20: 'in20', puntLong: 'lng'
    })
    const kickReturn = getCategoryStats('kickReturn', {
      returns: 'ret', returnYardage: 'yds',
      touchdowns: 'td', returnLong: 'lng'
    })
    const puntReturn = getCategoryStats('puntReturn', {
      returns: 'ret', returnYardage: 'yds',
      touchdowns: 'td', returnLong: 'lng'
    })

    return {
      gamesPlayed: playerYearStats.gamesPlayed || 0,
      snapsPlayed: playerYearStats.snapsPlayed || 0,
      passing, rushing, receiving, blocking, defensive, kicking, punting, kickReturn, puntReturn
    }
  }

  // Initialize form data when modal opens
  useEffect(() => {
    const playerId = player?.id || player?.name

    // Only initialize if modal is open AND we haven't already initialized for this player
    // This prevents resetting form data when dynasty updates after save
    if (player && isOpen && initializedForPlayerRef.current !== playerId) {
      initializedForPlayerRef.current = playerId
      setJustSyncedThisPlayer(false) // Reset sync flag for new player

      // Set default selected year to current dynasty year
      const years = getAvailableYears()
      const defaultYear = dynasty?.currentYear || years[0]
      setSelectedStatsYear(defaultYear)

      // Get stats for the default year
      const yearStats = getYearStats(defaultYear)

      // Helper to split name into first and last
      const splitName = (fullName) => {
        if (!fullName) return { firstName: '', lastName: '' }
        const parts = fullName.trim().split(/\s+/)
        if (parts.length === 1) return { firstName: parts[0], lastName: '' }
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
      }
      const { firstName: derivedFirst, lastName: derivedLast } = splitName(player.name)

      setFormData({
        // Basic Info
        pictureUrl: player.pictureUrl || '',
        firstName: player.firstName || derivedFirst || '',
        lastName: player.lastName || derivedLast || '',
        position: player.position || '',
        archetype: player.archetype || '',
        school: player.school || defaultSchool || '',
        year: player.year || '',
        devTrait: player.devTrait || 'Normal',
        overall: player.overall || 0,
        jerseyNumber: player.jerseyNumber || '',

        // Physical
        height: player.height || '',
        weight: player.weight || '',
        hometown: player.hometown || '',
        state: player.state || '',

        // Team Status
        team: player.team || '',
        previousTeam: player.previousTeam || '',

        // Recruiting
        yearStarted: player.yearStarted || '',
        recruitYear: player.recruitYear || '',
        stars: player.stars || 0,
        positionRank: player.positionRank || 0,
        stateRank: player.stateRank || 0,
        nationalRank: player.nationalRank || 0,

        // Development
        gemBust: player.gemBust || '',
        overallProgression: player.overallProgression || 0,
        overallRatingChange: player.overallRatingChange || 0,

        // Player Status Flags
        isRecruit: player.isRecruit || false,
        isPortal: player.isPortal || false,

        // Game Logs (for selected year)
        snapsPlayed: yearStats.snapsPlayed,
        gamesPlayed: yearStats.gamesPlayed,

        // Draft info (for departed players)
        draftRound: player.draftRound || '',

        // Accolades
        confPOW: player.confPOW || 0,
        nationalPOW: player.nationalPOW || 0,
        allConf1st: player.allConf1st || 0,
        allConf2nd: player.allConf2nd || 0,
        allConfFr: player.allConfFr || 0,
        allAm1st: player.allAm1st || 0,
        allAm2nd: player.allAm2nd || 0,
        allAmFr: player.allAmFr || 0,

        // Stats for selected year
        passing_completions: yearStats.passing.completions,
        passing_attempts: yearStats.passing.attempts,
        passing_yards: yearStats.passing.yards,
        passing_touchdowns: yearStats.passing.touchdowns,
        passing_interceptions: yearStats.passing.interceptions,
        passing_passingLong: yearStats.passing.passingLong,
        passing_sacksTaken: yearStats.passing.sacksTaken,

        rushing_carries: yearStats.rushing.carries,
        rushing_yards: yearStats.rushing.yards,
        rushing_touchdowns: yearStats.rushing.touchdowns,
        rushing_rushingLong: yearStats.rushing.rushingLong,
        rushing_fumbles: yearStats.rushing.fumbles,
        rushing_brokenTackles: yearStats.rushing.brokenTackles,

        receiving_receptions: yearStats.receiving.receptions,
        receiving_yards: yearStats.receiving.yards,
        receiving_touchdowns: yearStats.receiving.touchdowns,
        receiving_receivingLong: yearStats.receiving.receivingLong,
        receiving_drops: yearStats.receiving.drops,

        blocking_sacksAllowed: yearStats.blocking.sacksAllowed,

        defensive_soloTackles: yearStats.defensive.soloTackles,
        defensive_assistedTackles: yearStats.defensive.assistedTackles,
        defensive_tacklesForLoss: yearStats.defensive.tacklesForLoss,
        defensive_sacks: yearStats.defensive.sacks,
        defensive_interceptions: yearStats.defensive.interceptions,
        defensive_intReturnYards: yearStats.defensive.intReturnYards,
        defensive_defensiveTDs: yearStats.defensive.defensiveTDs,
        defensive_deflections: yearStats.defensive.deflections,
        defensive_forcedFumbles: yearStats.defensive.forcedFumbles,
        defensive_fumbleRecoveries: yearStats.defensive.fumbleRecoveries,

        kicking_fgMade: yearStats.kicking.fgMade,
        kicking_fgAttempted: yearStats.kicking.fgAttempted,
        kicking_fgLong: yearStats.kicking.fgLong,
        kicking_xpMade: yearStats.kicking.xpMade,
        kicking_xpAttempted: yearStats.kicking.xpAttempted,

        punting_punts: yearStats.punting.punts,
        punting_puntingYards: yearStats.punting.puntingYards,
        punting_puntsInside20: yearStats.punting.puntsInside20,
        punting_puntLong: yearStats.punting.puntLong,

        kickReturn_returns: yearStats.kickReturn.returns,
        kickReturn_returnYardage: yearStats.kickReturn.returnYardage,
        kickReturn_touchdowns: yearStats.kickReturn.touchdowns,
        kickReturn_returnLong: yearStats.kickReturn.returnLong,

        puntReturn_returns: yearStats.puntReturn.returns,
        puntReturn_returnYardage: yearStats.puntReturn.returnYardage,
        puntReturn_touchdowns: yearStats.puntReturn.touchdowns,
        puntReturn_returnLong: yearStats.puntReturn.returnLong,

        // Notes & Media
        notes: player.notes || '',
        links: player.links || [],

        // Roster History - which team this player was on each year
        // Normalize keys to strings in case old data has number keys
        teamsByYear: Object.fromEntries(
          Object.entries(player.teamsByYear || {}).map(([k, v]) => [String(k), v])
        ),
        // Class History - what class this player was each year
        classByYear: Object.fromEntries(
          Object.entries(player.classByYear || {}).map(([k, v]) => [String(k), v])
        ),
        // Movement History - what movement happened each year
        movementsByYear: Object.fromEntries(
          Object.entries(player.movementsByYear || {}).map(([k, v]) => [String(k), v])
        ),
        // Career Timeline - movement history (legacy)
        movements: player.movements || []
      })

      // Start with all sections collapsed
      setExpandedSections([])
    }

    // Clear the ref when modal closes so next open will re-initialize
    if (!isOpen) {
      initializedForPlayerRef.current = null
    }
  }, [player, isOpen, defaultSchool, dynasty])

  // Update stats when selected year changes
  const handleYearChange = (newYear) => {
    setSelectedStatsYear(newYear)
    setJustSyncedThisPlayer(false) // Reset sync flag when changing years
    const yearStats = getYearStats(newYear)

    setFormData(prev => ({
      ...prev,
      // Update game logs for selected year
      snapsPlayed: yearStats.snapsPlayed,
      gamesPlayed: yearStats.gamesPlayed,

      // Update stats for selected year
      passing_completions: yearStats.passing.completions,
      passing_attempts: yearStats.passing.attempts,
      passing_yards: yearStats.passing.yards,
      passing_touchdowns: yearStats.passing.touchdowns,
      passing_interceptions: yearStats.passing.interceptions,
      passing_passingLong: yearStats.passing.passingLong,
      passing_sacksTaken: yearStats.passing.sacksTaken,

      rushing_carries: yearStats.rushing.carries,
      rushing_yards: yearStats.rushing.yards,
      rushing_touchdowns: yearStats.rushing.touchdowns,
      rushing_rushingLong: yearStats.rushing.rushingLong,
      rushing_fumbles: yearStats.rushing.fumbles,
      rushing_brokenTackles: yearStats.rushing.brokenTackles,

      receiving_receptions: yearStats.receiving.receptions,
      receiving_yards: yearStats.receiving.yards,
      receiving_touchdowns: yearStats.receiving.touchdowns,
      receiving_receivingLong: yearStats.receiving.receivingLong,
      receiving_drops: yearStats.receiving.drops,

      blocking_sacksAllowed: yearStats.blocking.sacksAllowed,

      defensive_soloTackles: yearStats.defensive.soloTackles,
      defensive_assistedTackles: yearStats.defensive.assistedTackles,
      defensive_tacklesForLoss: yearStats.defensive.tacklesForLoss,
      defensive_sacks: yearStats.defensive.sacks,
      defensive_interceptions: yearStats.defensive.interceptions,
      defensive_intReturnYards: yearStats.defensive.intReturnYards,
      defensive_defensiveTDs: yearStats.defensive.defensiveTDs,
      defensive_deflections: yearStats.defensive.deflections,
      defensive_forcedFumbles: yearStats.defensive.forcedFumbles,
      defensive_fumbleRecoveries: yearStats.defensive.fumbleRecoveries,

      kicking_fgMade: yearStats.kicking.fgMade,
      kicking_fgAttempted: yearStats.kicking.fgAttempted,
      kicking_fgLong: yearStats.kicking.fgLong,
      kicking_xpMade: yearStats.kicking.xpMade,
      kicking_xpAttempted: yearStats.kicking.xpAttempted,

      punting_punts: yearStats.punting.punts,
      punting_puntingYards: yearStats.punting.puntingYards,
      punting_puntsInside20: yearStats.punting.puntsInside20,
      punting_puntLong: yearStats.punting.puntLong,

      kickReturn_returns: yearStats.kickReturn.returns,
      kickReturn_returnYardage: yearStats.kickReturn.returnYardage,
      kickReturn_touchdowns: yearStats.kickReturn.touchdowns,
      kickReturn_returnLong: yearStats.kickReturn.returnLong,

      puntReturn_returns: yearStats.puntReturn.returns,
      puntReturn_returnYardage: yearStats.puntReturn.returnYardage,
      puntReturn_touchdowns: yearStats.puntReturn.touchdowns,
      puntReturn_returnLong: yearStats.puntReturn.returnLong
    }))
  }

  const availableYears = getAvailableYears()

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const toggleSection = (section) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const num = (val) => parseFloat(val) || 0

    // Build stats for the selected year (using INTERNAL format keys)
    const yearStats = {
      year: selectedStatsYear,
      gamesPlayed: num(formData.gamesPlayed),
      snapsPlayed: num(formData.snapsPlayed),
      passing: {
        cmp: num(formData.passing_completions),
        att: num(formData.passing_attempts),
        yds: num(formData.passing_yards),
        td: num(formData.passing_touchdowns),
        int: num(formData.passing_interceptions),
        lng: num(formData.passing_passingLong),
        sacks: num(formData.passing_sacksTaken)
      },
      rushing: {
        car: num(formData.rushing_carries),
        yds: num(formData.rushing_yards),
        td: num(formData.rushing_touchdowns),
        lng: num(formData.rushing_rushingLong),
        fum: num(formData.rushing_fumbles),
        bt: num(formData.rushing_brokenTackles)
      },
      receiving: {
        rec: num(formData.receiving_receptions),
        yds: num(formData.receiving_yards),
        td: num(formData.receiving_touchdowns),
        lng: num(formData.receiving_receivingLong),
        drops: num(formData.receiving_drops)
      },
      blocking: {
        sacksAllowed: num(formData.blocking_sacksAllowed),
        pancakes: num(formData.blocking_pancakes)
      },
      defense: {
        soloTkl: num(formData.defensive_soloTackles),
        astTkl: num(formData.defensive_assistedTackles),
        tfl: num(formData.defensive_tacklesForLoss),
        sacks: num(formData.defensive_sacks),
        int: num(formData.defensive_interceptions),
        intYds: num(formData.defensive_intReturnYards),
        td: num(formData.defensive_defensiveTDs),
        pd: num(formData.defensive_deflections),
        ff: num(formData.defensive_forcedFumbles),
        fr: num(formData.defensive_fumbleRecoveries)
      },
      kicking: {
        fgm: num(formData.kicking_fgMade),
        fga: num(formData.kicking_fgAttempted),
        lng: num(formData.kicking_fgLong),
        xpm: num(formData.kicking_xpMade),
        xpa: num(formData.kicking_xpAttempted)
      },
      punting: {
        punts: num(formData.punting_punts),
        yds: num(formData.punting_puntingYards),
        in20: num(formData.punting_puntsInside20),
        lng: num(formData.punting_puntLong)
      },
      kickReturn: {
        ret: num(formData.kickReturn_returns),
        yds: num(formData.kickReturn_returnYardage),
        td: num(formData.kickReturn_touchdowns),
        lng: num(formData.kickReturn_returnLong)
      },
      puntReturn: {
        ret: num(formData.puntReturn_returns),
        yds: num(formData.puntReturn_returnYardage),
        td: num(formData.puntReturn_touchdowns),
        lng: num(formData.puntReturn_returnLong)
      }
    }

    const updatedPlayer = {
      ...player,
      pictureUrl: formData.pictureUrl,
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
      position: formData.position,
      archetype: formData.archetype,
      school: formData.school,
      year: formData.year,
      devTrait: formData.devTrait,
      overall: num(formData.overall),
      jerseyNumber: formData.jerseyNumber,
      height: formData.height,
      weight: formData.weight ? num(formData.weight) : null,
      hometown: formData.hometown,
      state: formData.state,
      // Team status - current team the player belongs to
      team: formData.team || null,
      previousTeam: formData.previousTeam,
      yearStarted: formData.yearStarted,
      recruitYear: formData.recruitYear ? num(formData.recruitYear) : null,
      stars: num(formData.stars),
      positionRank: num(formData.positionRank),
      stateRank: num(formData.stateRank),
      nationalRank: num(formData.nationalRank),
      gemBust: formData.gemBust,
      overallProgression: formData.overallProgression,
      overallRatingChange: formData.overallRatingChange,
      draftRound: formData.draftRound,
      confPOW: num(formData.confPOW),
      nationalPOW: num(formData.nationalPOW),
      allConf1st: num(formData.allConf1st),
      allConf2nd: num(formData.allConf2nd),
      allConfFr: num(formData.allConfFr),
      allAm1st: num(formData.allAm1st),
      allAm2nd: num(formData.allAm2nd),
      allAmFr: num(formData.allAmFr),
      notes: formData.notes,
      links: formData.links,
      // Roster History - which team this player was on each year
      // For tid-based storage: convert abbreviations to tid for fully migrated dynasties
      teamsByYear: dynasty?._tidFullyMigrated
        ? Object.fromEntries(
            Object.entries(formData.teamsByYear || {}).map(([yearKey, teamValue]) => {
              // If value is already a number (tid), keep it; otherwise convert abbr to tid
              if (typeof teamValue === 'number') return [yearKey, teamValue]
              const tid = getTidFromAbbr(teamValue)
              return [yearKey, tid || teamValue] // Fallback to abbr if tid not found
            })
          )
        : formData.teamsByYear,
      // Class History - what class this player was each year
      classByYear: formData.classByYear,
      // Movement history by year (Transfer, None, etc.)
      movementsByYear: formData.movementsByYear,
      // Career Timeline - movement history (legacy)
      movements: formData.movements,
      // Status flags
      isRecruit: formData.isRecruit,
      isPortal: formData.isPortal,
      // Always clear isHonorOnly - this legacy flag should not be used
      isHonorOnly: false
    }

    // Pass both player info and year-specific stats
    onSave(updatedPlayer, yearStats)
  }

  if (!isOpen) return null

  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  const positions = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P']
  const classes = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']
  const devTraits = ['Elite', 'Star', 'Impact', 'Normal']
  const states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']

  const archetypeOptions = [
    'Backfield Creator', 'Dual Threat', 'Pocket Passer', 'Pure Runner',
    'Backfield Threat', 'East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'North/South Blocker',
    'Blocking', 'Utility',
    'Contested Specialist', 'Elusive Route Runner', 'Gadget', 'Gritty Possession', 'Physical Route Runner', 'Route Artist', 'Speedster',
    'Possession', 'Pure Blocker', 'Pure Possession', 'Vertical Threat',
    'Agile', 'Pass Protector', 'Raw Strength', 'Ground and Pound', 'Well Rounded',
    'Edge Setter', 'Gap Specialist', 'Power Rusher', 'Pure Power', 'Speed Rusher',
    'Lurker', 'Signal Caller', 'Thumper',
    'Boundary', 'Bump and Run', 'Field', 'Zone',
    'Box Specialist', 'Coverage Specialist', 'Hybrid',
    'Accurate', 'Power'
  ]

  const inputStyle = {
    borderColor: `${teamColors.primary}40`,
    backgroundColor: '#ffffff',
    color: '#1f2937'
  }

  const labelStyle = { color: secondaryText, opacity: 0.7 }

  // Check if section is expanded
  const isExpanded = (id) => expandedSections.includes(id)

  // Render a collapsible section header
  const renderSectionHeader = (id, title) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="w-full px-4 py-3 flex items-center justify-between transition-colors rounded-lg"
      style={{ backgroundColor: isExpanded(id) ? teamColors.primary : `${teamColors.primary}15` }}
    >
      <span className="font-bold" style={{ color: isExpanded(id) ? primaryText : teamColors.primary }}>{title}</span>
      <svg
        className={`w-5 h-5 transition-transform ${isExpanded(id) ? 'rotate-180' : ''}`}
        fill="none"
        stroke={isExpanded(id) ? primaryText : teamColors.primary}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  )

  // Compact searchable team input for Career Timeline
  const SearchableTeamInput = ({ value, onChange, placeholder = "Select team...", className = "", style = {}, teams }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [highlighted, setHighlighted] = useState(0)
    const containerRef = useRef(null)
    const inputRef = useRef(null)

    const teamList = teams || getTeamAbbreviationsList()
    const filtered = search
      ? teamList.filter(t => t.toLowerCase().includes(search.toLowerCase()))
      : teamList

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setIsOpen(false)
          setSearch('')
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
      setHighlighted(0)
    }, [search])

    const handleSelect = (team) => {
      onChange(team)
      setSearch('')
      setIsOpen(false)
      inputRef.current?.blur()
    }

    const handleKeyDown = (e) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          setIsOpen(true)
          e.preventDefault()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlighted(h => Math.min(h + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlighted(h => Math.max(h - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[highlighted]) handleSelect(filtered[highlighted])
          break
        case 'Escape':
          setIsOpen(false)
          setSearch('')
          inputRef.current?.blur()
          break
      }
    }

    return (
      <div ref={containerRef} className="relative" style={{ flex: style.flex }}>
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? search : value}
          onChange={(e) => {
            setSearch(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            setIsOpen(true)
            setSearch('')
          }}
          onKeyDown={handleKeyDown}
          placeholder={value || placeholder}
          className={className}
          style={style}
          autoComplete="off"
        />
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto" style={{ borderColor: style.borderColor }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No teams found</div>
            ) : (
              filtered.map((team, idx) => (
                <div
                  key={team}
                  onClick={() => handleSelect(team)}
                  onMouseEnter={() => setHighlighted(idx)}
                  className={`px-3 py-2 text-sm cursor-pointer ${idx === highlighted ? 'bg-gray-100' : ''} ${team === value ? 'font-medium bg-gray-50' : ''}`}
                >
                  {team}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] py-8 px-4 sm:p-4 overflow-y-auto"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-3xl my-auto flex flex-col"
        style={{ backgroundColor: teamColors.secondary, maxHeight: 'calc(100vh - 4rem)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex flex-col max-h-full overflow-hidden">
          {/* Header */}
          <div
            className="px-4 sm:px-6 py-4 flex-shrink-0"
            style={{ backgroundColor: teamColors.primary }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Clickable image/placeholder for quick upload */}
                <button
                  type="button"
                  onClick={() => setShowQuickImageModal(true)}
                  className="relative group"
                  title="Click to add/change photo"
                >
                  {formData.pictureUrl ? (
                    <img
                      src={formData.pictureUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 group-hover:opacity-80 transition-opacity"
                      style={{ borderColor: teamColors.secondary }}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center group-hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: `${teamColors.secondary}30` }}
                    >
                      <svg className="w-6 h-6" fill="none" stroke={primaryText} viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                  )}
                  {/* Camera overlay icon - only show when no image */}
                  {!formData.pictureUrl && (
                    <div
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: teamColors.secondary }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke={secondaryText} viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                    </div>
                  )}
                </button>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: primaryText }}>
                    {formData.name || 'Edit Player'}
                  </h2>
                  <p className="text-sm opacity-80" style={{ color: primaryText }}>
                    {formData.position && `${formData.position} • `}{formData.overall ? `${formData.overall} OVR` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: primaryText }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Year Selector in Header */}
            <div
              className="mt-3 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              style={{ backgroundColor: `${teamColors.secondary}20` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: primaryText }}>Stats Year:</span>
                <select
                  value={selectedStatsYear || ''}
                  onChange={(e) => handleYearChange(parseInt(e.target.value))}
                  className="px-3 py-1.5 rounded-lg font-bold text-sm"
                  style={{ backgroundColor: teamColors.secondary, color: secondaryText }}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs" style={{ color: primaryText, opacity: 0.8 }}>
                Stats apply to selected season
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* Basic Information */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('basic', 'Basic Information')}
              {isExpanded('basic') && (
                <div className="p-4 space-y-4" style={{ backgroundColor: teamColors.secondary }}>
                  {/* Player Picture */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Player Picture</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        name="pictureUrl"
                        value={formData.pictureUrl ?? ''}
                        onChange={handleChange}
                        onPaste={handlePaste}
                        placeholder="Paste image here (Ctrl+V) or enter URL..."
                        className="flex-1 px-3 py-2.5 rounded-lg border-2 text-sm"
                        style={inputStyle}
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="px-3 py-2.5 rounded-lg border-2 text-sm font-medium flex items-center gap-1.5 whitespace-nowrap"
                        style={{
                          backgroundColor: teamColors.primary,
                          color: getContrastTextColor(teamColors.primary),
                          borderColor: teamColors.primary,
                          opacity: uploading ? 0.7 : 1,
                          cursor: uploading ? 'wait' : 'pointer'
                        }}
                      >
                        {uploading ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Upload
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>First Name</label>
                      <input type="text" name="firstName" value={formData.firstName ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Last Name</label>
                      <input type="text" name="lastName" value={formData.lastName ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Jersey #</label>
                      <input type="text" name="jerseyNumber" value={formData.jerseyNumber ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Overall</label>
                      <input type="text" name="overall" value={formData.overall ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Position</label>
                      <select name="position" value={formData.position ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle}>
                        <option value="">Select...</option>
                        {positions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Archetype</label>
                      <select name="archetype" value={formData.archetype ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle}>
                        <option value="">Select...</option>
                        {archetypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Class</label>
                      <select name="year" value={formData.year ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle}>
                        <option value="">Select...</option>
                        {classes.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Dev Trait</label>
                      <select name="devTrait" value={formData.devTrait ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle}>
                        <option value="">Select...</option>
                        {devTraits.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Height</label>
                      <input type="text" name="height" value={formData.height ?? ''} onChange={handleChange} placeholder="6'2&quot;" className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Weight</label>
                      <input type="text" name="weight" value={formData.weight ?? ''} onChange={handleChange} placeholder="220" className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Hometown</label>
                      <input type="text" name="hometown" value={formData.hometown ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>State</label>
                      <select name="state" value={formData.state ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle}>
                        <option value="">Select...</option>
                        {states.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recruiting & Development */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('recruiting', 'Recruiting & Development')}
              {isExpanded('recruiting') && (
                <div className="p-4 space-y-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Class Year</label>
                      <input type="text" name="recruitYear" value={formData.recruitYear ?? ''} onChange={handleChange} placeholder="2025" className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Stars</label>
                      <input type="text" name="stars" value={formData.stars ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Pos Rank</label>
                      <input type="text" name="positionRank" value={formData.positionRank ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>State Rank</label>
                      <input type="text" name="stateRank" value={formData.stateRank ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Nat'l Rank</label>
                      <input type="text" name="nationalRank" value={formData.nationalRank ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Gem/Bust</label>
                      <select name="gemBust" value={formData.gemBust ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle}>
                        <option value="">Neither</option>
                        <option value="Gem">Gem</option>
                        <option value="Bust">Bust</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>OVR Progression</label>
                      <input type="text" name="overallProgression" value={formData.overallProgression ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>OVR Change</label>
                      <input type="text" name="overallRatingChange" value={formData.overallRatingChange ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Transfer From</label>
                      <SearchableTeamInput
                        value={formData.previousTeam ?? ''}
                        onChange={(team) => setFormData(prev => ({ ...prev, previousTeam: team }))}
                        placeholder="Select team..."
                        className="w-full px-3 py-2.5 rounded-lg border-2 text-sm"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div className="flex gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="isRecruit"
                        checked={formData.isRecruit || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, isRecruit: e.target.checked }))}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm" style={labelStyle}>Is Recruit (not yet enrolled)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="isPortal"
                        checked={formData.isPortal || false}
                        onChange={(e) => setFormData(prev => ({ ...prev, isPortal: e.target.checked }))}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm" style={labelStyle}>Is Portal Transfer</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Accolades */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('accolades', 'Accolades')}
              {isExpanded('accolades') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Conf POW</label>
                      <input type="text" name="confPOW" value={formData.confPOW ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Nat'l POW</label>
                      <input type="text" name="nationalPOW" value={formData.nationalPOW ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>All-Conf 1st</label>
                      <input type="text" name="allConf1st" value={formData.allConf1st ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>All-Conf 2nd</label>
                      <input type="text" name="allConf2nd" value={formData.allConf2nd ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>All-Am 1st</label>
                      <input type="text" name="allAm1st" value={formData.allAm1st ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>All-Am 2nd</label>
                      <input type="text" name="allAm2nd" value={formData.allAm2nd ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Fr All-Conf</label>
                      <input type="text" name="allConfFr" value={formData.allConfFr ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Fr All-Am</label>
                      <input type="text" name="allAmFr" value={formData.allAmFr ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Career Timeline - Vertical timeline with arrows */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('rosterStatus', 'Career Timeline')}
              {isExpanded('rosterStatus') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  {(() => {
                    const teamsByYear = formData.teamsByYear || {}
                    const classByYear = formData.classByYear || {}
                    const movementsByYear = formData.movementsByYear || {}
                    const currentYear = dynasty?.currentYear || new Date().getFullYear()

                    // Get all years with data
                    const dataYears = [...new Set([
                      ...Object.keys(teamsByYear),
                      ...Object.keys(classByYear)
                    ])].map(y => parseInt(y)).filter(y => !isNaN(y)).sort((a, b) => a - b)

                    // Determine the range of years to show
                    const minYear = dataYears.length > 0 ? Math.min(...dataYears) : currentYear
                    const maxYear = dataYears.length > 0 ? Math.max(...dataYears, currentYear) : currentYear

                    // Build array of ALL years from min to max (no gaps!)
                    const allYears = []
                    for (let y = minYear; y <= maxYear; y++) {
                      allYears.push(y)
                    }

                    // Entry types and movement types
                    const entryTypes = ['Recruited', 'Portal Transfer', 'Created']
                    const movementTypes = ['Stayed', 'Transferred', 'Entered Portal', 'Recommitted']
                    const exitTypes = ['Active', 'Graduated', 'Pro Draft', 'Transfer Out', 'Encouraged Transfer', 'Cut']

                    // Get entry type based on player data
                    const getEntryType = () => {
                      if (formData.isPortal) return 'Portal Transfer'
                      if (formData.isRecruit !== false) return 'Recruited'
                      return 'Created'
                    }

                    // Get exit info - check encourageTransfersByTeamYear first (source of truth), then legacy movements
                    // Note: Encourage transfers data is stored under the NEW season year (maxYear + 1)
                    const lastTeamForExit = teamsByYear[String(maxYear)] || teamsByYear[maxYear] || ''
                    const nextYearForExit = maxYear + 1
                    const encouragedTransfers = dynasty?.encourageTransfersByTeamYear?.[lastTeamForExit]?.[nextYearForExit] || []
                    const wasEncouragedTransfer = encouragedTransfers.some(t =>
                      t.name?.toLowerCase().trim() === player?.name?.toLowerCase().trim()
                    )
                    // Find any exit movement (departure, graduate, draft)
                    const exitMovementTypes = ['departure', 'graduate', 'draft']
                    const departureMovement = (formData.movements || []).find(m => exitMovementTypes.includes(m.type))
                    const getExitType = () => {
                      if (wasEncouragedTransfer) return 'Encouraged Transfer'
                      if (!departureMovement) return 'Active'
                      // Map movement type to display value
                      if (departureMovement.type === 'graduate') return 'Graduated'
                      if (departureMovement.type === 'draft') return 'Pro Draft'
                      // Legacy departure with reason
                      if (departureMovement.reason === 'Graduating') return 'Graduated'
                      return departureMovement.reason || 'Active'
                    }

                    // Arrow component
                    const Arrow = () => (
                      <div className="flex justify-center py-1">
                        <svg className="w-4 h-4" style={{ color: secondaryText, opacity: 0.4 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                    )

                    return (
                      <div className="space-y-0">
                        {/* ENTRY - How player was created */}
                        <div className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: '#dcfce7' }}>
                          <div className="w-20 text-xs font-semibold text-green-700">ENTRY</div>
                          <select
                            value={getEntryType()}
                            onChange={(e) => {
                              const type = e.target.value
                              setFormData(prev => ({
                                ...prev,
                                isRecruit: type === 'Recruited',
                                isPortal: type === 'Portal Transfer',
                                previousTeam: type === 'Portal Transfer' ? prev.previousTeam : ''
                              }))
                            }}
                            className="flex-1 px-3 py-2 rounded border text-sm bg-white border-green-300"
                          >
                            {entryTypes.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          {getEntryType() === 'Portal Transfer' && (
                            <>
                              <span className="text-xs text-green-700">from</span>
                              <SearchableTeamInput
                                value={formData.previousTeam || ''}
                                onChange={(team) => setFormData(prev => ({ ...prev, previousTeam: team }))}
                                placeholder="Team..."
                                className="w-28 px-2 py-2 rounded border text-sm bg-white border-green-300"
                                style={{ borderColor: '#86efac' }}
                              />
                            </>
                          )}
                        </div>

                        {allYears.map((year, idx) => {
                          const yearKey = String(year)
                          const team = teamsByYear[yearKey] || teamsByYear[year] || ''
                          const playerClass = classByYear[yearKey] || classByYear[year] || ''
                          const isMissing = !team
                          const isLast = idx === allYears.length - 1

                          // Get next year's team to auto-detect transfers
                          const nextYear = allYears[idx + 1]
                          const nextYearKey = nextYear ? String(nextYear) : null
                          const nextTeam = nextYearKey ? (teamsByYear[nextYearKey] || teamsByYear[nextYear] || '') : ''

                          // Auto-detect movement: if team changes, it's a transfer
                          const storedMovement = movementsByYear[yearKey] || movementsByYear[year]
                          const autoMovement = (team && nextTeam && team !== nextTeam) ? 'Transferred' : 'Stayed'
                          const movement = storedMovement || autoMovement

                          return (
                            <div key={year}>
                              {/* Arrow before season */}
                              <Arrow />

                              {/* Season row */}
                              <div
                                className={`flex items-center gap-2 p-2 rounded-lg ${isMissing ? 'bg-red-100' : ''}`}
                                style={{ backgroundColor: isMissing ? undefined : `${teamColors.primary}15` }}
                              >
                                {/* Year badge */}
                                <div
                                  className="w-14 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                                  style={{ backgroundColor: teamColors.primary, color: primaryText }}
                                >
                                  {year}
                                </div>

                                {/* Team */}
                                <SearchableTeamInput
                                  value={team}
                                  onChange={(newTeam) => {
                                    setFormData(prev => ({
                                      ...prev,
                                      teamsByYear: { ...prev.teamsByYear, [yearKey]: newTeam }
                                    }))
                                  }}
                                  placeholder="Select team..."
                                  className={`w-full px-3 py-2 rounded-lg border text-sm bg-white ${isMissing ? 'border-red-400' : ''}`}
                                  style={{ flex: 1, borderColor: isMissing ? undefined : `${teamColors.primary}40` }}
                                />

                                {/* Class */}
                                <select
                                  value={playerClass}
                                  onChange={(e) => {
                                    setFormData(prev => ({
                                      ...prev,
                                      classByYear: { ...prev.classByYear, [yearKey]: e.target.value }
                                    }))
                                  }}
                                  className="w-24 px-2 py-2 rounded-lg border text-sm bg-white"
                                  style={{ borderColor: `${teamColors.primary}40` }}
                                >
                                  <option value="">Class</option>
                                  {classes.map(cls => (
                                    <option key={cls} value={cls}>{cls}</option>
                                  ))}
                                </select>

                                {/* Delete button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => {
                                      const newTeamsByYear = { ...prev.teamsByYear }
                                      const newClassByYear = { ...prev.classByYear }
                                      const newMovementsByYear = { ...prev.movementsByYear }
                                      delete newTeamsByYear[yearKey]
                                      delete newTeamsByYear[year]
                                      delete newClassByYear[yearKey]
                                      delete newClassByYear[year]
                                      delete newMovementsByYear[yearKey]
                                      delete newMovementsByYear[year]
                                      return { ...prev, teamsByYear: newTeamsByYear, classByYear: newClassByYear, movementsByYear: newMovementsByYear }
                                    })
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>

                              {/* Movement row (between seasons, not after last) */}
                              {!isLast && (
                                <>
                                  <Arrow />
                                  <div className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: '#fef3c7' }}>
                                    <div className="w-20 text-xs font-semibold text-amber-700">MOVEMENT</div>
                                    <select
                                      value={movement}
                                      onChange={(e) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          movementsByYear: { ...prev.movementsByYear, [yearKey]: e.target.value }
                                        }))
                                      }}
                                      className="flex-1 px-3 py-2 rounded border text-sm bg-white border-amber-300"
                                    >
                                      {movementTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}

                        {/* Arrow before exit */}
                        <Arrow />

                        {/* EXIT - Player's current status */}
                        <div className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: '#fee2e2' }}>
                          <div className="w-20 text-xs font-semibold text-red-700">EXIT</div>
                          <select
                            value={getExitType()}
                            onChange={(e) => {
                              const exitType = e.target.value
                              // Map exit display value to movement type
                              const getMovementType = (exit) => {
                                if (exit === 'Graduated') return 'graduate'
                                if (exit === 'Pro Draft') return 'draft'
                                return 'departure' // For Transfer Out, Cut, etc.
                              }
                              setFormData(prev => {
                                // Remove any existing exit movements
                                const filteredMovements = (prev.movements || []).filter(m =>
                                  !exitMovementTypes.includes(m.type)
                                )
                                if (exitType === 'Active') {
                                  return { ...prev, movements: filteredMovements }
                                } else {
                                  const movementType = getMovementType(exitType)
                                  return {
                                    ...prev,
                                    movements: [...filteredMovements, {
                                      type: movementType,
                                      year: maxYear,
                                      from: teamsByYear[String(maxYear)] || '',
                                      reason: exitType,
                                      timestamp: Date.now()
                                    }]
                                  }
                                }
                              })
                            }}
                            className="flex-1 px-3 py-2 rounded border text-sm bg-white border-red-300"
                          >
                            {exitTypes.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>

                        {/* Add Season Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const newYear = maxYear + 1
                            const lastTeam = teamsByYear[String(maxYear)] || teamsByYear[maxYear] || formData.team || ''
                            setFormData(prev => ({
                              ...prev,
                              teamsByYear: { ...prev.teamsByYear, [String(newYear)]: lastTeam },
                              classByYear: { ...prev.classByYear, [String(newYear)]: '' },
                              movementsByYear: { ...prev.movementsByYear, [String(maxYear)]: 'Stayed' }
                            }))
                          }}
                          className="w-full py-2 mt-2 rounded-lg border-2 border-dashed text-sm font-medium hover:border-solid"
                          style={{ borderColor: `${teamColors.primary}40`, color: teamColors.primary }}
                        >
                          + Add Season ({maxYear + 1})
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Box Score Stats Sync */}
            {boxScoreTotals && (
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: `2px solid ${statsOutOfSync ? '#f59e0b' : teamColors.primary}`,
                  backgroundColor: statsOutOfSync ? '#fef3c720' : undefined
                }}
              >
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ backgroundColor: statsOutOfSync ? '#f59e0b20' : `${teamColors.primary}20` }}
                >
                  <div className="flex items-center gap-2">
                    {statsOutOfSync ? (
                      <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className="font-semibold text-sm" style={{ color: primaryText }}>
                      {statsOutOfSync ? 'Stats Out of Sync' : 'Stats In Sync'}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: primaryText, opacity: 0.7 }}>
                    Box Scores: {boxScoreTotals.gamesPlayed || 0} games
                  </span>
                </div>

                {statsOutOfSync && !justSyncedThisPlayer && (
                  <div className="p-4 space-y-3" style={{ backgroundColor: teamColors.secondary }}>
                    <p className="text-xs" style={{ color: secondaryText, opacity: 0.8 }}>
                      This player's stats don't match the sum of their box scores. This is fine if you plan to enter total season stats manually at end of year.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSyncThisPlayerClick}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                        style={{
                          backgroundColor: teamColors.primary,
                          color: getContrastTextColor(teamColors.primary)
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Sync This Player
                      </button>
                      {onSyncAllPlayers && (
                        <button
                          type="button"
                          disabled={syncingAll}
                          onClick={handleSyncAllPlayersClick}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border-2 disabled:opacity-50"
                          style={{
                            borderColor: teamColors.primary,
                            color: primaryText
                          }}
                        >
                          {syncingAll ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          )}
                          {syncingAll ? 'Syncing...' : `Sync All Players (${selectedStatsYear})`}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Game Log */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('gamelog', `Game Log (${selectedStatsYear})`)}
              {isExpanded('gamelog') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Games Played</label>
                      <input type="text" name="gamesPlayed" value={formData.gamesPlayed ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Snaps Played</label>
                      <input type="text" name="snapsPlayed" value={formData.snapsPlayed ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Passing Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('passing', `Passing (${selectedStatsYear})`)}
              {isExpanded('passing') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Completions</label>
                      <input type="text" name="passing_completions" value={formData.passing_completions ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Attempts</label>
                      <input type="text" name="passing_attempts" value={formData.passing_attempts ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Yards</label>
                      <input type="text" name="passing_yards" value={formData.passing_yards ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>TDs</label>
                      <input type="text" name="passing_touchdowns" value={formData.passing_touchdowns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>INTs</label>
                      <input type="text" name="passing_interceptions" value={formData.passing_interceptions ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Long</label>
                      <input type="text" name="passing_passingLong" value={formData.passing_passingLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Sacks</label>
                      <input type="text" name="passing_sacksTaken" value={formData.passing_sacksTaken ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rushing Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('rushing', `Rushing (${selectedStatsYear})`)}
              {isExpanded('rushing') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Carries</label>
                      <input type="text" name="rushing_carries" value={formData.rushing_carries ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Yards</label>
                      <input type="text" name="rushing_yards" value={formData.rushing_yards ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>TDs</label>
                      <input type="text" name="rushing_touchdowns" value={formData.rushing_touchdowns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Long</label>
                      <input type="text" name="rushing_rushingLong" value={formData.rushing_rushingLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Fumbles</label>
                      <input type="text" name="rushing_fumbles" value={formData.rushing_fumbles ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Broken Tackles</label>
                      <input type="text" name="rushing_brokenTackles" value={formData.rushing_brokenTackles ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Receiving Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('receiving', `Receiving (${selectedStatsYear})`)}
              {isExpanded('receiving') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Receptions</label>
                      <input type="text" name="receiving_receptions" value={formData.receiving_receptions ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Yards</label>
                      <input type="text" name="receiving_yards" value={formData.receiving_yards ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>TDs</label>
                      <input type="text" name="receiving_touchdowns" value={formData.receiving_touchdowns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Long</label>
                      <input type="text" name="receiving_receivingLong" value={formData.receiving_receivingLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Drops</label>
                      <input type="text" name="receiving_drops" value={formData.receiving_drops ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Blocking Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('blocking', `Blocking (${selectedStatsYear})`)}
              {isExpanded('blocking') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Sacks Allowed</label>
                      <input type="text" name="blocking_sacksAllowed" value={formData.blocking_sacksAllowed ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Defensive Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('defensive', `Defense (${selectedStatsYear})`)}
              {isExpanded('defensive') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Solo Tackles</label>
                      <input type="text" name="defensive_soloTackles" value={formData.defensive_soloTackles ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Asst Tackles</label>
                      <input type="text" name="defensive_assistedTackles" value={formData.defensive_assistedTackles ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>TFL</label>
                      <input type="text" name="defensive_tacklesForLoss" value={formData.defensive_tacklesForLoss ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Sacks</label>
                      <input type="text" name="defensive_sacks" value={formData.defensive_sacks ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>INTs</label>
                      <input type="text" name="defensive_interceptions" value={formData.defensive_interceptions ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>INT Yards</label>
                      <input type="text" name="defensive_intReturnYards" value={formData.defensive_intReturnYards ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Def TDs</label>
                      <input type="text" name="defensive_defensiveTDs" value={formData.defensive_defensiveTDs ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Pass Def</label>
                      <input type="text" name="defensive_deflections" value={formData.defensive_deflections ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Forced Fum</label>
                      <input type="text" name="defensive_forcedFumbles" value={formData.defensive_forcedFumbles ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Fum Rec</label>
                      <input type="text" name="defensive_fumbleRecoveries" value={formData.defensive_fumbleRecoveries ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Kicking Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('kicking', `Kicking (${selectedStatsYear})`)}
              {isExpanded('kicking') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>FG Made</label>
                      <input type="text" name="kicking_fgMade" value={formData.kicking_fgMade ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>FG Att</label>
                      <input type="text" name="kicking_fgAttempted" value={formData.kicking_fgAttempted ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>FG Long</label>
                      <input type="text" name="kicking_fgLong" value={formData.kicking_fgLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>XP Made</label>
                      <input type="text" name="kicking_xpMade" value={formData.kicking_xpMade ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>XP Att</label>
                      <input type="text" name="kicking_xpAttempted" value={formData.kicking_xpAttempted ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Punting Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('punting', `Punting (${selectedStatsYear})`)}
              {isExpanded('punting') && (
                <div className="p-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Punts</label>
                      <input type="text" name="punting_punts" value={formData.punting_punts ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Yards</label>
                      <input type="text" name="punting_puntingYards" value={formData.punting_puntingYards ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Inside 20</label>
                      <input type="text" name="punting_puntsInside20" value={formData.punting_puntsInside20 ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Long</label>
                      <input type="text" name="punting_puntLong" value={formData.punting_puntLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Returns Stats */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('returns', `Returns (${selectedStatsYear})`)}
              {isExpanded('returns') && (
                <div className="p-4 space-y-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div>
                    <p className="text-xs font-medium mb-2" style={labelStyle}>Kick Returns</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Returns</label>
                        <input type="text" name="kickReturn_returns" value={formData.kickReturn_returns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Yards</label>
                        <input type="text" name="kickReturn_returnYardage" value={formData.kickReturn_returnYardage ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>TDs</label>
                        <input type="text" name="kickReturn_touchdowns" value={formData.kickReturn_touchdowns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Long</label>
                        <input type="text" name="kickReturn_returnLong" value={formData.kickReturn_returnLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2" style={labelStyle}>Punt Returns</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Returns</label>
                        <input type="text" name="puntReturn_returns" value={formData.puntReturn_returns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Yards</label>
                        <input type="text" name="puntReturn_returnYardage" value={formData.puntReturn_returnYardage ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>TDs</label>
                        <input type="text" name="puntReturn_touchdowns" value={formData.puntReturn_touchdowns ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Long</label>
                        <input type="text" name="puntReturn_returnLong" value={formData.puntReturn_returnLong ?? ''} onChange={handleChange} className="w-full px-3 py-2.5 rounded-lg border-2 text-sm" style={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes & Media */}
            <div className="rounded-xl overflow-hidden" style={{ border: `2px solid ${teamColors.primary}` }}>
              {renderSectionHeader('notes', 'Notes & Media')}
              {isExpanded('notes') && (
                <div className="p-4 space-y-4" style={{ backgroundColor: teamColors.secondary }}>
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={labelStyle}>Notes</label>
                    <textarea
                      name="notes"
                      value={formData.notes ?? ''}
                      onChange={handleChange}
                      placeholder="Add notes about this player..."
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-lg border-2 text-sm resize-y"
                      style={inputStyle}
                    />
                  </div>

                  {/* Links */}
                  <div>
                    <label className="block text-xs font-medium mb-2" style={labelStyle}>Links</label>
                    {formData.links?.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {formData.links.map((link, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={link.title || ''}
                              onChange={(e) => {
                                const newLinks = [...formData.links]
                                newLinks[index] = { ...newLinks[index], title: e.target.value }
                                setFormData(prev => ({ ...prev, links: newLinks }))
                              }}
                              placeholder="Title"
                              className="flex-1 px-3 py-2 rounded-lg border-2 text-sm"
                              style={inputStyle}
                            />
                            <input
                              type="text"
                              value={link.url || ''}
                              onChange={(e) => {
                                const newLinks = [...formData.links]
                                newLinks[index] = { ...newLinks[index], url: e.target.value }
                                setFormData(prev => ({ ...prev, links: newLinks }))
                              }}
                              placeholder="URL"
                              className="flex-[2] px-3 py-2 rounded-lg border-2 text-sm"
                              style={inputStyle}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newLinks = formData.links.filter((_, i) => i !== index)
                                setFormData(prev => ({ ...prev, links: newLinks }))
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const newLinks = [...(formData.links || []), { title: '', url: '' }]
                        setFormData(prev => ({ ...prev, links: newLinks }))
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ backgroundColor: `${teamColors.primary}20`, color: teamColors.primary }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Link
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div
            className="px-6 py-4 flex justify-end gap-3 flex-shrink-0 border-t"
            style={{ backgroundColor: teamColors.secondary, borderColor: `${teamColors.primary}20` }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
              style={{ color: secondaryText, backgroundColor: `${teamColors.primary}15` }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
              style={{ backgroundColor: teamColors.primary, color: primaryText }}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Quick Image Upload Modal */}
      {showQuickImageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4"
          style={{ margin: 0 }}
          onMouseDown={() => setShowQuickImageModal(false)}
        >
          <div
            className="rounded-xl max-w-sm w-full overflow-hidden shadow-2xl"
            style={{ backgroundColor: teamColors.secondary }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4" style={{ backgroundColor: teamColors.primary }}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: primaryText }}>
                  {formData.pictureUrl ? 'Change Photo' : 'Add Photo'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowQuickImageModal(false)}
                  className="p-1 rounded-lg hover:bg-white/10"
                  style={{ color: primaryText }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Current image preview */}
              {formData.pictureUrl && (
                <div className="flex justify-center">
                  <img
                    src={formData.pictureUrl}
                    alt=""
                    className="w-24 h-24 rounded-full object-cover border-4"
                    style={{ borderColor: teamColors.primary }}
                  />
                </div>
              )}

              {/* Paste area */}
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-text"
                style={{ borderColor: teamColors.primary }}
                tabIndex={0}
                onPaste={async (e) => {
                  const items = e.clipboardData?.items
                  if (!items) return
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      e.preventDefault()
                      const file = item.getAsFile()
                      if (file) {
                        const url = await uploadToImgBB(file)
                        if (url) {
                          setFormData(prev => ({ ...prev, pictureUrl: url }))
                          setShowQuickImageModal(false)
                        }
                      }
                      return
                    }
                  }
                }}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <svg className="animate-spin h-8 w-8" style={{ color: teamColors.primary }} viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="text-sm font-medium" style={{ color: secondaryText }}>Uploading...</p>
                  </div>
                ) : (
                  <>
                    <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke={teamColors.primary} viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
                    </svg>
                    <p className="text-sm font-medium mb-1" style={{ color: secondaryText }}>
                      Click here and paste image (Ctrl+V)
                    </p>
                    <p className="text-xs" style={{ color: secondaryText, opacity: 0.7 }}>
                      Works with screenshots & copied images
                    </p>
                  </>
                )}
              </div>

              {/* Or divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: `${teamColors.primary}30` }} />
                <span className="text-xs font-medium" style={{ color: secondaryText, opacity: 0.7 }}>or</span>
                <div className="flex-1 h-px" style={{ backgroundColor: `${teamColors.primary}30` }} />
              </div>

              {/* File upload button */}
              <input
                type="file"
                ref={quickFileInputRef}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (!file.type.startsWith('image/')) {
                    alert('Please select an image file')
                    return
                  }
                  if (file.size > 32 * 1024 * 1024) {
                    alert('Image must be less than 32MB')
                    return
                  }
                  const url = await uploadToImgBB(file)
                  if (url) {
                    setFormData(prev => ({ ...prev, pictureUrl: url }))
                    setShowQuickImageModal(false)
                  }
                  e.target.value = ''
                }}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => quickFileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
                style={{
                  backgroundColor: teamColors.primary,
                  color: primaryText,
                  opacity: uploading ? 0.7 : 1
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Choose from Device
              </button>

              {/* Remove photo button if exists */}
              {formData.pictureUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, pictureUrl: '' }))
                    setShowQuickImageModal(false)
                  }}
                  className="w-full py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sync Confirmation Modal */}
      {showSyncConfirmation && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4"
          style={{ margin: 0 }}
          onMouseDown={(e) => {
            e.stopPropagation()
            setShowSyncConfirmation(null)
          }}
        >
          <div
            className="rounded-xl w-full max-w-md overflow-hidden"
            style={{ backgroundColor: teamColors.secondary }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4" style={{ backgroundColor: teamColors.primary }}>
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={getContrastTextColor(teamColors.primary)}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-bold" style={{ color: getContrastTextColor(teamColors.primary) }}>
                  Detailed Stats Already Entered
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <p className="text-sm" style={{ color: secondaryText }}>
                You've already entered detailed stats for <strong>{selectedStatsYear}</strong> via the end-of-season Detailed Stats Entry sheet.
              </p>
              <p className="text-sm" style={{ color: secondaryText }}>
                <strong>Syncing will replace those stats</strong> with the totals calculated from your game box scores.
              </p>
              <div className="p-3 rounded-lg" style={{ backgroundColor: `${teamColors.primary}15` }}>
                <p className="text-xs font-medium" style={{ color: primaryText }}>
                  {showSyncConfirmation === 'this'
                    ? `This will overwrite ${player?.name || 'this player'}'s detailed stats with box score totals.`
                    : `This will overwrite ALL players' detailed stats for ${selectedStatsYear} with box score totals.`}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 flex gap-3 border-t" style={{ borderColor: `${teamColors.primary}30` }}>
              <button
                onClick={() => setShowSyncConfirmation(null)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm border-2"
                style={{ borderColor: teamColors.primary, color: primaryText }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const syncType = showSyncConfirmation
                  setShowSyncConfirmation(null)
                  if (syncType === 'this') {
                    handleSyncThisPlayer()
                  } else {
                    performSyncAllPlayers()
                  }
                }}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm"
                style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
              >
                Sync Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
