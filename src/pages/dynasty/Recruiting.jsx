import { useState, useMemo, useEffect } from 'react'
import { proxyImageUrl } from '../../utils/imageProxy'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDynasty, getRecruitingCommitments, lookupByTeamYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import RecruitingCommitmentsModal from '../../components/RecruitingCommitmentsModal'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getTidFromAbbr, getOriginalTeamAbbr } from '../../data/teamRegistry'
import { getTeamLogoByTid, stripMascotFromName } from '../../data/teams'
import { PageHero, Card, Badge, Button, Select, EmptyState, TeamLogo } from '../../components/ui'
import Modal from '../../components/ui/Modal'
import { calculateRecruitingClassScore, formatRecruitingClassScore, flattenClassCommitments } from '../../utils/recruitingScore'
import { sideOfPosition } from '../../utils/outlookBoard'
import { finePositionGroup } from '../../data/positionGroups'
import TeamPermissionBanner from '../../components/TeamPermissionBanner'

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
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'Washington D.C.', 'Non-US': 'Non-US'
}

const DEV_TRAIT_VARIANT = {
  'elite': 'warning',
  'star': 'accent',
  'impact': 'info',
  'normal': 'default'
}

// Dev trait ranking (best → worst) for the "Dev Trait" recruit sort.
const DEV_TRAIT_RANK = { elite: 4, star: 3, impact: 2, normal: 1 }

// Football position ordering for the "Position" recruit sort: offense
// skill → line, defensive front → back, then specialists. Positions not
// listed fall to the end (then alpha within).
const RECRUIT_POSITION_ORDER = [
  'QB', 'RB', 'HB', 'FB', 'WR', 'TE',
  'LT', 'LG', 'C', 'RG', 'RT', 'OL', 'OT', 'OG', 'G', 'T',
  'LE', 'RE', 'DE', 'DT', 'NT', 'DL',
  'LOLB', 'ROLB', 'OLB', 'MLB', 'ILB', 'LB', 'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS', 'S', 'DB',
  'K', 'P', 'LS', 'ATH',
]

// Position filter — side groupings (offense/defense/special) plus the finer
// position groups. matchPos(filterValue, recruitPosition) decides inclusion.
const POSITION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Positions' },
  { value: 'offense', label: 'Offense' },
  { value: 'defense', label: 'Defense' },
  { value: 'st', label: 'Special Teams' },
  { value: 'QB', label: 'QB' },
  { value: 'RB', label: 'RB' },
  { value: 'WR', label: 'WR' },
  { value: 'TE', label: 'TE' },
  { value: 'OL', label: 'OL' },
  { value: 'EDGE', label: 'EDGE' },
  { value: 'DT', label: 'DT' },
  { value: 'LB', label: 'LB' },
  { value: 'DB', label: 'DB' },
  { value: 'K/P', label: 'K/P' },
]
// Map a recruit position to the coarse group used by the position dropdown.
const OL_GROUPS = new Set(['OT', 'OG', 'C'])
const LB_GROUPS = new Set(['OLB', 'MIKE'])
const DB_GROUPS = new Set(['CB', 'Safety'])
function matchesPositionFilter(filter, position) {
  if (filter === 'all') return true
  // ATH (athlete) has no fixed side — surface them under BOTH Offense and Defense.
  const isAth = (position || '').toUpperCase() === 'ATH'
  const side = sideOfPosition(position)
  if (filter === 'offense' || filter === 'defense') return side === filter || isAth
  if (filter === 'st') return side === filter
  const g = finePositionGroup(position)
  if (filter === 'OL') return OL_GROUPS.has(g)
  if (filter === 'LB') return LB_GROUPS.has(g)
  if (filter === 'DB') return DB_GROUPS.has(g)
  if (filter === 'K/P') return g === 'K' || g === 'P'
  return g === filter
}

const StarRating = ({ stars, size = 'md' }) => {
  const starCount = Number(stars) || 0
  const sizeClass = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' }[size] || 'w-4 h-4'
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className={sizeClass}
          fill={i < starCount ? 'var(--accent-warning)' : 'var(--surface-5)'}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  )
}

const VIEW_MODE_OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'hs', label: 'High School' },
  { value: 'portal', label: 'Portal' }
]

