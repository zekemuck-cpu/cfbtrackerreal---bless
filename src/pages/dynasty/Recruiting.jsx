import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getTeamColors } from '../../data/teamColors'
import { getTeamLogo } from '../../data/teams'
import { teamAbbreviations, getAbbreviationFromDisplayName } from '../../data/teamAbbreviations'
import RecruitingCommitmentsModal from '../../components/RecruitingCommitmentsModal'

// Star display helper
const StarRating = ({ stars, size = 'md' }) => {
  const starCount = Number(stars) || 0
  const sizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={sizes[size]}
          fill={i < starCount ? '#FFD700' : '#D1D5DB'}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

// State abbreviation to full name
const stateFullNames = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'Washington D.C.'
}

// Dev trait badge colors
const getDevTraitStyle = (devTrait) => {
  switch (devTrait?.toLowerCase()) {
    case 'elite':
      return { backgroundColor: '#FCD34D', color: '#78350F' }
    case 'star':
      return { backgroundColor: '#A78BFA', color: '#4C1D95' }
    case 'impact':
      return { backgroundColor: '#60A5FA', color: '#1E3A8A' }
    default:
      return { backgroundColor: '#9CA3AF', color: '#1F2937' }
  }
}

// Gem/Bust badge
const GemBustBadge = ({ value }) => {
  if (!value) return null
  const isGem = value.toLowerCase() === 'gem'
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{
        backgroundColor: isGem ? '#10B981' : '#EF4444',
        color: 'white'
      }}
    >
      {isGem ? '💎 Gem' : '💥 Bust'}
    </span>
  )
}

