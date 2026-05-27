import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { getTeamLogo, getMascotName as getMascotNameFromTeams } from '../../data/teams'
import { teamAbbreviations } from '../../data/teamAbbreviations'
import { TEAMS, resolveTid, getCurrentTeamAbbr, getGameTeamInfo, getAbbrFromTeamName, getTidFromAbbr, getOriginalTeamAbbr } from '../../data/teamRegistry'
import { useDynasty, GAME_TYPES, getCurrentCustomConferences, buildRecordUpdatePayload, calculateTeamRecordFromGames, getStoredTeamRecord, getTeamRecord, getTeamRankForWeek, propagateCFPWinner, isPlayerOnRoster, getRecordAsOfGame } from '../../context/DynastyContext'
import { useAuth } from '../../context/AuthContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { getFullRecapPrompt, getRivalryName } from '../../services/geminiService'
import { getBowlLogo } from '../../data/bowlLogos'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getTeamConference } from '../../data/conferenceTeams'
import BoxScoreSheetModal from '../../components/BoxScoreSheetModal'
import { setPlayerStatsForTid, setTeamStatsForTid, setScoringSummary, getPlayerStatsSheetIdForTid, canonicalBoxScore, swapBoxScoreTeams, hasAnyPlayerStats, hasAnyTeamStats } from '../../utils/boxScoreHelpers'
import { parseCFPGameId, getCFPRoundInfo, getCFPSlotDisplayName } from '../../data/cfpConstants'
import { isBowlInWeek1, isBowlInWeek2, getWeek1BowlGamesList, getWeek2BowlGamesList } from '../../services/sheetsService'
import { PageHero, Card, Button, EmptyState, Input, Select, Textarea, SectionHeader, Modal } from '../../components/ui'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useToast } from '../../components/ui/Toast'
import RecapSettingsModal from '../../components/RecapSettingsModal'
import { getTeamLogoRobust } from '../../utils/teamLogo'
import { getTeamColors } from '../../data/teamColors'
import { uploadImagesToImgBB } from '../../utils/imgbb'
import TeamPermissionBanner from '../../components/TeamPermissionBanner'
import ImageUpload from '../../components/ImageUpload'
import { buildScoreGraphicPrompt } from '../../utils/scoreGraphicPrompt'

// Map abbreviations to mascot names for logo lookup
function getMascotName(abbr, teamsData = null) {
  if (teamsData) {
    const result = getMascotNameFromTeams(abbr, teamsData)
    if (result) return result
  }
  const mascotMap = {
    'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips', 'BAMA': 'Alabama Crimson Tide',
    'APP': 'Appalachian State Mountaineers', 'ARIZ': 'Arizona Wildcats',
    'ARK': 'Arkansas Razorbacks', 'ARMY': 'Army Black Knights',
    'ARST': 'Arkansas State Red Wolves', 'ASU': 'Arizona State Sun Devils',
    'AUB': 'Auburn Tigers', 'BALL': 'Ball State Cardinals', 'BC': 'Boston College Eagles',
    'BGSU': 'Bowling Green Falcons', 'BOIS': 'Boise State Broncos',
    'BU': 'Baylor Bears', 'BUFF': 'Buffalo Bulls', 'BYU': 'Brigham Young Cougars',
    'CAL': 'California Golden Bears', 'CCU': 'Coastal Carolina Chanticleers',
    'CHAR': 'Charlotte 49ers', 'CLEM': 'Clemson Tigers', 'CMU': 'Central Michigan Chippewas',
    'COLO': 'Colorado Buffaloes', 'CONN': 'Connecticut Huskies', 'CSU': 'Colorado State Rams',
    'DEL': 'Delaware Fightin\' Blue Hens', 'DUKE': 'Duke Blue Devils',
    'ECU': 'East Carolina Pirates', 'EMU': 'Eastern Michigan Eagles',
    'FIU': 'Florida International Panthers', 'FSU': 'Florida State Seminoles',
    'FAU': 'Florida Atlantic Owls', 'FRES': 'Fresno State Bulldogs', 'FLA': 'Florida Gators',
    'GASO': 'Georgia Southern Eagles', 'GSU': 'Georgia State Panthers',
    'GT': 'Georgia Tech Yellow Jackets', 'UGA': 'Georgia Bulldogs',
    'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
    'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers',
    'IOWA': 'Iowa Hawkeyes', 'ISU': 'Iowa State Cyclones',
    'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
    'KENN': 'Kennesaw State Owls', 'KENT': 'Kent State Golden Flashes',
    'KU': 'Kansas Jayhawks', 'KSU': 'Kansas State Wildcats', 'UK': 'Kentucky Wildcats',
    'LIB': 'Liberty Flames', 'LOU': 'Louisville Cardinals', 'LSU': 'LSU Tigers',
    'LT': 'Louisiana Tech Bulldogs', 'MIA': 'Miami Hurricanes', 'M-OH': 'Miami Redhawks',
    'UMD': 'Maryland Terrapins', 'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers',
    'MICH': 'Michigan Wolverines', 'MSU': 'Michigan State Spartans',
    'MTSU': 'Middle Tennessee State Blue Raiders', 'MINN': 'Minnesota Golden Gophers',
    'MISS': 'Ole Miss Rebels', 'MSST': 'Mississippi State Bulldogs', 'MIZ': 'Missouri Tigers',
    'MRSH': 'Marshall Thundering Herd', 'NAVY': 'Navy Midshipmen',
    'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack',
    'UNM': 'New Mexico Lobos', 'NMSU': 'New Mexico State Aggies',
    'UNC': 'North Carolina Tar Heels', 'NCST': 'North Carolina State Wolfpack',
    'UNT': 'North Texas Mean Green', 'NU': 'Northwestern Wildcats',
    'ND': 'Notre Dame Fighting Irish', 'NIU': 'Northern Illinois Huskies',
    'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes',
    'OKLA': 'Oklahoma Sooners', 'OU': 'Oklahoma Sooners',
    'OKST': 'Oklahoma State Cowboys', 'ODU': 'Old Dominion Monarchs',
    'ORE': 'Oregon Ducks', 'ORST': 'Oregon State Beavers',
    'PSU': 'Penn State Nittany Lions', 'PITT': 'Pittsburgh Panthers',
    'PUR': 'Purdue Boilermakers', 'RICE': 'Rice Owls', 'RUT': 'Rutgers Scarlet Knights',
    'SDSU': 'San Diego State Aztecs', 'SJSU': 'San Jose State Spartans',
    'SAM': 'Sam Houston State Bearkats', 'USF': 'South Florida Bulls',
    'SMU': 'SMU Mustangs', 'USC': 'USC Trojans', 'SCAR': 'South Carolina Gamecocks',
    'STAN': 'Stanford Cardinal', 'SYR': 'Syracuse Orange', 'TCU': 'TCU Horned Frogs',
    'TEM': 'Temple Owls', 'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns',
    'TXAM': 'Texas A&M Aggies', 'TXST': 'Texas State Bobcats', 'TTU': 'Texas Tech Red Raiders',
    'TOL': 'Toledo Rockets', 'TROY': 'Troy Trojans', 'TUL': 'Tulane Green Wave',
    'TLSA': 'Tulsa Golden Hurricane', 'UAB': 'UAB Blazers', 'UCF': 'UCF Knights',
    'UCLA': 'UCLA Bruins', 'UNLV': 'UNLV Rebels', 'UTEP': 'UTEP Miners',
    'USA': 'South Alabama Jaguars', 'USM': 'Southern Mississippi Golden Eagles',
    'USU': 'Utah State Aggies', 'UTAH': 'Utah Utes', 'UTSA': 'UTSA Roadrunners',
    'VAN': 'Vanderbilt Commodores', 'UVA': 'Virginia Cavaliers',
    'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons',
    'WASH': 'Washington Huskies', 'WSU': 'Washington State Cougars',
    'WVU': 'West Virginia Mountaineers', 'WMU': 'Western Michigan Broncos',
    'WKU': 'Western Kentucky Hilltoppers', 'WIS': 'Wisconsin Badgers', 'WYO': 'Wyoming Cowboys',
    'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
    'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
  }
  return mascotMap[abbr] || null
}

// Robust logo lookup
// getTeamLogoRobust now lives in src/utils/teamLogo.js. Single
// source of truth shared with Game.jsx; the previous local copy
// here was a partial re-implementation missing the uppercase-abbr
// and teamAbbreviations fallbacks.

// Helper to get ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
const getOrdinalSuffix = (num) => {
  if (!num || isNaN(num)) return ''
  const n = parseInt(num)
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

// Compact labeled-stat field used in the Team Details card. Tiny
// uppercase label sits above the input so a row of 4–6 of these reads
// as a tidy stat strip rather than a cramped grid.
function StatField({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-txt-tertiary text-center">{label}</label>
      {children}
    </div>
  )
}

// Inline quarter input — module-scoped so its component identity is
// stable across renders. If we redefined this inside the GameEdit
// render body, every keystroke would create a new component reference,
// React would unmount/remount the input, and focus would drop after
// each character. (Lesson learned the painful way.)
function QuarterInput({ value, onChange, onBlur }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={onChange}
      onBlur={onBlur}
      className="w-12 text-center tabular-nums text-sm rounded-sm py-1 bg-transparent text-txt-secondary focus:outline-none focus:ring-1 focus:ring-white/40"
      style={{ border: '1px solid var(--surface-5)' }}
      min="0"
      placeholder="0"
    />
  )
}

// Maps a game record to a display week slot string used in the week picker.
function deriveDisplayWeek(game, fallbackWeek, fallbackGameType, fallbackBowlName) {
  if (!game) {
    if (fallbackGameType === 'cfp_championship') return 'NatChamp'
    if (fallbackGameType === 'cfp_semifinal') return 'BW3'
    if (fallbackGameType === 'cfp_quarterfinal') return 'BW2'
    if (fallbackGameType === 'bowl' || fallbackGameType === 'cfp_first_round') return 'BW1'
    if (fallbackGameType === 'conference_championship' || fallbackWeek === 'CCG') return 'CCG'
    return fallbackWeek || ''
  }
  if (game.isCFPChampionship) return 'NatChamp'
  if (game.isCFPSemifinal) return 'BW3'
  if (game.isCFPQuarterfinal) return 'BW2'
  if (game.isBowlGame && game.bowlWeek === 'week2') return 'BW2'
  if (game.isCFPFirstRound || game.isBowlGame) return 'BW1'
  if (game.isConferenceChampionship || game.week === 'CCG') return 'CCG'
  const w = game.week
  return (w !== null && w !== undefined && w !== '') ? String(w) : (fallbackWeek || '')
}