export default function Recruiting() {
  const { currentDynasty, updateDynasty, isViewOnly } = useDynasty()
  const { tid: tidParam, year: urlYear } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const location = useLocation()

  const [viewMode, setViewMode] = useState(() => {
    if (location.pathname.includes('/recruiting/portal/')) return 'portal'
    return 'both'
  })
  const [selectedStars, setSelectedStars] = useState([])
  const [positionFilter, setPositionFilter] = useState('all')
  // Recruit sort: 'rank' (national rank, default) | 'position' | 'dev'.
  // Persisted to the device so the chosen sort sticks across visits
  // (Ezekiel wanted it to stay on Dev Trait).
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('recruiting-sort') || 'rank')
  const handleSortChange = (value) => {
    setSortBy(value)
    try { localStorage.setItem('recruiting-sort', value) } catch { /* ignore */ }
  }
  const [showEditModal, setShowEditModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty?.teamName
  const currentTeamTid = resolveTid(currentTeamAbbr, TEAMS)

  const selectedTid = tidParam ? parseInt(tidParam, 10) : currentTeamTid

  const baseTeam = TEAMS[selectedTid]
  const dynastyTeam = currentDynasty?.teams?.[selectedTid]
  const team = baseTeam ? { ...baseTeam, ...dynastyTeam } : dynastyTeam
  const teamAbbr = team?.abbr || baseTeam?.abbr || currentTeamAbbr
  const selectedYear = urlYear === 'all' ? 'all' : (urlYear ? Number(urlYear) : currentDynasty?.currentYear)

  const teamFullName = team?.name || baseTeam?.name || teamAbbr

  const teamsSource = currentDynasty?.teams || TEAMS

  useEffect(() => {
    if (!tidParam && currentTeamTid && currentDynasty?.currentYear) {
      const currentYear = currentDynasty.currentYear
      const startYear = currentDynasty.startYear || currentYear
      const isFirstYear = currentYear === startYear
      const targetYear = isFirstYear ? currentYear : currentYear - 1
      navigate(`${pathPrefix}/recruiting/${currentTeamTid}/${targetYear}`, { replace: true })
    }
  }, [tidParam, currentTeamTid, currentDynasty?.id, currentDynasty?.currentYear, currentDynasty?.startYear, navigate, pathPrefix])

  const availableYears = useMemo(() => {
    const yearsSet = new Set()
    if (selectedTid && currentDynasty?.teams?.[selectedTid]?.byYear) {
      Object.entries(currentDynasty.teams[selectedTid].byYear).forEach(([year, yearData]) => {
        if (yearData?.recruitingCommitments && Object.keys(yearData.recruitingCommitments).length > 0) {
          yearsSet.add(Number(year))
        }
      })
    }
    // Years from team-centric structure — check tid AND abbr keys (dual-keyed
    // since pass-5 migration; either may exist).
    const teamCentric = currentDynasty?.recruitingCommitmentsByTeamYear || {}
    const fromAbbr = teamAbbr ? teamCentric[teamAbbr] : null
    const fromTid = selectedTid != null ? teamCentric[selectedTid] : null
    Object.keys(fromAbbr || {}).forEach(year => yearsSet.add(Number(year)))
    Object.keys(fromTid || {}).forEach(year => yearsSet.add(Number(year)))
    const years = Array.from(yearsSet)
    if (currentDynasty?.currentYear && !years.includes(currentDynasty.currentYear)) {
      years.push(currentDynasty.currentYear)
    }
    return years.sort((a, b) => b - a)
  }, [currentDynasty?.recruitingCommitmentsByTeamYear, currentDynasty?.teams, selectedTid, teamAbbr, currentDynasty?.currentYear])

  const teamsWithRecruitingClasses = useMemo(() => {
    const teamsMap = new Map()
    if (currentDynasty?.teams) {
      Object.entries(currentDynasty.teams).forEach(([tidKey, teamData]) => {
        const tid = Number(tidKey)
        if (isNaN(tid) || !teamData?.byYear) return
        const hasRecruits = Object.values(teamData.byYear).some(yearData => {
          if (!yearData?.recruitingCommitments) return false
          return Object.values(yearData.recruitingCommitments).some(weekCommitments => {
            return Array.isArray(weekCommitments) && weekCommitments.length > 0
          })
        })
        if (hasRecruits) {
          const sourceTeam = teamsSource[tid]
          teamsMap.set(tid, {
            abbr: sourceTeam?.abbr || teamData?.abbr || `T${tid}`,
            tid,
            name: sourceTeam?.name || teamData?.name || `Team ${tid}`
          })
        }
      })
    }
    const abbrData = currentDynasty?.recruitingCommitmentsByTeamYear || {}
    Object.entries(abbrData).forEach(([abbr, yearData]) => {
      const hasRecruits = Object.values(yearData).some(yearCommitments => {
        return Object.values(yearCommitments).some(weekCommitments => {
          return Array.isArray(weekCommitments) && weekCommitments.length > 0
        })
      })
      if (hasRecruits) {
        const tid = getTidFromAbbr(abbr, currentDynasty)
        if (tid && !teamsMap.has(tid)) {
          const teamData = teamsSource[tid]
          teamsMap.set(tid, {
            abbr,
            tid,
            name: teamData?.name || abbr
          })
        }
      }
    })
    return Array.from(teamsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [currentDynasty?.recruitingCommitmentsByTeamYear, currentDynasty?.teams, teamsSource])

  const handleTeamChange = (newTid) => {
    navigate(`${pathPrefix}/recruiting/${newTid}/${selectedYear}`)
  }

  const handleYearChange = (newYear) => {
    navigate(`${pathPrefix}/recruiting/${selectedTid}/${newYear}`)
  }

  const isAllSeasons = selectedYear === 'all'

  const handleRecruitingSave = async (recruits) => {
    if (!currentDynasty?.id) return

    const existingPlayers = currentDynasty.players || []
    const maxExistingPID = existingPlayers.reduce((max, p) => Math.max(max, p.pid || 0), 0)
    let nextPID = Math.max(maxExistingPID + 1, currentDynasty.nextPID || 1)

    const teamsByYearValue = selectedTid

    const classToYear = {
      'HS': 'Fr', 'JUCO Fr': 'So', 'JUCO So': 'Jr', 'JUCO Jr': 'Sr',
      'Fr': 'Fr', 'RS Fr': 'RS Fr', 'So': 'So', 'RS So': 'RS So',
      'Jr': 'Jr', 'RS Jr': 'RS Jr', 'Sr': 'Sr', 'RS Sr': 'RS Sr'
    }

    const existingPlayersByName = {}
    const sameTeamPlayersByName = {}
    existingPlayers.forEach(p => {
      const normalizedName = p.name?.toLowerCase().trim()
      if (normalizedName) {
        existingPlayersByName[normalizedName] = p
        if (p.team === selectedTid || p.team === teamAbbr) {
          sameTeamPlayersByName[normalizedName] = p
        }
      }
    })

    const updatedPlayers = [...existingPlayers]
    const newPlayers = []

    recruits.forEach(recruit => {
      if (!recruit.name) return

      const normalizedName = recruit.name.toLowerCase().trim()
      const sameTeamPlayer = sameTeamPlayersByName[normalizedName]
      const anyTeamPlayer = existingPlayersByName[normalizedName]

      if (sameTeamPlayer) {
        const playerIndex = updatedPlayers.findIndex(p => p.pid === sameTeamPlayer.pid)
        if (playerIndex !== -1) {
          updatedPlayers[playerIndex] = {
            ...updatedPlayers[playerIndex],
            position: updatedPlayers[playerIndex].position || recruit.position,
            archetype: updatedPlayers[playerIndex].archetype || recruit.archetype,
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
      } else if (anyTeamPlayer) {
        const playerIndex = updatedPlayers.findIndex(p => p.pid === anyTeamPlayer.pid)
        if (playerIndex !== -1) {
          const existingPlayer = updatedPlayers[playerIndex]
          const previousTeamTid = existingPlayer.team

          // Canonical v2 movement — write straight to movementByYear.
          // The legacy movements[] write was being stripped by
          // syncDerivedFieldsFromV2 anyway and used the legacy
          // 'portal_in' type that the heal then re-canonicalized.
          updatedPlayers[playerIndex] = {
            ...existingPlayer,
            team: selectedTid,
            teamsByYear: {
              ...existingPlayer.teamsByYear,
              [selectedYear + 1]: teamsByYearValue
            },
            movementByYear: {
              ...(existingPlayer.movementByYear || {}),
              [selectedYear]: {
                type: 'arrival',
                arrival: 'transfer_in',
                fromTid: previousTeamTid != null ? Number(previousTeamTid) : null,
              },
            },
            isPortal: true,
            isRecruit: true,
            recruitYear: selectedYear,
            previousTeam: recruit.previousTeam || getOriginalTeamAbbr(previousTeamTid) || existingPlayer.previousTeam,
            devTrait: recruit.devTrait || existingPlayer.devTrait,
            stars: recruit.stars ?? existingPlayer.stars,
            nationalRank: recruit.nationalRank ?? existingPlayer.nationalRank,
            stateRank: recruit.stateRank ?? existingPlayer.stateRank,
            positionRank: recruit.positionRank ?? existingPlayer.positionRank,
            gemBust: recruit.gemBust || existingPlayer.gemBust
          }
          console.log(`[Recruiting] Cross-team transfer detected: ${recruit.name} from tid ${previousTeamTid} to tid ${selectedTid}`)
        }
      } else {
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
          team: selectedTid,
          isRecruit: true,
          recruitYear: selectedYear,
          teamsByYear: { [selectedYear + 1]: teamsByYearValue },
          stars: recruit.stars || 0,
          nationalRank: recruit.nationalRank || null,
          stateRank: recruit.stateRank || null,
          positionRank: recruit.positionRank || null,
          gemBust: recruit.gemBust || '',
          previousTeam: recruit.previousTeam || '',
          isPortal: recruit.isPortal || false
        })
      }
    })

    const commitmentData = { edit: recruits }
    const finalPlayers = [...updatedPlayers, ...newPlayers]

    const updates = {
      players: finalPlayers,
      nextPID: nextPID
    }

    if (selectedTid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[selectedTid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[selectedYear] || {}

      updates.teams = {
        ...existingTeams,
        [selectedTid]: {
          ...existingTeamData,
          byYear: {
            ...existingByYear,
            [selectedYear]: {
              ...existingYearData,
              recruitingCommitments: commitmentData
            }
          }
        }
      }
    }

    const existingByTeamYear = currentDynasty.recruitingCommitmentsByTeamYear || {}
    // dual-keyed (rename-safe)
    updates.recruitingCommitmentsByTeamYear = {
      ...existingByTeamYear,
      [teamAbbr]: {
        ...(existingByTeamYear[teamAbbr] || {}),
        [selectedYear]: commitmentData
      },
      ...(selectedTid ? { [selectedTid]: { ...(existingByTeamYear[selectedTid] || {}), [selectedYear]: commitmentData } } : {})
    }

    await updateDynasty(currentDynasty.id, updates)
  }

  const playersByName = useMemo(() => {
    const map = {}
    const players = currentDynasty?.players || []
    players.forEach(p => {
      if (p.name) {
        const normalizedName = p.name.toLowerCase().trim()
        map[normalizedName] = p
      }
    })

    const wasPlayerOnTeam = (player, team, year) => {
      if (!player || !team) return false
      const teamTid = typeof team === 'number' ? team : getTidFromAbbr(team, currentDynasty)
      const teamAbbrLocal = typeof team === 'string'
        ? team
        : (currentDynasty?.teams?.[team]?.abbr
           || currentDynasty?.customTeams?.[team]?.abbr
           || TEAMS[team]?.abbr)

      const matchesTeam = (value) => {
        if (!value) return false
        if (typeof value === 'number') return value === teamTid
        return value === teamAbbrLocal || getTidFromAbbr(value, currentDynasty) === teamTid
      }

      if (year && player.teamsByYear?.[year] && matchesTeam(player.teamsByYear[year])) return true
      if (player.teamsByYear && Object.values(player.teamsByYear).some(matchesTeam)) return true
      return matchesTeam(player.team)
    }

    const levenshteinDistance = (a, b) => {
      if (a.length === 0) return b.length
      if (b.length === 0) return a.length
      const matrix = []
      for (let i = 0; i <= b.length; i++) matrix[i] = [i]
      for (let j = 0; j <= a.length; j++) matrix[0][j] = j
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          matrix[i][j] = b[i-1] === a[j-1]
            ? matrix[i-1][j-1]
            : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1)
        }
      }
      return matrix[b.length][a.length]
    }

    const namesAreSimilar = (name1, name2) => {
      if (!name1 || !name2) return false
      const n1 = name1.toLowerCase().trim()
      const n2 = name2.toLowerCase().trim()
      if (n1 === n2) return true
      const maxDist = Math.max(n1.length, n2.length) > 10 ? 2 : 1
      return levenshteinDistance(n1, n2) <= maxDist
    }

    map._findPlayer = (name, recruitYear) => {
      if (!name) return null
      const normalizedName = name.toLowerCase().trim()
      const enrollmentYear = recruitYear ? recruitYear + 1 : null

      const nameMatches = (playerName) => {
        if (!playerName) return false
        const pName = playerName.toLowerCase().trim()
        if (pName === normalizedName) return true
        if (pName.includes(normalizedName) || normalizedName.includes(pName)) return true
        return false
      }

      const exactTeamMatch = players.find(p => {
        if (!nameMatches(p.name)) return false
        return wasPlayerOnTeam(p, teamAbbr, enrollmentYear)
      })
      if (exactTeamMatch) return exactTeamMatch

      if (map[normalizedName]) {
        if (wasPlayerOnTeam(map[normalizedName], teamAbbr, enrollmentYear)) {
          return map[normalizedName]
        }
      }

      const fuzzyTeamMatch = players.find(p => {
        const pName = p.name?.toLowerCase().trim()
        if (!pName) return false
        if (!(pName.includes(normalizedName) || normalizedName.includes(pName))) return false
        return wasPlayerOnTeam(p, teamAbbr, enrollmentYear)
      })
      if (fuzzyTeamMatch) return fuzzyTeamMatch

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

      if (nameParts.length >= 2) {
        const suffixes = ['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']
        let lastNameIdx = nameParts.length - 1
        while (lastNameIdx > 0 && suffixes.includes(nameParts[lastNameIdx])) {
          lastNameIdx--
        }
        const lastName = nameParts[lastNameIdx]
        const firstName = nameParts[0]

        const typoMatch = players.find(p => {
          const pName = p.name?.toLowerCase().trim()
          if (!pName) return false
          const pParts = pName.split(' ')
          if (pParts.length < 2) return false
          let pLastIdx = pParts.length - 1
          while (pLastIdx > 0 && suffixes.includes(pParts[pLastIdx])) {
            pLastIdx--
          }
          if (pParts[pLastIdx] !== lastName) return false
          if (!namesAreSimilar(pParts[0], firstName)) return false
          return wasPlayerOnTeam(p, teamAbbr, enrollmentYear)
        })
        if (typoMatch) return typoMatch
      }

      if (map[normalizedName]) return map[normalizedName]

      return null
    }

    return map
  }, [currentDynasty?.players, teamAbbr])

  const allCommitmentsUnfiltered = useMemo(() => {
    const commitments = []

    const ensurePortalStatus = (merged) => {
      if (merged.previousTeam) return merged
      if (merged.isPortal === true) {
        return { ...merged, previousTeam: 'Transfer Portal' }
      }
      return merged
    }

    if (isAllSeasons) {
      const processedYears = new Set()

      if (selectedTid && currentDynasty?.teams?.[selectedTid]?.byYear) {
        Object.entries(currentDynasty.teams[selectedTid].byYear).forEach(([year, yearData]) => {
          if (!yearData?.recruitingCommitments) return
          processedYears.add(Number(year))
          Object.entries(yearData.recruitingCommitments).forEach(([key, weekCommitments]) => {
            if (Array.isArray(weekCommitments)) {
              weekCommitments.forEach(commit => {
                const currentPlayer = playersByName._findPlayer(commit.name, Number(year))
                commitments.push(ensurePortalStatus({
                  ...commit,
                  ...(currentPlayer && {
                    name: currentPlayer.name, firstName: currentPlayer.firstName, lastName: currentPlayer.lastName,
                    position: currentPlayer.position, devTrait: currentPlayer.devTrait,
                    archetype: currentPlayer.archetype, height: currentPlayer.height, weight: currentPlayer.weight,
                    hometown: currentPlayer.hometown, state: currentPlayer.state, pictureUrl: currentPlayer.pictureUrl,
                    stars: currentPlayer.stars, nationalRank: currentPlayer.nationalRank, stateRank: currentPlayer.stateRank,
                    positionRank: currentPlayer.positionRank, gemBust: currentPlayer.gemBust,
                    previousTeam: currentPlayer.previousTeam || commit.previousTeam,
                    isPortal: currentPlayer.isPortal ?? commit.isPortal, pid: currentPlayer.pid
                  }),
                  commitmentWeek: key, recruitYear: Number(year)
                }))
              })
            }
          })
        })
      }

      // Pull all-years commits from BOTH the tid key and the abbr key
      // (dual-keyed since pass 5; old data may live under either).
      const teamCentric = currentDynasty.recruitingCommitmentsByTeamYear || {}
      const allYearsData = {
        ...(selectedTid != null ? (teamCentric[selectedTid] || {}) : {}),
        ...(teamCentric[teamAbbr] || {})
      }
      Object.entries(allYearsData).forEach(([year, yearCommitments]) => {
        if (processedYears.has(Number(year))) return
        Object.entries(yearCommitments).forEach(([key, weekCommitments]) => {
          if (Array.isArray(weekCommitments)) {
            weekCommitments.forEach(commit => {
              const currentPlayer = playersByName._findPlayer(commit.name, Number(year))
              commitments.push(ensurePortalStatus({
                ...commit,
                ...(currentPlayer && {
                  name: currentPlayer.name, firstName: currentPlayer.firstName, lastName: currentPlayer.lastName,
                  position: currentPlayer.position, devTrait: currentPlayer.devTrait,
                  archetype: currentPlayer.archetype, height: currentPlayer.height, weight: currentPlayer.weight,
                  hometown: currentPlayer.hometown, state: currentPlayer.state, pictureUrl: currentPlayer.pictureUrl,
                  stars: currentPlayer.stars, nationalRank: currentPlayer.nationalRank, stateRank: currentPlayer.stateRank,
                  positionRank: currentPlayer.positionRank, gemBust: currentPlayer.gemBust,
                  previousTeam: currentPlayer.previousTeam || commit.previousTeam,
                  isPortal: currentPlayer.isPortal ?? commit.isPortal, pid: currentPlayer.pid
                }),
                commitmentWeek: key, recruitYear: Number(year)
              }))
            })
          }
        })
      })
    } else {
      const commitmentsForYear = getRecruitingCommitments(currentDynasty, selectedTid, selectedYear)
      Object.entries(commitmentsForYear).forEach(([key, weekCommitments]) => {
        if (Array.isArray(weekCommitments)) {
          weekCommitments.forEach(commit => {
            const currentPlayer = playersByName._findPlayer(commit.name, selectedYear)
            commitments.push(ensurePortalStatus({
              ...commit,
              ...(currentPlayer && {
                name: currentPlayer.name,
                firstName: currentPlayer.firstName,
                lastName: currentPlayer.lastName,
                position: currentPlayer.position,
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
                previousTeam: currentPlayer.previousTeam || commit.previousTeam,
                isPortal: currentPlayer.isPortal ?? commit.isPortal,
                pid: currentPlayer.pid
              }),
              commitmentWeek: key,
              recruitYear: selectedYear
            }))
          })
        }
      })
    }

    const seenPids = new Set()
    const seenNames = new Set()
    const dedupedCommitments = commitments.filter(c => {
      if (c.pid) {
        if (seenPids.has(c.pid)) return false
        seenPids.add(c.pid)
        return true
      }
      const normalizedName = c.name?.toLowerCase().trim()
      if (normalizedName) {
        if (seenNames.has(normalizedName)) return false
        seenNames.add(normalizedName)
      }
      return true
    })

    return dedupedCommitments.sort((a, b) => {
      const rankA = Number(a.nationalRank) || 9999
      const rankB = Number(b.nationalRank) || 9999
      if (rankA !== rankB) return rankA - rankB
      const starsA = Number(a.stars) || 0
      const starsB = Number(b.stars) || 0
      if (starsA !== starsB) return starsB - starsA
      if (a.recruitYear !== b.recruitYear) {
        return b.recruitYear - a.recruitYear
      }
      return 0
    })
  }, [currentDynasty?.recruitingCommitmentsByTeamYear, currentDynasty?.teams, selectedTid, teamAbbr, selectedYear, isAllSeasons, playersByName])

  const allCommitments = useMemo(() => {
    let filtered
    if (viewMode === 'portal') {
      filtered = allCommitmentsUnfiltered.filter(c => c.previousTeam)
    } else if (viewMode === 'hs') {
      filtered = allCommitmentsUnfiltered.filter(c => !c.previousTeam)
    } else {
      filtered = allCommitmentsUnfiltered
    }

    if (selectedStars.length > 0) {
      filtered = filtered.filter(c => selectedStars.includes(Number(c.stars)))
    }

    if (positionFilter !== 'all') {
      filtered = filtered.filter(c => matchesPositionFilter(positionFilter, c.position))
    }

    // Sort by the chosen key. 'rank' mirrors the base order (national
    // rank, then stars). 'position' groups by football order; 'dev' puts
    // the best dev traits first. All fall back to rank within ties.
    const natRank = (c) => Number(c.nationalRank) || 9999
    const starOf = (c) => Number(c.stars) || 0
    const yearOf = (c) => Number(c.recruitYear) || 0
    const byRank = (a, b) =>
      (natRank(a) - natRank(b)) || (starOf(b) - starOf(a)) || (yearOf(b) - yearOf(a))
    const posIdx = (c) => {
      const i = RECRUIT_POSITION_ORDER.indexOf((c.position || '').toUpperCase())
      return i === -1 ? RECRUIT_POSITION_ORDER.length : i
    }
    const devOf = (c) => DEV_TRAIT_RANK[(c.devTrait || '').toLowerCase()] || 0

    const sorted = [...filtered]
    if (sortBy === 'position') {
      sorted.sort((a, b) => {
        const d = posIdx(a) - posIdx(b)
        if (d !== 0) return d
        const sa = (a.position || '').toUpperCase()
        const sb = (b.position || '').toUpperCase()
        if (sa !== sb) return sa.localeCompare(sb)
        return byRank(a, b)
      })
    } else if (sortBy === 'dev') {
      sorted.sort((a, b) => (devOf(b) - devOf(a)) || byRank(a, b))
    } else {
      sorted.sort(byRank)
    }
    return sorted
  }, [allCommitmentsUnfiltered, viewMode, selectedStars, positionFilter, sortBy])

  const classStats = useMemo(() => {
    // Single pass over allCommitmentsUnfiltered. Was five separate
    // .filter() calls (one per star count), each iterating the whole
    // list — 5× the work for the same result.
    let fiveStars = 0, fourStars = 0, threeStars = 0, twoStars = 0, oneStars = 0
    for (const c of allCommitmentsUnfiltered) {
      switch (Number(c.stars)) {
        case 5: fiveStars++; break
        case 4: fourStars++; break
        case 3: threeStars++; break
        case 2: twoStars++; break
        case 1: oneStars++; break
        default: break
      }
    }
    return { fiveStars, fourStars, threeStars, twoStars, oneStars, total: allCommitmentsUnfiltered.length }
  }, [allCommitmentsUnfiltered])

  const classScore = useMemo(() => {
    if (isAllSeasons) return 0
    return calculateRecruitingClassScore(allCommitmentsUnfiltered)
  }, [allCommitmentsUnfiltered, isAllSeasons])

  const classHistory = useMemo(() => {
    if (!selectedTid) return []
    const rows = []
    availableYears.forEach(year => {
      if (typeof year !== 'number') return
      const commits = flattenClassCommitments(getRecruitingCommitments(currentDynasty, selectedTid, year))
      const score = calculateRecruitingClassScore(commits)
      const rank = lookupByTeamYear(currentDynasty?.recruitingClassRankByTeamYear, currentDynasty, selectedTid, year) ?? null
      if (commits.length === 0 && !rank && !score) return
      rows.push({ year, score, rank, count: commits.length })
    })
    return rows.sort((a, b) => b.year - a.year)
  }, [availableYears, currentDynasty, selectedTid, teamAbbr])

  if (!currentDynasty) return null

  const findPlayerByName = (name, recruitYear) => {
    if (!name) return null
    const enrollmentYear = recruitYear ? recruitYear + 1 : null

    const matchesTeam = (value) => {
      if (!value) return false
      if (typeof value === 'number') return value === selectedTid
      return value === teamAbbr || getTidFromAbbr(value, currentDynasty) === selectedTid
    }

    return currentDynasty.players?.find(p => {
      if (p.name?.toLowerCase().trim() !== name.toLowerCase().trim()) return false
      if (p.teamsByYear) {
        if (enrollmentYear && matchesTeam(p.teamsByYear[enrollmentYear])) return true
        if (Object.values(p.teamsByYear).some(matchesTeam)) return true
      }
      return matchesTeam(p.team)
    })
  }

  const nationalRank = !isAllSeasons
    ? (lookupByTeamYear(currentDynasty.recruitingClassRankByTeamYear, currentDynasty, selectedTid, selectedYear) ?? null)
    : null

  const hasHSandPortal = true

  return (
    <div className="space-y-4">
      {/* Cross-team write warning. Recruiting is per-team; if the user
          isn't assigned to selectedTid, surface that they'd be writing
          on behalf of another coach. Silent for commish/co-commishes. */}
      <TeamPermissionBanner tids={selectedTid ? [selectedTid] : []} />

      <PageHero
        title="Recruiting Class"
        meta={
          <span className="group inline-flex items-baseline flex-wrap gap-x-2 text-[clamp(1.1rem,2.2vw,1.5rem)] font-bold text-txt-secondary">
            {/* Inline year selector (falls back to "All Seasons") */}
            <span className="relative inline-flex items-baseline">
              <span className="tabular-nums" aria-hidden="true">
                {isAllSeasons ? 'All Seasons' : selectedYear}
              </span>
              <svg
                className="ml-1 self-center w-[0.5em] h-[0.5em] opacity-60"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                aria-label="Select recruiting year"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
              >
                {availableYears.length > 0 && <option value="all">All Seasons</option>}
                {availableYears.length > 0 ? (
                  availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))
                ) : (
                  <option value={selectedYear}>{selectedYear}</option>
                )}
              </select>
            </span>

            {/* Inline team selector — only a dropdown when there's more than one team */}
            <span className="relative inline-flex items-baseline">
              <span>{teamFullName}</span>
              {teamsWithRecruitingClasses.length > 1 && (
                <>
                  <svg
                    className="ml-1 self-center w-[0.5em] h-[0.5em] opacity-60"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                  <select
                    value={selectedTid}
                    onChange={(e) => handleTeamChange(Number(e.target.value))}
                    aria-label="Select team"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
                  >
                    {teamsWithRecruitingClasses.map(t => (
                      <option key={t.tid} value={t.tid}>{t.name}</option>
                    ))}
                  </select>
                </>
              )}
            </span>
          </span>
        }
        actions={
          !isViewOnly && !isAllSeasons ? (
            <Button variant="primary" size="sm" onClick={() => setShowEditModal(true)}>
              Edit
            </Button>
          ) : null
        }
      />

      <div className="media-card overflow-hidden">
        {/* Toolbar — stacks vertically on mobile so each block (metrics,
            view toggle, star filters) gets a full-width row instead of
            cramming together and wrapping awkwardly. From md: up they sit
            side-by-side with vertical dividers. */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-stretch divide-y md:divide-y-0 md:divide-x divide-surface-4">
          {/* Metrics — entire block opens the class history modal */}
          {!isAllSeasons ? (
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              disabled={classHistory.length <= 1}
              className="flex items-center gap-4 sm:gap-6 px-3 sm:px-5 py-3 flex-shrink-0 text-left transition-colors hover:bg-surface-3 disabled:cursor-default disabled:hover:bg-transparent"
              title={classHistory.length > 1 ? 'View class scores by season' : 'NCAA Football 25 class score formula'}
              aria-label="View recruiting class history"
            >
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular text-txt-primary leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {nationalRank ? `#${nationalRank}` : '—'}
                </span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Natl Rank</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular text-txt-primary leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {formatRecruitingClassScore(classScore)}
                </span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Score</span>
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-4 sm:gap-6 px-3 sm:px-5 py-3 flex-shrink-0">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular text-txt-primary leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {classStats.total}
                </span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Commits</span>
              </div>
            </div>
          )}

          {/* View toggle */}
          {hasHSandPortal && (
            <div className="flex items-center gap-1 px-3 sm:px-4 py-3 flex-shrink-0">
              {VIEW_MODE_OPTIONS.map(opt => {
                const active = viewMode === opt.value
                const count = opt.value === 'both'
                  ? allCommitmentsUnfiltered.length
                  : opt.value === 'hs'
                    ? allCommitmentsUnfiltered.filter(c => !c.previousTeam).length
                    : allCommitmentsUnfiltered.filter(c => c.previousTeam).length
                return (
                  <button
                    key={opt.value}
                    onClick={() => setViewMode(opt.value)}
                    className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      active ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-primary hover:bg-surface-3'
                    }`}
                    style={active ? { backgroundColor: 'var(--surface-3)' } : undefined}
                  >
                    {opt.label} <span className="tabular opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Star filter — single dropdown (All / 5 / 4 / …) so the toolbar
              stays one row tall instead of stacking five star chips. Drives
              the same selectedStars filter: [] = All, [n] = that tier.
              flex-shrink-0 (not flex-1 min-w-0) so the select sizes to its
              content and doesn't get squeezed/clipped. */}
          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-3 flex-shrink-0">
            <span className="label-xs text-txt-tertiary hidden sm:inline" style={{ letterSpacing: '1.5px' }}>Stars</span>
            <Select
              size="sm"
              value={selectedStars.length === 1 ? String(selectedStars[0]) : 'all'}
              onChange={(e) => setSelectedStars(e.target.value === 'all' ? [] : [Number(e.target.value)])}
              aria-label="Filter by star rating"
            >
              <option value="all">All ({classStats.total})</option>
              <option value="5">5 ★ ({classStats.fiveStars})</option>
              <option value="4">4 ★ ({classStats.fourStars})</option>
              <option value="3">3 ★ ({classStats.threeStars})</option>
              <option value="2">2 ★ ({classStats.twoStars})</option>
              <option value="1">1 ★ ({classStats.oneStars})</option>
            </Select>
          </div>

          {/* Position filter — Offense/Defense/Special Teams plus finer groups. */}
          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-3 flex-shrink-0">
            <span className="label-xs text-txt-tertiary hidden sm:inline" style={{ letterSpacing: '1.5px' }}>Pos</span>
            <Select
              size="sm"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              aria-label="Filter by position"
            >
              {POSITION_FILTER_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </div>

          {/* Sort control — anchored to the right edge on desktop. */}
          <div className="flex items-center gap-1.5 px-3 sm:px-4 py-3 flex-shrink-0 md:ml-auto">
            <span className="label-xs text-txt-tertiary hidden sm:inline" style={{ letterSpacing: '1.5px' }}>Sort</span>
            <Select
              size="sm"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              aria-label="Sort recruits"
            >
              <option value="rank">Recruit Rank</option>
              <option value="position">Position</option>
              <option value="dev">Dev Trait</option>
            </Select>
          </div>
        </div>
      </div>

      {allCommitments.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 stagger-reveal">
          {allCommitments.map((recruit, index) => {
            const player = findPlayerByName(recruit.name, recruit.recruitYear)
            const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
            const transferTid = recruit.previousTeam ? getTidFromAbbr(recruit.previousTeam, teamsData) : null
            const transferLogo = transferTid ? getTeamLogoByTid(transferTid, teamsData) : null

            const hometownText = recruit.hometown
              ? `${recruit.hometown}${recruit.state ? `, ${recruit.state}` : ''}`
              : (recruit.state ? (stateFullNames[recruit.state] || recruit.state) : null)
            const sizeText = (recruit.height || recruit.weight)
              ? `${recruit.height || ''}${recruit.height && recruit.weight ? ', ' : ''}${recruit.weight ? `${recruit.weight} lbs` : ''}`
              : null
            const previousTeamTid = recruit.previousTeam ? getTidFromAbbr(recruit.previousTeam, teamsData) : null
            // School only — strip the mascot ("Syracuse Orange" → "Syracuse")
            // so the FROM chip stays compact.
            const rawPreviousTeamName = previousTeamTid && teamsSource[previousTeamTid]?.name
              ? teamsSource[previousTeamTid].name
              : recruit.previousTeam
            const previousTeamName = rawPreviousTeamName
              ? (stripMascotFromName(rawPreviousTeamName) || rawPreviousTeamName)
              : null
            const devTraitKey = recruit.devTrait?.toLowerCase()
            // FROM chip is portal-only — non-portal HS recruits with a
            // previous-school field (e.g. their high school being filled
            // in by the importer) shouldn't surface a transfer chip.
            const isPortalRecruit = recruit.isPortal === true
            const showFromChip = isPortalRecruit && !!previousTeamName
            // Gem/bust is intentionally omitted from the tile — it adds
            // visual noise and isn't load-bearing in the directory view.
            // Dev trait now rides along inline in the identity row instead
            // of sitting in its own footer chip. Footer chip is now a
            // single unified marker: FROM-school for portal guys,
            // "HIGH SCHOOL" for everyone else, so every tile ends with
            // the same visual element.
            const showHsMarker = !showFromChip
            const showBottomChips = showFromChip || showHsMarker

            const starCount = Number(recruit.stars) || 0
            const archAndSize = [recruit.archetype, sizeText].filter(Boolean).join(' ')
            // Scouting-report card. Three vertical bands separated by hairline
            // rules so the eye can scan: identity → scouting → context.
            const sizeOnly = (recruit.height || recruit.weight)
              ? `${recruit.height || ''}${recruit.height && recruit.weight ? ', ' : ''}${recruit.weight ? `${recruit.weight} lbs` : ''}`
              : null
            const cardContent = (
              <Card
                padding="none"
                variant="bordered"
                interactive={!!player}
                className="h-full overflow-hidden group"
              >
                <div className="p-2 sm:p-3 flex flex-col h-full gap-1.5 sm:gap-2.5">
                  {/* === IDENTITY BAND === photo + name + pos·class + stars,
                      stacked and centered so the rhythm matches the
                      centered rank band, scouting band, and footer chip
                      below it. Mobile sizes are tightened down a notch
                      from desktop so two cards fit per row without
                      losing any of the info bands. */}
                  <div className="flex flex-col items-center gap-1 sm:gap-1.5 text-center">
                    {player?.pictureUrl ? (
                      <img
                        src={proxyImageUrl(player.pictureUrl, 300)}
                        alt={recruit.name}
                        className="w-11 h-11 sm:w-14 sm:h-14 object-cover rounded-md flex-shrink-0"
                        style={{ border: '1px solid var(--surface-4)' }}
                      />
                    ) : (
                      <div
                        className="w-11 h-11 sm:w-14 sm:h-14 rounded-md flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}
                      >
                        <span
                          className="text-xs sm:text-sm font-black uppercase tracking-wide text-txt-secondary tabular-nums"
                          style={{ letterSpacing: '0.05em' }}
                        >
                          {(recruit.position || 'ATH').slice(0, 3)}
                        </span>
                      </div>
                    )}
                    <h3
                      className="font-display font-black text-txt-primary leading-tight truncate max-w-full"
                      style={{ fontSize: 'clamp(13px, 3.4vw, 16px)', letterSpacing: '-0.02em' }}
                    >
                      {recruit.name || 'Unknown'}
                    </h3>
                    <div
                      className="flex items-center justify-center gap-1 sm:gap-1.5 label-xs text-txt-secondary flex-wrap"
                      style={{ letterSpacing: '1.2px', fontSize: '9px' }}
                    >
                      <span className="font-bold">{recruit.position || 'ATH'}</span>
                      
                      <span>{recruit.class || 'HS'}</span>
                      {recruit.devTrait && (
                        <>
                          
                          <span>{recruit.devTrait}</span>
                        </>
                      )}
                      {isAllSeasons && recruit.recruitYear && (
                        <>
                          
                          <span className="tabular-nums">{recruit.recruitYear}</span>
                        </>
                      )}
                    </div>
                    {/* Stars — broadcast-style yellow, more prominent than before */}
                    <span className="flex items-center justify-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3"
                          fill={i < starCount ? 'var(--accent-warning, #f59e0b)' : 'var(--surface-4)'}
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </span>
                  </div>

                  {/* === RANK BAND === editorial-magazine grid, no inner borders */}
                  {(recruit.nationalRank || recruit.stateRank || recruit.positionRank) && (
                    <div
                      className="grid grid-cols-3 gap-1 sm:gap-2 py-1.5 sm:py-2"
                      style={{
                        borderTop: '1px solid var(--surface-4)',
                        borderBottom: '1px solid var(--surface-4)',
                      }}
                    >
                      <div className="text-center">
                        <div
                          className="label-xs text-txt-tertiary"
                          style={{ letterSpacing: '1.2px', fontSize: '8px' }}
                        >
                          NATL
                        </div>
                        <div
                          className="font-display font-black tabular-nums text-txt-primary leading-none mt-0.5 sm:mt-1"
                          style={{ fontSize: 'clamp(13px, 3.5vw, 17px)', letterSpacing: '-0.02em' }}
                        >
                          {recruit.nationalRank ? `#${recruit.nationalRank}` : '—'}
                        </div>
                      </div>
                      <div
                        className="text-center"
                        style={{
                          borderLeft: '1px solid var(--surface-4)',
                          borderRight: '1px solid var(--surface-4)',
                        }}
                      >
                        <div
                          className="label-xs text-txt-tertiary"
                          style={{ letterSpacing: '1.2px', fontSize: '8px' }}
                        >
                          {recruit.position || 'POS'}
                        </div>
                        <div
                          className="font-display font-black tabular-nums text-txt-primary leading-none mt-0.5 sm:mt-1"
                          style={{ fontSize: 'clamp(13px, 3.5vw, 17px)', letterSpacing: '-0.02em' }}
                        >
                          {recruit.positionRank ? `#${recruit.positionRank}` : '—'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div
                          className="label-xs text-txt-tertiary"
                          style={{ letterSpacing: '1.2px', fontSize: '8px' }}
                        >
                          {recruit.state || 'ST'}
                        </div>
                        <div
                          className="font-display font-black tabular-nums text-txt-primary leading-none mt-0.5 sm:mt-1"
                          style={{ fontSize: 'clamp(13px, 3.5vw, 17px)', letterSpacing: '-0.02em' }}
                        >
                          {recruit.stateRank ? `#${recruit.stateRank}` : '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* === SCOUTING BAND === archetype, size, hometown.
                      Centered so the rhythm matches the centered identity
                      photo + name above and the centered footer chips
                      below — left-aligned text in a centered card felt
                      orphaned. */}
                  {(recruit.archetype || sizeOnly || hometownText) && (
                    <div className="text-[10px] sm:text-[12px] leading-snug space-y-0.5 text-center">
                      {recruit.archetype && (
                        <div className="font-semibold text-txt-primary truncate">
                          {recruit.archetype}
                        </div>
                      )}
                      {sizeOnly && (
                        <div className="text-txt-secondary tabular-nums truncate">
                          {sizeOnly}
                        </div>
                      )}
                      {hometownText && (
                        <div className="text-txt-tertiary truncate">{hometownText}</div>
                      )}
                    </div>
                  )}

                  {/* === CONTEXT BAND === one unified marker so every
                      tile ends with the same shape:
                        - Portal recruits: FROM-school chip (school logo + name)
                        - HS recruits:     "HIGH SCHOOL" chip
                      Dev trait moved up into the identity row, so this
                      band is now a single centered chip on every card,
                      keeping vertical heights in sync across the grid. */}
                  {showBottomChips && (
                    <div
                      className="mt-auto pt-1.5 sm:pt-2 flex justify-center"
                      style={{ borderTop: '1px solid var(--surface-4)' }}
                    >
                      {showFromChip ? (() => {
                        // Paint the FROM chip in the previous school's
                        // own colors when we can resolve them — primary
                        // as the fill, secondary for the school name.
                        // The "FROM" label stays neutral so the school
                        // is the headline. Falls back to the muted
                        // surface treatment when colors are missing.
                        const prevTeam = previousTeamTid ? teamsSource[previousTeamTid] : null
                        const prevPrimary = prevTeam?.primaryColor
                        const prevSecondary = prevTeam?.secondaryColor || '#ffffff'
                        const themed = !!prevPrimary
                        return (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest min-w-0"
                            style={{
                              letterSpacing: '1.5px',
                              color: themed ? prevSecondary : 'var(--text-secondary)',
                              backgroundColor: themed ? prevPrimary : 'transparent',
                              border: themed ? `1px solid ${prevPrimary}` : '1px solid var(--surface-5)',
                            }}
                          >
                            <span
                              className="flex-shrink-0"
                              style={{ color: themed ? prevSecondary : 'var(--text-tertiary)', opacity: themed ? 0.7 : 1 }}
                            >
                              FROM
                            </span>
                            {transferLogo && (
                              <img
                                src={transferLogo}
                                alt=""
                                className="w-3.5 h-3.5 object-contain flex-shrink-0 rounded-sm"
                                style={themed ? { backgroundColor: prevSecondary, padding: '1px' } : undefined}
                              />
                            )}
                            <span className="truncate" style={{ color: themed ? prevSecondary : undefined }}>
                              {previousTeamName}
                            </span>
                          </span>
                        )
                      })() : (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest"
                          style={{
                            letterSpacing: '1.5px',
                            color: 'var(--text-tertiary)',
                            border: '1px solid var(--surface-5)',
                          }}
                        >
                          High School
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )

            return player ? (
              <Link
                key={`${recruit.name}-${index}`}
                to={`${pathPrefix}/player/${player.pid}`}
                className="block"
              >
                {cardContent}
              </Link>
            ) : (
              <div key={`${recruit.name}-${index}`}>{cardContent}</div>
            )
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title={viewMode === 'portal' ? 'No Transfer Portal Commits' : viewMode === 'hs' ? 'No HS Commitments Yet' : 'No Commitments Yet'}
          />
        </Card>
      )}

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
        teamColors={{ primary: 'var(--text-primary)', secondary: 'var(--team-secondary)' }}
      />

      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={(() => {
          const logo = selectedTid ? getTeamLogoByTid(selectedTid, teamsSource) : null
          return (
            <span className="inline-flex items-center gap-3">
              {logo && <img src={logo} alt="" className="w-8 h-8 object-contain flex-shrink-0" />}
              Class History
            </span>
          )
        })()}
        size="md"
      >
        {classHistory.length === 0 ? (
          <p className="text-sm text-txt-secondary">No recruiting class data recorded yet.</p>
        ) : (() => {
          const maxScore = Math.max(...classHistory.map(r => Number(r.score) || 0), 1)
          return (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-[3.5rem_3rem_1fr_3rem] gap-3 items-center px-1">
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Year</span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Rank</span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Score</span>
                <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px' }}>Commits</span>
              </div>

              <div className="flex flex-col gap-1.5 -mt-3">
                {classHistory.map(row => {
                  const isCurrent = row.year === selectedYear
                  const score = Number(row.score) || 0
                  const barPct = maxScore > 0 ? Math.max(4, (score / maxScore) * 100) : 0
                  const isTopTen = row.rank && row.rank <= 10
                  return (
                    <button
                      key={row.year}
                      type="button"
                      onClick={() => {
                        setShowHistoryModal(false)
                        navigate(`${pathPrefix}/recruiting/${selectedTid}/${row.year}`)
                      }}
                      className="grid grid-cols-[3.5rem_3rem_1fr_3rem] gap-3 items-center px-1 py-3 rounded-md text-left transition-all hover:bg-surface-3 group relative overflow-hidden"
                      style={{
                        backgroundColor: isCurrent ? 'var(--surface-3)' : 'transparent',
                      }}
                    >
                      {isCurrent && (
                        <div
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
                          style={{ backgroundColor: 'var(--text-primary)' }}
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className="text-2xl font-black tabular leading-none pl-2"
                        style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          color: isCurrent ? 'var(--text-primary)' : 'var(--txt-primary)',
                        }}
                      >
                        {row.year}
                      </span>
                      <span
                        className="text-sm font-semibold tabular inline-flex items-center justify-center px-2 py-0.5 rounded-full"
                        style={{
                          color: isTopTen ? 'var(--text-primary)' : 'var(--txt-secondary)',
                          backgroundColor: isTopTen ? 'var(--surface-3)' : 'transparent',
                          border: isTopTen ? '1px solid var(--text-primary)' : '1px solid transparent',
                          minWidth: '2.5rem',
                        }}
                      >
                        {row.rank ? `#${row.rank}` : '—'}
                      </span>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden min-w-0">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${barPct}%`,
                              backgroundColor: 'var(--text-primary)',
                              opacity: isCurrent ? 1 : 0.55,
                            }}
                          />
                        </div>
                        <span
                          className="text-base font-black tabular flex-shrink-0 text-right tabular-nums"
                          style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            color: 'var(--txt-primary)',
                            minWidth: '3.5rem',
                          }}
                        >
                          {formatRecruitingClassScore(row.score)}
                        </span>
                      </div>
                      <span className="text-sm text-txt-secondary tabular-nums text-right pr-1">
                        {row.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