export default function Recruiting() {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { teamAbbr: urlTeamAbbr, year: urlYear } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const location = useLocation()

  // View mode: 'both' (default), 'hs', 'portal'
  // Initialize from URL if portal path, otherwise default to 'both'
  const [viewMode, setViewMode] = useState(() => {
    if (location.pathname.includes('/recruiting/portal/')) return 'portal'
    return 'both'
  })

  // Star filter state - which star ratings to show (empty = show all)
  const [selectedStars, setSelectedStars] = useState([])

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false)

  // Toggle star filter
  const toggleStarFilter = (starCount) => {
    setSelectedStars(prev =>
      prev.includes(starCount)
        ? prev.filter(s => s !== starCount)
        : [...prev, starCount]
    )
  }

  // Get current team abbreviation (for redirect if no URL params)
  const currentTeamAbbr = getAbbreviationFromDisplayName(currentDynasty?.teamName) || currentDynasty?.teamName

  // Use URL params if provided, otherwise use current team/year
  const teamAbbr = urlTeamAbbr || currentTeamAbbr
  const selectedYear = urlYear === 'all' ? 'all' : (urlYear ? Number(urlYear) : currentDynasty?.currentYear)

  // Get team info for display
  const teamData = teamAbbreviations[teamAbbr]
  const teamFullName = teamData?.name || teamAbbr
  const teamLogo = getTeamLogo(teamFullName)

  // Use the viewed team's colors (pass full team name, not abbreviation)
  const viewedTeamColors = getTeamColors(teamFullName)
  const teamColors = viewedTeamColors || { primary: '#1F2937', secondary: '#F3F4F6' }
  const secondaryBgText = getContrastTextColor(teamColors.secondary)
  const primaryBgText = getContrastTextColor(teamColors.primary)

  // Redirect to team-specific URL if on base /recruiting route
  // Default to previous year if no recruits for current year (unless it's the first year)
  useEffect(() => {
    if (!urlTeamAbbr && currentTeamAbbr && currentDynasty?.currentYear) {
      const currentYear = currentDynasty.currentYear
      const startYear = currentDynasty.startYear || currentYear
      const isFirstYear = currentYear === startYear

      // Check if there are any recruits for the current year
      const currentYearCommitments = currentDynasty.recruitingCommitmentsByTeamYear?.[currentTeamAbbr]?.[currentYear] || {}
      const hasCurrentYearRecruits = Object.keys(currentYearCommitments).length > 0

      // If no recruits for current year and not first year, show previous year
      const targetYear = (!hasCurrentYearRecruits && !isFirstYear) ? currentYear - 1 : currentYear

      navigate(`${pathPrefix}/recruiting/${currentTeamAbbr}/${targetYear}`, { replace: true })
    }
  }, [urlTeamAbbr, currentTeamAbbr, currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.startYear, currentDynasty?.recruitingCommitmentsByTeamYear, navigate, pathPrefix])

  // Get all years with recruiting commitments for this team - TEAM-CENTRIC
  // Always include current year so user can view/enter current season's recruits
  const availableYears = useMemo(() => {
    const years = currentDynasty?.recruitingCommitmentsByTeamYear?.[teamAbbr]
      ? Object.keys(currentDynasty.recruitingCommitmentsByTeamYear[teamAbbr]).map(Number)
      : []

    // Always include current year if not already present
    if (currentDynasty?.currentYear && !years.includes(currentDynasty.currentYear)) {
      years.push(currentDynasty.currentYear)
    }

    return years.sort((a, b) => b - a) // Most recent first
  }, [currentDynasty?.recruitingCommitmentsByTeamYear, teamAbbr, currentDynasty?.currentYear])

  // Handle year change - navigate to new URL
  const handleYearChange = (newYear) => {
    navigate(`${pathPrefix}/recruiting/${teamAbbr}/${newYear}`)
  }

  // Check if viewing all seasons
  const isAllSeasons = selectedYear === 'all'

  // Change view mode (both/hs/portal)
  const handleViewModeChange = (mode) => {
    setViewMode(mode)
  }

  // Handle saving recruiting edits
  const handleRecruitingSave = async (recruits) => {
    if (!currentDynasty?.id) return

    const existingPlayers = currentDynasty.players || []
    const maxExistingPID = existingPlayers.reduce((max, p) => Math.max(max, p.pid || 0), 0)
    let nextPID = Math.max(maxExistingPID + 1, currentDynasty.nextPID || 1)

    const classToYear = {
      'HS': 'Fr',
      'JUCO Fr': 'So',
      'JUCO So': 'Jr',
      'JUCO Jr': 'Sr',
      'Fr': 'Fr',
      'RS Fr': 'RS Fr',
      'So': 'So',
      'RS So': 'RS So',
      'Jr': 'Jr',
      'RS Jr': 'RS Jr',
      'Sr': 'Sr',
      'RS Sr': 'RS Sr'
    }

    // Build a map of existing players by normalized name for this team
    const existingPlayersByName = {}
    existingPlayers.forEach(p => {
      if (p.team === teamAbbr) {
        const normalizedName = p.name?.toLowerCase().trim()
        if (normalizedName) {
          existingPlayersByName[normalizedName] = p
        }
      }
    })

    // Process each recruit: update existing players or create new ones
    const updatedPlayers = [...existingPlayers]
    const newPlayers = []

    recruits.forEach(recruit => {
      if (!recruit.name) return

      const normalizedName = recruit.name.toLowerCase().trim()
      const existingPlayer = existingPlayersByName[normalizedName]

      if (existingPlayer) {
        // Update existing player's info from the sheet
        const playerIndex = updatedPlayers.findIndex(p => p.pid === existingPlayer.pid)
        if (playerIndex !== -1) {
          updatedPlayers[playerIndex] = {
            ...updatedPlayers[playerIndex],
            // Update fields from sheet, but PRESERVE existing position/archetype (may have been changed in-app)
            position: updatedPlayers[playerIndex].position || recruit.position,
            archetype: updatedPlayers[playerIndex].archetype || recruit.archetype,
            // These fields can be updated from sheet
            devTrait: recruit.devTrait || updatedPlayers[playerIndex].devTrait,
            height: recruit.height || updatedPlayers[playerIndex].height,
            weight: recruit.weight || updatedPlayers[playerIndex].weight,
            hometown: recruit.hometown || updatedPlayers[playerIndex].hometown,
            state: recruit.state || updatedPlayers[playerIndex].state,
            stars: recruit.stars ?? updatedPlayers[playerIndex].stars,
            nationalRank: recruit.nationalRank ?? updatedPlayers[playerIndex].nationalRank,
            stateRank: recruit.stateRank ?? updatedPlayers[playerIndex].stateRank,
            positionRank: recruit.positionRank ?? updatedPlayers[playerIndex].positionRank,
            gemBust: recruit.gemBust || updatedPlayers[playerIndex].gemBust,
            previousTeam: recruit.previousTeam || updatedPlayers[playerIndex].previousTeam,
            isPortal: recruit.isPortal ?? updatedPlayers[playerIndex].isPortal ?? false
          }
        }
      } else {
        // No existing player found - create new one
        const pid = nextPID++
        newPlayers.push({
          pid,
          id: `player-${pid}`,
          name: recruit.name,
          position: recruit.position || '',
          year: classToYear[recruit.class] || 'Fr',
          jerseyNumber: '',
          devTrait: recruit.devTrait || 'Normal',
          archetype: recruit.archetype || '',
          overall: null,
          height: recruit.height || '',
          weight: recruit.weight || 0,
          hometown: recruit.hometown || '',
          state: recruit.state || '',
          team: teamAbbr,
          isRecruit: true,
          recruitYear: selectedYear,
          // IMMUTABLE roster history - recruits will be on team starting NEXT year
          teamsByYear: { [selectedYear + 1]: teamAbbr },
          stars: recruit.stars || 0,
          nationalRank: recruit.nationalRank || null,
          stateRank: recruit.stateRank || null,
          positionRank: recruit.positionRank || null,
          gemBust: recruit.gemBust || '',
          previousTeam: recruit.previousTeam || '',
          isPortal: recruit.isPortal || false // Track if transfer portal player
        })
      }
    })

    // When editing, replace ALL commitment keys with just 'edit' to avoid duplicates
    const existingByTeamYear = currentDynasty.recruitingCommitmentsByTeamYear || {}
    const existingForTeam = existingByTeamYear[teamAbbr] || {}

    const finalPlayers = [...updatedPlayers, ...newPlayers]

    await updateDynasty(currentDynasty.id, {
      recruitingCommitmentsByTeamYear: {
        ...existingByTeamYear,
        [teamAbbr]: {
          ...existingForTeam,
          [selectedYear]: {
            edit: recruits // Replace all keys with just 'edit'
          }
        }
      },
      players: finalPlayers,
      nextPID: nextPID
    })
  }

  if (!currentDynasty) return null

  // Build a lookup map of players by normalized name for quick access
  // Also build a fuzzy lookup that can match partial names
  const playersByName = useMemo(() => {
    const map = {}
    const players = currentDynasty.players || []
    players.forEach(p => {
      if (p.name) {
        const normalizedName = p.name.toLowerCase().trim()
        // Store the most recent version (later entries override earlier)
        map[normalizedName] = p
      }
    })

    // Helper to check if a player was on a specific team at a specific year
    const wasPlayerOnTeam = (player, team, year) => {
      if (!player || !team) return false
      // Check teamsByYear for the enrollment year
      if (year && player.teamsByYear?.[year] === team) return true
      // Check if player was ever on this team
      if (player.teamsByYear && Object.values(player.teamsByYear).includes(team)) return true
      // Fallback to current team
      return player.team === team
    }

    // Helper to find player with team context and fallback matching
    // recruitYear is the commitment year, enrollmentYear = recruitYear + 1
    map._findPlayer = (name, recruitYear) => {
      if (!name) return null
      const normalizedName = name.toLowerCase().trim()
      const enrollmentYear = recruitYear ? recruitYear + 1 : null

      // Helper to match name (exact or fuzzy)
      const nameMatches = (playerName) => {
        if (!playerName) return false
        const pName = playerName.toLowerCase().trim()
        // Exact match
        if (pName === normalizedName) return true
        // Contains match
        if (pName.includes(normalizedName) || normalizedName.includes(pName)) return true
        return false
      }

      // First: Try to find player with exact name who was on THIS team at enrollment year
      const exactTeamMatch = players.find(p => {
        if (!nameMatches(p.name)) return false
        return wasPlayerOnTeam(p, teamAbbr, enrollmentYear)
      })
      if (exactTeamMatch) return exactTeamMatch

      // Second: Try simple exact name match from map
      if (map[normalizedName]) {
        // If this player was ever on the team we're viewing, use them
        if (wasPlayerOnTeam(map[normalizedName], teamAbbr, enrollmentYear)) {
          return map[normalizedName]
        }
      }

      // Third: Fuzzy match with team context - prefer players who were on this team
      const fuzzyTeamMatch = players.find(p => {
        const pName = p.name?.toLowerCase().trim()
        if (!pName) return false
        if (!(pName.includes(normalizedName) || normalizedName.includes(pName))) return false
        return wasPlayerOnTeam(p, teamAbbr, enrollmentYear)
      })
      if (fuzzyTeamMatch) return fuzzyTeamMatch

      // Fourth: First/last name match with team context
      const nameParts = normalizedName.split(' ')
      if (nameParts.length >= 2) {
        const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']
        let lastNameIdx = nameParts.length - 1
        while (lastNameIdx > 0 && suffixes.includes(nameParts[lastNameIdx])) {
          lastNameIdx--
        }
        const lastName = nameParts[lastNameIdx]
        const firstName = nameParts[0]

        const lastNameTeamMatch = players.find(p => {
          const pName = p.name?.toLowerCase().trim()
          if (!pName) return false
          const pParts = pName.split(' ')
          if (pParts.length < 2) return false
          let pLastIdx = pParts.length - 1
          while (pLastIdx > 0 && suffixes.includes(pParts[pLastIdx])) {
            pLastIdx--
          }
          if (!(pParts[0] === firstName && pParts[pLastIdx] === lastName)) return false
          return wasPlayerOnTeam(p, teamAbbr, enrollmentYear)
        })
        if (lastNameTeamMatch) return lastNameTeamMatch
      }

      // Fifth: Fallback to any name match (for edge cases)
      if (map[normalizedName]) return map[normalizedName]

      return null
    }

    return map
  }, [currentDynasty.players, teamAbbr])

  // Get all commitments for selected year - TEAM-CENTRIC
  // If 'all' is selected, combine all years' data
  // IMPORTANT: Merge with current player data from players[] to reflect any edits
  const allCommitmentsUnfiltered = useMemo(() => {
    const commitments = []

    // Helper to ensure portal players have previousTeam set for filtering
    const ensurePortalStatus = (merged) => {
      // If previousTeam is already set, return as-is
      if (merged.previousTeam) return merged
      // Only check isPortal flag (set correctly by sheetsService based on original class)
      // Don't use class detection here as it may be overwritten by player.year
      if (merged.isPortal === true) {
        return { ...merged, previousTeam: 'Transfer Portal' }
      }
      return merged
    }

    if (isAllSeasons) {
      // Get commitments from all years for this team
      const allYearsData = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr] || {}
      Object.entries(allYearsData).forEach(([year, yearCommitments]) => {
        Object.entries(yearCommitments).forEach(([key, weekCommitments]) => {
          if (Array.isArray(weekCommitments)) {
            weekCommitments.forEach(commit => {
              // Find matching player in players array to get latest data
              // Pass recruitYear for team context matching
              const currentPlayer = playersByName._findPlayer(commit.name, Number(year))

              // Merge: use current player data, but keep commitment-specific fields
              // Wrap with ensurePortalStatus to detect portal by class if previousTeam not set
              commitments.push(ensurePortalStatus({
                ...commit,
                // Override with current player data if available (for fields that can be edited)
                ...(currentPlayer && {
                  name: currentPlayer.name,
                  firstName: currentPlayer.firstName,
                  lastName: currentPlayer.lastName,
                  position: currentPlayer.position,
                  class: currentPlayer.year, // 'year' in player = 'class' in recruit display
                  devTrait: currentPlayer.devTrait,
                  archetype: currentPlayer.archetype,
                  height: currentPlayer.height,
                  weight: currentPlayer.weight,
                  hometown: currentPlayer.hometown,
                  state: currentPlayer.state,
                  pictureUrl: currentPlayer.pictureUrl,
                  stars: currentPlayer.stars,
                  nationalRank: currentPlayer.nationalRank,
                  stateRank: currentPlayer.stateRank,
                  positionRank: currentPlayer.positionRank,
                  gemBust: currentPlayer.gemBust,
                  // Preserve commitment's portal data if player doesn't have it
                  previousTeam: currentPlayer.previousTeam || commit.previousTeam,
                  isPortal: currentPlayer.isPortal ?? commit.isPortal,
                  pid: currentPlayer.pid
                }),
                // Always keep these commitment-specific fields from the original
                commitmentWeek: key,
                recruitYear: Number(year)
              }))
            })
          }
        })
      })
    } else {
      // Get commitments for selected year only
      const commitmentsForYear = currentDynasty.recruitingCommitmentsByTeamYear?.[teamAbbr]?.[selectedYear] || {}
      Object.entries(commitmentsForYear).forEach(([key, weekCommitments]) => {
        if (Array.isArray(weekCommitments)) {
          weekCommitments.forEach(commit => {
            // Find matching player in players array to get latest data
            // Pass recruitYear for team context matching
            const currentPlayer = playersByName._findPlayer(commit.name, selectedYear)

            // Merge: use current player data, but keep commitment-specific fields
            // Wrap with ensurePortalStatus to detect portal by class if previousTeam not set
            commitments.push(ensurePortalStatus({
              ...commit,
              // Override with current player data if available (for fields that can be edited)
              ...(currentPlayer && {
                name: currentPlayer.name,
                firstName: currentPlayer.firstName,
                lastName: currentPlayer.lastName,
                position: currentPlayer.position,
                class: currentPlayer.year, // 'year' in player = 'class' in recruit display
                devTrait: currentPlayer.devTrait,
                archetype: currentPlayer.archetype,
                height: currentPlayer.height,
                weight: currentPlayer.weight,
                hometown: currentPlayer.hometown,
                state: currentPlayer.state,
                pictureUrl: currentPlayer.pictureUrl,
                stars: currentPlayer.stars,
                nationalRank: currentPlayer.nationalRank,
                stateRank: currentPlayer.stateRank,
                positionRank: currentPlayer.positionRank,
                gemBust: currentPlayer.gemBust,
                // Preserve commitment's portal data if player doesn't have it
                previousTeam: currentPlayer.previousTeam || commit.previousTeam,
                isPortal: currentPlayer.isPortal ?? commit.isPortal,
                pid: currentPlayer.pid
              }),
              // Always keep these commitment-specific fields from the original
              commitmentWeek: key,
              recruitYear: selectedYear
            }))
          })
        }
      })
    }

    // Sort by national rank first, then by stars, then by year
    return commitments.sort((a, b) => {
      // Primary sort: national rank (lower rank = better)
      const rankA = Number(a.nationalRank) || 9999
      const rankB = Number(b.nationalRank) || 9999
      if (rankA !== rankB) return rankA - rankB
      // Secondary sort: stars (higher = better)
      const starsA = Number(a.stars) || 0
      const starsB = Number(b.stars) || 0
      if (starsA !== starsB) return starsB - starsA
      // Tertiary sort: year (most recent first) - only relevant for all seasons view
      if (a.recruitYear !== b.recruitYear) {
        return b.recruitYear - a.recruitYear
      }
      return 0
    })
  }, [currentDynasty.recruitingCommitmentsByTeamYear, teamAbbr, selectedYear, isAllSeasons, playersByName])

  // Filter commitments based on view mode (Both/HS/Portal) AND star filter
  const allCommitments = useMemo(() => {
    let filtered
    if (viewMode === 'portal') {
      // Portal view: only show players with a previousTeam
      filtered = allCommitmentsUnfiltered.filter(c => c.previousTeam)
    } else if (viewMode === 'hs') {
      // HS view: only show players WITHOUT a previousTeam
      filtered = allCommitmentsUnfiltered.filter(c => !c.previousTeam)
    } else {
      // Both view: show all
      filtered = allCommitmentsUnfiltered
    }

    // Apply star filter if any stars are selected
    if (selectedStars.length > 0) {
      filtered = filtered.filter(c => selectedStars.includes(Number(c.stars)))
    }

    return filtered
  }, [allCommitmentsUnfiltered, viewMode, selectedStars])

  // Calculate class stats - always use ALL commits (HS + Portal combined)
  const classStats = useMemo(() => {
    const fiveStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 5).length
    const fourStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 4).length
    const threeStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 3).length
    const twoStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 2).length
    const oneStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 1).length

    return { fiveStars, fourStars, threeStars, twoStars, oneStars, total: allCommitmentsUnfiltered.length }
  }, [allCommitmentsUnfiltered])

  // Get player by name to link to player page - check if they were ever on this team
  const findPlayerByName = (name, recruitYear) => {
    if (!name) return null
    // Find player by name - check if they were on this team at any point
    // Use teamsByYear to handle players who have since transferred/left
    // The enrollment year is recruitYear + 1 (they commit in one year, start the next)
    const enrollmentYear = recruitYear ? recruitYear + 1 : null
    return currentDynasty.players?.find(p => {
      if (p.name?.toLowerCase().trim() !== name.toLowerCase().trim()) return false
      // Check if player was ever on this team via teamsByYear
      if (p.teamsByYear) {
        // If we know the enrollment year, check that specific year
        if (enrollmentYear && p.teamsByYear[enrollmentYear] === teamAbbr) return true
        // Otherwise check if they were ever on this team
        if (Object.values(p.teamsByYear).includes(teamAbbr)) return true
      }
      // Fallback to current team (for legacy data)
      return p.team === teamAbbr
    })
  }

  return (
    <div className="space-y-6">
      {/* Header with Team Logo and Year Selector */}
      <div
        className="rounded-lg shadow-lg p-6"
        style={{
          backgroundColor: teamColors.secondary,
          border: `3px solid ${teamColors.primary}`
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          {/* Team Logo and Title */}
          <div className="flex items-center gap-4">
            {teamLogo && (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: `3px solid ${teamColors.secondary}`,
                  padding: '3px'
                }}
              >
                <img
                  src={teamLogo}
                  alt={teamFullName}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div>
              <Link
                to={`${pathPrefix}/team/${teamAbbr}/${isAllSeasons ? currentDynasty?.currentYear : selectedYear}`}
                className="text-2xl font-bold hover:underline"
                style={{ color: secondaryBgText }}
              >
                {teamFullName}
              </Link>
              <p className="text-sm font-medium" style={{ color: secondaryBgText, opacity: 0.7 }}>
                {isAllSeasons ? 'All-Time Recruiting' : `${selectedYear} Recruiting Class`}
              </p>
            </div>
          </div>

          {/* Year Selector and Edit Button */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium" style={{ color: secondaryBgText }}>
              Season:
            </label>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3 py-2 rounded-lg border-2 font-semibold"
              style={{
                borderColor: teamColors.primary,
                backgroundColor: teamColors.secondary,
                color: secondaryBgText
              }}
            >
              {availableYears.length > 0 && (
                <option value="all">All Seasons</option>
              )}
              {availableYears.length > 0 ? (
                availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))
              ) : (
                <option value={selectedYear}>{selectedYear}</option>
              )}
            </select>
            {!isViewOnly && !isAllSeasons && (
              <button
                onClick={() => setShowEditModal(true)}
                className="px-3 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: teamColors.primary,
                  color: primaryBgText
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Both / HS / Portal Toggle */}
        <div className="flex justify-center mb-6">
          <div
            className="inline-flex rounded-lg border-2 overflow-hidden"
            style={{ borderColor: teamColors.primary }}
          >
            <button
              onClick={() => handleViewModeChange('both')}
              className="px-4 py-2 font-semibold transition-colors"
              style={{
                backgroundColor: viewMode === 'both' ? teamColors.primary : 'transparent',
                color: viewMode === 'both' ? primaryBgText : secondaryBgText
              }}
            >
              Both ({allCommitmentsUnfiltered.length})
            </button>
            <button
              onClick={() => handleViewModeChange('hs')}
              className="px-4 py-2 font-semibold transition-colors"
              style={{
                backgroundColor: viewMode === 'hs' ? teamColors.primary : 'transparent',
                color: viewMode === 'hs' ? primaryBgText : secondaryBgText
              }}
            >
              High School ({allCommitmentsUnfiltered.filter(c => !c.previousTeam).length})
            </button>
            <button
              onClick={() => handleViewModeChange('portal')}
              className="px-4 py-2 font-semibold transition-colors"
              style={{
                backgroundColor: viewMode === 'portal' ? teamColors.primary : 'transparent',
                color: viewMode === 'portal' ? primaryBgText : secondaryBgText
              }}
            >
              Portal ({allCommitmentsUnfiltered.filter(c => c.previousTeam).length})
            </button>
          </div>
        </div>

        {/* Class Stats Summary */}
        {(() => {
          const nationalRank = !isAllSeasons ? currentDynasty.recruitingClassRankByTeamYear?.[teamAbbr]?.[selectedYear] : null

          // Mini star component for stats
          const MiniStars = ({ count, filled }) => (
            <div className="flex justify-center gap-0.5">
              {[...Array(count)].map((_, i) => (
                <svg key={i} className="w-3 h-3" fill="#FFD700" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          )

          return (
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-6">
              {/* National Rank - hide when viewing all seasons */}
              {!isAllSeasons && (
                <div className="px-4 py-2 rounded-lg text-center" style={{ backgroundColor: `${teamColors.primary}15`, minWidth: '80px' }}>
                  <div className="text-xl font-bold" style={{ color: teamColors.primary }}>
                    {nationalRank ? `#${nationalRank}` : '—'}
                  </div>
                  <div className="text-xs font-medium mt-0.5" style={{ color: secondaryBgText, opacity: 0.7 }}>Rank</div>
                </div>
              )}
              {/* Total recruits when viewing all seasons */}
              {isAllSeasons && (
                <div className="px-4 py-2 rounded-lg text-center" style={{ backgroundColor: `${teamColors.primary}15`, minWidth: '80px' }}>
                  <div className="text-xl font-bold" style={{ color: teamColors.primary }}>
                    {classStats.total}
                  </div>
                  <div className="text-xs font-medium mt-0.5" style={{ color: secondaryBgText, opacity: 0.7 }}>Total</div>
                </div>
              )}

              {/* 5-Star */}
              <button
                onClick={() => toggleStarFilter(5)}
                className={`px-3 py-2 rounded-lg text-center transition-all cursor-pointer ${
                  selectedStars.includes(5) ? 'ring-2 ring-offset-1 ring-yellow-500 scale-105' : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: selectedStars.includes(5) ? '#FEF3C7' : '#FEF3C720',
                  width: '70px'
                }}
              >
                <div className="text-xl font-bold" style={{ color: '#B45309' }}>{classStats.fiveStars}</div>
                <MiniStars count={5} />
              </button>

              {/* 4-Star */}
              <button
                onClick={() => toggleStarFilter(4)}
                className={`px-3 py-2 rounded-lg text-center transition-all cursor-pointer ${
                  selectedStars.includes(4) ? 'ring-2 ring-offset-1 ring-indigo-500 scale-105' : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: selectedStars.includes(4) ? '#E0E7FF' : '#E0E7FF20',
                  width: '70px'
                }}
              >
                <div className="text-xl font-bold" style={{ color: '#4338CA' }}>{classStats.fourStars}</div>
                <MiniStars count={4} />
              </button>

              {/* 3-Star */}
              <button
                onClick={() => toggleStarFilter(3)}
                className={`px-3 py-2 rounded-lg text-center transition-all cursor-pointer ${
                  selectedStars.includes(3) ? 'ring-2 ring-offset-1 ring-blue-500 scale-105' : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: selectedStars.includes(3) ? '#DBEAFE' : '#DBEAFE20',
                  width: '70px'
                }}
              >
                <div className="text-xl font-bold" style={{ color: '#1D4ED8' }}>{classStats.threeStars}</div>
                <MiniStars count={3} />
              </button>

              {/* 2-Star */}
              <button
                onClick={() => toggleStarFilter(2)}
                className={`px-3 py-2 rounded-lg text-center transition-all cursor-pointer ${
                  selectedStars.includes(2) ? 'ring-2 ring-offset-1 ring-gray-400 scale-105' : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: selectedStars.includes(2) ? '#E5E7EB' : '#F3F4F620',
                  width: '70px'
                }}
              >
                <div className="text-xl font-bold" style={{ color: '#6B7280' }}>{classStats.twoStars}</div>
                <MiniStars count={2} />
              </button>

              {/* 1-Star */}
              <button
                onClick={() => toggleStarFilter(1)}
                className={`px-3 py-2 rounded-lg text-center transition-all cursor-pointer ${
                  selectedStars.includes(1) ? 'ring-2 ring-offset-1 ring-gray-300 scale-105' : 'hover:scale-105'
                }`}
                style={{
                  backgroundColor: selectedStars.includes(1) ? '#F3F4F6' : '#F3F4F610',
                  width: '70px'
                }}
              >
                <div className="text-xl font-bold" style={{ color: '#9CA3AF' }}>{classStats.oneStars}</div>
                <MiniStars count={1} />
              </button>
            </div>
          )
        })()}

        {/* Recruit Cards */}
        {allCommitments.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allCommitments.map((recruit, index) => {
              const player = findPlayerByName(recruit.name, recruit.recruitYear)
              const transferTeamFullName = recruit.previousTeam ? (teamAbbreviations[recruit.previousTeam]?.name || recruit.previousTeam) : null
              const transferTeamColors = transferTeamFullName ? getTeamColors(transferTeamFullName) : null
              const transferTeamLogo = transferTeamFullName ? getTeamLogo(transferTeamFullName) : null

              const cardContent = (
                <div
                  className="p-4 rounded-lg border-2 hover:shadow-lg transition-shadow"
                  style={{
                    borderColor: `${teamColors.primary}40`,
                    backgroundColor: teamColors.secondary
                  }}
                >
                  {/* Header: Picture, Name, Position, Stars */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* Player Picture (if exists) */}
                    {player?.pictureUrl && (
                      <img
                        src={player.pictureUrl}
                        alt={recruit.name}
                        className="w-14 h-14 object-cover rounded-lg border-2 flex-shrink-0"
                        style={{ borderColor: teamColors.primary }}
                      />
                    )}

                    <div className="flex-1 min-w-0 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-bold text-lg truncate"
                          style={{ color: player ? teamColors.primary : secondaryBgText }}
                        >
                          {recruit.name || 'Unknown'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-bold"
                            style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
                          >
                            {recruit.position || 'ATH'}
                          </span>
                          {isAllSeasons && recruit.recruitYear && (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-bold"
                              style={{ backgroundColor: secondaryBgText, color: teamColors.secondary, opacity: 0.8 }}
                            >
                              {recruit.recruitYear}
                            </span>
                          )}
                          <span className="text-xs font-medium" style={{ color: secondaryBgText, opacity: 0.7 }}>
                            {recruit.class || 'HS'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StarRating stars={recruit.stars} />
                        {recruit.nationalRank && (
                          <span className="text-xs font-medium" style={{ color: secondaryBgText, opacity: 0.7 }}>
                            #{recruit.nationalRank} Nat'l
                          </span>
                        )}
                        {(recruit.stateRank || recruit.positionRank) && (
                          <div className="flex flex-col items-end text-xs" style={{ color: secondaryBgText, opacity: 0.7 }}>
                            {recruit.stateRank && <span>#{recruit.stateRank} in State</span>}
                            {recruit.positionRank && <span>#{recruit.positionRank} {recruit.position}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    {recruit.archetype && (
                      <div>
                        <span style={{ color: secondaryBgText, opacity: 0.6 }}>Archetype: </span>
                        <span className="font-medium" style={{ color: secondaryBgText }}>{recruit.archetype}</span>
                      </div>
                    )}
                    {(recruit.height || recruit.weight) && (
                      <div>
                        <span style={{ color: secondaryBgText, opacity: 0.6 }}>Size: </span>
                        <span className="font-medium" style={{ color: secondaryBgText }}>
                          {recruit.height}{recruit.weight ? `, ${recruit.weight} lbs` : ''}
                        </span>
                      </div>
                    )}
                    {(recruit.hometown || recruit.state) && (
                      <div className="col-span-2">
                        <span style={{ color: secondaryBgText, opacity: 0.6 }}>From: </span>
                        <span className="font-medium" style={{ color: secondaryBgText }}>
                          {recruit.hometown
                            ? `${recruit.hometown}${recruit.state ? `, ${recruit.state}` : ''}`
                            : stateFullNames[recruit.state] || recruit.state}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Dev Trait, Gem/Bust, Transfer */}
                  <div className="flex items-center flex-wrap gap-2">
                    {recruit.devTrait && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={getDevTraitStyle(recruit.devTrait)}
                      >
                        {recruit.devTrait}
                      </span>
                    )}
                    <GemBustBadge value={recruit.gemBust} />
                    {recruit.previousTeam && (
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: transferTeamColors?.primary || '#6B7280',
                          color: getContrastTextColor(transferTeamColors?.primary || '#6B7280')
                        }}
                      >
                        {transferTeamLogo && (
                          <img src={transferTeamLogo} alt="" className="w-3 h-3" />
                        )}
                        <span>From {recruit.previousTeam}</span>
                      </div>
                    )}
                  </div>
                </div>
              )

              // Wrap in Link if player exists
              return player ? (
                <Link
                  key={`${recruit.name}-${index}`}
                  to={`${pathPrefix}/player/${player.pid}`}
                  className="block"
                >
                  {cardContent}
                </Link>
              ) : (
                <div key={`${recruit.name}-${index}`}>
                  {cardContent}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div style={{ color: secondaryBgText, opacity: 0.5 }} className="mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: secondaryBgText }}>
              {viewMode === 'portal' ? 'No Transfer Portal Commits' : viewMode === 'hs' ? 'No HS Commitments Yet' : 'No Commitments Yet'}
            </h3>
            <p style={{ color: secondaryBgText, opacity: 0.8 }} className="max-w-md mx-auto">
              {isAllSeasons
                ? 'No recruiting data has been recorded for this team yet.'
                : selectedYear === currentDynasty.currentYear
                  ? 'Record recruiting commitments during preseason, regular season, or signing day.'
                  : `No recruiting data recorded for the ${selectedYear} class.`}
            </p>
          </div>
        )}
      </div>

      {/* Edit Recruiting Modal */}
      <RecruitingCommitmentsModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleRecruitingSave}
        currentYear={selectedYear}
        currentPhase="offseason"
        currentWeek={5}
        commitmentKey="edit"
        recruitingLabel={`${selectedYear} Recruiting Class`}
        existingCommitments={allCommitmentsUnfiltered}
        teamColors={teamColors}
      />
    </div>
  )
}