export default function GameEdit() {
  const { id, gameId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentDynasty, updateDynasty, updateGame, addGame, deleteGame, isViewOnly } = useDynasty()
  const { confirm } = useConfirm()
  const { toast } = useToast()
  const pathPrefix = usePathPrefix()
  const { user } = useAuth()

  // Check if this is a new game from URL
  const isNewGameFromUrl = !gameId || gameId === 'new'

  // Track the actual game ID (may be generated for new games)
  const [currentGameId, setCurrentGameId] = useState(isNewGameFromUrl ? null : gameId)
  const [gameCreated, setGameCreated] = useState(!isNewGameFromUrl)

  // CRITICAL: Use ref to prevent race condition in game creation
  // State updates are async and can cause duplicate game creation if effect runs twice quickly
  const gameCreationInProgressRef = useRef(false)

  // isNewGame means we haven't created a game record yet
  const isNewGame = !gameCreated

  // Get query params for new game
  const queryWeek = searchParams.get('week')
  const queryYear = searchParams.get('year')
  const queryTeam1Tid = searchParams.get('team1Tid')
  const queryTeam2Tid = searchParams.get('team2Tid')
  const queryGameType = searchParams.get('gameType')
  const queryBowlName = searchParams.get('bowlName')
  const queryLocation = searchParams.get('location')
  const queryConference = searchParams.get('conference')

  // Toast state
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  // Tracks whether a save is in-flight — disables the Save button to
  // prevent double-submits and gives visual feedback on slow networks.
  const [isSaving, setIsSaving] = useState(false)

  // Box score sheet modal state
  const [showBoxScoreModal, setShowBoxScoreModal] = useState(false)
  // Modal toggles for bulky panels that we've pulled off the page proper
  // (Photos in particular). Keep state at this level so the modal body
  // can read/write the same form fields as the rest of the editor.
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  // Recap-edit modal — the big textarea was eating most of the Story
  // section's screen real estate. Now it lives in a modal opened via
  // the expand button alongside Copy / Paste / Settings.
  const [showRecapEditModal, setShowRecapEditModal] = useState(false)
  // Toast/feedback for the inline "Paste" button so the user knows
  // the clipboard read succeeded (or didn't — e.g. browser blocked it).
  const [recapPasteFeedback, setRecapPasteFeedback] = useState(null)
  const [boxScoreModalType, setBoxScoreModalType] = useState(null) // 'playerStats' | 'scoring' | 'teamStats'
  // For 'playerStats' only — the tid of the team this sheet covers.
  // Routes the modal, the saved data, and the saved sheet ID by tid, so
  // there's no home/away ambiguity to resolve on read.
  const [boxScoreModalTargetTid, setBoxScoreModalTargetTid] = useState(null)

  // Recap state — copy-prompt only, no live AI calls.
  const [recapError, setRecapError] = useState(null)
  const [promptCopied, setPromptCopied] = useState(false)
  // Recap perspective slider — see GameEntryModal.jsx for design notes.
  // Same localStorage key so the two entry points stay in sync.
  const [recapPerspective, setRecapPerspective] = useState(() => {
    try { return localStorage.getItem('gameRecapPerspective') || 'neutral' } catch { return 'neutral' }
  })
  const [recapDepth, setRecapDepth] = useState(() => {
    try { return localStorage.getItem('gameRecapDepth') || 'standard' } catch { return 'standard' }
  })
  const [showRecapSettings, setShowRecapSettings] = useState(false)
  useEffect(() => {
    try { localStorage.setItem('gameRecapPerspective', recapPerspective) } catch { /* ignored */ }
  }, [recapPerspective])
  useEffect(() => {
    try { localStorage.setItem('gameRecapDepth', recapDepth) } catch { /* ignored */ }
  }, [recapDepth])

  // Form state
  const [formData, setFormData] = useState({
    team1Score: '',
    team2Score: '',
    quarters: {
      team1: { Q1: '', Q2: '', Q3: '', Q4: '' },
      team2: { Q1: '', Q2: '', Q3: '', Q4: '' }
    },
    overtimes: [],
    team1Rank: '',
    team2Rank: '',
    team1Overall: '',
    team1Offense: '',
    team1Defense: '',
    team2Overall: '',
    team2Offense: '',
    team2Defense: '',
    team1Record: '',
    team2Record: '',
    team1ConfRecord: '',
    team2ConfRecord: '',
    location: queryLocation || 'home', // home, away, neutral
    aiRecap: '',
    isConferenceGame: false,
    links: [''], // Array of media links (YouTube, images, etc.) - always has at least one empty entry for input
    // Player of the Week fields (store player names)
    conferencePOW: '',      // Conference Offensive Player of the Week
    confDefensePOW: '',     // Conference Defensive Player of the Week
    nationalPOW: '',        // National Offensive Player of the Week
    natlDefensePOW: '',     // National Defensive Player of the Week
    photos: [],             // Array of ImgBB-hosted photo URLs for this game
    scoreGraphic: '',       // URL of AI-generated final score graphic
  })

  // Score graphic team selector — null means "auto" (follow user's team).
  // Stored as 'team1' | 'team2' | null. Resolved at render time.
  const [graphicFeaturedSide, setGraphicFeaturedSide] = useState(null)
  // Brief "Copied!" flash on the score graphic prompt copy button.
  const [graphicPromptCopied, setGraphicPromptCopied] = useState(false)

  // Tracks in-flight ImgBB uploads from the Photos section so the UI
  // can show a "Uploading X photo(s)…" indicator and disable the file
  // picker while a batch is in progress.
  const [photoUploadCount, setPhotoUploadCount] = useState(0)
  // Per-photo progress so the user sees "X of 21" + a progress bar
  // instead of just "Uploading 21 photos…" for the duration of the
  // batch. Bumps as each upload settles (success or failure).
  const [photoUploadDone, setPhotoUploadDone] = useState(0)
  const [photoUploadFailed, setPhotoUploadFailed] = useState(0)
  const photoUploadAbortRef = useRef(null)

  // When ON, opponent Record and Conf inputs are read-only and show the
  // live "after this game finished" computation from `liveRecordFor`.
  // When OFF, they become editable and the user's manual entry is saved.
  // Default ON so the on-screen note ("Record and Conf are the opponent's
  // record after this game finished") is actually true out of the box.
  const [autoFillRecords, setAutoFillRecords] = useState(true)

  // Find existing game or set up new game data
  const existingGame = useMemo(() => {
    if (!currentDynasty?.games) return null

    // Direct ID lookup - try currentGameId first (for newly created games), then gameId from URL
    const lookupId = currentGameId || gameId
    if (!lookupId || lookupId === 'new') return null

    let found = currentDynasty.games.find(g => g.id === lookupId)
    if (found) {
      return found
    }

    // CFP Slot ID pattern lookup
    const cfpParsed = parseCFPGameId(gameId)
    if (cfpParsed) {
      const { slotId, year } = cfpParsed

      // Get user's bowl config for this year
      const bowlConfig = currentDynasty.cfpBowlConfigByYear?.[year] || {}
      const cfpSeeds = currentDynasty.cfpSeedsByYear?.[year] || []

      // Map slot to bye seed for reliable lookup
      const slotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }
      const frSeedMatchups = { cfpfr1: [5, 12], cfpfr2: [8, 9], cfpfr3: [6, 11], cfpfr4: [7, 10] }

      if (slotId.startsWith('cfpfr')) {
        const [seed1, seed2] = frSeedMatchups[slotId] || []
        found = currentDynasty.games.find(g =>
          g.isCFPFirstRound && Number(g.year) === year &&
          ((g.seed1 === seed1 && g.seed2 === seed2) || (g.seed1 === seed2 && g.seed2 === seed1))
        )
      } else if (slotId.startsWith('cfpqf')) {
        // Find QF game by bye seed (most reliable method)
        const byeSeed = slotToByeSeed[slotId]
        const byeSeedEntry = cfpSeeds.find(s => s.seed === byeSeed)
        if (byeSeedEntry) {
          found = currentDynasty.games.find(g => {
            if (!g.isCFPQuarterfinal || Number(g.year) !== year) return false
            // Check if bye seed team is in this game
            if (byeSeedEntry.tid && (g.team1Tid === byeSeedEntry.tid || g.team2Tid === byeSeedEntry.tid)) return true
            if (byeSeedEntry.team && (g.team1 === byeSeedEntry.team || g.team2 === byeSeedEntry.team)) return true
            return false
          })
        }

        // Fallback to cfpSlot match
        if (!found) {
          found = currentDynasty.games.find(g =>
            g.isCFPQuarterfinal && Number(g.year) === year && g.cfpSlot === slotId
          )
        }
      } else if (slotId.startsWith('cfpsf')) {
        // Find SF game by cfpSlot first, then bowlName from config
        found = currentDynasty.games.find(g =>
          g.isCFPSemifinal && Number(g.year) === year && g.cfpSlot === slotId
        )
        if (!found) {
          const sfBowl = slotId === 'cfpsf1' ? (bowlConfig.sf1 || 'Peach Bowl') : (bowlConfig.sf2 || 'Fiesta Bowl')
          found = currentDynasty.games.find(g =>
            g.isCFPSemifinal && Number(g.year) === year && g.bowlName === sfBowl
          )
        }
      } else if (slotId === 'cfpnc') {
        found = currentDynasty.games.find(g => g.isCFPChampionship && Number(g.year) === year)
      }

    }
    return found || null
  }, [currentDynasty?.games, gameId, currentGameId, currentDynasty?.cfpBowlConfigByYear, currentDynasty?.cfpSeedsByYear])

  // Derive team data - merge dynasty.teams WITH TEAMS to preserve static team properties
  // dynasty.teams may have partial data (byYear, userId) that would overwrite complete team info
  const teamsSource = useMemo(() => {
    const merged = { ...TEAMS }
    if (currentDynasty?.teams) {
      Object.entries(currentDynasty.teams).forEach(([key, dynastyTeamData]) => {
        const staticTeam = TEAMS[key]
        if (staticTeam) {
          // Merge: keep static properties, add dynasty-specific data
          merged[key] = { ...staticTeam, ...dynastyTeamData }
          // Ensure critical properties come from static TEAMS if missing
          if (!dynastyTeamData.tid) merged[key].tid = staticTeam.tid
          if (!dynastyTeamData.abbr) merged[key].abbr = staticTeam.abbr
          if (!dynastyTeamData.name) merged[key].name = staticTeam.name
          if (!dynastyTeamData.primaryColor) merged[key].primaryColor = staticTeam.primaryColor
          if (!dynastyTeamData.secondaryColor) merged[key].secondaryColor = staticTeam.secondaryColor
        } else {
          // Teambuilder team - use as-is
          merged[key] = dynastyTeamData
        }
      })
    }
    return merged
  }, [currentDynasty?.teams])

  // Handle multiple game formats: unified (team1Tid/team2Tid), user game (userTid/opponentTid), legacy (userTeam/opponent)
  const resolveTeam1Tid = () => {
    if (existingGame?.team1Tid) return existingGame.team1Tid
    if (existingGame?.userTid) return existingGame.userTid
    if (existingGame?.userTeam) return getTidFromAbbr(existingGame.userTeam, currentDynasty)
    if (queryTeam1Tid) return parseInt(queryTeam1Tid)
    return null
  }
  const resolveTeam2Tid = () => {
    if (existingGame?.team2Tid) return existingGame.team2Tid
    if (existingGame?.opponentTid) return existingGame.opponentTid
    if (existingGame?.opponent) return getTidFromAbbr(existingGame.opponent, currentDynasty)
    if (queryTeam2Tid) return parseInt(queryTeam2Tid)
    return null
  }

  const team1Tid = resolveTeam1Tid()
  const team2Tid = resolveTeam2Tid()

  const team1Data = team1Tid ? teamsSource[team1Tid] : null
  const team2Data = team2Tid ? teamsSource[team2Tid] : null

  const team1Abbr = team1Data?.abbr || existingGame?.team1 || existingGame?.userTeam || ''
  const team2Abbr = team2Data?.abbr || existingGame?.team2 || existingGame?.opponent || ''

  const team1Name = team1Data?.name || getMascotName(team1Abbr, teamsSource) || team1Abbr
  const team2Name = team2Data?.name || getMascotName(team2Abbr, teamsSource) || team2Abbr

  const team1Logo = getTeamLogoRobust(team1Name, teamsSource) || getTeamLogoRobust(team1Abbr, teamsSource)
  const team2Logo = getTeamLogoRobust(team2Name, teamsSource) || getTeamLogoRobust(team2Abbr, teamsSource)

  // Game metadata
  const gameYear = existingGame?.year || (queryYear ? parseInt(queryYear) : currentDynasty?.currentYear)
  const gameWeek = existingGame?.week || queryWeek || ''
  // gameType is editable — the user picks "Regular Season" or
  // "Conference Championship" via the classification dropdown in the
  // form. Bowl/CFP types stay in the dropdown for display but the picker
  // disables itself so users can't accidentally convert away from those
  // (each has matchup/seed/bowl-name state that this form doesn't carry).
  // Initialized from existingGame / query param so editing a game keeps
  // its current classification, then hydrated again when existingGame
  // resolves on async dynasty loads.
  const [gameType, setGameType] = useState(() =>
    (existingGame?.gameType) ||
    (existingGame?.isConferenceChampionship ? 'conference_championship' : null) ||
    (existingGame?.isBowlGame ? 'bowl' : null) ||
    (existingGame?.isCFPFirstRound ? 'cfp_first_round' : null) ||
    (existingGame?.isCFPQuarterfinal ? 'cfp_quarterfinal' : null) ||
    (existingGame?.isCFPSemifinal ? 'cfp_semifinal' : null) ||
    (existingGame?.isCFPChampionship ? 'cfp_championship' : null) ||
    queryGameType ||
    'regular'
  )
  // Conference picker — only used when gameType is conference_championship.
  // Pre-fills from the game's stored conference, falling back to the query
  // param and the dynasty's own conference so the dropdown opens on a
  // sensible default.
  const [selectedConference, setSelectedConference] = useState(() =>
    // existingGame?.conference is authoritative for already-saved CCGs.
    // queryConference comes from the schedule/CFP bracket link.
    // Never fall back to currentDynasty?.conference — it's a stale
    // root-level field that reflects the dynasty's original conference
    // only, not the current per-season alignment.
    existingGame?.conference || queryConference || ''
  )
  const bowlName = existingGame?.bowlName || queryBowlName || ''

  // Editable year/week/bowl fields — the source of truth for saves
  const [editYear, setEditYear] = useState(() =>
    existingGame?.year || (queryYear ? parseInt(queryYear) : currentDynasty?.currentYear)
  )
  const [editWeek, setEditWeek] = useState(() =>
    deriveDisplayWeek(existingGame, queryWeek, queryGameType, queryBowlName)
  )
  const [editBowlName, setEditBowlName] = useState(existingGame?.bowlName || queryBowlName || '')

  // Derived classification flags from the current editWeek + editBowlName selection
  const computedWeekFlags = (() => {
    const bn = (editBowlName || '').trim()
    if (editWeek === 'NatChamp') return {
      week: 'NatChamp', gameType: 'cfp_championship',
      isConferenceChampionship: false, isBowlGame: false,
      isCFPFirstRound: false, isCFPQuarterfinal: false, isCFPSemifinal: false, isCFPChampionship: true,
      bowlName: null, bowlWeek: null, conference: null,
    }
    if (editWeek === 'BW3') return {
      week: 'Bowl', gameType: 'cfp_semifinal',
      isConferenceChampionship: false, isBowlGame: false,
      isCFPFirstRound: false, isCFPQuarterfinal: false, isCFPSemifinal: true, isCFPChampionship: false,
      bowlName: bn || null, bowlWeek: null, conference: null,
    }
    if (editWeek === 'BW2') {
      const isCFPQF = bn.includes('(CFP QF)')
      return {
        week: 'Bowl', gameType: isCFPQF ? 'cfp_quarterfinal' : 'bowl',
        isConferenceChampionship: false, isBowlGame: !isCFPQF,
        isCFPFirstRound: false, isCFPQuarterfinal: isCFPQF, isCFPSemifinal: false, isCFPChampionship: false,
        bowlName: bn || null, bowlWeek: 'week2', conference: null,
      }
    }
    if (editWeek === 'BW1') {
      const isCFPFR = bn.startsWith('CFP First Round')
      return {
        week: 'Bowl', gameType: isCFPFR ? 'cfp_first_round' : 'bowl',
        isConferenceChampionship: false, isBowlGame: !isCFPFR,
        isCFPFirstRound: isCFPFR, isCFPQuarterfinal: false, isCFPSemifinal: false, isCFPChampionship: false,
        bowlName: bn || null, bowlWeek: 'week1', conference: null,
      }
    }
    if (editWeek === 'CCG') return {
      week: 'CCG', gameType: 'conference_championship',
      isConferenceChampionship: true, isBowlGame: false,
      isCFPFirstRound: false, isCFPQuarterfinal: false, isCFPSemifinal: false, isCFPChampionship: false,
      bowlName: null, bowlWeek: null, conference: selectedConference || null,
    }
    const wNum = parseInt(editWeek)
    return {
      week: Number.isFinite(wNum) ? wNum : (editWeek || null),
      gameType: 'regular',
      isConferenceChampionship: false, isBowlGame: false,
      isCFPFirstRound: false, isCFPQuarterfinal: false, isCFPSemifinal: false, isCFPChampionship: false,
      bowlName: null, bowlWeek: null, conference: null,
    }
  })()

  // Determine game title
  const getGameTitle = () => {
    if (existingGame?.isCFPChampionship) return 'National Championship'
    if (existingGame?.isCFPSemifinal) return existingGame?.bowlName || 'CFP Semifinal'
    if (existingGame?.isCFPQuarterfinal) return existingGame?.bowlName || 'CFP Quarterfinal'
    if (existingGame?.isCFPFirstRound) return 'CFP First Round'
    if (existingGame?.isConferenceChampionship) return `${existingGame?.conference || ''} Championship`
    if (existingGame?.isBowlGame || bowlName) return bowlName || 'Bowl Game'
    return `Week ${gameWeek}`
  }

  const gameTitle = getGameTitle()
  const gameSubtitle = `${gameYear} ${existingGame?.isConferenceChampionship || existingGame?.isBowlGame || existingGame?.isCFPFirstRound || existingGame?.isCFPQuarterfinal || existingGame?.isCFPSemifinal || existingGame?.isCFPChampionship ? 'Postseason' : 'Regular Season'}`

  // Detect if either team is the user's team FOR THIS GAME'S YEAR
  // Uses coachTeamByYear to handle job changes - check what team user coached in the game's year
  const getUserTidForYear = (year) => {
    if (!year) return currentDynasty?.currentTid
    const yearNum = Number(year)
    const yearStr = String(year)
    // Check coachTeamByYear first (handles historical games correctly)
    const coachEntry = currentDynasty?.coachTeamByYear?.[yearNum] || currentDynasty?.coachTeamByYear?.[yearStr]
    if (coachEntry?.tid) return coachEntry.tid
    // Fallback to current tid for current year games
    if (yearNum === Number(currentDynasty?.currentYear)) return currentDynasty?.currentTid
    return null
  }
  const userTidForGame = getUserTidForYear(gameYear)
  const isTeam1UserTeam = team1Tid === userTidForGame
  const isTeam2UserTeam = team2Tid === userTidForGame

  // Auto-detect conference game
  const customConferences = getCurrentCustomConferences(currentDynasty)
  const team1Conference = getTeamConference(team1Abbr, customConferences)
  const team2Conference = getTeamConference(team2Abbr, customConferences)
  const isConferenceGame = team1Conference && team2Conference &&
    team1Conference === team2Conference && team1Conference !== 'Independent'

  // Get players from both teams' rosters for POW dropdown
  const availablePlayers = useMemo(() => {
    const allPlayers = currentDynasty?.players || []
    const yearToCheck = gameYear || currentDynasty?.currentYear
    if (!yearToCheck) return []

    // Get players from both teams' rosters
    const playersFromBothTeams = allPlayers.filter(player => {
      if (team1Tid && isPlayerOnRoster(player, team1Tid, yearToCheck)) return true
      if (team2Tid && isPlayerOnRoster(player, team2Tid, yearToCheck)) return true
      return false
    })

    // Sort by team (team1 first, then team2), then alphabetically by name
    return playersFromBothTeams.sort((a, b) => {
      const aTeam1 = team1Tid && isPlayerOnRoster(a, team1Tid, yearToCheck)
      const bTeam1 = team1Tid && isPlayerOnRoster(b, team1Tid, yearToCheck)
      if (aTeam1 && !bTeam1) return -1
      if (!aTeam1 && bTeam1) return 1
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [currentDynasty?.players, team1Tid, team2Tid, gameYear, currentDynasty?.currentYear])

  // Display order: Away team on left/top, Home team on right/bottom
  // For CFP games: Lower seed (better, e.g. #1) on left/top, Higher seed (worse, e.g. #12) on right/bottom
  // location 'home' = team1 is home, 'away' = team2 is home, 'neutral' = keep order
  const isTeam1Home = formData.location === 'home'
  const isTeam2Home = formData.location === 'away'

  // Check if this is a CFP game and get seeds
  const isCFPGame = computedWeekFlags.isCFPFirstRound || computedWeekFlags.isCFPQuarterfinal ||
                    computedWeekFlags.isCFPSemifinal || computedWeekFlags.isCFPChampionship ||
                    existingGame?.isCFPFirstRound || existingGame?.isCFPQuarterfinal ||
                    existingGame?.isCFPSemifinal || existingGame?.isCFPChampionship

  // Get CFP seeds for each team by tid
  const getCFPSeedForTid = (tid) => {
    if (!tid || !currentDynasty?.cfpSeedsByYear) return null
    const cfpSeeds = currentDynasty.cfpSeedsByYear[gameYear] || currentDynasty.cfpSeedsByYear[String(gameYear)]
    if (!cfpSeeds) return null
    const seedEntry = cfpSeeds.find(s => s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get seeds from game data or calculate from cfpSeedsByYear
  const team1Seed = existingGame?.seed1 || existingGame?.cfpSeed1 || getCFPSeedForTid(team1Tid)
  const team2Seed = existingGame?.seed2 || existingGame?.cfpSeed2 || getCFPSeedForTid(team2Tid)

  // For CFP games: better seed (lower number like #1) goes on right/bottom
  // Lower seed number = better team (e.g., #1 is better than #12)
  const shouldSwapForCFP = isCFPGame && team1Seed && team2Seed && team1Seed < team2Seed

  // Display variables - swap order based on home/away OR CFP seeding
  let displayLeftTeam, displayRightTeam
  if (isCFPGame && team1Seed && team2Seed) {
    // CFP games: higher seed number (worse team) on left, lower seed number (better team) on right
    displayLeftTeam = team1Seed > team2Seed ? 'team1' : 'team2'
    displayRightTeam = team1Seed > team2Seed ? 'team2' : 'team1'
  } else {
    // Regular games: away on left, home on right
    displayLeftTeam = isTeam1Home ? 'team2' : 'team1'
    displayRightTeam = isTeam1Home ? 'team1' : 'team2'
  }

  const leftTeamTid = displayLeftTeam === 'team1' ? team1Tid : team2Tid
  const rightTeamTid = displayRightTeam === 'team1' ? team1Tid : team2Tid
  const leftTeamName = displayLeftTeam === 'team1' ? team1Name : team2Name
  const rightTeamName = displayRightTeam === 'team1' ? team1Name : team2Name
  const leftTeamAbbr = displayLeftTeam === 'team1' ? team1Abbr : team2Abbr
  const rightTeamAbbr = displayRightTeam === 'team1' ? team1Abbr : team2Abbr
  const leftTeamLogo = displayLeftTeam === 'team1' ? team1Logo : team2Logo
  const rightTeamLogo = displayRightTeam === 'team1' ? team1Logo : team2Logo

  // For Team Details section: determine which team to show first (left/top) and second (right/bottom)
  const isLeftTeam1 = displayLeftTeam === 'team1'
  const isLeftUserTeam = leftTeamTid === userTidForGame
  const isRightUserTeam = rightTeamTid === userTidForGame

  // Resolve the home-team tid from the current location setting. Box-
  // score sheets are now tid-keyed, so this only feeds the read-time
  // home/away derivation for legacy fallback in the helpers.
  const gameHomeTeamTid = formData.location === 'home' ? team1Tid :
                          formData.location === 'away' ? team2Tid : null

  // Pre-game record for this team — calculated from saved games only,
  // current game excluded. No fallback to the stored full-season helper
  // because that overrides the as-of-game truth with the team's end-
  // of-season totals (which made every Wk 1 game display "5-6" etc.).
  // For CPU teams calc is sparse, but the user has the manual override
  // toggle below to fix that case by hand.
  const calculateTeamRecord = (tid, year) => {
    if (!currentDynasty?.games || !tid) return ''
    const calc = calculateTeamRecordFromGames(currentDynasty, tid, year, {
      upToGameId: existingGame?.id
    })
    const calcGames = (calc.wins || 0) + (calc.losses || 0)
    if (calcGames === 0) return ''
    return `${calc.wins}-${calc.losses}`
  }

  // Live POST-game record helper. Computes overall and conference records
  // for `tid` AS OF the end of this game, using:
  //   1) saved games minus the current one as the pregame baseline,
  //   2) when no saved games are found, the standings/byYear data the
  //      user has uploaded (e.g. via Weekly Scores) — minus the current
  //      game if it's already counted in those snapshots,
  //   3) plus the in-progress current game's score from formData.
  // This is what the "after this game finished" label promises.
  const liveRecordFor = (tid) => {
    if (!tid || !currentDynasty) return { record: '', confRecord: '' }

    // Pre-game baseline from saved games only (current game excluded).
    // No stored-helper fallback — using the team's full-season totals
    // here was the bug that caused saved games to capture the wrong
    // record (e.g. Wk 1 saved as "5-6" because that's the team's
    // eventual season-end record). For CPU teams the baseline is
    // sparse; the user has the manual override toggle below.
    let baseline = calculateTeamRecordFromGames(currentDynasty, tid, gameYear, {
      upToGameId: existingGame?.id,
    })
    let { wins = 0, losses = 0, confWins = 0, confLosses = 0 } = baseline

    // For CPU teams whose regular-season games aren't in dynasty.games,
    // fall back to standings / stored records as the pre-game baseline.
    if (wins + losses === 0) {
      const stored = getStoredTeamRecord(currentDynasty, tid, gameYear)
      if (stored && (stored.wins > 0 || stored.losses > 0)) {
        wins = stored.wins; losses = stored.losses
        confWins = stored.confWins; confLosses = stored.confLosses
      }
    }

    // Apply the in-progress current game from formData.
    const t1Score = parseInt(formData.team1Score, 10)
    const t2Score = parseInt(formData.team2Score, 10)
    const confNow = !!(formData.isConferenceGame || isConferenceGame)
    if (Number.isFinite(t1Score) && Number.isFinite(t2Score) && t1Score !== t2Score) {
      const isT1 = Number(tid) === Number(team1Tid)
      const teamScore = isT1 ? t1Score : t2Score
      const oppScore  = isT1 ? t2Score : t1Score
      if (teamScore > oppScore)      { wins++;   if (confNow) confWins++ }
      else if (teamScore < oppScore) { losses++; if (confNow) confLosses++ }
    }

    return {
      record:     (wins > 0 || losses > 0)         ? `${wins}-${losses}`         : '',
      confRecord: (confWins > 0 || confLosses > 0) ? `${confWins}-${confLosses}` : '',
    }
  }

  // Memoized JSX-render-time live records for both teams. liveRecordFor
  // iterates dynasty.games and conferenceStandingsByYear; calling it
  // inline in the team-row JSX ran 2× per render AND combined with the
  // cascading re-renders from openBoxScoreModal's awaited updateGame
  // (Firestore listener fires N times → setCurrentDynasty → re-render),
  // it compounded into a 5+ second main-thread freeze and Chrome's
  // "Page Unresponsive" dialog at modal-mount on 4-7MB dynasties.
  // Memoizing collapses all that to a single cached pair that only
  // refreshes when its underlying inputs actually move.
  const live1 = useMemo(
    () => (autoFillRecords && team1Tid) ? liveRecordFor(team1Tid) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      autoFillRecords, team1Tid, team2Tid, gameYear,
      currentDynasty?.games, currentDynasty?.teams,
      currentDynasty?.conferenceStandingsByYear,
      currentDynasty?.teamRecordsByTeamYear,
      existingGame?.id, existingGame?.team1Tid,
      existingGame?.team1Score, existingGame?.team2Score,
      existingGame?.isConferenceGame,
      formData.team1Score, formData.team2Score,
      formData.isConferenceGame, isConferenceGame,
    ]
  )
  const live2 = useMemo(
    () => (autoFillRecords && team2Tid) ? liveRecordFor(team2Tid) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      autoFillRecords, team1Tid, team2Tid, gameYear,
      currentDynasty?.games, currentDynasty?.teams,
      currentDynasty?.conferenceStandingsByYear,
      currentDynasty?.teamRecordsByTeamYear,
      existingGame?.id, existingGame?.team1Tid,
      existingGame?.team1Score, existingGame?.team2Score,
      existingGame?.isConferenceGame,
      formData.team1Score, formData.team2Score,
      formData.isConferenceGame, isConferenceGame,
    ]
  )

  // Get team ratings from dynasty data - checks multiple possible storage locations
  const getTeamRatings = (tid, year) => {
    if (!tid) return { overall: '', offense: '', defense: '' }
    const abbr = teamsSource[tid]?.abbr
    const yearNum = Number(year)
    const currentUserTid = currentDynasty?.currentTid
    const currentYear = Number(currentDynasty?.currentYear)

    let ratings = null

    // PRIORITY 1: For current user team and current year, use dynasty.teamRatings
    // This ensures we always get the LATEST ratings if user updates them mid-season
    if (tid === currentUserTid && yearNum === currentYear && currentDynasty?.teamRatings) {
      const tr = currentDynasty.teamRatings
      if (tr.overall || tr.offense || tr.defense) {
        ratings = tr
      }
    }

    // PRIORITY 2: New tid-based byYear structure (for past years or other teams)
    if (!ratings) {
      ratings = currentDynasty?.teams?.[tid]?.byYear?.[yearNum]?.teamRatings ||
                currentDynasty?.teams?.[tid]?.byYear?.[String(yearNum)]?.teamRatings
    }

    // PRIORITY 3: teamRatingsByTeamYear[abbr][year] structure (legacy)
    if (!ratings && abbr) {
      ratings = currentDynasty?.teamRatingsByTeamYear?.[abbr]?.[yearNum] ||
                currentDynasty?.teamRatingsByTeamYear?.[abbr]?.[String(yearNum)]
    }

    return {
      overall: ratings?.overall?.toString() || '',
      offense: ratings?.offense?.toString() || '',
      defense: ratings?.defense?.toString() || ''
    }
  }

  // Create game record immediately when opening a new game
  useEffect(() => {
    const createInitialGame = async () => {
      // Guard 1: Basic state checks
      if (!isNewGameFromUrl || gameCreated || !currentDynasty?.id) return
      if (!team1Tid && !team2Tid) return // Wait for team data

      // Guard 2: CRITICAL - Use ref to prevent race condition
      // React state updates are async, so if this effect runs twice quickly,
      // both calls could pass the state check above before setGameCreated takes effect
      if (gameCreationInProgressRef.current) {
        console.log('[GameEdit] Game creation already in progress, skipping duplicate attempt')
        return
      }
      gameCreationInProgressRef.current = true

      // CCG games carry week='CCG' (a string sentinel) — parseInt would
      // produce NaN and stash that into game.week, breaking every
      // numeric sort/filter downstream. Treat any non-numeric query
      // week as the literal string and only parse the numeric case.
      const targetWeek = (() => {
        if (!queryWeek) return null
        const parsed = parseInt(queryWeek, 10)
        return Number.isFinite(parsed) ? parsed : String(queryWeek)
      })()
      const targetYear = queryYear ? parseInt(queryYear) : currentDynasty.currentYear
      const targetGameType = queryGameType || 'regular'

      // Guard 3: Check if a game already exists for this week/year/gameType.
      // Match on the team-PAIR (either order) using Number-coerced tids so
      // a number-vs-string round-trip from Firestore can't slip a duplicate
      // through. The previous version only checked one team, which let
      // 0-0 shell duplicates land next to fully-played games.
      const existingGames = currentDynasty.games || []
      const t1 = team1Tid != null ? Number(team1Tid) : null
      const t2 = team2Tid != null ? Number(team2Tid) : null
      const duplicateGame = existingGames.find(g => {
        if (Number(g.year) !== targetYear) return false
        if ((g.gameType || 'regular') !== targetGameType) return false
        // Week match — tolerant of '' (treated as null) so a missing
        // queryWeek doesn't accidentally match week 0. CCG games use
        // the string 'CCG' for game.week, so compare numeric vs. string
        // explicitly: numeric targets compare numerically against the
        // game's coerced week, string targets compare string-vs-string.
        const gwRaw = g.week === '' || g.week == null ? null : g.week
        if (targetWeek != null) {
          if (gwRaw == null) return false
          if (typeof targetWeek === 'string') {
            if (String(gwRaw).toUpperCase() !== targetWeek.toUpperCase()) return false
          } else {
            const gwNum = Number(gwRaw)
            if (!Number.isFinite(gwNum) || gwNum !== targetWeek) return false
          }
        }
        if (targetWeek == null && gwRaw != null) return false
        // Team-pair match — both teams must be in the game (either order).
        const gT1 = g.team1Tid != null ? Number(g.team1Tid) : null
        const gT2 = g.team2Tid != null ? Number(g.team2Tid) : null
        if (t1 != null && t2 != null) {
          return (gT1 === t1 && gT2 === t2) || (gT1 === t2 && gT2 === t1)
        }
        // Fallback: any team match if we only have one tid
        if (t1 != null) return gT1 === t1 || gT2 === t1 || Number(g.userTid) === t1
        return false
      })

      if (duplicateGame) {
        console.log('[GameEdit] Game already exists for this week/year/gameType, using existing:', duplicateGame.id)
        setCurrentGameId(duplicateGame.id)
        setGameCreated(true)
        gameCreationInProgressRef.current = false
        navigate(`${pathPrefix}/game/${duplicateGame.id}/edit`, { replace: true, state: location.state })
        return
      }

      const newGameId = `game-${Date.now()}`

      // Determine homeTeamTid at creation time based on queryLocation
      // This ensures home/away display is correct from the start
      let initialHomeTeamTid = null
      const isNeutralGameType = targetGameType !== 'regular'
      if (!isNeutralGameType) {
        if (queryLocation === 'home') initialHomeTeamTid = team1Tid
        else if (queryLocation === 'away') initialHomeTeamTid = team2Tid
        // For neutral or unspecified, leave as null
      }

      const initialGameData = {
        id: newGameId,
        week: targetWeek ?? '',
        year: targetYear,
        gameType: targetGameType,
        team1Tid: team1Tid || null,
        team2Tid: team2Tid || null,
        team1Score: 0,
        team2Score: 0,
        homeTeamTid: initialHomeTeamTid,
        location: queryLocation || 'home', // Store location for fallback
        ...(queryBowlName && { bowlName: queryBowlName, isBowlGame: true }),
        ...(queryGameType === 'conference_championship' && { isConferenceChampionship: true, conference: queryConference || null }),
        ...(queryGameType === 'cfp_first_round' && { isCFPFirstRound: true }),
        ...(queryGameType === 'cfp_quarterfinal' && { isCFPQuarterfinal: true }),
        ...(queryGameType === 'cfp_semifinal' && { isCFPSemifinal: true }),
        ...(queryGameType === 'cfp_championship' && { isCFPChampionship: true })
      }

      try {
        // OPTIMIZED: Use addGame for efficient single-doc saves to cloud
        await addGame(currentDynasty.id, initialGameData)
        setCurrentGameId(newGameId)
        setGameCreated(true)
        // Update URL to reflect the new game ID without adding to history
        navigate(`${pathPrefix}/game/${newGameId}/edit`, { replace: true, state: location.state })
      } catch (error) {
        console.error('Error creating initial game:', error)
      } finally {
        gameCreationInProgressRef.current = false
      }
    }

    createInitialGame()
  }, [isNewGameFromUrl, gameCreated, currentDynasty?.id, team1Tid, team2Tid])

  // Initialize form data from existing game or query params
  useEffect(() => {
    if (existingGame) {
      // Use resolved team tids (handles legacy formats)
      const resolvedTeam1Tid = existingGame.team1Tid || existingGame.userTid || (existingGame.userTeam ? getTidFromAbbr(existingGame.userTeam, currentDynasty) : null)
      const resolvedTeam2Tid = existingGame.team2Tid || existingGame.opponentTid || (existingGame.opponent ? getTidFromAbbr(existingGame.opponent, currentDynasty) : null)

      const team1Ratings = getTeamRatings(resolvedTeam1Tid, existingGame.year)
      const team2Ratings = getTeamRatings(resolvedTeam2Tid, existingGame.year)
      const team1Rec = calculateTeamRecord(resolvedTeam1Tid, existingGame.year)
      const team2Rec = calculateTeamRecord(resolvedTeam2Tid, existingGame.year)

      // Resolve scores - handle both unified (team1Score/team2Score) and legacy (teamScore/opponentScore) formats
      const score1 = existingGame.team1Score ?? existingGame.teamScore
      const score2 = existingGame.team2Score ?? existingGame.opponentScore

      // Resolve location - PRIORITY ORDER:
      // 1. homeTeamTid (most reliable, computed field) - handles both user and CPU games
      // 2. existingGame.location (direct storage)
      // 3. Schedule entry location (for games created from schedule)
      // 4. Default to 'home' for user games, 'neutral' for CPU games
      let locationValue = 'home' // Default: team1 is home

      if (existingGame.homeTeamTid !== undefined) {
        // homeTeamTid is explicitly set (could be a tid number or null for neutral site)
        if (existingGame.homeTeamTid === null) {
          // Neutral site game (bowls, CFP, conference championships)
          locationValue = 'neutral'
        } else if (existingGame.homeTeamTid === resolvedTeam1Tid) {
          locationValue = 'home' // team1 is home
        } else if (existingGame.homeTeamTid === resolvedTeam2Tid) {
          locationValue = 'away' // team2 is home
        } else {
          locationValue = 'neutral' // homeTeamTid doesn't match either team
        }
      } else if (existingGame.location) {
        locationValue = existingGame.location
      } else {
        // Check schedule entry for location (fallback for older games)
        const scheduleEntries = currentDynasty?.schedule || []
        const scheduleEntry = scheduleEntries.find(s =>
          s.gameId === existingGame.id ||
          (Number(s.week) === Number(existingGame.week) && s.opponentTid === existingGame.team2Tid)
        )
        if (scheduleEntry?.location) {
          locationValue = scheduleEntry.location
        }
      }

      // For CFP games, auto-fill ranks with seeds if not already set
      const isCFP = existingGame.isCFPFirstRound || existingGame.isCFPQuarterfinal ||
                    existingGame.isCFPSemifinal || existingGame.isCFPChampionship
      const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[gameYear] || currentDynasty?.cfpSeedsByYear?.[String(gameYear)] || []

      // Look up CFP seed by tid only
      const getCFPSeedForTidInit = (tid) => {
        if (!tid || !cfpSeeds.length) return null
        const entry = cfpSeeds.find(s => s.tid === tid)
        return entry?.seed || null
      }

      // Rank fill priority:
      //   1. The rank stored on the game record itself (team1Rank /
      //      legacy userRank).
      //   2. For CFP games: the team's CFP seed.
      //   3. The entering-week rank stored at
      //      dynasty.teams[tid].byYear[year].rankByWeek[gameWeek] —
      //      written by saveWeeklyScores when the user enters that
      //      week's poll. This is what the user means by "auto-fill
      //      from the Week N weekly scores entry": if they punched
      //      in the Top 25 for the week this game belongs to, the
      //      rank shows up here automatically the next time they
      //      open the game.
      let rank1 = existingGame.team1Rank?.toString() || existingGame.userRank?.toString() || ''
      let rank2 = existingGame.team2Rank?.toString() || existingGame.opponentRank?.toString() || ''

      if (isCFP && !rank1) {
        const seed = getCFPSeedForTidInit(existingGame.team1Tid)
        if (seed) rank1 = seed.toString()
      }
      if (isCFP && !rank2) {
        const seed = getCFPSeedForTidInit(existingGame.team2Tid)
        if (seed) rank2 = seed.toString()
      }

      const weekForRank = existingGame.week
      if (!rank1 && existingGame.team1Tid != null && weekForRank != null) {
        const r = getTeamRankForWeek(currentDynasty, existingGame.team1Tid, gameYear, weekForRank)
        if (r) rank1 = String(r)
      }
      if (!rank2 && existingGame.team2Tid != null && weekForRank != null) {
        const r = getTeamRankForWeek(currentDynasty, existingGame.team2Tid, gameYear, weekForRank)
        if (r) rank2 = String(r)
      }

      setFormData({
        team1Score: score1?.toString() || '',
        team2Score: score2?.toString() || '',
        quarters: existingGame.quarters || {
          team1: { Q1: '', Q2: '', Q3: '', Q4: '' },
          team2: { Q1: '', Q2: '', Q3: '', Q4: '' }
        },
        overtimes: existingGame.overtimes || [],
        team1Rank: rank1,
        team2Rank: rank2,
        team1Overall: existingGame.team1Overall?.toString() || team1Ratings.overall,
        team1Offense: existingGame.team1Offense?.toString() || team1Ratings.offense,
        team1Defense: existingGame.team1Defense?.toString() || team1Ratings.defense,
        team2Overall: existingGame.team2Overall?.toString() || team2Ratings.overall,
        team2Offense: existingGame.team2Offense?.toString() || team2Ratings.offense,
        team2Defense: existingGame.team2Defense?.toString() || team2Ratings.defense,
        team1Record: existingGame.team1Record || team1Rec,
        team2Record: existingGame.team2Record || team2Rec,
        team1ConfRecord: existingGame.team1ConfRecord || '',
        team2ConfRecord: existingGame.team2ConfRecord || '',
        location: locationValue,
        aiRecap: existingGame.aiRecap || existingGame.gameNote || '',
        isConferenceGame: existingGame.isConferenceGame || isConferenceGame,
        // Player of the Week fields
        conferencePOW: existingGame.conferencePOW || '',
        confDefensePOW: existingGame.confDefensePOW || '',
        nationalPOW: existingGame.nationalPOW || '',
        natlDefensePOW: existingGame.natlDefensePOW || '',
        // Handle both old format (comma-separated string) and new format (array)
        links: Array.isArray(existingGame.links)
          ? [...existingGame.links.filter(l => l.trim()), ''] // Existing array + empty input
          : existingGame.links
            ? [...existingGame.links.split(',').map(l => l.trim()).filter(l => l), ''] // Convert string to array
            : [''], // Default empty input
        photos: Array.isArray(existingGame.photos) ? existingGame.photos.filter(Boolean) : [],
        scoreGraphic: existingGame.scoreGraphic || '',
      })
    } else if (isNewGame && team1Tid && team2Tid) {
      // New game - fetch ratings and calculate records
      const team1Ratings = getTeamRatings(team1Tid, gameYear)
      const team2Ratings = getTeamRatings(team2Tid, gameYear)
      const team1Rec = calculateTeamRecord(team1Tid, gameYear)
      const team2Rec = calculateTeamRecord(team2Tid, gameYear)

      // For CFP games, auto-fill ranks with seeds
      const isCFPGameType = gameType?.startsWith('cfp_')
      const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[gameYear] || currentDynasty?.cfpSeedsByYear?.[String(gameYear)] || []
      let rank1 = ''
      let rank2 = ''

      if (isCFPGameType && cfpSeeds.length) {
        // Look up by tid only
        const seed1Entry = cfpSeeds.find(s => s.tid === team1Tid)
        const seed2Entry = cfpSeeds.find(s => s.tid === team2Tid)
        if (seed1Entry?.seed) rank1 = seed1Entry.seed.toString()
        if (seed2Entry?.seed) rank2 = seed2Entry.seed.toString()
      }

      // Fallback for regular-season games: pull the entering-week
      // rank from the rankByWeek store. If the user already saved
      // that week's Top 25 via the weekly scores entry, the rank
      // appears here automatically.
      const weekForNewRank = gameWeek
      if (!rank1 && team1Tid != null && weekForNewRank != null) {
        const r = getTeamRankForWeek(currentDynasty, team1Tid, gameYear, weekForNewRank)
        if (r) rank1 = String(r)
      }
      if (!rank2 && team2Tid != null && weekForNewRank != null) {
        const r = getTeamRankForWeek(currentDynasty, team2Tid, gameYear, weekForNewRank)
        if (r) rank2 = String(r)
      }

      setFormData(prev => ({
        ...prev,
        team1Overall: team1Ratings.overall,
        team1Offense: team1Ratings.offense,
        team1Defense: team1Ratings.defense,
        team2Overall: team2Ratings.overall,
        team2Offense: team2Ratings.offense,
        team2Defense: team2Ratings.defense,
        team1Record: team1Rec,
        team2Record: team2Rec,
        team1Rank: rank1 || prev.team1Rank,
        team2Rank: rank2 || prev.team2Rank,
        location: queryLocation || prev.location,
        isConferenceGame
      }))
    }
  // IMPORTANT: Use existingGame?.id (primitive) instead of existingGame
  // (object) so this effect only fires when the game itself changes
  // (initial load / navigation to a different game). Using the full
  // existingGame object caused the form — including formData.photos —
  // to be reset on EVERY Firestore listener update, wiping any unsaved
  // edits (uploaded photos, scores entered mid-session, etc.).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingGame?.id, isNewGame, team1Tid, team2Tid, gameYear, queryLocation])

  // Re-hydrate state when existingGame resolves (cloud dynasties load async).
  useEffect(() => {
    if (!existingGame) return
    const derivedType =
      existingGame.gameType ||
      (existingGame.isConferenceChampionship ? 'conference_championship' : null) ||
      (existingGame.isBowlGame ? 'bowl' : null) ||
      (existingGame.isCFPFirstRound ? 'cfp_first_round' : null) ||
      (existingGame.isCFPQuarterfinal ? 'cfp_quarterfinal' : null) ||
      (existingGame.isCFPSemifinal ? 'cfp_semifinal' : null) ||
      (existingGame.isCFPChampionship ? 'cfp_championship' : null) ||
      'regular'
    setGameType(derivedType)
    if (existingGame.conference) setSelectedConference(existingGame.conference)
    if (existingGame.year) setEditYear(existingGame.year)
    setEditWeek(deriveDisplayWeek(existingGame, queryWeek, null, null))
    setEditBowlName(existingGame.bowlName || '')
  }, [existingGame?.id])

  // Quarter score helpers
  const hasQuarterScores = () => {
    const quarters = formData.quarters
    if (!quarters?.team1 || !quarters?.team2) return false
    return Object.values(quarters.team1).some(v => v !== '') || Object.values(quarters.team2).some(v => v !== '')
  }

  const calculateTotalFromQuarters = (teamKey, quarters = formData.quarters, overtimes = formData.overtimes) => {
    let total = 0
    if (quarters?.[teamKey]) {
      Object.values(quarters[teamKey]).forEach(score => {
        if (score !== '') total += parseInt(score) || 0
      })
    }
    if (overtimes) {
      overtimes.forEach(ot => {
        const otScore = ot?.[teamKey]
        if (otScore !== '' && otScore != null) total += parseInt(otScore) || 0
      })
    }
    return total
  }

  const handleQuarterChange = (teamKey, quarter, value) => {
    // Parse as integer to handle cases like "07" → "7"
    // Keep empty string as empty (for placeholder display)
    const parsedValue = value === '' ? '' : String(parseInt(value, 10) || 0)

    const defaultQuarters = { Q1: '', Q2: '', Q3: '', Q4: '' }
    const currentQuarters = formData.quarters || { team1: defaultQuarters, team2: defaultQuarters }
    const newQuarters = {
      ...currentQuarters,
      [teamKey]: {
        ...(currentQuarters[teamKey] || defaultQuarters),
        [quarter]: parsedValue
      }
    }

    const newFormData = { ...formData, quarters: newQuarters }

    // Auto-calculate totals if quarters are being used
    if (hasQuarterScores() || value !== '') {
      newFormData.team1Score = calculateTotalFromQuarters('team1', newQuarters, formData.overtimes).toString()
      newFormData.team2Score = calculateTotalFromQuarters('team2', newQuarters, formData.overtimes).toString()
    }

    // Check if all quarters are filled and regulation is tied
    const allQuartersFilled =
      newQuarters.team1?.Q1 !== '' && newQuarters.team1?.Q2 !== '' &&
      newQuarters.team1?.Q3 !== '' && newQuarters.team1?.Q4 !== '' &&
      newQuarters.team2?.Q1 !== '' && newQuarters.team2?.Q2 !== '' &&
      newQuarters.team2?.Q3 !== '' && newQuarters.team2?.Q4 !== ''

    if (allQuartersFilled) {
      const team1Regulation = calculateTotalFromQuarters('team1', newQuarters, [])
      const team2Regulation = calculateTotalFromQuarters('team2', newQuarters, [])

      if (team1Regulation === team2Regulation) {
        if (formData.overtimes.length === 0) {
          newFormData.overtimes = [{ team1: '', team2: '' }]
        }
      } else {
        newFormData.overtimes = []
      }
    } else if (formData.overtimes.length > 0) {
      newFormData.overtimes = []
    }

    setFormData(newFormData)
  }

  const handleOvertimeChange = (index, teamKey, value) => {
    // Parse as integer to handle cases like "07" → "7"
    const parsedValue = value === '' ? '' : String(parseInt(value, 10) || 0)

    const newOvertimes = [...formData.overtimes]
    newOvertimes[index] = { ...newOvertimes[index], [teamKey]: parsedValue }

    const newFormData = { ...formData, overtimes: newOvertimes }
    newFormData.team1Score = calculateTotalFromQuarters('team1', formData.quarters, newOvertimes).toString()
    newFormData.team2Score = calculateTotalFromQuarters('team2', formData.quarters, newOvertimes).toString()

    // Check if tied after this OT, add another if needed
    const team1Total = calculateTotalFromQuarters('team1', formData.quarters, newOvertimes)
    const team2Total = calculateTotalFromQuarters('team2', formData.quarters, newOvertimes)
    const lastOT = newOvertimes[newOvertimes.length - 1]
    if (lastOT?.team1 !== '' && lastOT?.team2 !== '' && team1Total === team2Total) {
      newFormData.overtimes = [...newOvertimes, { team1: '', team2: '' }]
    }

    setFormData(newFormData)
  }

  // Handle save
  const handleSave = async () => {
    if (isSaving || photoUploadCount > 0) return
    setIsSaving(true)
    try {
      // Determine homeTeamTid
      let homeTeamTid = null
      const isNeutralGame = computedWeekFlags.gameType !== 'regular'
      if (!isNeutralGame) {
        if (formData.location === 'home') homeTeamTid = team1Tid
        else if (formData.location === 'away') homeTeamTid = team2Tid
      }

      // When auto-fill is on, replace the manually-entered Record / Conf
      // values with the live "post-game" computation so what gets saved
      // matches what the user is looking at on screen.
      const live1 = autoFillRecords ? liveRecordFor(team1Tid) : null
      const live2 = autoFillRecords ? liveRecordFor(team2Tid) : null
      const team1RecordToSave     = autoFillRecords ? (live1.record     || '') : formData.team1Record
      const team2RecordToSave     = autoFillRecords ? (live2.record     || '') : formData.team2Record
      const team1ConfRecordToSave = autoFillRecords ? (live1.confRecord || '') : formData.team1ConfRecord
      const team2ConfRecordToSave = autoFillRecords ? (live2.confRecord || '') : formData.team2ConfRecord

      const wf = computedWeekFlags

      const gameData = {
        id: currentGameId || existingGame?.id || `game-${Date.now()}`,
        week: wf.week,
        year: editYear,
        gameType: wf.gameType,
        team1Tid,
        team2Tid,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
        quarters: formData.quarters,
        overtimes: formData.overtimes,
        team1Rank: formData.team1Rank ? parseInt(formData.team1Rank) : null,
        team2Rank: formData.team2Rank ? parseInt(formData.team2Rank) : null,
        team1Overall: formData.team1Overall ? parseInt(formData.team1Overall) : null,
        team1Offense: formData.team1Offense ? parseInt(formData.team1Offense) : null,
        team1Defense: formData.team1Defense ? parseInt(formData.team1Defense) : null,
        team2Overall: formData.team2Overall ? parseInt(formData.team2Overall) : null,
        team2Offense: formData.team2Offense ? parseInt(formData.team2Offense) : null,
        team2Defense: formData.team2Defense ? parseInt(formData.team2Defense) : null,
        team1Record: team1RecordToSave,
        team2Record: team2RecordToSave,
        team1ConfRecord: team1ConfRecordToSave,
        team2ConfRecord: team2ConfRecordToSave,
        homeTeamTid,
        isConferenceGame: formData.isConferenceGame || isConferenceGame,
        aiRecap: formData.aiRecap,
        // Player of the Week fields - always include to allow clearing
        conferencePOW: formData.conferencePOW || '',
        confDefensePOW: formData.confDefensePOW || '',
        nationalPOW: formData.nationalPOW || '',
        natlDefensePOW: formData.natlDefensePOW || '',
        // NOTE: No userTid - games are team-centric (team1Tid/team2Tid), not user-centric
        // Classification flags — all derived from the week/bowl pickers (fully editable).
        isConferenceChampionship: wf.isConferenceChampionship,
        conference: wf.conference,
        isBowlGame: wf.isBowlGame || false,
        isCFPFirstRound: wf.isCFPFirstRound || false,
        isCFPQuarterfinal: wf.isCFPQuarterfinal || false,
        isCFPSemifinal: wf.isCFPSemifinal || false,
        isCFPChampionship: wf.isCFPChampionship || false,
        ...(wf.bowlName && { bowlName: wf.bowlName }),
        ...(wf.bowlWeek && { bowlWeek: wf.bowlWeek }),
        ...(existingGame?.boxScore && { boxScore: existingGame.boxScore }),
        // Preserve cfpSlot for CFP games (critical for winner propagation)
        ...(existingGame?.cfpSlot && { cfpSlot: existingGame.cfpSlot }),
        ...(existingGame?.cfpRound && { cfpRound: existingGame.cfpRound }),
        // Save links as array (filter out empty entries)
        ...(() => {
          const validLinks = formData.links.filter(l => l.trim())
          return validLinks.length > 0 ? { links: validLinks } : {}
        })(),
        // Photos — array of ImgBB-hosted URLs uploaded via the Photos
        // section. Always persisted (even if empty) so deletes stick.
        photos: Array.isArray(formData.photos) ? formData.photos.filter(Boolean) : [],
        // Score graphic — single AI-generated image URL (empty string = none)
        ...(formData.scoreGraphic ? { scoreGraphic: formData.scoreGraphic } : {}),
      }

      // Update or add game - build updated games array for CFP propagation and record calc
      const games = currentDynasty.games || []
      const existingIndex = games.findIndex(g => g.id === gameData.id)

      let updatedGames
      if (existingIndex >= 0) {
        updatedGames = [...games]
        updatedGames[existingIndex] = { ...games[existingIndex], ...gameData }
      } else {
        updatedGames = [...games, gameData]
      }

      // Track CFP propagation - identify which games get modified
      let cfpGamesToPropagate = []
      const savedGame = existingIndex >= 0 ? updatedGames[existingIndex] : updatedGames[updatedGames.length - 1]
      if (savedGame.cfpSlot && savedGame.team1Score != null && savedGame.team2Score != null) {
        // Snapshot games before propagation to detect changes
        const gamesBeforeProp = updatedGames.map(g => ({ id: g.id, team1Tid: g.team1Tid, team2Tid: g.team2Tid }))
        updatedGames = propagateCFPWinner(updatedGames, savedGame)

        // Find games that were modified by propagation (not the main game)
        for (const game of updatedGames) {
          if (game.id === savedGame.id) continue // Skip main game
          const before = gamesBeforeProp.find(g => g.id === game.id)
          if (before && (before.team1Tid !== game.team1Tid || before.team2Tid !== game.team2Tid)) {
            cfpGamesToPropagate.push(game)
          }
        }
      }

      // Build record updates for both teams involved
      const dynastyWithUpdatedGames = { ...currentDynasty, games: updatedGames }
      let recordUpdates = {}
      if (team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team1Tid, gameYear))
      }
      if (team2Tid && team2Tid !== team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team2Tid, gameYear))
      }

      // OPTIMIZED: Use updateGame for efficient single-doc saves to cloud
      await updateGame(currentDynasty.id, savedGame, { recordUpdates, cfpGamesToPropagate })

      setToastMessage('Game saved successfully!')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)

      // Navigate to the game page
      navigate(`${pathPrefix}/game/${gameData.id}`)
    } catch (error) {
      console.error('Error saving game:', error)
      // Use both the local toast AND the global toast so errors are
      // visible even if the component unmounts before re-rendering.
      setToastMessage('Error saving game: ' + (error?.message || 'unknown error'))
      setShowToast(true)
      setTimeout(() => setShowToast(false), 5000)
      toast?.error?.('Error saving game: ' + (error?.message || 'unknown error'))
    } finally {
      setIsSaving(false)
    }
  }

  // Delete this game. Only available when editing an existing game (not
  // for the new-game flow). Confirms first, deletes via the context's
  // fast-path helper (single Firestore delete + local state update +
  // box-score stat resync), then navigates back.
  const handleDelete = async () => {
    const idToDelete = currentGameId || gameId
    if (!idToDelete || !existingGame) return
    const t1 = team1Name || team1Abbr || 'Team 1'
    const t2 = team2Name || team2Abbr || 'Team 2'
    const ok = await confirm({
      title: 'Delete this game?',
      message: `Permanently remove ${t1} vs ${t2} (${gameYear} Week ${existingGame.week ?? '?'}). This cannot be undone. Player season stats from this game will be subtracted automatically if a box score was entered.`,
      confirmLabel: 'Delete game',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteGame(currentDynasty.id, idToDelete)
      toast?.success?.('Game deleted.')
      // Navigate back to where the user came from, falling back to the
      // dashboard if no referrer state.
      if (location.state?.from) navigate(location.state.from)
      else navigate(`${pathPrefix}`)
    } catch (err) {
      console.error('[GameEdit] delete failed:', err)
      toast?.error?.('Could not delete the game: ' + (err?.message || 'unknown error'))
    }
  }

  // Handle cancel
  const handleCancel = () => {
    if (location.state?.from) {
      navigate(location.state.from)
    } else if (currentGameId || existingGame) {
      navigate(`${pathPrefix}/game/${currentGameId || gameId}`)
    } else {
      navigate(-1)
    }
  }

  // Save game data silently (without navigation or toast) - used for auto-save
  const saveGameDataSilently = async () => {
    if (!currentDynasty?.id) return false

    try {
      // Determine homeTeamTid
      let homeTeamTid = null
      const isNeutralGame = computedWeekFlags.gameType !== 'regular'
      if (!isNeutralGame) {
        if (formData.location === 'home') homeTeamTid = team1Tid
        else if (formData.location === 'away') homeTeamTid = team2Tid
      }

      // Same auto-fill override as handleSave — keep what's saved in
      // sync with what the user is looking at on screen.
      const live1 = autoFillRecords ? liveRecordFor(team1Tid) : null
      const live2 = autoFillRecords ? liveRecordFor(team2Tid) : null
      const team1RecordToSave     = autoFillRecords ? (live1.record     || '') : formData.team1Record
      const team2RecordToSave     = autoFillRecords ? (live2.record     || '') : formData.team2Record
      const team1ConfRecordToSave = autoFillRecords ? (live1.confRecord || '') : formData.team1ConfRecord
      const team2ConfRecordToSave = autoFillRecords ? (live2.confRecord || '') : formData.team2ConfRecord

      const wf = computedWeekFlags

      const gameData = {
        id: currentGameId || existingGame?.id || `game-${Date.now()}`,
        week: wf.week,
        year: editYear,
        gameType: wf.gameType,
        team1Tid,
        team2Tid,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
        quarters: formData.quarters,
        overtimes: formData.overtimes,
        team1Rank: formData.team1Rank ? parseInt(formData.team1Rank) : null,
        team2Rank: formData.team2Rank ? parseInt(formData.team2Rank) : null,
        team1Overall: formData.team1Overall ? parseInt(formData.team1Overall) : null,
        team1Offense: formData.team1Offense ? parseInt(formData.team1Offense) : null,
        team1Defense: formData.team1Defense ? parseInt(formData.team1Defense) : null,
        team2Overall: formData.team2Overall ? parseInt(formData.team2Overall) : null,
        team2Offense: formData.team2Offense ? parseInt(formData.team2Offense) : null,
        team2Defense: formData.team2Defense ? parseInt(formData.team2Defense) : null,
        team1Record: team1RecordToSave,
        team2Record: team2RecordToSave,
        team1ConfRecord: team1ConfRecordToSave,
        team2ConfRecord: team2ConfRecordToSave,
        homeTeamTid,
        isConferenceGame: formData.isConferenceGame || isConferenceGame,
        aiRecap: formData.aiRecap,
        // Player of the Week fields - always include to allow clearing
        conferencePOW: formData.conferencePOW || '',
        confDefensePOW: formData.confDefensePOW || '',
        nationalPOW: formData.nationalPOW || '',
        natlDefensePOW: formData.natlDefensePOW || '',
        // NOTE: No userTid - games are team-centric (team1Tid/team2Tid), not user-centric
        // Classification flags — all derived from the week/bowl pickers (fully editable).
        isConferenceChampionship: wf.isConferenceChampionship,
        conference: wf.conference,
        isBowlGame: wf.isBowlGame || false,
        isCFPFirstRound: wf.isCFPFirstRound || false,
        isCFPQuarterfinal: wf.isCFPQuarterfinal || false,
        isCFPSemifinal: wf.isCFPSemifinal || false,
        isCFPChampionship: wf.isCFPChampionship || false,
        ...(wf.bowlName && { bowlName: wf.bowlName }),
        ...(wf.bowlWeek && { bowlWeek: wf.bowlWeek }),
        ...(existingGame?.boxScore && { boxScore: existingGame.boxScore }),
        // Preserve cfpSlot for CFP games (critical for winner propagation)
        ...(existingGame?.cfpSlot && { cfpSlot: existingGame.cfpSlot }),
        ...(existingGame?.cfpRound && { cfpRound: existingGame.cfpRound }),
        // Save links as array (filter out empty entries)
        ...(() => {
          const validLinks = formData.links.filter(l => l.trim())
          return validLinks.length > 0 ? { links: validLinks } : {}
        })(),
        // Photos — array of ImgBB-hosted URLs uploaded via the Photos
        // section. Always persisted (even if empty) so deletes stick.
        photos: Array.isArray(formData.photos) ? formData.photos.filter(Boolean) : [],
        // Score graphic — single AI-generated image URL (empty string = none)
        ...(formData.scoreGraphic ? { scoreGraphic: formData.scoreGraphic } : {}),
      }

      // Update or add game - build updated games array for CFP propagation and record calc
      const games = currentDynasty.games || []
      const existingIndex = games.findIndex(g => g.id === gameData.id)

      let updatedGames
      if (existingIndex >= 0) {
        updatedGames = [...games]
        updatedGames[existingIndex] = { ...games[existingIndex], ...gameData }
      } else {
        updatedGames = [...games, gameData]
      }

      // Track CFP propagation - identify which games get modified
      let cfpGamesToPropagate = []
      const savedGame = existingIndex >= 0 ? updatedGames[existingIndex] : updatedGames[updatedGames.length - 1]
      if (savedGame.cfpSlot && savedGame.team1Score != null && savedGame.team2Score != null) {
        // Snapshot games before propagation to detect changes
        const gamesBeforeProp = updatedGames.map(g => ({ id: g.id, team1Tid: g.team1Tid, team2Tid: g.team2Tid }))
        updatedGames = propagateCFPWinner(updatedGames, savedGame)

        // Find games that were modified by propagation (not the main game)
        for (const game of updatedGames) {
          if (game.id === savedGame.id) continue // Skip main game
          const before = gamesBeforeProp.find(g => g.id === game.id)
          if (before && (before.team1Tid !== game.team1Tid || before.team2Tid !== game.team2Tid)) {
            cfpGamesToPropagate.push(game)
          }
        }
      }

      // Build record updates for both teams involved
      const dynastyWithUpdatedGames = { ...currentDynasty, games: updatedGames }
      let recordUpdates = {}
      if (team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team1Tid, gameYear))
      }
      if (team2Tid && team2Tid !== team1Tid) {
        Object.assign(recordUpdates, buildRecordUpdatePayload(dynastyWithUpdatedGames, team2Tid, gameYear))
      }

      // OPTIMIZED: Use updateGame for efficient single-doc saves to cloud
      await updateGame(currentDynasty.id, savedGame, { recordUpdates, cfpGamesToPropagate })
      return true
    } catch (error) {
      console.error('Error auto-saving game:', error)
      return false
    }
  }

  // Open box score modal — auto-save in BACKGROUND so the modal opens
  // immediately without waiting on Firestore writes. The await-version
  // of this used to block for 600ms-3s while updateGame fired its
  // setDocs, and during that window a cascade of listener-driven
  // re-renders made the page unresponsive enough that Chrome popped
  // the "Page Unresponsive" dialog before the modal even rendered.
  // Fire-and-forget: the silent save still runs, just doesn't gate
  // modal display on it. Modal mounts in <100ms.
  const openBoxScoreModal = (type, targetTid = null) => {
    saveGameDataSilently().catch(error => {
      console.error('[openBoxScoreModal] background save failed:', error)
    })
    setBoxScoreModalType(type)
    setBoxScoreModalTargetTid(type === 'playerStats' ? (targetTid != null ? Number(targetTid) : null) : null)
    setShowBoxScoreModal(true)
  }

  // Handle box score save from modal
  const handleBoxScoreSave = async (data) => {
    if (!currentGameId || !currentDynasty?.id) return

    try {
      const games = currentDynasty.games || []
      const existingGame = games.find(g => g.id === currentGameId)

      if (existingGame) {
        const teamsForResolve = currentDynasty?.teams || currentDynasty?.customTeams
        let updatedGame = existingGame

        // Route each sheet's data to the canonical byTid store via the
        // helpers. Player-stats data is keyed by the target team's tid;
        // team-stats data arrives already tid-keyed from the sheet reader;
        // scoringSummary is a flat array (unchanged).
        if (boxScoreModalType === 'teamStats') {
          const canon = canonicalBoxScore(updatedGame, teamsForResolve) || { byTid: {}, teamStatsByTid: {}, scoringSummary: [] }
          updatedGame = {
            ...updatedGame,
            boxScore: {
              byTid: canon.byTid,
              teamStatsByTid: data || {},
              scoringSummary: canon.scoringSummary || []
            }
          }
        } else if (boxScoreModalType === 'scoring') {
          updatedGame = setScoringSummary(updatedGame, data || [], teamsForResolve)
        } else if (boxScoreModalType === 'playerStats') {
          if (boxScoreModalTargetTid != null) {
            updatedGame = setPlayerStatsForTid(updatedGame, boxScoreModalTargetTid, data || {}, teamsForResolve)
          }
        }

        // Use addGame to ensure delta tracking is applied for player stats
        // This prevents double-counting when editing a game multiple times
        await addGame(currentDynasty.id, updatedGame)
      }
    } catch (error) {
      console.error('Error saving box score data:', error)
    }
  }

  // Handle sheet creation - save sheet ID to game so it can be reused
  const handleSheetCreated = async (sheetId) => {
    if (!currentGameId || !currentDynasty?.id || !sheetId) return

    try {
      const games = currentDynasty.games || []
      const existingGame = games.find(g => g.id === currentGameId)

      if (existingGame) {
        let updatedGame = { ...existingGame }

        // Player-stats sheet IDs live in a tid-keyed map. Other sheet
        // types use a single top-level field.
        if (boxScoreModalType === 'teamStats') {
          updatedGame.teamStatsSheetId = sheetId
        } else if (boxScoreModalType === 'scoring') {
          updatedGame.scoringSummarySheetId = sheetId
        } else if (boxScoreModalType === 'playerStats' && boxScoreModalTargetTid != null) {
          const prev = updatedGame.playerStatsSheetIdByTid || {}
          updatedGame.playerStatsSheetIdByTid = { ...prev, [boxScoreModalTargetTid]: sheetId }
        }

        await addGame(currentDynasty.id, updatedGame)
      }
    } catch (error) {
      console.error('Error saving sheet ID:', error)
    }
  }

  // Get existing sheet ID based on modal type
  const getExistingSheetId = () => {
    if (!existingGame) return null
    const teamsForResolve = currentDynasty?.teams || currentDynasty?.customTeams
    switch (boxScoreModalType) {
      case 'teamStats': return existingGame.teamStatsSheetId
      case 'scoring': return existingGame.scoringSummarySheetId
      case 'playerStats':
        return boxScoreModalTargetTid != null
          ? getPlayerStatsSheetIdForTid(existingGame, boxScoreModalTargetTid, teamsForResolve)
          : null
      default: return null
    }
  }

  // Copy full prompt to clipboard for use in external AI (ChatGPT/Claude/etc.)
  const handleCopyPrompt = async () => {
    try {
      const gameForRecap = {
        ...existingGame,
        team1: team1Name,
        team2: team2Name,
        team1Score: parseInt(formData.team1Score) || 0,
        team2Score: parseInt(formData.team2Score) || 0,
        quarters: formData.quarters,
        gameType,
        bowlName,
        year: gameYear,
      }

      const fullPrompt = getFullRecapPrompt(currentDynasty, gameForRecap, { perspective: recapPerspective, depth: recapDepth })

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullPrompt)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = fullPrompt
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }

      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy prompt:', error)
      setRecapError('Failed to copy prompt to clipboard: ' + error.message)
    }
  }

  if (isViewOnly) {
    return (
      <Card>
        <EmptyState
          title="View-only mode"
          message="Editing is not available in view-only mode."
          action={<Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>}
        />
      </Card>
    )
  }

  if (!isNewGame && !existingGame) {
    return (
      <Card>
        <EmptyState
          title="Game not found"
          action={<Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {showToast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-2 rounded-sm label-sm text-white"
          style={{ backgroundColor: 'var(--accent-success)' }}
        >
          {toastMessage}
        </div>
      )}

      {/* Cross-team write warning. Soft banner — doesn't block save,
          just makes accidental edits to another coach's data visible.
          Commish + co-commishes never see this (they manage extras). */}
      <TeamPermissionBanner tids={[team1Tid, team2Tid].filter(Boolean)} />

      {/* Hero — mirrors the actual Game page hero so editing/viewing share
          a visual surface. The gradient header carries Save/Cancel; the
          body has team logos, names, big editable score inputs, and an
          inline editable quarter table. */}
      {(() => {
        const leftColors = getTeamColors(leftTeamName, teamsSource) || { primary: '#444', secondary: '#fff' }
        const rightColors = getTeamColors(rightTeamName, teamsSource) || { primary: '#444', secondary: '#fff' }
        // 50/50 gradient — winner highlight isn't meaningful while editing.
        const headerGradient = `linear-gradient(90deg, ${leftColors.primary} 0%, ${leftColors.primary} 40%, ${rightColors.primary} 60%, ${rightColors.primary} 100%)`
        const titleText = isNewGame ? 'New Game' : (gameTitle || 'Edit Game')
        // QuarterInput is defined at module scope (top of this file) so its
        // component identity is stable across renders — see the comment up
        // there for why.

        return (
          <div className="bg-surface-1 rounded-2xl overflow-hidden shadow-2xl">
            {/* Top bar: Cancel — title — Save */}
            <div
              className="px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2"
              style={{ background: headerGradient }}
            >
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs sm:text-sm bg-white/15 text-white hover:bg-white/25 transition-colors backdrop-blur-sm"
              >
                Cancel
              </button>

              <div className="text-white text-center min-w-0 px-2">
                <div className="text-sm sm:text-lg font-bold drop-shadow-md truncate">{titleText}</div>
                <div className="text-[10px] sm:text-xs opacity-90 truncate">{gameSubtitle}</div>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || photoUploadCount > 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs sm:text-sm bg-white text-surface-1 hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving…' : photoUploadCount > 0 ? 'Uploading…' : 'Save'}
              </button>
            </div>

            {/* Desktop: integrated layout — left team / quarter inputs / right team */}
            <div className="hidden lg:block px-8 py-6">
              <div className="flex items-center justify-between">
                {/* Left team cluster */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center p-2 shadow-xl bg-white shrink-0"
                    >
                      {leftTeamLogo && <img src={leftTeamLogo} alt={leftTeamName} className="w-full h-full object-contain" />}
                    </div>
                    <div className="text-left">
                      {formData[`${displayLeftTeam}Rank`] && (
                        <div className="text-amber-400 text-xs font-bold">#{formData[`${displayLeftTeam}Rank`]}</div>
                      )}
                      <div className="text-white font-bold text-lg">{leftTeamName}</div>
                    </div>
                  </div>
                  <input
                    type="number"
                    value={formData[`${displayLeftTeam}Score`]}
                    onChange={(e) => !hasQuarterScores() && setFormData({ ...formData, [`${displayLeftTeam}Score`]: e.target.value })}
                    disabled={hasQuarterScores()}
                    className={`w-20 text-6xl font-black tabular-nums bg-transparent text-center text-white focus:outline-none focus:ring-2 focus:ring-white/30 rounded-md ${hasQuarterScores() ? 'cursor-not-allowed opacity-60' : ''}`}
                    min="0"
                  />
                </div>

                {/* Center quarter inputs table */}
                <div className="flex-shrink-0 mx-4">
                  <table className="text-center">
                    <thead>
                      <tr className="text-xs text-txt-muted uppercase">
                        <th className="px-2 py-1"></th>
                        <th className="px-3 py-1">1</th>
                        <th className="px-3 py-1">2</th>
                        <th className="px-3 py-1">3</th>
                        <th className="px-3 py-1">4</th>
                        {formData.overtimes.map((_, i) => (
                          <th key={i} className="px-3 py-1">OT{i > 0 ? i + 1 : ''}</th>
                        ))}
                        <th className="px-3 py-1 pl-4 border-l border-surface-4">T</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pr-3 py-1.5 text-left text-sm font-bold text-txt-tertiary">{leftTeamAbbr}</td>
                        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                          <td key={q} className="px-1 py-1.5">
                            <QuarterInput
                              value={formData.quarters?.[displayLeftTeam]?.[q]}
                              onChange={(e) => handleQuarterChange(displayLeftTeam, q, e.target.value)}
                              onBlur={(e) => { if (e.target.value === '') handleQuarterChange(displayLeftTeam, q, '0') }}
                            />
                          </td>
                        ))}
                        {formData.overtimes.map((ot, idx) => (
                          <td key={idx} className="px-1 py-1.5">
                            <QuarterInput
                              value={ot[displayLeftTeam]}
                              onChange={(e) => handleOvertimeChange(idx, displayLeftTeam, e.target.value)}
                              onBlur={(e) => { if (e.target.value === '') handleOvertimeChange(idx, displayLeftTeam, '0') }}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 pl-4 border-l border-surface-4 text-xl font-black text-white tabular-nums">
                          {formData[`${displayLeftTeam}Score`] || '0'}
                        </td>
                      </tr>
                      <tr>
                        <td className="pr-3 py-1.5 text-left text-sm font-bold text-txt-tertiary">{rightTeamAbbr}</td>
                        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                          <td key={q} className="px-1 py-1.5">
                            <QuarterInput
                              value={formData.quarters?.[displayRightTeam]?.[q]}
                              onChange={(e) => handleQuarterChange(displayRightTeam, q, e.target.value)}
                              onBlur={(e) => { if (e.target.value === '') handleQuarterChange(displayRightTeam, q, '0') }}
                            />
                          </td>
                        ))}
                        {formData.overtimes.map((ot, idx) => (
                          <td key={idx} className="px-1 py-1.5">
                            <QuarterInput
                              value={ot[displayRightTeam]}
                              onChange={(e) => handleOvertimeChange(idx, displayRightTeam, e.target.value)}
                              onBlur={(e) => { if (e.target.value === '') handleOvertimeChange(idx, displayRightTeam, '0') }}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-1.5 pl-4 border-l border-surface-4 text-xl font-black text-white tabular-nums">
                          {formData[`${displayRightTeam}Score`] || '0'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right team cluster */}
                <div className="flex items-center gap-6">
                  <input
                    type="number"
                    value={formData[`${displayRightTeam}Score`]}
                    onChange={(e) => !hasQuarterScores() && setFormData({ ...formData, [`${displayRightTeam}Score`]: e.target.value })}
                    disabled={hasQuarterScores()}
                    className={`w-20 text-6xl font-black tabular-nums bg-transparent text-center text-white focus:outline-none focus:ring-2 focus:ring-white/30 rounded-md ${hasQuarterScores() ? 'cursor-not-allowed opacity-60' : ''}`}
                    min="0"
                  />
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      {formData[`${displayRightTeam}Rank`] && (
                        <div className="text-amber-400 text-xs font-bold">#{formData[`${displayRightTeam}Rank`]}</div>
                      )}
                      <div className="text-white font-bold text-lg">{rightTeamName}</div>
                    </div>
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center p-2 shadow-xl bg-white shrink-0"
                    >
                      {rightTeamLogo && <img src={rightTeamLogo} alt={rightTeamName} className="w-full h-full object-contain" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile / tablet: stacked logos+score-inputs, then quarter inputs below */}
            <div className="lg:hidden">
              <div className="px-3 py-4 sm:px-6 sm:py-6">
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                  {/* Left team */}
                  <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center p-1.5 sm:p-2 shadow-xl bg-white shrink-0">
                      {leftTeamLogo && <img src={leftTeamLogo} alt={leftTeamName} className="w-full h-full object-contain" />}
                    </div>
                    <div className="text-center min-w-0 w-full">
                      {formData[`${displayLeftTeam}Rank`] && (
                        <div className="text-amber-400 text-[10px] font-bold">#{formData[`${displayLeftTeam}Rank`]}</div>
                      )}
                      <div className="text-white font-bold text-xs sm:text-sm leading-tight truncate">{leftTeamName}</div>
                    </div>
                  </div>

                  {/* Score inputs */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <input
                      type="number"
                      value={formData[`${displayLeftTeam}Score`]}
                      onChange={(e) => !hasQuarterScores() && setFormData({ ...formData, [`${displayLeftTeam}Score`]: e.target.value })}
                      disabled={hasQuarterScores()}
                      className={`w-14 sm:w-20 text-3xl sm:text-5xl font-black tabular-nums bg-transparent text-center text-white focus:outline-none focus:ring-2 focus:ring-white/30 rounded-md ${hasQuarterScores() ? 'cursor-not-allowed opacity-60' : ''}`}
                      min="0"
                    />
                    <span className="text-lg sm:text-2xl font-bold text-txt-tertiary">–</span>
                    <input
                      type="number"
                      value={formData[`${displayRightTeam}Score`]}
                      onChange={(e) => !hasQuarterScores() && setFormData({ ...formData, [`${displayRightTeam}Score`]: e.target.value })}
                      disabled={hasQuarterScores()}
                      className={`w-14 sm:w-20 text-3xl sm:text-5xl font-black tabular-nums bg-transparent text-center text-white focus:outline-none focus:ring-2 focus:ring-white/30 rounded-md ${hasQuarterScores() ? 'cursor-not-allowed opacity-60' : ''}`}
                      min="0"
                    />
                  </div>

                  {/* Right team */}
                  <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center p-1.5 sm:p-2 shadow-xl bg-white shrink-0">
                      {rightTeamLogo && <img src={rightTeamLogo} alt={rightTeamName} className="w-full h-full object-contain" />}
                    </div>
                    <div className="text-center min-w-0 w-full">
                      {formData[`${displayRightTeam}Rank`] && (
                        <div className="text-amber-400 text-[10px] font-bold">#{formData[`${displayRightTeam}Rank`]}</div>
                      )}
                      <div className="text-white font-bold text-xs sm:text-sm leading-tight truncate">{rightTeamName}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile quarter inputs */}
              <div className="px-3 sm:px-4 pb-4 overflow-x-auto">
                <table className="w-full text-center min-w-[400px]">
                  <thead>
                    <tr className="text-[10px] sm:text-xs text-txt-tertiary uppercase tracking-wider">
                      <th className="text-left py-2 px-2 font-semibold">Team</th>
                      <th className="py-2 px-1 font-semibold">1st</th>
                      <th className="py-2 px-1 font-semibold">2nd</th>
                      <th className="py-2 px-1 font-semibold">3rd</th>
                      <th className="py-2 px-1 font-semibold">4th</th>
                      {formData.overtimes.map((_, i) => (
                        <th key={i} className="py-2 px-1 font-semibold">OT{i > 0 ? i + 1 : ''}</th>
                      ))}
                      <th className="py-2 px-2 font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {[
                      { prefix: displayLeftTeam, abbr: leftTeamAbbr, logo: leftTeamLogo },
                      { prefix: displayRightTeam, abbr: rightTeamAbbr, logo: rightTeamLogo },
                    ].map(({ prefix, abbr, logo }, idx) => (
                      <tr key={prefix} className={idx === 0 ? 'border-b border-surface-4' : ''}>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            {logo && <img src={logo} alt="" className="w-6 h-6 object-contain shrink-0" />}
                            <span className="text-sm font-bold text-txt-primary">{abbr}</span>
                          </div>
                        </td>
                        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                          <td key={q} className="py-2 px-1">
                            <QuarterInput
                              value={formData.quarters?.[prefix]?.[q]}
                              onChange={(e) => handleQuarterChange(prefix, q, e.target.value)}
                              onBlur={(e) => { if (e.target.value === '') handleQuarterChange(prefix, q, '0') }}
                            />
                          </td>
                        ))}
                        {formData.overtimes.map((ot, otIdx) => (
                          <td key={otIdx} className="py-2 px-1">
                            <QuarterInput
                              value={ot[prefix]}
                              onChange={(e) => handleOvertimeChange(otIdx, prefix, e.target.value)}
                              onBlur={(e) => { if (e.target.value === '') handleOvertimeChange(otIdx, prefix, '0') }}
                            />
                          </td>
                        ))}
                        <td className="py-2 px-2 text-lg font-black text-white tabular-nums">
                          {formData[`${prefix}Score`] || '0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* All game editor cards in one continuous flow */}
      <div className="space-y-3">

      {/* Setup — year, week, location, conference game all in one card */}
      {(() => {
        const WEEK_OPTIONS = [
          { value: '', label: '— Select week —' },
          ...Array.from({ length: 15 }, (_, i) => ({ value: String(i), label: `Week ${i}` })),
          { value: 'CCG', label: 'Conference Championship' },
          { value: 'BW1', label: 'Bowl Week 1' },
          { value: 'BW2', label: 'Bowl Week 2' },
          { value: 'BW3', label: 'Bowl Week 3 (CFP Semis)' },
          { value: 'NatChamp', label: 'National Championship' },
        ]
        const CONFERENCE_OPTIONS = [
          'ACC', 'American', 'Big 12', 'Big Ten', 'Conference USA',
          'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt',
        ]
        const showConferencePicker = editWeek === 'CCG'
        const showBowlPicker = editWeek === 'BW1' || editWeek === 'BW2' || editWeek === 'BW3'
        const bw1Bowls = getWeek1BowlGamesList()
        const bw2Bowls = getWeek2BowlGamesList()
        const cfpBowlConfig = currentDynasty?.cfpBowlConfigByYear?.[editYear] || {}
        const sfBowls = [cfpBowlConfig.sf1 || 'Peach Bowl', cfpBowlConfig.sf2 || 'Fiesta Bowl']
        const bowlOptions = editWeek === 'BW1' ? bw1Bowls : editWeek === 'BW2' ? bw2Bowls : sfBowls
        return (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-txt-tertiary mb-1">Year</label>
                <Input
                  size="sm"
                  type="number"
                  value={editYear}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    if (Number.isFinite(v)) setEditYear(v)
                  }}
                  min={1990}
                  max={2200}
                />
              </div>
              <div>
                <label className="block text-xs text-txt-tertiary mb-1">Week</label>
                <Select
                  size="sm"
                  value={editWeek}
                  onChange={(e) => {
                    const next = e.target.value
                    setEditWeek(next)
                    if (next !== 'BW1' && next !== 'BW2' && next !== 'BW3') setEditBowlName('')
                    if (next === 'CCG' && !selectedConference) setSelectedConference(queryConference || '')
                  }}
                >
                  {WEEK_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-txt-tertiary mb-1">Location</label>
                <Select
                  size="sm"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                >
                  <option value="home">{team1Name} Home</option>
                  <option value="away">{team2Name} Home</option>
                  <option value="neutral">Neutral Site</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-txt-tertiary mb-1">Conference Game</label>
                <div className="flex items-center gap-2 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isConferenceGame}
                      onChange={(e) => setFormData({ ...formData, isConferenceGame: e.target.checked })}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: 'var(--text-primary)' }}
                    />
                    <span className="text-sm text-txt-secondary">Yes</span>
                  </label>
                  {isConferenceGame && (
                    <span className="label-xs" style={{ color: 'var(--accent-success)' }}>
                      {team1Conference}
                    </span>
                  )}
                </div>
              </div>
              {showConferencePicker && (
                <div className="col-span-2">
                  <label className="block text-xs text-txt-tertiary mb-1">Conference</label>
                  <Select
                    size="sm"
                    value={selectedConference}
                    onChange={(e) => setSelectedConference(e.target.value)}
                  >
                    <option value="">Select a conference…</option>
                    {CONFERENCE_OPTIONS.map(conf => (
                      <option key={conf} value={conf}>{conf}</option>
                    ))}
                  </Select>
                </div>
              )}
              {showBowlPicker && (
                <div className="col-span-2">
                  <label className="block text-xs text-txt-tertiary mb-1">Bowl Game</label>
                  <Select
                    size="sm"
                    value={editBowlName}
                    onChange={(e) => setEditBowlName(e.target.value)}
                  >
                    <option value="">— Select bowl —</option>
                    {bowlOptions.map(bowl => (
                      <option key={bowl} value={bowl}>{bowl}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          </Card>
        )
      })()}

      {/* Team details — stacked rows, one per team. Each row is the
          team identity (logo + name + 'Your team' chip when applicable)
          followed by a single inline cluster of compact stat inputs.
          Avoids the cramped 4-input grid the previous design forced. */}
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="label-sm text-txt-primary">TEAM DETAILS</h3>
          <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={autoFillRecords}
              onChange={(e) => setAutoFillRecords(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-surface-5 cursor-pointer"
            />
            <span className="text-[11px] text-txt-tertiary">Auto-fill records</span>
          </label>
        </div>

        {/* Grid: team identity col + 6 stat cols, headers once at top */}
        <div className="grid gap-x-1.5 gap-y-1.5" style={{ gridTemplateColumns: 'auto repeat(6, minmax(0, 1fr))' }}>

          {/* Header row */}
          <div />
          {['Rank', 'OVR', 'OFF', 'DEF', 'Rec', 'Conf'].map(lbl => (
            <div key={lbl} className="text-[9px] uppercase tracking-wide text-txt-tertiary text-center">{lbl}</div>
          ))}

          {/* Team rows */}
          {[
            { prefix: displayLeftTeam, name: leftTeamName, abbr: leftTeamAbbr, logo: leftTeamLogo, isUser: isLeftUserTeam },
            { prefix: displayRightTeam, name: rightTeamName, abbr: rightTeamAbbr, logo: rightTeamLogo, isUser: isRightUserTeam }
          ].map(({ prefix, name, abbr, logo, isUser }) => {
            const live = prefix === 'team1' ? live1 : live2
            const recordValue = autoFillRecords ? (live?.record || '') : formData[`${prefix}Record`]
            const confValue   = autoFillRecords ? (live?.confRecord || '') : formData[`${prefix}ConfRecord`]
            return (
              <React.Fragment key={prefix}>
                {/* Team identity — logo only */}
                <div className="flex items-center justify-center pr-1">
                  {logo && <img src={logo} alt={abbr || name} className="w-7 h-7 object-contain" />}
                </div>

                {/* Rank */}
                <Input type="number" value={formData[`${prefix}Rank`]}
                  onChange={(e) => setFormData({ ...formData, [`${prefix}Rank`]: e.target.value })}
                  size="sm" className="w-full text-center tabular" min="1" max="133" placeholder="—" />

                {/* OVR / OFF / DEF */}
                {['Overall', 'Offense', 'Defense'].map(field => (
                  <Input key={field} type="number" value={formData[`${prefix}${field}`]}
                    onChange={(e) => setFormData({ ...formData, [`${prefix}${field}`]: e.target.value })}
                    size="sm" className="w-full text-center tabular" min="0" max="99" />
                ))}

                {/* Record */}
                <Input type="text" value={recordValue}
                  onChange={(e) => setFormData({ ...formData, [`${prefix}Record`]: e.target.value })}
                  size="sm" className="w-full text-center tabular" placeholder="0-0"
                  readOnly={autoFillRecords} disabled={autoFillRecords} />

                {/* Conf */}
                <Input type="text" value={confValue}
                  onChange={(e) => setFormData({ ...formData, [`${prefix}ConfRecord`]: e.target.value })}
                  size="sm" className="w-full text-center tabular" placeholder="0-0"
                  readOnly={autoFillRecords} disabled={autoFillRecords} />
              </React.Fragment>
            )
          })}
        </div>
      </Card>

      <Card>
        <h3 className="label-sm text-txt-primary mb-2">Box Score &amp; Stats</h3>
        {isNewGame ? (
          <p className="text-sm text-txt-tertiary">Save the game first to connect Google Sheets for detailed stats.</p>
        ) : (
          <>

            <div className="grid grid-cols-4 gap-2">
              {[
                {
                  key: 'team-stats',
                  label: 'Team Stats',
                  onClick: () => openBoxScoreModal('teamStats'),
                  connected: !!existingGame?.teamStatsSheetId,
                  logo: null
                },
                {
                  key: 'left-stats',
                  label: '',
                  onClick: () => openBoxScoreModal('playerStats', leftTeamTid),
                  connected: !!getPlayerStatsSheetIdForTid(existingGame, leftTeamTid, currentDynasty?.teams || currentDynasty?.customTeams),
                  logo: leftTeamLogo
                },
                {
                  key: 'right-stats',
                  label: '',
                  onClick: () => openBoxScoreModal('playerStats', rightTeamTid),
                  connected: !!getPlayerStatsSheetIdForTid(existingGame, rightTeamTid, currentDynasty?.teams || currentDynasty?.customTeams),
                  logo: rightTeamLogo
                },
                {
                  key: 'scoring-summary',
                  label: 'Plays',
                  onClick: () => openBoxScoreModal('scoring'),
                  connected: !!existingGame?.scoringSummarySheetId,
                  logo: null
                }
              ].map(tile => (
                <button
                  key={tile.key}
                  onClick={tile.onClick}
                  className="p-2 rounded-sm text-center transition-colors hover:bg-surface-3"
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    border: tile.connected
                      ? '1px solid var(--accent-success)'
                      : '1px dashed var(--surface-5)'
                  }}
                >
                  {tile.logo && (
                    <img src={tile.logo} alt="" className="h-5 w-5 object-contain mx-auto mb-1" />
                  )}
                  <div className="text-xs font-semibold text-txt-primary leading-tight">{tile.label}</div>
                  {tile.connected && (
                    <div className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: 'var(--accent-success)' }}>Connected</div>
                  )}
                </button>
              ))}
            </div>

            {/* Repair tool removed — use Admin → Danger Zone → "Swap Box Score Teams" to fix mismatched stats. */}
          </>
        )}
      </Card>

      {/* Player of the Week — compact 2×2 grid */}
      <Card>
        <h3 className="label-sm text-txt-primary mb-2">Player of the Week</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Conf Off', key: 'conferencePOW' },
            { label: 'Conf Def', key: 'confDefensePOW' },
            { label: 'Natl Off', key: 'nationalPOW' },
            { label: 'Natl Def', key: 'natlDefensePOW' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-[10px] uppercase tracking-wide text-txt-tertiary mb-1">{field.label}</label>
              <Select
                size="sm"
                value={formData[field.key]}
                onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
              >
                <option value="">None</option>
                {availablePlayers.map(player => (
                  <option key={player.pid} value={player.name}>
                    {player.name} ({player.position || 'N/A'})
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      </Card>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

      <Card>
        {(() => {
          // Resolve display names for the perspective slider labels.
          const t1Name = team1Name || team1Abbr || 'Team 1'
          const t2Name = team2Name || team2Abbr || 'Team 2'
          const perspectiveOptions = [
            { key: 'team1Fan',      label: `${t1Name} fan`,         blurb: `Blog-style, first-person plural ("we" / "our ${t1Name}"). Emotional. Pro-${t1Name}.` },
            { key: 'team1Reporter', label: `${t1Name} reporter`,     blurb: `Hometown beat writer for ${t1Name}. News-forward, third-person, but ${t1Name}-led framing.` },
            { key: 'neutral',       label: 'Neutral national media', blurb: 'ESPN.com beat writer. Inverted-pyramid news, balanced coverage of both teams.' },
            { key: 'team2Reporter', label: `${t2Name} reporter`,     blurb: `Hometown beat writer for ${t2Name}. News-forward, third-person, but ${t2Name}-led framing.` },
            { key: 'team2Fan',      label: `${t2Name} fan`,          blurb: `Blog-style, first-person plural ("we" / "our ${t2Name}"). Emotional. Pro-${t2Name}.` },
          ]
          const wordCount = (formData.aiRecap || '').trim().split(/\s+/).filter(Boolean).length
          // Pull recap text from the clipboard and set it on the form.
          // The big visible textarea is gone; this button is the primary
          // way users land text in the field (along with the expand-modal
          // editor for hand-edits).
          const handlePasteRecap = async () => {
            try {
              const text = await navigator.clipboard.readText()
              if (!text) {
                setRecapPasteFeedback('Clipboard is empty.')
                setTimeout(() => setRecapPasteFeedback(null), 2500)
                return
              }
              setFormData(prev => ({ ...prev, aiRecap: text }))
              setRecapPasteFeedback('Pasted.')
              setTimeout(() => setRecapPasteFeedback(null), 1800)
            } catch {
              setRecapPasteFeedback('Browser blocked clipboard. Open the editor and paste there.')
              setTimeout(() => setRecapPasteFeedback(null), 3500)
            }
          }
          return (
            <>
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* ⚙ | Copy AI Prompt — joined pair */}
                  <div className="flex items-stretch rounded-lg overflow-hidden" style={{ border: '1px solid var(--surface-5)' }}>
                    <button
                      type="button"
                      onClick={() => setShowRecapSettings(true)}
                      title="Recap perspective and length"
                      className="px-2.5 flex items-center justify-center transition-colors text-txt-secondary hover:text-txt-primary hover:bg-surface-3"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                    </button>
                    <div style={{ width: '1px', background: 'var(--surface-5)', flexShrink: 0 }} />
                    <button
                      type="button"
                      onClick={handleCopyPrompt}
                      disabled={!formData.team1Score || !formData.team2Score}
                      title="Copy the full prompt to paste into ChatGPT, Claude, or another AI"
                      className="px-3 py-1.5 text-sm font-semibold transition-colors text-txt-primary hover:bg-surface-3 disabled:opacity-40"
                      style={{ background: 'var(--surface-2)' }}
                    >
                      {promptCopied ? 'Copied!' : 'Copy AI Prompt'}
                    </button>
                  </div>

                  {/* Paste | ↗ — joined pair */}
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
                      onClick={() => setShowRecapEditModal(true)}
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
                </div>
              </div>
              {recapError && (
                <p className="text-sm mt-1" style={{ color: 'var(--accent-error)' }}>{recapError}</p>
              )}
              <RecapSettingsModal
                isOpen={showRecapSettings}
                onClose={() => setShowRecapSettings(false)}
                perspectiveOptions={perspectiveOptions}
                perspective={recapPerspective}
                onPerspectiveChange={setRecapPerspective}
                depth={recapDepth}
                onDepthChange={setRecapDepth}
              />
            </>
          )
        })()}
      </Card>

      {/* Photos — bulk upload to imgbb. Each picked file is uploaded
          in parallel; thumbnails are appended progressively (one by
          one as each upload settles) so the user sees forward progress
          instead of waiting on a static spinner for a long batch. The
          Game page surfaces these in a "Photos" tab gallery. */}
      {/* Photos — compact summary card. The actual upload area + thumbnail
          grid live in a modal so the editor page stays scannable. Click
          "Manage photos" to open the full UI. */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="label-sm text-txt-primary">Photos</h3>
            <p className="text-xs text-txt-tertiary mt-0.5 tabular-nums">
              {photoUploadCount > 0
                ? `Uploading ${photoUploadDone} of ${photoUploadCount}${photoUploadFailed > 0 ? ` · ${photoUploadFailed} failed` : ''}…`
                : `${formData.photos.length} ${formData.photos.length === 1 ? 'photo' : 'photos'} uploaded`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPhotosModal(true)}
          >
            Manage photos
          </Button>
        </div>
      </Card>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

      {/* Score Graphic — AI-generated final score image */}
      {(() => {
        // For existing games, wait until the game is loaded before generating
        // the prompt — live1/live2 use existingGame?.id to filter records by
        // week order; if it's undefined on first render, findIndex returns -1
        // and all season games count, producing the wrong record (e.g. 5-1
        // instead of 1-0 for a Week 1 game viewed in Week 6).
        const gameLoaded = !gameId || !!existingGame
        const hasScores = gameLoaded && formData.team1Score !== '' && formData.team2Score !== ''

        // Resolve which team leads the graphic. Auto-pick user's team;
        // fall back to team1 for CPU games.
        const autoSide = isTeam1UserTeam ? 'team1' : isTeam2UserTeam ? 'team2' : 'team1'
        const activeSide = graphicFeaturedSide ?? autoSide
        const featuredTeamNum = activeSide === 'neutral' ? 0 : activeSide === 'team2' ? 2 : 1

        const t1Colors = getTeamColors(team1Name)
        const t2Colors = getTeamColors(team2Name)

        // Pull records for the graphic prompt using the same logic as the Cast
        // view: getRecordAsOfGame counts all saved games up through this game's
        // week (inclusive), giving the correct post-game record regardless of
        // which week the user is currently on. For unsaved new games where
        // existingGame doesn't exist yet, fall back to the live-calculated value.
        const graphicRec1Obj = (existingGame && team1Tid)
          ? getRecordAsOfGame(currentDynasty, existingGame, team1Tid)
          : null
        const graphicRec2Obj = (existingGame && team2Tid)
          ? getRecordAsOfGame(currentDynasty, existingGame, team2Tid)
          : null
        const rec1 = graphicRec1Obj?.overall || live1?.record || ''
        const rec2 = graphicRec2Obj?.overall || live2?.record || ''

        // Pass screenshot count so the prompt can tell the AI to expect attachments
        const uploadedScreenshots = Array.isArray(formData.photos) ? formData.photos.filter(Boolean).length : 0

        // Derive home team number (1, 2, or null for neutral) from location field.
        // location='home' means team1 is home; 'away' means team2 is home.
        const homeTeamNum = formData.location === 'home' ? 1
                          : formData.location === 'away' ? 2
                          : null

        // Derive the game's classification (regular / bowl / CFP / CCG) so
        // the prompt can frame the postseason context. Prefer the live
        // edit state (computedWeekFlags) because the user may have just
        // changed the week dropdown; fall back to the saved gameType /
        // bowlName / conference on existingGame for previously-saved games
        // we're only viewing.
        const promptGameType   = computedWeekFlags?.gameType   || existingGame?.gameType   || 'regular'
        const promptBowlName   = computedWeekFlags?.bowlName   ?? existingGame?.bowlName   ?? null
        const promptConference = computedWeekFlags?.conference ?? existingGame?.conference ?? null
        // Trophy / rivalry games: look up by abbr pair. Returns null for
        // non-rivalries and for custom-team-builder pairs not in the registry.
        const promptRivalryName = getRivalryName(team1Abbr, team2Abbr)

        const prompt = hasScores ? buildScoreGraphicPrompt({
          team1Name,
          team1Score: formData.team1Score,
          team1Rank: formData.team1Rank || null,
          team1Record: rec1 || null,
          team1Colors: t1Colors || undefined,
          team2Name,
          team2Score: formData.team2Score,
          team2Rank: formData.team2Rank || null,
          team2Record: rec2 || null,
          team2Colors: t2Colors || undefined,
          gameLabel: gameTitle,
          year: gameYear,
          featuredTeam: featuredTeamNum,
          homeTeam: homeTeamNum,
          screenshotCount: uploadedScreenshots,
          gameType: promptGameType,
          bowlName: promptBowlName,
          conference: promptConference,
          rivalryName: promptRivalryName,
        }) : ''

        return (
          <Card>
            <h3 className="label-sm text-txt-primary mb-1">Score Graphic</h3>

            {!hasScores ? (
              <p className="text-xs text-txt-muted italic">Enter scores above to generate a prompt.</p>
            ) : (
              <div className="space-y-3">
                {/* Team selector */}
                <div>
                  <p className="label-xs text-txt-tertiary mb-1.5">Featured team</p>
                  <div className="flex gap-2">
                    {[
                      { side: 'team1', logo: team1Logo, name: team1Name },
                      { side: 'neutral', logo: null, name: 'Neutral' },
                      { side: 'team2', logo: team2Logo, name: team2Name },
                    ].map(({ side, logo, name }) => {
                      const isActive = activeSide === side
                      return (
                        <button
                          key={side}
                          type="button"
                          onClick={() => setGraphicFeaturedSide(side)}
                          className="flex-1 flex items-center justify-center py-1.5 rounded transition-colors"
                          style={{
                            backgroundColor: isActive ? 'var(--text-primary)' : 'var(--surface-3)',
                            color: isActive ? 'var(--surface-1)' : 'var(--text-secondary)',
                            border: '1px solid var(--surface-4)',
                            minHeight: '2rem',
                          }}
                        >
                          {logo
                            ? <img src={logo} alt={name} className="w-6 h-6 object-contain" />
                            : <span className="text-xs font-semibold">{name}</span>
                          }
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Copy prompt button — prompt text is hidden from the user;
                    they don't need to read it, just copy it into their image
                    generator. Hold the actual text in the closure above. */}
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

                {/* Upload result. When a graphic is set, the ImageUpload
                    component renders the image INSIDE the dropzone — click
                    it to re-open the file picker. No separate preview. */}
                <div>
                  <p className="label-xs text-txt-tertiary mb-2">Upload generated image</p>
                  <ImageUpload
                    value={formData.scoreGraphic}
                    onChange={(url) => setFormData(prev => ({ ...prev, scoreGraphic: url }))}
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
      })()}

        </div>
      </div>

      {/* Bottom Save/Cancel Buttons + Delete (only for existing games) */}
      <div className="flex items-center pb-4">
        {/* Delete sits on the LEFT, intentionally separated from Save/Cancel
            so it can't be hit by accident. Only shown for existing games — a
            new-game form has nothing to delete. */}
        {existingGame && !isViewOnly && (
          <Button
            variant="outline"
            onClick={handleDelete}
            className="text-red-400 border-red-700/40 hover:bg-red-900/20 hover:border-red-600"
          >
            Delete game
          </Button>
        )}
        <div className="ml-auto flex gap-3">
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button variant="primary" accentColor="#ffffff" onClick={handleSave} disabled={isSaving || photoUploadCount > 0}>
            {isSaving ? 'Saving…' : photoUploadCount > 0 ? 'Uploading…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Game ID — shown at very bottom for reference (e.g. Danger Zone tools) */}
      {(currentGameId || existingGame?.id) && (
        <p className="text-[10px] text-txt-tertiary text-center pb-6 select-all">
          Game ID: {currentGameId || existingGame?.id}
        </p>
      )}

      {/* Box Score Sheet Modal */}
      {showBoxScoreModal && currentGameId && (
        <BoxScoreSheetModal
          isOpen={showBoxScoreModal}
          onClose={() => setShowBoxScoreModal(false)}
          onSave={handleBoxScoreSave}
          onSheetCreated={handleSheetCreated}
          existingSheetId={getExistingSheetId()}
          sheetType={boxScoreModalType}
          targetTid={boxScoreModalTargetTid}
          game={existingGame ? {
            ...existingGame,
            // Override homeTeamTid with current form state if changed
            homeTeamTid: formData.location === 'home' ? team1Tid :
                         formData.location === 'away' ? team2Tid : null
          } : {
            id: currentGameId,
            team1Tid,
            team2Tid,
            team1: team1Abbr || getOriginalTeamAbbr(team1Tid) || 'Team 1',
            team2: team2Abbr || getOriginalTeamAbbr(team2Tid) || 'Team 2',
            year: gameYear,
            week: gameWeek,
            location: formData.location,
            homeTeamTid: formData.location === 'home' ? team1Tid :
                         formData.location === 'away' ? team2Tid : null
          }}
          teamColors={{ primary: 'var(--text-primary)', secondary: 'var(--text-secondary)' }}
        />
      )}

      {/* Recap Edit Modal — the big editing textarea lives here instead
          of inline on the page. The compact recap card has Copy / Paste
          / Settings buttons; this modal is for hand-editing the saved
          text. Writes to the same formData.aiRecap as everything else,
          so close → reopen → save flows preserve content. */}
      <Modal
        isOpen={showRecapEditModal}
        onClose={() => setShowRecapEditModal(false)}
        title="Edit Game Recap"
        size="xl"
      >
        <p className="text-xs text-txt-tertiary mb-3">
          Paste, edit, or write the game recap by hand. Changes are kept in memory until you save the game.
        </p>
        <Textarea
          value={formData.aiRecap}
          onChange={(e) => setFormData({ ...formData, aiRecap: e.target.value })}
          rows={18}
          placeholder="Paste the AI-generated recap here (or write your own)..."
          autoFocus
        />
        <div className="flex items-center justify-between mt-3 text-xs text-txt-tertiary">
          <span className="tabular-nums">
            {(formData.aiRecap || '').trim().split(/\s+/).filter(Boolean).length} words
          </span>
          <Button variant="primary" size="sm" onClick={() => setShowRecapEditModal(false)}>
            Done
          </Button>
        </div>
      </Modal>

      {/* Photos Modal — full upload + thumbnail UI lives here. Reads/
          writes the same formData.photos and photoUpload* state as the
          rest of the page, so closing/reopening preserves everything. */}
      <Modal
        isOpen={showPhotosModal}
        onClose={() => setShowPhotosModal(false)}
        title="Photos"
        size="xl"
        closeOnBackdrop={photoUploadCount === 0}
        closeOnEscape={photoUploadCount === 0}
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-xs text-txt-tertiary m-0">
            Upload one or many photos at once — each one is hosted on imgbb and shows up under the Photos tab on the game page.
          </p>
          <div className="flex items-center gap-2">
            <span className="label-xs text-txt-tertiary tabular-nums">
              {photoUploadCount > 0
                ? `${photoUploadDone} of ${photoUploadCount}${photoUploadFailed > 0 ? ` ${photoUploadFailed} failed` : ''}`
                : `${formData.photos.length} ${formData.photos.length === 1 ? 'photo' : 'photos'}`}
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

        <label
          className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer mb-3 transition-colors text-sm font-semibold overflow-hidden"
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
              style={{
                width: `${Math.round((photoUploadDone / photoUploadCount) * 100)}%`,
                backgroundColor: 'var(--text-primary)',
                opacity: 0.12,
              }}
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
                  {photoUploadFailed > 0 && ` ${photoUploadFailed} failed`}
                  …
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
              if (files.length === 0) return
              const controller = new AbortController()
              photoUploadAbortRef.current = controller
              setPhotoUploadCount(files.length)
              setPhotoUploadDone(0)
              setPhotoUploadFailed(0)
              try {
                const { urls, errors } = await uploadImagesToImgBB(files, {
                  signal: controller.signal,
                  onProgress: ({ done, ok, url }) => {
                    setPhotoUploadDone(done)
                    if (ok && url) {
                      setFormData(prev => ({ ...prev, photos: [...(prev.photos || []), url] }))
                    } else if (!ok) {
                      setPhotoUploadFailed(prev => prev + 1)
                    }
                  }
                })
                if (controller.signal.aborted) return
                if (errors.length > 0) {
                  setToastMessage(
                    urls.length > 0
                      ? `Uploaded ${urls.length}; ${errors.length} failed (${errors[0].error.message})`
                      : `Upload failed: ${errors[0].error.message}`
                  )
                  setShowToast(true)
                  setTimeout(() => setShowToast(false), 4000)
                } else if (urls.length > 0) {
                  setToastMessage(`Uploaded ${urls.length} photo${urls.length === 1 ? '' : 's'}`)
                  setShowToast(true)
                  setTimeout(() => setShowToast(false), 2000)
                }
              } finally {
                photoUploadAbortRef.current = null
                setPhotoUploadCount(0)
                setPhotoUploadDone(0)
                setPhotoUploadFailed(0)
              }
            }}
          />
        </label>

        {formData.photos.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {formData.photos.map((url, idx) => (
              <div
                key={`${url}-${idx}`}
                className="group relative aspect-square overflow-hidden rounded-md"
                style={{ backgroundColor: 'var(--surface-3)', border: '1px solid var(--surface-4)' }}
              >
                <img
                  src={url}
                  alt={`Game photo ${idx + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      photos: prev.photos.filter((_, i) => i !== idx),
                    }))
                  }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', color: '#f87171', border: '1px solid var(--surface-5)' }}
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-txt-tertiary italic text-center py-6">
            No photos uploaded yet.
          </p>
        )}
      </Modal>
    </div>
  )
}
