import { useState, useMemo, useEffect, lazy, Suspense } from 'react'
import { proxyImageUrl } from '../../utils/imageProxy'
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useDynasty, getRecruitingCommitments, lookupByTeamYear, isPlayerOnRoster } from '../../context/DynastyContext'
import { inferPlayStyle } from '../../utils/scoutGrade'
import { scoutCalibration } from '../../utils/scoutLearning'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import RecruitingCommitmentsModal from '../../components/RecruitingCommitmentsModal'
import RecruitingClassRankModal from '../../components/RecruitingClassRankModal'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getTidFromAbbr, getOriginalTeamAbbr, getColorsFromTid } from '../../data/teamRegistry'
import { getTeamLogoByTid, stripMascotFromName } from '../../data/teams'
import { getContrastTextColor } from '../../utils/colorUtils'
import { PageHero, Card, Badge, Button, Select, EmptyState, TeamLogo } from '../../components/ui'
import Modal from '../../components/ui/Modal'
import { calculateRecruitingClassScore, formatRecruitingClassScore, flattenClassCommitments } from '../../utils/recruitingScore'
import { sideOfPosition } from '../../utils/outlookBoard'
import { finePositionGroup } from '../../data/positionGroups'
import { POSITION_FILTER_OPTIONS, matchesPositionFilter } from '../../utils/recruitFilters'
import TeamPermissionBanner from '../../components/TeamPermissionBanner'
import { partitionRecruitingRows, reconcileRecruitingRows, isOpenTarget, resolveTargetCommitment, buildCommitmentRecord } from '../../utils/recruitingTargets'
import { carryRecruitingNilForward } from '../../data/playerNilModel'
import ScoutBoard from './ScoutBoard'
// Scout Staff is an opt-in (League Preferences) replacement for the MaxPlaysCFB
// Scout Board. Lazy-loaded so its chunk only ships when a dynasty enables it.
const ScoutStaff = lazy(() => import('../../components/ScoutStaff'))
import TargetResolutionModal from '../../components/TargetResolutionModal'
import RecruitCard from '../../components/RecruitCard'
import { buildRevealedPool } from '../../utils/devTraitLearning'
import { buildAttributeQualityMap } from '../../utils/devPrediction'

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
  'LEDG', 'REDG', 'DE', 'DT', 'NT', 'DL',
  'LOLB', 'ROLB', 'OLB', 'MLB', 'ILB', 'LB', 'SAM', 'MIKE', 'WILL',
  'CB', 'FS', 'SS', 'S', 'DB',
  'K', 'P', 'LS', 'ATH',
]

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

  // All four filters are URL-driven so each is its own route (back/forward,
  // refresh, and shared links preserve them). Helper writes one param, keeping
  // the others, with replace so filter changes don't spam history.
  const [searchParams, setSearchParams] = useSearchParams()
  const setParam = (key, value, dflt) => setSearchParams(prev => {
    const p = new URLSearchParams(prev)
    if (value == null || value === dflt) p.delete(key); else p.set(key, value)
    return p
  }, { replace: true })

  // viewMode: ?view= ; defaults to 'portal' on the /recruiting/portal/ route, else 'both'.
  const defaultView = location.pathname.includes('/recruiting/portal/') ? 'portal' : 'both'
  const viewMode = searchParams.get('view') || defaultView
  const setViewMode = (v) => setParam('view', v, defaultView)

  // The user's own team vs the team whose recruiting page is being viewed.
  // Targets are a "my team" planning tool — they only belong to the user's own
  // team, so they're scoped to it (never shown on another team's class).
  const currentTeamAbbr = getCurrentTeamAbbr(currentDynasty) || currentDynasty?.teamName
  const currentTeamTid = resolveTid(currentTeamAbbr, TEAMS)
  const selectedTid = tidParam ? parseInt(tidParam, 10) : currentTeamTid
  const isOwnTeam = Number(selectedTid) === Number(currentTeamTid)

  // Commitments / Targets / Scout Staff tab (persisted in the URL like the
  // other filters — an explicit ?tab= always wins across refresh/back-forward,
  // and is omitted when it matches the default so URLs stay clean). When Scout
  // Staff is enabled for this dynasty (League Preferences), it becomes the
  // primary recruiting workflow, so it takes over as both the first tab shown
  // and the default landing tab. Otherwise, default depends on the class being
  // viewed: the CURRENT recruiting year opens on Targets (you're actively
  // scouting); past/future years open on Commitments (reviewing a finished class).
  const scoutStaffEnabled = !!currentDynasty?.scoutStaffEnabled
  const viewingYear = urlYear === 'all' ? 'all' : (urlYear ? Number(urlYear) : Number(currentDynasty?.currentYear))
  const isCurrentRecruitingYear = viewingYear !== 'all' && viewingYear === Number(currentDynasty?.currentYear)
  const hasTargetsThisYear = isCurrentRecruitingYear && isOwnTeam
    && (currentDynasty?.players || []).some((p) => p?.isTarget && Number(p.targetYear) === viewingYear)
  const defaultTab = scoutStaffEnabled ? 'staff' : hasTargetsThisYear ? 'targets' : 'commitments'
  const tabParam = searchParams.get('tab')
  // 'database'/'outlook'/'thresholds'/'counts' are Scout Staff's own Recruiting
  // Database / Program Outlook / Threshold Lookup / Player Count sections,
  // promoted to top-level tabs here instead of nav tiles nested inside the
  // Scout Staff tab — see ScoutStaff.jsx's SECTION_TO_VIEW mapping.
  const KNOWN_TABS = ['targets', 'commitments', 'staff', 'database', 'outlook', 'thresholds', 'counts']
  const activeTab = KNOWN_TABS.includes(tabParam) ? tabParam : defaultTab
  const setActiveTab = (t) => setParam('tab', t === defaultTab ? null : t, null)
  const tabOrder = scoutStaffEnabled
    ? [
        { k: 'staff', l: 'Staff' },
        { k: 'targets', l: 'Targets' },
        { k: 'commitments', l: 'Commitments' },
        { k: 'database', l: 'Database' },
        { k: 'outlook', l: 'Outlook' },
        { k: 'thresholds', l: 'Thresholds' },
        { k: 'counts', l: 'Scouting Needs' },
      ]
    : [{ k: 'commitments', l: 'Commitments' }, { k: 'targets', l: 'Targets' }, { k: 'staff', l: 'Staff' }]

  // Tab switches only touch the URL's query string, not its pathname, so the
  // route-level ScrollToTop never fires — land at the top of each tab manually.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeTab])

  // In-app target resolution (Phase 4). openTargets is defined below, once
  // selectedYear exists.
  const [showResolveModal, setShowResolveModal] = useState(false)

  // stars: ?stars=<n> (single tier) ; absent = All. Memoized so the array
  // identity is stable across renders (it feeds a useMemo dep below).
  const starsParam = Number(searchParams.get('stars'))
  const selectedStars = useMemo(
    () => (Number.isFinite(starsParam) && starsParam >= 1 && starsParam <= 5 ? [starsParam] : []),
    [starsParam])
  const setSelectedStars = (arr) => setParam('stars', arr.length ? String(arr[0]) : null, null)

  // position: ?pos= ; absent = all.
  const positionFilter = searchParams.get('pos') || 'all'
  const setPositionFilter = (v) => setParam('pos', v, 'all')

  // sort: ?sort= ; defaults from the device-persisted preference, falling back to 'rank'.
  const sortPref = (typeof localStorage !== 'undefined' && localStorage.getItem('recruiting-sort')) || 'rank'
  const sortBy = searchParams.get('sort') || sortPref
  const handleSortChange = (value) => {
    try { localStorage.setItem('recruiting-sort', value) } catch { /* ignore */ }
    setParam('sort', value, null)
  }
  const [showEditModal, setShowEditModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showRankModal, setShowRankModal] = useState(false)

  const baseTeam = TEAMS[selectedTid]
  const dynastyTeam = currentDynasty?.teams?.[selectedTid]
  const team = baseTeam ? { ...baseTeam, ...dynastyTeam } : dynastyTeam
  const teamAbbr = team?.abbr || baseTeam?.abbr || currentTeamAbbr
  const selectedYear = urlYear === 'all' ? 'all' : (urlYear ? Number(urlYear) : currentDynasty?.currentYear)

  // Open targets for this class — drives the "Resolve Targets" action + modal.
  const openTargets = useMemo(
    () => (currentDynasty?.players || []).filter(p => isOpenTarget(p) && Number(p.targetYear) === Number(selectedYear)),
    [currentDynasty?.players, selectedYear],
  )

  // Offensive identity of the class's team (pass/run/balanced) → feeds the
  // scheme-fit line in each card's generated scouting report.
  const playStyle = useMemo(() => {
    const yr = Number(currentDynasty?.currentYear)
    const roster = (currentDynasty?.players || []).filter(p => isPlayerOnRoster(p, selectedTid, yr, currentDynasty))
    return inferPlayStyle(roster, yr)
  }, [currentDynasty?.players, selectedTid, currentDynasty?.currentYear, currentDynasty])

  // Self-calibrating scout model (learned from past recruit outcomes) so the
  // commitment cards grade on the same sharpened scale as the Targets board.
  const scoutModel = useMemo(() => scoutCalibration(currentDynasty?.players || []), [currentDynasty?.players])

  // Revealed-devTrait HS recruit pool — nudges Scout Staff archetype grading
  // once enough real data exists.
  const revealedPool = useMemo(() => buildRevealedPool(currentDynasty?.players || []), [currentDynasty?.players])
  const weightsMap = useMemo(() => buildAttributeQualityMap(revealedPool, currentDynasty?.players || []), [revealedPool, currentDynasty?.players])

  const teamFullName = team?.name || baseTeam?.name || teamAbbr

  // The whole page belongs to ONE team's class — wash it in that team's
  // colors (hero, toolbar accent, and every recruit card).
  const teamColorsRaw = getColorsFromTid(currentDynasty?.teams, selectedTid) || { primary: '#1f2937', secondary: '#f3f4f6' }
  const teamAccent = teamColorsRaw.primary || '#1f2937'
  const teamBgText = getContrastTextColor(teamAccent)

  const teamsSource = currentDynasty?.teams || TEAMS
  const heroLogo = selectedTid ? getTeamLogoByTid(selectedTid, teamsSource) : null

  // Filter dropdowns in the team-colored toolbar are styled as white pills to
  // match the active BOTH/HS/PORTAL toggle — contrast text + a matching chevron.
  const filterSelectStyle = {
    backgroundColor: teamBgText,
    color: teamAccent,
    border: `1px solid ${teamBgText}`,
    fontWeight: 700,
    backgroundImage:
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20' stroke='${encodeURIComponent(teamAccent)}'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
  }

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
    Object.entries(abbrData).forEach(([key, yearData]) => {
      const hasRecruits = Object.values(yearData).some(yearCommitments => {
        return Object.values(yearCommitments).some(weekCommitments => {
          return Array.isArray(weekCommitments) && weekCommitments.length > 0
        })
      })
      if (hasRecruits) {
        // The map is dual-keyed: numeric tid keys (rename-safe) and legacy
        // abbr keys. Prefer the tid key directly; only resolve abbr→tid for
        // legacy entries — otherwise a renamed team's class drops out here.
        const tid = /^\d+$/.test(key) ? Number(key) : getTidFromAbbr(key, currentDynasty)
        if (tid && !teamsMap.has(tid)) {
          const teamData = teamsSource[tid]
          teamsMap.set(tid, {
            abbr: teamData?.abbr || key,
            tid,
            name: teamData?.name || key
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

  // Edit the national class rank for the CURRENTLY-SELECTED team + year (the
  // dropdowns above). Unlike the Dashboard's Signing-Day modal — which is hard-
  // wired to the offseason data year — this lets the user correct a rank that
  // landed on the wrong season (e.g. a 2036 class that should have been 2035).
  // Pass rank = null to clear the year's rank entirely.
  const handleRankSave = async (rank) => {
    if (!currentDynasty?.id || isAllSeasons) return
    const year = selectedYear
    const tid = selectedTid
    const abbr = teamAbbr
    const existingRanks = currentDynasty.recruitingClassRankByTeamYear || {}

    // A rank can be stored under several aliases for the same team (current
    // abbr, numeric tid, a renamed-team's old abbr). lookupByTeamYear reads ALL
    // of them via drift-recovery, so a clear must scrub the year from every key
    // that resolves to this tid — otherwise the old value re-surfaces and it
    // looks like "nothing happened." A set scrubs the aliases too, then writes
    // the canonical abbr + tid keys, so no conflicting stale value lingers.
    const keyResolvesToTid = (key) => {
      if (tid == null) return false
      if (/^\d+$/.test(String(key))) return Number(key) === Number(tid)
      const k = getTidFromAbbr(key, currentDynasty)
      return k != null && Number(k) === Number(tid)
    }

    const nextRanks = {}
    for (const [key, sub] of Object.entries(existingRanks)) {
      if (keyResolvesToTid(key)) {
        const copy = { ...(sub || {}) }
        delete copy[year]
        delete copy[String(year)]
        nextRanks[key] = copy
      } else {
        nextRanks[key] = sub
      }
    }
    if (rank != null) {
      if (abbr) nextRanks[abbr] = { ...(nextRanks[abbr] || {}), [year]: rank }
      if (tid != null) nextRanks[tid] = { ...(nextRanks[tid] || {}), [year]: rank }
    }
    const updates = { recruitingClassRankByTeamYear: nextRanks }

    // Mirror into the tid-based teams[tid].byYear[year].recruitingClassRank store.
    if (tid != null && currentDynasty.teams?.[tid]) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[tid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[year] || existingByYear[String(year)] || {}
      const nextYearData = { ...existingYearData }
      if (rank == null) {
        delete nextYearData.recruitingClassRank
      } else {
        nextYearData.recruitingClassRank = rank
      }
      updates.teams = {
        ...existingTeams,
        [tid]: {
          ...existingTeamData,
          byYear: { ...existingByYear, [year]: nextYearData },
        },
      }
    }

    // replaceSeasonal/replaceTeams: a clear REMOVES the year from the maps, and
    // a plain merge (Firestore season doc + local deepMerge) can't drop a key
    // that's simply absent — so the cleared rank would re-surface. These options
    // make both layers replace the field, honoring the removal.
    await updateDynasty(currentDynasty.id, updates, {
      replaceSeasonal: ['recruitingClassRankByTeamYear'],
      replaceTeams: true,
    })
  }

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

    // Targets routing: target-concern rows go to the safe reconciler; plain
    // commit rows keep the existing portal/returning logic below. With no
    // tracked targets and no Commitment column, every row is a commit row and
    // this path runs byte-for-byte as before. See utils/recruitingTargets.js.
    const { targetRows, commitRows } = partitionRecruitingRows(recruits, {
      players: existingPlayers,
      userTid: selectedTid,
      classYear: selectedYear,
      dynastyTeams: currentDynasty.teams,
    })

    commitRows.forEach(recruit => {
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
            // Sheet is authoritative: a blank ('') clears the trait; only an
            // omitted field (undefined) keeps the existing one.
            devTrait: recruit.devTrait ?? updatedPlayers[playerIndex].devTrait,
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
            isPortal: recruit.isPortal ?? updatedPlayers[playerIndex].isPortal ?? false,
            // Recruiting NIL offer (CFB 27+), absence-safe + carried forward as
            // the next-season roster floor (never clobbering an entered value).
            ...(recruit.nil != null && !isNaN(Number(recruit.nil))
              ? { nilByYear: {
                  ...(updatedPlayers[playerIndex].nilByYear || {}),
                  [selectedYear]: Number(recruit.nil),
                  [selectedYear + 1]: (updatedPlayers[playerIndex].nilByYear?.[selectedYear + 1] ?? updatedPlayers[playerIndex].nilByYear?.[String(selectedYear + 1)] ?? Number(recruit.nil)),
                } }
              : {})
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
            devTrait: recruit.devTrait ?? existingPlayer.devTrait,
            stars: recruit.stars ?? existingPlayer.stars,
            nationalRank: recruit.nationalRank ?? existingPlayer.nationalRank,
            stateRank: recruit.stateRank ?? existingPlayer.stateRank,
            positionRank: recruit.positionRank ?? existingPlayer.positionRank,
            gemBust: recruit.gemBust || existingPlayer.gemBust,
            // Recruiting NIL offer (CFB 27+), absence-safe + carried forward as
            // the next-season roster floor (never clobbering an entered value).
            ...(recruit.nil != null && !isNaN(Number(recruit.nil))
              ? { nilByYear: {
                  ...(existingPlayer.nilByYear || {}),
                  [selectedYear]: Number(recruit.nil),
                  [selectedYear + 1]: (existingPlayer.nilByYear?.[selectedYear + 1] ?? existingPlayer.nilByYear?.[String(selectedYear + 1)] ?? Number(recruit.nil)),
                } }
              : {})
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
          // Dev traits are often hidden until signing day — leave blank when the
          // user didn't enter one (don't presume Normal).
          devTrait: recruit.devTrait || '',
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
          isPortal: recruit.isPortal || false,
          // Recruiting NIL offer (CFB 27+), absence-safe + carried forward as the
          // next-season roster floor (new signee, so both years start at the offer).
          ...(recruit.nil != null && !isNaN(Number(recruit.nil))
            ? { nilByYear: { [selectedYear]: Number(recruit.nil), [selectedYear + 1]: Number(recruit.nil) } }
            : {})
        })
      }
    })

    let finalPlayers = [...updatedPlayers, ...newPlayers]
    let committedToUs = []
    if (targetRows.length) {
      const rec = reconcileRecruitingRows({
        rows: targetRows,
        players: finalPlayers,
        userTid: selectedTid,
        dynastyTeams: currentDynasty.teams,
        classYear: selectedYear,
        weekKey: null,
        startPID: nextPID,
      })
      finalPlayers = rec.players
      nextPID = rec.nextPID
      committedToUs = rec.committedToUs
    }

    // recruitingCommitments holds ONLY commitments to this team (M1): plain
    // commit rows plus any tracked target that resolved to us. Open / elsewhere
    // targets are excluded so they never inflate the class score.
    const commitmentData = { edit: [...commitRows, ...committedToUs] }

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

  // In-app target resolution (Phase 4). `resolutions` is { pid: commitmentTid }.
  // Flips each target's player record with the SAME field-setting the sheet
  // reconciler uses (resolveTargetCommitment → applyStatus), then — for any that
  // committed to US — appends to recruitingCommitments so the class score counts
  // them (M1: open / elsewhere targets never touch that store).
  const handleResolveTargets = async (resolutions) => {
    if (isViewOnly || !currentDynasty) return
    const ids = Object.keys(resolutions || {})
    if (!ids.length) return

    const players = currentDynasty.players || []
    const committedToUs = []
    const changedPids = []
    const newPlayers = players.map((p) => {
      const tid = resolutions[p.pid]
      if (tid == null) return p
      const classYear = Number(p.targetYear) || Number(selectedYear)
      let updated = resolveTargetCommitment(p, { commitmentTid: Number(tid), classYear, weekKey: null })
      if (Number(tid) === Number(selectedTid)) {
        // Signing with you carries the recruiting offer forward as next season's roster floor.
        updated = carryRecruitingNilForward(updated, classYear)
        committedToUs.push(buildCommitmentRecord(updated))
      }
      changedPids.push(p.pid)
      return updated
    })

    const updates = { players: newPlayers }

    if (committedToUs.length && selectedTid && currentDynasty.teams) {
      const existingTeams = currentDynasty.teams
      const existingTeamData = existingTeams[selectedTid] || {}
      const existingByYear = existingTeamData.byYear || {}
      const existingYearData = existingByYear[selectedYear] || {}
      const prevEdit = existingYearData.recruitingCommitments?.edit || []
      const prevPids = new Set(prevEdit.map((c) => c.pid))
      const merged = [...prevEdit, ...committedToUs.filter((c) => !prevPids.has(c.pid))]
      const commitmentData = { edit: merged }

      updates.teams = {
        ...existingTeams,
        [selectedTid]: {
          ...existingTeamData,
          byYear: { ...existingByYear, [selectedYear]: { ...existingYearData, recruitingCommitments: commitmentData } },
        },
      }
      const existingByTeamYear = currentDynasty.recruitingCommitmentsByTeamYear || {}
      updates.recruitingCommitmentsByTeamYear = {
        ...existingByTeamYear,
        [teamAbbr]: { ...(existingByTeamYear[teamAbbr] || {}), [selectedYear]: commitmentData },
        [selectedTid]: { ...(existingByTeamYear[selectedTid] || {}), [selectedYear]: commitmentData },
      }
    }

    // Only the resolved players changed — persist just those (not the whole
    // roster) so the save stays sub-second and the commitment fields written
    // alongside don't get reverted by a stale listener snapshot mid-write.
    await updateDynasty(currentDynasty.id, updates, { changedPlayerPids: changedPids })
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

      <section
        className="card overflow-hidden relative reveal cfb-texture cfb-watermark"
        style={{
          backgroundColor: teamAccent,
          backgroundImage:
            'linear-gradient(120deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.44) 100%)',
          ...(heroLogo ? { '--cfb-watermark': `url("${heroLogo}")`, '--cfb-watermark-right': '7rem' } : {}),
        }}
      >
        <div className="relative px-6 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="font-display font-extrabold uppercase leading-none m-0 break-words"
              style={{ color: teamBgText, fontSize: 'clamp(1.6rem, 4vw, 2.6rem)' }}
            >
              Recruiting Class
            </h1>
            <div className="mt-2">
              <span className="group inline-flex items-baseline flex-wrap gap-x-2 text-[clamp(1.1rem,2.2vw,1.5rem)] font-bold" style={{ color: teamBgText, opacity: 0.92 }}>
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
            </div>
          </div>
          {!isViewOnly && !isAllSeasons && (
            <div className="self-start sm:self-center flex-shrink-0 flex items-center gap-2">
              <button
                onClick={() => setShowRankModal(true)}
                className="px-4 py-1.5 rounded-lg font-display font-bold uppercase tracking-wide text-sm hover:opacity-90 transition-opacity border"
                style={{ borderColor: teamBgText, color: teamBgText, backgroundColor: 'transparent' }}
              >
                Edit Rank
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="px-4 py-1.5 rounded-lg font-display font-bold uppercase tracking-wide text-sm hover:opacity-90 transition-opacity"
                style={{ backgroundColor: teamBgText, color: teamAccent }}
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Commitments / Targets tabs — docked under the hero title */}
        <div className="flex gap-1 px-3 sm:px-5" style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
          {tabOrder.map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => setActiveTab(t.k)}
              className="relative px-3 sm:px-4 py-2.5 font-display font-bold uppercase whitespace-nowrap transition-opacity"
              style={{ fontSize: '0.8rem', letterSpacing: '0.06em', color: teamBgText, opacity: activeTab === t.k ? 1 : 0.55 }}
            >
              {t.l}
              {activeTab === t.k && <span aria-hidden className="absolute left-2 right-2 bottom-0 h-[2px] rounded-t-sm" style={{ backgroundColor: teamBgText }} />}
            </button>
          ))}
        </div>

        {activeTab === 'commitments' && (
        <div
          className="relative"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.18)',
            color: teamBgText,
            '--text-tertiary': `color-mix(in srgb, ${teamBgText} 66%, transparent)`,
          }}
        >
        {/* Toolbar — stacks vertically on mobile so each block (metrics,
            view toggle, star filters) gets a full-width row instead of
            cramming together and wrapping awkwardly. From md: up they sit
            side-by-side with vertical dividers. */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-stretch divide-y md:divide-y-0 md:divide-x divide-white/15">
          {/* Metrics — entire block opens the class history modal */}
          {!isAllSeasons ? (
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              disabled={classHistory.length <= 1}
              className="flex items-center gap-4 sm:gap-6 px-3 sm:px-5 py-3 flex-shrink-0 text-left transition-colors hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent"
              title={classHistory.length > 1 ? 'View class scores by season' : 'NCAA Football 25 class score formula'}
              aria-label="View recruiting class history"
            >
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {nationalRank ? `#${nationalRank}` : '—'}
                </span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Natl Rank</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {formatRecruitingClassScore(classScore)}
                </span>
                <span className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>Score</span>
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-4 sm:gap-6 px-3 sm:px-5 py-3 flex-shrink-0">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular leading-none" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
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
                      active ? '' : 'hover:bg-white/10'
                    }`}
                    style={active ? { backgroundColor: teamBgText, color: teamAccent } : undefined}
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
              style={filterSelectStyle}
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
              style={filterSelectStyle}
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
              style={filterSelectStyle}
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
        )}
      </section>

      {activeTab === 'commitments' ? (
        allCommitments.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 stagger-reveal">
          {allCommitments.map((recruit, index) => {
            const player = findPlayerByName(recruit.name, recruit.recruitYear)
            // pid is resolved two ways: the lenient _findPlayer match baked
            // onto the commitment during construction (recruit.pid), and the
            // stricter name lookup above. Use whichever resolves so the whole
            // tile links to the recruit's player page.
            const linkPid = recruit.pid || player?.pid
            const teamsData = currentDynasty?.teams || currentDynasty?.customTeams
            // The card itself (identity → ranks → scouting → footer) is the
            // shared RecruitCard; the Targets tab renders the exact same card.
            const cardContent = (
              <RecruitCard
                recruit={recruit}
                player={player}
                bg={teamAccent}
                text={teamBgText}
                teamsData={teamsData}
                isAllSeasons={isAllSeasons}
                interactive={!!linkPid}
                playStyle={playStyle}
                model={scoutModel}
                scoutStaffEnabled={!!currentDynasty?.scoutStaffEnabled}
                weightsMap={weightsMap}
                pool={revealedPool}
              />
            )

            return linkPid ? (
              <Link
                key={`${recruit.name}-${index}`}
                to={`${pathPrefix}/player/${linkPid}`}
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
        )
      ) : ['staff', 'database', 'outlook', 'thresholds', 'counts'].includes(activeTab) ? (
        currentDynasty?.scoutStaffEnabled ? (
          <Suspense fallback={<div className="py-12 text-center text-sm text-txt-tertiary">Loading Scout Staff…</div>}>
            <ScoutStaff year={selectedYear} section={activeTab} onNavigate={setActiveTab} />
          </Suspense>
        ) : (
          <Card>
            <EmptyState title="Scout Staff is not enabled for this dynasty" />
          </Card>
        )
      ) : (
        <ScoutBoard
          dynasty={currentDynasty}
          year={selectedYear}
          userTid={selectedTid}
          pathPrefix={pathPrefix}
          positionFilter={positionFilter}
          onPositionFilterChange={setPositionFilter}
          viewingOwnTeam={isOwnTeam}
          onResolveTargets={!isViewOnly && openTargets.length > 0 ? () => setShowResolveModal(true) : null}
          resolveCount={openTargets.length}
          scoutStaffEnabled={!!currentDynasty?.scoutStaffEnabled}
        />
      )}

      <TargetResolutionModal
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        targets={openTargets}
        dynastyTeams={currentDynasty?.teams}
        userTid={selectedTid}
        onResolve={handleResolveTargets}
      />

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

      <RecruitingClassRankModal
        isOpen={showRankModal}
        onClose={() => setShowRankModal(false)}
        onSave={handleRankSave}
        currentRank={nationalRank}
        seasonLabel={!isAllSeasons ? `${selectedYear} ${teamFullName}` : ''}
        teamColors={teamColorsRaw}
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
