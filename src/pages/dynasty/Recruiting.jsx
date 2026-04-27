import { useState, useMemo, useEffect } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useDynasty, getRecruitingCommitments, lookupByTeamYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import RecruitingCommitmentsModal from '../../components/RecruitingCommitmentsModal'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getTidFromAbbr, getOriginalTeamAbbr } from '../../data/teamRegistry'
import { getTeamLogoByTid } from '../../data/teams'
import { PageHero, Card, Badge, Button, Select, EmptyState, TeamLogo } from '../../components/ui'
import Modal from '../../components/ui/Modal'
import { calculateRecruitingClassScore, formatRecruitingClassScore, flattenClassCommitments } from '../../utils/recruitingScore'

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

const DEV_TRAIT_VARIANT = {
  'elite': 'warning',
  'star': 'accent',
  'impact': 'info',
  'normal': 'default'
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
  const [showEditModal, setShowEditModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const toggleStarFilter = (starCount) => {
    setSelectedStars(prev =>
      prev.includes(starCount)
        ? prev.filter(s => s !== starCount)
        : [...prev, starCount]
    )
  }

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
        const tid = getTidFromAbbr(abbr)
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

          const movement = {
            year: selectedYear,
            type: 'portal_in',
            from: previousTeamTid,
            to: selectedTid,
            reason: 'Transfer'
          }

          updatedPlayers[playerIndex] = {
            ...existingPlayer,
            team: selectedTid,
            teamsByYear: {
              ...existingPlayer.teamsByYear,
              [selectedYear + 1]: teamsByYearValue
            },
            movements: [...(existingPlayer.movements || []), movement],
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

    return filtered
  }, [allCommitmentsUnfiltered, viewMode, selectedStars])

  const classStats = useMemo(() => {
    const fiveStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 5).length
    const fourStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 4).length
    const threeStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 3).length
    const twoStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 2).length
    const oneStars = allCommitmentsUnfiltered.filter(c => Number(c.stars) === 1).length
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

  const starTiles = [
    { count: 5, label: classStats.fiveStars },
    { count: 4, label: classStats.fourStars },
    { count: 3, label: classStats.threeStars },
    { count: 2, label: classStats.twoStars },
    { count: 1, label: classStats.oneStars }
  ]

  return (
    <div className="space-y-4">
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

      <Card padding="none">
        <div className="flex flex-wrap items-stretch divide-y md:divide-y-0 md:divide-x divide-surface-4">
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
                    style={active ? { backgroundColor: 'var(--team-primary-faded)' } : undefined}
                  >
                    {opt.label} <span className="tabular opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Star filter chips — wrap freely. On mobile we show a compact
              "5★" form (rating number + single star) so all five chips fit
              alongside the view toggle on small viewports; the full 1–5
              star pattern only appears from sm: up where there's room. */}
          <div className="flex items-center gap-1 px-3 sm:px-4 py-3 flex-1 min-w-0 flex-wrap">
            {starTiles.map(tile => {
              const selected = selectedStars.includes(tile.count)
              return (
                <button
                  key={tile.count}
                  onClick={() => toggleStarFilter(tile.count)}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-colors flex-shrink-0"
                  style={{
                    backgroundColor: selected ? 'var(--team-primary-faded)' : 'transparent',
                    border: `1px solid ${selected ? 'var(--team-primary)' : 'var(--surface-4)'}`,
                    color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                  aria-pressed={selected}
                  aria-label={`Filter ${tile.count}-star recruits (${tile.label} total)`}
                >
                  {/* Mobile: compact "5★" */}
                  <span className="flex items-center gap-0.5 sm:hidden">
                    <span className="tabular text-txt-primary leading-none">{tile.count}</span>
                    <svg className="w-2.5 h-2.5" fill="var(--accent-warning)" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </span>
                  {/* Desktop+: full 1–5 star pattern */}
                  <span className="hidden sm:flex items-center gap-0.5">
                    {[...Array(tile.count)].map((_, i) => (
                      <svg key={i} className="w-2.5 h-2.5" fill="var(--accent-warning)" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </span>
                  <span className="tabular">{tile.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {allCommitments.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 stagger-reveal">
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
            const previousTeamName = previousTeamTid && teamsSource[previousTeamTid]?.name
              ? teamsSource[previousTeamTid].name
              : recruit.previousTeam
            const devTraitKey = recruit.devTrait?.toLowerCase()
            const showBottomChips = recruit.devTrait || recruit.gemBust || recruit.previousTeam

            const starCount = Number(recruit.stars) || 0
            const cardContent = (
              <Card
                padding="none"
                variant="bordered"
                interactive={!!player}
                className="h-full overflow-hidden group"
              >
                <div className="p-3 flex flex-col h-full">
                  {/* Top row — photo, name, position, stars */}
                  <div className="flex items-start gap-2.5">
                    {player?.pictureUrl ? (
                      <img
                        src={player.pictureUrl}
                        alt={recruit.name}
                        className="w-12 h-12 object-cover rounded-sm flex-shrink-0"
                        style={{ border: '1px solid var(--surface-4)' }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-sm flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}
                      >
                        <span
                          className="text-base font-black uppercase tracking-wide text-txt-muted"
                          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                        >
                          {(recruit.position || 'ATH').slice(0, 3)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-sm font-black uppercase tracking-wide text-txt-primary leading-tight truncate"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '1px' }}
                      >
                        {recruit.name || 'Unknown'}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="accent" size="sm">{recruit.position || 'ATH'}</Badge>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>
                          {recruit.class || 'HS'}
                          {isAllSeasons && recruit.recruitYear ? ` · ${recruit.recruitYear}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 mt-1">
                        {[...Array(5)].map((_, i) => (
                          <svg
                            key={i}
                            className="w-3 h-3"
                            fill={i < starCount ? 'var(--accent-warning)' : 'var(--surface-4)'}
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Rank strip — editorial, tabular */}
                  {(recruit.nationalRank || recruit.stateRank || recruit.positionRank) && (
                    <div
                      className="mt-2 grid grid-cols-3 text-center rounded-sm overflow-hidden"
                      style={{ backgroundColor: 'var(--surface-1)', border: '1px solid var(--surface-4)' }}
                    >
                      <div className="py-1 px-1" style={{ borderRight: '1px solid var(--surface-4)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Natl</div>
                        <div className="text-xs font-black tabular text-txt-primary leading-none mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                          {recruit.nationalRank ? `#${recruit.nationalRank}` : '—'}
                        </div>
                      </div>
                      <div className="py-1 px-1" style={{ borderRight: '1px solid var(--surface-4)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>{recruit.position || 'Pos'}</div>
                        <div className="text-xs font-black tabular text-txt-primary leading-none mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                          {recruit.positionRank ? `#${recruit.positionRank}` : '—'}
                        </div>
                      </div>
                      <div className="py-1 px-1">
                        <div className="text-[9px] font-bold uppercase tracking-widest text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>{recruit.state || 'St'}</div>
                        <div className="text-xs font-black tabular text-txt-primary leading-none mt-0.5" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                          {recruit.stateRank ? `#${recruit.stateRank}` : '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Meta info — compact stacked lines */}
                  {(recruit.archetype || sizeText || hometownText) && (
                    <div className="mt-2 space-y-0.5 text-[11px]">
                      {recruit.archetype && (
                        <div className="truncate">
                          <span className="text-txt-tertiary uppercase tracking-wider text-[9px] mr-1" style={{ letterSpacing: '1.5px' }}>Arch</span>
                          <span className="font-semibold text-txt-primary">{recruit.archetype}</span>
                        </div>
                      )}
                      {sizeText && (
                        <div className="truncate">
                          <span className="text-txt-tertiary uppercase tracking-wider text-[9px] mr-1" style={{ letterSpacing: '1.5px' }}>Size</span>
                          <span className="font-semibold text-txt-primary tabular">{sizeText}</span>
                        </div>
                      )}
                      {hometownText && (
                        <div className="truncate">
                          <span className="text-txt-tertiary uppercase tracking-wider text-[9px] mr-1" style={{ letterSpacing: '1.5px' }}>From</span>
                          <span className="font-semibold text-txt-primary">{hometownText}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom chips */}
                  {showBottomChips && (
                    <div className="flex items-center flex-wrap gap-1 mt-auto pt-2">
                      {recruit.devTrait && (
                        <Badge variant="outline" size="sm">
                          {recruit.devTrait}
                        </Badge>
                      )}
                      {recruit.gemBust && (
                        <Badge
                          variant={recruit.gemBust.toLowerCase() === 'gem' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {recruit.gemBust}
                        </Badge>
                      )}
                      {recruit.previousTeam && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-surface-3 text-txt-secondary"
                          style={{ letterSpacing: '1.5px' }}
                        >
                          <span className="text-txt-tertiary">From</span>
                          {transferLogo && <img src={transferLogo} alt="" className="w-3.5 h-3.5 object-contain" />}
                          <span>{previousTeamName}</span>
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
            message={
              isAllSeasons
                ? 'No recruiting data has been recorded for this team yet.'
                : selectedYear === currentDynasty.currentYear
                  ? 'Record recruiting commitments during preseason, regular season, or signing day.'
                  : `No recruiting data recorded for the ${selectedYear} class.`
            }
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
        teamColors={{ primary: 'var(--team-primary)', secondary: 'var(--team-secondary)' }}
      />

      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`${teamFullName} · Class History`}
        size="md"
      >
        {classHistory.length === 0 ? (
          <p className="text-sm text-txt-secondary">No recruiting class data recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-3 pb-2 border-b border-surface-4">
              <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Year</span>
              <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Rank</span>
              <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px' }}>Score</span>
              <span className="label-xs text-txt-tertiary text-right" style={{ letterSpacing: '1.5px' }}>Commits</span>
            </div>
            {classHistory.map(row => {
              const isCurrent = row.year === selectedYear
              return (
                <button
                  key={row.year}
                  type="button"
                  onClick={() => {
                    setShowHistoryModal(false)
                    navigate(`${pathPrefix}/recruiting/${selectedTid}/${row.year}`)
                  }}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-4 items-center px-3 py-2.5 rounded-sm text-left transition-colors hover:bg-surface-3"
                  style={{
                    backgroundColor: isCurrent ? 'var(--team-primary-faded, var(--surface-3))' : 'transparent',
                    borderLeft: isCurrent ? '3px solid var(--team-primary)' : '3px solid transparent'
                  }}
                >
                  <span className="text-2xl font-black tabular text-txt-primary leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    {row.year}
                  </span>
                  <span className="text-sm font-semibold text-txt-secondary tabular">
                    {row.rank ? `#${row.rank}` : '—'}
                  </span>
                  <span className="text-xl font-black tabular text-txt-primary text-right" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    {formatRecruitingClassScore(row.score)}
                  </span>
                  <span className="text-sm text-txt-secondary tabular text-right">
                    {row.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
