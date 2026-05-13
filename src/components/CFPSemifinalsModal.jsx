import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getGamesByType, GAME_TYPES } from '../context/DynastyContext'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo, stripMascotFromName } from '../data/teams'
import { getBowlLogo } from '../data/bowlGames'
import { TEAMS, getGameTeamInfo } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { useToast } from './ui/Toast'
import { DEFAULT_BOWL_CONFIG } from '../data/cfpConstants'

// Map abbreviations to mascot names for logo lookup
const mascotMap = {
  'AFA': 'Air Force Falcons', 'AKR': 'Akron Zips', 'APP': 'Appalachian State Mountaineers',
  'ARIZ': 'Arizona Wildcats', 'ARK': 'Arkansas Razorbacks', 'ARMY': 'Army Black Knights',
  'ARST': 'Arkansas State Red Wolves', 'ASU': 'Arizona State Sun Devils', 'AUB': 'Auburn Tigers',
  'BALL': 'Ball State Cardinals', 'BAMA': 'Alabama Crimson Tide', 'BC': 'Boston College Eagles',
  'BGSU': 'Bowling Green Falcons', 'BOIS': 'Boise State Broncos', 'BU': 'Baylor Bears',
  'BUFF': 'Buffalo Bulls', 'BYU': 'Brigham Young Cougars', 'CAL': 'California Golden Bears',
  'CCU': 'Coastal Carolina Chanticleers', 'CHAR': 'Charlotte 49ers', 'CLEM': 'Clemson Tigers',
  'CMU': 'Central Michigan Chippewas', 'COLO': 'Colorado Buffaloes', 'CONN': 'Connecticut Huskies',
  'CSU': 'Colorado State Rams', 'DUKE': 'Duke Blue Devils', 'ECU': 'East Carolina Pirates',
  'EMU': 'Eastern Michigan Eagles', 'FIU': 'Florida International Panthers', 'FSU': 'Florida State Seminoles',
  'FAU': 'Florida Atlantic Owls', 'FRES': 'Fresno State Bulldogs', 'UF': 'Florida Gators',
  'GASO': 'Georgia Southern Eagles', 'GAST': 'Georgia State Panthers', 'GT': 'Georgia Tech Yellow Jackets',
  'UGA': 'Georgia Bulldogs', 'HAW': 'Hawaii Rainbow Warriors', 'HOU': 'Houston Cougars',
  'ILL': 'Illinois Fighting Illini', 'IU': 'Indiana Hoosiers', 'IOWA': 'Iowa Hawkeyes',
  'ISU': 'Iowa State Cyclones', 'JKST': 'Jacksonville State Gamecocks', 'JMU': 'James Madison Dukes',
  'KU': 'Kansas Jayhawks', 'KSU': 'Kansas State Wildcats', 'KENT': 'Kent State Golden Flashes',
  'UK': 'Kentucky Wildcats', 'LIB': 'Liberty Flames', 'ULL': 'Lafayette Ragin\' Cajuns',
  'LT': 'Louisiana Tech Bulldogs', 'LOU': 'Louisville Cardinals', 'LSU': 'LSU Tigers',
  'UM': 'Miami Hurricanes', 'M-OH': 'Miami Redhawks', 'UMD': 'Maryland Terrapins',
  'MASS': 'Massachusetts Minutemen', 'MEM': 'Memphis Tigers', 'MICH': 'Michigan Wolverines',
  'MSU': 'Michigan State Spartans', 'MTSU': 'Middle Tennessee State Blue Raiders',
  'MINN': 'Minnesota Golden Gophers', 'MISS': 'Ole Miss Rebels', 'MSST': 'Mississippi State Bulldogs',
  'MZST': 'Missouri State Bears', 'MRSH': 'Marshall Thundering Herd', 'NAVY': 'Navy Midshipmen',
  'NEB': 'Nebraska Cornhuskers', 'NEV': 'Nevada Wolf Pack', 'UNM': 'New Mexico Lobos',
  'NMSU': 'New Mexico State Aggies', 'UNC': 'North Carolina Tar Heels', 'NCST': 'North Carolina State Wolfpack',
  'UNT': 'North Texas Mean Green', 'NU': 'Northwestern Wildcats', 'ND': 'Notre Dame Fighting Irish',
  'NIU': 'Northern Illinois Huskies', 'OHIO': 'Ohio Bobcats', 'OSU': 'Ohio State Buckeyes',
  'OKLA': 'Oklahoma Sooners', 'OKST': 'Oklahoma State Cowboys', 'ODU': 'Old Dominion Monarchs',
  'ORE': 'Oregon Ducks', 'ORST': 'Oregon State Beavers', 'PSU': 'Penn State Nittany Lions',
  'PITT': 'Pittsburgh Panthers', 'PUR': 'Purdue Boilermakers', 'RICE': 'Rice Owls',
  'RUT': 'Rutgers Scarlet Knights', 'SDSU': 'San Diego State Aztecs', 'SJSU': 'San Jose State Spartans',
  'SAM': 'Sam Houston State Bearkats', 'USF': 'South Florida Bulls', 'SMU': 'SMU Mustangs',
  'USC': 'USC Trojans', 'SCAR': 'South Carolina Gamecocks', 'STAN': 'Stanford Cardinal',
  'SYR': 'Syracuse Orange', 'TCU': 'TCU Horned Frogs', 'TEM': 'Temple Owls',
  'TENN': 'Tennessee Volunteers', 'TEX': 'Texas Longhorns', 'TAMU': 'Texas A&M Aggies', 'TXAM': 'Texas A&M Aggies',
  'TXST': 'Texas State Bobcats', 'TXTECH': 'Texas Tech Red Raiders', 'TOL': 'Toledo Rockets',
  'TROY': 'Troy Trojans', 'TUL': 'Tulane Green Wave', 'TLSA': 'Tulsa Golden Hurricane',
  'UAB': 'UAB Blazers', 'UCF': 'UCF Knights', 'UCLA': 'UCLA Bruins', 'UNLV': 'UNLV Rebels',
  'UTEP': 'UTEP Miners', 'USA': 'South Alabama Jaguars', 'USU': 'Utah State Aggies',
  'UTAH': 'Utah Utes', 'UTSA': 'UTSA Roadrunners', 'VAN': 'Vanderbilt Commodores',
  'UVA': 'Virginia Cavaliers', 'VT': 'Virginia Tech Hokies', 'WAKE': 'Wake Forest Demon Deacons',
  'WASH': 'Washington Huskies', 'WSU': 'Washington State Cougars', 'WVU': 'West Virginia Mountaineers',
  'WMU': 'Western Michigan Broncos', 'WKU': 'Western Kentucky Hilltoppers', 'WIS': 'Wisconsin Badgers',
  'WYO': 'Wyoming Cowboys', 'DEL': 'Delaware Fightin\' Blue Hens', 'FLA': 'Florida Gators',
  'KENN': 'Kennesaw State Owls', 'ULM': 'Monroe Warhawks', 'UC': 'Cincinnati Bearcats',
  'MIA': 'Miami Hurricanes', 'MIZ': 'Missouri Tigers', 'OU': 'Oklahoma Sooners', 'GSU': 'Georgia State Panthers',
  'USM': 'Southern Mississippi Golden Eagles', 'RUTG': 'Rutgers Scarlet Knights', 'SHSU': 'Sam Houston State Bearkats',
  'TTU': 'Texas Tech Red Raiders', 'TULN': 'Tulane Green Wave', 'UH': 'Houston Cougars',
  'UL': 'Lafayette Ragin\' Cajuns', 'UT': 'Tennessee Volunteers',
  // FCS teams
  'FCSE': 'FCS East Judicials', 'FCSM': 'FCS Midwest Rebels',
  'FCSN': 'FCS Northwest Stallions', 'FCSW': 'FCS West Titans'
}

// Semifinal structure - USE SLOT IDs for QF lookup (bowl names are configurable!)
// SF1 (cfpsf1): cfpqf1 winner vs cfpqf2 winner (1/4 bracket side)
// SF2 (cfpsf2): cfpqf3 winner vs cfpqf4 winner (2/3 bracket side)
// Bowl names come from user's config (sf1 and sf2 keys), not hardcoded
const SEMIFINAL_STRUCTURE = [
  {
    id: 'sf1',
    slotId: 'cfpsf1',
    configKey: 'sf1',
    defaultBowlName: 'Peach Bowl',
    qfSlot1: 'cfpqf1', // #1 seed's QF
    qfSlot2: 'cfpqf2'  // #4 seed's QF
  },
  {
    id: 'sf2',
    slotId: 'cfpsf2',
    configKey: 'sf2',
    defaultBowlName: 'Fiesta Bowl',
    qfSlot1: 'cfpqf3', // #3 seed's QF
    qfSlot2: 'cfpqf4'  // #2 seed's QF
  }
]

export default function CFPSemifinalsModal({ isOpen, onClose, onSave, currentYear, teamColors, userTeamAbbr }) {
  const { currentDynasty } = useDynasty()
  const { toast } = useToast()
  const [games, setGames] = useState([])
  const [saving, setSaving] = useState(false)
  const [userGameIndex, setUserGameIndex] = useState(-1) // Index of user's game (if any)
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])

  // Bowl host assignments are entered upstream in the Bowl Week 2 Results
  // modal (during Bowl Week 3). Read-only here.
  const bowlConfig = useMemo(() => {
    const saved = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
    return {
      sf1: saved.sf1 || DEFAULT_BOWL_CONFIG.sf1,
      sf2: saved.sf2 || DEFAULT_BOWL_CONFIG.sf2,
    }
  }, [currentYear, currentDynasty?.cfpBowlConfigByYear])

  // Get seed by tid
  const getSeedByTid = (tid) => {
    const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
    const seedEntry = cfpSeeds.find(s => s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get team info for display (accepts tid or abbr for backward compatibility)
  const getTeamInfoByTid = (tid) => {
    if (!tid) return null
    const teams = currentDynasty?.teams || TEAMS
    const teamData = getGameTeamInfo(teams, tid)
    if (!teamData) return null

    const abbr = teamData.abbr
    const mascotName = mascotMap[abbr] || teamData.name
    const logo = teamData.logo || (mascotName ? getTeamLogo(mascotName, teams) : null)

    // Extract just the school name (remove mascot suffix). Delegates
    // to the shared helper so the known-mascot list stays in one place.
    const getSchoolName = (fullName) => stripMascotFromName(fullName) || abbr

    return {
      abbr,
      tid,
      name: getSchoolName(mascotName) || teamData?.name || abbr,
      fullMascot: mascotName,
      backgroundColor: teamData?.primaryColor || teamAbbreviations[abbr]?.backgroundColor || '#4B5563',
      textColor: teamData?.secondaryColor || teamAbbreviations[abbr]?.textColor || '#FFFFFF',
      logo,
      seed: getSeedByTid(tid)
    }
  }

  // Initialize games with auto-filled teams from quarterfinal results
  useEffect(() => {
    if (isOpen) {
      // Read from games[] array (unified source of truth)
      const qfResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_QUARTERFINAL, currentYear)
      const existingSemis = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentYear)

      // ALSO look for any QF games from all games that have scores (might not be in shells)
      const allGames = currentDynasty?.games || []
      const allQFGamesWithScores = allGames.filter(g =>
        g && Number(g.year) === Number(currentYear) &&
        (g.isCFPQuarterfinal || g.gameType === 'cfp_quarterfinal' || (g.week === 'Bowl 2' && g.cfpSlot?.startsWith('cfpqf'))) &&
        g.team1Score !== undefined && g.team1Score !== null && g.team1Score !== ''
      )
      console.log('[CFPSemifinalsModal] All QF games with scores:', allQFGamesWithScores.map(g => ({
        id: g.id, cfpSlot: g.cfpSlot, team1Tid: g.team1Tid, team2Tid: g.team2Tid, team1Score: g.team1Score, team2Score: g.team2Score
      })))

      // Merge: prefer games with scores
      const qfResultsEnhanced = [...qfResults]
      allQFGamesWithScores.forEach(g => {
        if (!qfResultsEnhanced.find(r => r.id === g.id)) {
          qfResultsEnhanced.push(g)
        }
      })

      // Get bowl configuration for correct bowl names
      const bowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}

      // Fallback to cfpResultsByYear for backwards compatibility with old data
      const legacyQFResults = currentDynasty?.cfpResultsByYear?.[currentYear]?.quarterfinals || []
      const legacySemis = currentDynasty?.cfpResultsByYear?.[currentYear]?.semifinals || []

      // Find user's CFP Semifinal game from games[] (unified format has team1Score)
      // Get user tid for tid-based lookup
      const userTid = currentDynasty?.currentTid
      const userSFGame = existingSemis.find(g =>
        // Prefer tid-based match for teambuilder support
        (userTid && (g.userTid === userTid || g.team1Tid === userTid || g.team2Tid === userTid)) ||
        // Fallback to abbr for legacy data
        g.userTeam === userTeamAbbr
      ) ||
        currentDynasty?.games?.find(g => {
          if (Number(g.year) !== Number(currentYear)) return false
          if (g.teamScore === undefined || g.teamScore === null || g.teamScore === '') return false
          // Check if it's a CFP semifinal
          if (g.isCFPSemifinal) return true
          return false
        })

      // Helper to get winner from a game (handles both legacy and unified formats)
      const teams = currentDynasty?.teams || TEAMS
      const getGameWinner = (game) => {
        if (!game) return ''
        // Try winner field first
        if (game.winner) return game.winner
        // Derive from winnerTid for unified format
        if (game.winnerTid) {
          const winnerInfo = getGameTeamInfo(teams, game.winnerTid)
          return winnerInfo?.abbr || ''
        }
        // Fallback: compute from scores - MUST have actual score values (not null/undefined/'')
        const score1 = game.team1Score
        const score2 = game.team2Score
        const hasValidScores = score1 !== undefined && score1 !== null && score1 !== '' &&
                               score2 !== undefined && score2 !== null && score2 !== ''
        if (hasValidScores) {
          const t1Info = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid) : null
          const t2Info = game.team2Tid ? getGameTeamInfo(teams, game.team2Tid) : null
          const t1 = t1Info?.abbr || game.team1 || ''
          const t2 = t2Info?.abbr || game.team2 || ''
          const winner = Number(score1) > Number(score2) ? t1 : t2
          console.log(`[getGameWinner] ${game.id}: t1Tid=${game.team1Tid}→${t1}, t2Tid=${game.team2Tid}→${t2}, scores=${score1}-${score2}, winner=${winner}`)
          return winner
        }
        // No valid scores - return empty (TBD)
        console.log(`[getGameWinner] ${game.id}: No valid scores (team1Score=${score1}, team2Score=${score2}), returning empty`)
        return ''
      }

      // Helper to get team abbreviation from a game
      const getTeamAbbr = (game, isTeam1) => {
        if (!game) return ''
        const tidField = isTeam1 ? 'team1Tid' : 'team2Tid'
        const legacyField = isTeam1 ? 'team1' : 'team2'
        if (game[tidField]) {
          const teamInfo = getGameTeamInfo(teams, game[tidField])
          return teamInfo?.abbr || game[legacyField] || ''
        }
        return game[legacyField] || ''
      }

      // Map QF slots to bye seeds for reliable lookup
      const qfSlotToByeSeed = { cfpqf1: 1, cfpqf2: 4, cfpqf3: 3, cfpqf4: 2 }
      const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []

      // BULLETPROOF: Find QF game by slot ID - cfpSlot or game ID is the ONLY reliable identifier
      // Bowl names are NOT used for lookups - they're only for display
      const findQFGameBySlot = (slotId) => {
        const byeSeed = qfSlotToByeSeed[slotId]

        // PRIMARY: Look for a game with this cfpSlot that HAS scores
        const bySlotWithScores = qfResultsEnhanced.find(g => g && g.cfpSlot === slotId &&
          g.team1Score !== undefined && g.team1Score !== null && g.team1Score !== '')
        if (bySlotWithScores) {
          console.log(`[findQFGameBySlot] ${slotId}: Found by cfpSlot WITH scores`, {
            gameId: bySlotWithScores.id, team1Score: bySlotWithScores.team1Score, team2Score: bySlotWithScores.team2Score
          })
          return bySlotWithScores
        }

        // SECONDARY: Look for game by expected ID pattern (e.g., cfpqf1-2029)
        const expectedGameId = `${slotId}-${currentYear}`
        const byIdWithScores = qfResultsEnhanced.find(g => g && g.id === expectedGameId &&
          g.team1Score !== undefined && g.team1Score !== null && g.team1Score !== '')
        if (byIdWithScores) {
          console.log(`[findQFGameBySlot] ${slotId}: Found by game ID ${expectedGameId} WITH scores`)
          return byIdWithScores
        }

        // TERTIARY: Find by bye seed team - ONLY check team1Tid (bye seed should be in team1 position)
        if (byeSeed) {
          const byeSeedEntry = cfpSeeds.find(s => s.seed === byeSeed)
          if (byeSeedEntry?.tid) {
            // Look for QF game where bye seed team is in team1 position (correct structure)
            const withScores = qfResultsEnhanced.find(g => {
              if (!g || g.team1Score === undefined || g.team1Score === null || g.team1Score === '') return false
              // Bye seed should be team1Tid in QF games
              return g.team1Tid === byeSeedEntry.tid
            })
            if (withScores) {
              console.log(`[findQFGameBySlot] ${slotId}: Found by bye seed ${byeSeed} (tid=${byeSeedEntry.tid}) WITH scores`, {
                gameId: withScores.id
              })
              return withScores
            }
          }
        }

        // FALLBACK: Look for shell without scores (for display purposes)
        const bySlot = qfResultsEnhanced.find(g => g && g.cfpSlot === slotId)
        if (bySlot) {
          console.log(`[findQFGameBySlot] ${slotId}: Found shell by cfpSlot (no scores)`, { gameId: bySlot.id })
          return bySlot
        }

        // Also check by game ID pattern for shells
        const byId = qfResultsEnhanced.find(g => g && g.id === expectedGameId)
        if (byId) {
          console.log(`[findQFGameBySlot] ${slotId}: Found shell by game ID (no scores)`, { gameId: byId.id })
          return byId
        }

        console.log(`[findQFGameBySlot] ${slotId}: No game found!`)
        return null
      }

      // Log QF results in readable format
      console.log('[CFPSemifinalsModal] QF Results (enhanced):')
      qfResultsEnhanced.forEach((g, i) => {
        console.log(`  QF[${i}]: id=${g?.id}, cfpSlot=${g?.cfpSlot}, bowl=${g?.bowlName}, t1=${g?.team1Tid}(${g?.team1}), t2=${g?.team2Tid}(${g?.team2}), scores=${g?.team1Score}-${g?.team2Score}, winner=${g?.winner}`)
      })
      console.log('[CFPSemifinalsModal] CFP Seeds (bye seeds 1-4):')
      cfpSeeds.filter(s => s.seed <= 4).forEach(s => {
        console.log(`  Seed ${s.seed}: ${s.team} (tid=${s.tid})`)
      })
      console.log('[CFPSemifinalsModal] Existing Semis:', existingSemis.map(g => ({
        id: g?.id, cfpSlot: g?.cfpSlot, bowlName: g?.bowlName,
        team1Tid: g?.team1Tid, team2Tid: g?.team2Tid
      })))

      const initialGames = SEMIFINAL_STRUCTURE.map((sf, index) => {
        // Get bowl name from user's config, fallback to default
        const bowlName = bowlConfig[sf.configKey] || sf.defaultBowlName

        // CRITICAL: Find QF games by SLOT ID using bye seed matching
        // This ensures we get the correct game regardless of bowl configuration
        const qf1 = findQFGameBySlot(sf.qfSlot1)
        const qf2 = findQFGameBySlot(sf.qfSlot2)

        console.log(`[CFPSemifinalsModal] ${sf.id} (${bowlName}):`, {
          qfSlot1: sf.qfSlot1, qfSlot2: sf.qfSlot2,
          qf1: qf1 ? { id: qf1.id, cfpSlot: qf1.cfpSlot, team1Tid: qf1.team1Tid, team2Tid: qf1.team2Tid, winner: qf1.winner } : null,
          qf2: qf2 ? { id: qf2.id, cfpSlot: qf2.cfpSlot, team1Tid: qf2.team1Tid, team2Tid: qf2.team2Tid, winner: qf2.winner } : null
        })

        // Check if we have existing semifinal data - try by slot first, then bowl name
        const existing = existingSemis.find(g => g && g.cfpSlot === sf.slotId) ||
                         existingSemis.find(g => g && g.bowlName === bowlName) ||
                         legacySemis.find(g => g && g.bowlName === bowlName)

        // Get teams from QF winners, with fallbacks to SF shell data
        const qf1Winner = getGameWinner(qf1)
        const qf2Winner = getGameWinner(qf2)

        // Get winner TIDs from QF games (for rendering)
        const getQFWinnerTid = (qfGame) => {
          if (!qfGame) return null
          if (qfGame.winnerTid) return qfGame.winnerTid
          // Compute from scores
          if (qfGame.team1Score !== undefined && qfGame.team2Score !== undefined) {
            return Number(qfGame.team1Score) > Number(qfGame.team2Score) ? qfGame.team1Tid : qfGame.team2Tid
          }
          return null
        }

        let team1 = qf1Winner
        let team2 = qf2Winner
        let team1Tid = getQFWinnerTid(qf1)
        let team2Tid = getQFWinnerTid(qf2)

        // Fallback 1: If no QF winners, check existing SF shell's team tids (from propagation)
        if (!team1Tid && existing?.team1Tid) {
          team1Tid = existing.team1Tid
          const t1Info = getGameTeamInfo(teams, team1Tid)
          team1 = t1Info?.abbr || ''
          console.log(`[CFPSemifinalsModal] ${sf.id} team1 from shell tid:`, team1Tid, '→', team1)
        }
        if (!team2Tid && existing?.team2Tid) {
          team2Tid = existing.team2Tid
          const t2Info = getGameTeamInfo(teams, team2Tid)
          team2 = t2Info?.abbr || ''
          console.log(`[CFPSemifinalsModal] ${sf.id} team2 from shell tid:`, team2Tid, '→', team2)
        }

        // Fallback 2: Check legacy abbr fields on existing shell
        if (!team1 && existing) team1 = getTeamAbbr(existing, true)
        if (!team2 && existing) team2 = getTeamAbbr(existing, false)

        console.log(`[CFPSemifinalsModal] ${sf.id} teams:`, { qf1Winner, qf2Winner, team1, team2, team1Tid, team2Tid })

        // Check if user's team is in this game. Tid-first so a renamed
        // teambuilder team is still classified as the user's game even
        // when the abbr displayed in this slot has drifted.
        const userTidNum = userTid != null ? Number(userTid) : null
        const userInThisGame = (
          (userTidNum != null && (Number(team1Tid) === userTidNum || Number(team2Tid) === userTidNum)) ||
          (userTeamAbbr && (team1 === userTeamAbbr || team2 === userTeamAbbr))
        )

        // If user is in this game
        if (userInThisGame) {
          // Tid wins, then abbr fallback. team1Tid/team2Tid are the
          // canonical identifiers for this slot.
          const userIsTeam1 = (userTidNum != null && Number(team1Tid) === userTidNum)
            ? true
            : (userTidNum != null && Number(team2Tid) === userTidNum)
              ? false
              : (team1 === userTeamAbbr)

          // PRIORITY: Check user's game from games[] array (source of truth)
          // Handle both unified format (team1Score) and legacy format (teamScore)
          if (userSFGame) {
            let userScore, oppScore
            if (userSFGame.team1Score !== undefined && userSFGame.team1Score !== '') {
              // Unified format. Prefer tid match for which side is the user;
              // abbr match only when tids aren't both available.
              const sfT1Tid = userSFGame.team1Tid != null ? Number(userSFGame.team1Tid) : null
              const sfT2Tid = userSFGame.team2Tid != null ? Number(userSFGame.team2Tid) : null
              const userIsSFTeam1 = (userTidNum != null && sfT1Tid === userTidNum)
                ? true
                : (userTidNum != null && sfT2Tid === userTidNum)
                  ? false
                  : (userSFGame.userTeam === userSFGame.team1)
              userScore = userIsSFTeam1 ? userSFGame.team1Score : userSFGame.team2Score
              oppScore = userIsSFTeam1 ? userSFGame.team2Score : userSFGame.team1Score
            } else if (userSFGame.teamScore !== undefined && userSFGame.teamScore !== '') {
              // Legacy format - scores are in teamScore/opponentScore
              userScore = userSFGame.teamScore
              oppScore = userSFGame.opponentScore
            }

            if (userScore !== undefined) {
              return {
                id: sf.id,
                bowlName,
                slotId: sf.slotId,
                team1,
                team2,
                team1Tid,
                team2Tid,
                team1Score: userIsTeam1 ? userScore : oppScore,
                team2Score: userIsTeam1 ? oppScore : userScore,
                userGame: true // Flag to indicate this is user's game - NOT EDITABLE
              }
            }
          }

          // Fallback: Check existing semifinal data from games[] or cfpResultsByYear
          const hasExistingScores = existing?.team1Score !== undefined && existing?.team1Score !== '' &&
                                    existing?.team2Score !== undefined && existing?.team2Score !== ''
          if (hasExistingScores) {
            return {
              id: sf.id,
              bowlName,
              slotId: sf.slotId,
              team1,
              team2,
              team1Tid,
              team2Tid,
              team1Score: existing.team1Score,
              team2Score: existing.team2Score,
              userGame: true
            }
          }

          // User's game exists but not yet entered
          return {
            id: sf.id,
            bowlName,
            slotId: sf.slotId,
            team1,
            team2,
            team1Tid,
            team2Tid,
            team1Score: '',
            team2Score: '',
            userGame: true,
            userGamePending: true
          }
        }

        // CPU vs CPU game - use existing data or empty
        return {
          id: sf.id,
          bowlName,
          slotId: sf.slotId,
          team1,
          team2,
          team1Tid,  // Include tid for rendering
          team2Tid,  // Include tid for rendering
          team1Score: existing?.team1Score ?? '',
          team2Score: existing?.team2Score ?? ''
        }
      })

      // Track which game index is the user's
      const userIdx = initialGames.findIndex(g => g.userGame)
      setUserGameIndex(userIdx)

      setGames(initialGames)
    }
  }, [isOpen, currentYear, currentDynasty, userTeamAbbr])

  const handleScoreChange = (gameIndex, field, value) => {
    const updatedGames = [...games]
    updatedGames[gameIndex] = {
      ...updatedGames[gameIndex],
      [field]: value
    }
    setGames(updatedGames)
  }

  const handleSave = async () => {
    // Check if user's game is pending (not yet played)
    const userPendingGame = games.find(g => g.userGame && g.userGamePending)
    if (userPendingGame) {
      toast.error('Please play and enter your semifinal game first before saving results.')
      return
    }

    // Validate all games have scores
    const allComplete = games.every(g =>
      g.team1 && g.team2 && g.team1Score !== '' && g.team2Score !== ''
    )

    if (!allComplete) {
      toast.error('Please enter scores for all games')
      return
    }

    setSaving(true)
    try {
      const processedGames = games.map(game => ({
        ...game,
        team1Score: parseInt(game.team1Score),
        team2Score: parseInt(game.team2Score),
        winner: parseInt(game.team1Score) > parseInt(game.team2Score) ? game.team1 : game.team2,
        seed1: getSeedByTid(game.team1Tid),
        seed2: getSeedByTid(game.team2Tid),
      }))

      await onSave(processedGames)
      onClose()
    } catch (error) {
      console.error('Error saving CFP Semifinals results:', error)
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Neutral CFP gold — this modal isn't about any one team, so we don't tint
  // it with the user's primary color. Team cards below still use real team
  // colors for their left rails (those ARE about the teams).
  const accent = '#c9a227'

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="w-full max-w-3xl card-elevated flex flex-col max-h-[90dvh] overflow-hidden modal-panel-in"
        role="dialog"
        aria-modal="true"
        aria-label="CFP Semifinals"
      >
        {/* Thin team-primary accent stripe */}
        <div
          className="h-[3px] w-full flex-shrink-0"
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />

        {/* Header */}
        <header className="px-5 sm:px-6 py-4 sm:py-5 border-b border-surface-4 flex items-start justify-between flex-shrink-0">
          <div>
            <div
              className="text-txt-tertiary"
              style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600 }}
            >
              {currentYear} College Football Playoff
            </div>
            <h2 className="font-display text-txt-primary m-0 mt-1" style={{ fontSize: 'clamp(1.25rem, 3vw, 1.75rem)', fontWeight: 900, letterSpacing: '-0.02em' }}>
              Semifinals
            </h2>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="p-1.5 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Games */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5 stagger-reveal">
          {games.map((game, index) => {
            const team1Info = getTeamInfoByTid(game.team1Tid)
            const team2Info = getTeamInfoByTid(game.team2Tid)
            const sfStruct = SEMIFINAL_STRUCTURE.find(s => s.id === game.id || s.slotId === game.cfpSlot)
            const configKey = sfStruct?.configKey
            const selectedBowl = configKey
              ? (bowlConfig[configKey] || DEFAULT_BOWL_CONFIG[configKey])
              : game.bowlName
            const bowlLogo = getBowlLogo(selectedBowl)

            return (
              <div
                key={game.id}
                className="rounded-lg overflow-hidden border border-surface-4 bg-surface-2"
              >
                {/* Bowl row */}
                <div className="px-4 py-3 flex items-center gap-3 border-b border-surface-4 bg-surface-3">
                  {bowlLogo && (
                    <div className="w-8 h-8 bg-white rounded p-1 flex items-center justify-center flex-shrink-0">
                      <img src={bowlLogo} alt={selectedBowl} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-txt-tertiary"
                      style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600 }}
                    >
                      Semifinal
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-txt-primary truncate">
                      {selectedBowl}
                    </h3>
                  </div>
                  {game.userGame && (
                    <span
                      className="px-2.5 py-1 rounded border"
                      style={{
                        fontSize: '9px',
                        letterSpacing: '2px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: game.userGamePending ? '#fbbf24' : accent,
                        borderColor: game.userGamePending ? 'rgba(251, 191, 36, 0.4)' : accent,
                        backgroundColor: game.userGamePending ? 'rgba(251, 191, 36, 0.08)' : 'transparent',
                      }}
                    >
                      {game.userGamePending ? 'Pending' : 'Your Game'}
                    </span>
                  )}
                </div>

                {/* Teams + Scores */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-stretch gap-3 sm:gap-4">
                    {/* Team 1 */}
                    <TeamCard info={team1Info} side="left" qfLabel={game.qfBowl1} />

                    {/* Scores (desktop) */}
                    <div className="hidden sm:flex items-center justify-center gap-3 px-1 min-w-[180px]">
                      {game.userGame && game.userGamePending ? (
                        <div className="text-center px-3 py-2 rounded border border-amber-500/40 bg-amber-500/5">
                          <div
                            className="text-amber-400"
                            style={{ fontSize: '9px', letterSpacing: '2px', fontWeight: 700, textTransform: 'uppercase' }}
                          >
                            Enter via Game Entry
                          </div>
                          <div className="text-xs text-txt-tertiary mt-1">Play this game first</div>
                        </div>
                      ) : game.userGame ? (
                        <>
                          <ScoreDisplay value={game.team1Score} />
                          <Dash />
                          <ScoreDisplay value={game.team2Score} />
                        </>
                      ) : (
                        <>
                          <ScoreInput
                            value={game.team1Score}
                            onChange={(v) => handleScoreChange(index, 'team1Score', v)}
                            disabled={!game.team1}
                            accent={accent}
                          />
                          <Dash />
                          <ScoreInput
                            value={game.team2Score}
                            onChange={(v) => handleScoreChange(index, 'team2Score', v)}
                            disabled={!game.team2}
                            accent={accent}
                          />
                        </>
                      )}
                    </div>

                    {/* Team 2 */}
                    <TeamCard info={team2Info} side="right" qfLabel={game.qfBowl2} />
                  </div>

                  {/* Mobile score entry */}
                  {!game.userGame && (
                    <div className="flex sm:hidden items-center justify-center gap-3 mt-4">
                      <ScoreInput
                        value={game.team1Score}
                        onChange={(v) => handleScoreChange(index, 'team1Score', v)}
                        disabled={!game.team1}
                        accent={accent}
                        small
                      />
                      <Dash />
                      <ScoreInput
                        value={game.team2Score}
                        onChange={(v) => handleScoreChange(index, 'team2Score', v)}
                        disabled={!game.team2}
                        accent={accent}
                        small
                      />
                    </div>
                  )}
                  {game.userGame && !game.userGamePending && (
                    <div className="flex sm:hidden items-center justify-center gap-3 mt-4">
                      <ScoreDisplay value={game.team1Score} small />
                      <Dash />
                      <ScoreDisplay value={game.team2Score} small />
                    </div>
                  )}
                  {game.userGame && game.userGamePending && (
                    <div className="flex sm:hidden justify-center mt-3">
                      <div className="px-3 py-2 rounded border border-amber-500/40 bg-amber-500/5">
                        <div
                          className="text-amber-400"
                          style={{ fontSize: '9px', letterSpacing: '2px', fontWeight: 700, textTransform: 'uppercase' }}
                        >
                          Enter via Game Entry
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <footer className="px-5 sm:px-6 py-4 border-t border-surface-4 flex items-center justify-end gap-3 flex-shrink-0 bg-surface-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-semibold text-txt-secondary hover:text-txt-primary hover:bg-surface-3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || games.some(g => !g.team1 || !g.team2)}
            className="px-5 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-40"
            style={{
              backgroundColor: accent,
              color: '#0b0b10',
            }}
          >
            {saving ? 'Saving…' : 'Save Results'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

// --- Local presentational helpers ---

function TeamCard({ info, side, qfLabel }) {
  const accent = info?.backgroundColor || 'var(--text-primary)'
  const reverse = side === 'right'
  if (!info) {
    return (
      <div className="sm:flex-1 rounded-md border border-dashed border-surface-4 bg-surface-3 px-3 py-4 flex flex-col items-center justify-center text-center">
        <span className="font-display text-base font-bold text-txt-tertiary tracking-tight">TBD</span>
        <p
          className="mt-1 text-txt-muted"
          style={{ fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600 }}
        >
          Awaiting {qfLabel || 'QF'} result
        </p>
      </div>
    )
  }
  return (
    <div
      className={`sm:flex-1 relative rounded-md bg-surface-3 border border-surface-4 overflow-hidden flex items-center gap-3 px-3 py-3 ${reverse ? 'sm:flex-row-reverse sm:text-right' : ''}`}
    >
      <div
        className={`absolute top-0 ${reverse ? 'right-0' : 'left-0'} bottom-0 w-[3px]`}
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />
      {info.logo && (
        <div className="w-11 h-11 sm:w-12 sm:h-12 bg-white rounded-full p-1 flex items-center justify-center flex-shrink-0">
          <img src={info.logo} alt={info.fullMascot} className="w-full h-full object-contain" />
        </div>
      )}
      <div className={`flex-1 min-w-0 ${reverse ? 'sm:text-right' : ''}`}>
        <div
          className="text-txt-tertiary"
          style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}
        >
          #{info.seed || '–'} Seed
        </div>
        <div className="font-display font-bold text-txt-primary text-base sm:text-lg truncate leading-tight">
          {info.name}
        </div>
      </div>
    </div>
  )
}

function ScoreInput({ value, onChange, disabled, accent, small }) {
  const size = small ? 'w-14 h-12 text-xl' : 'w-16 h-16 text-2xl'
  return (
    <input
      type="number"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="0"
      className={`${size} text-center font-display font-black rounded-md bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:ring-2 transition-all disabled:opacity-30`}
      style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        '--tw-ring-color': accent,
      }}
    />
  )
}

function ScoreDisplay({ value, small }) {
  const size = small ? 'w-14 h-12 text-xl' : 'w-16 h-16 text-2xl'
  return (
    <div
      className={`${size} flex items-center justify-center font-display font-black rounded-md bg-surface-3 border border-surface-4 text-txt-primary`}
      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
    >
      {value !== '' && value !== null && value !== undefined ? value : '–'}
    </div>
  )
}

function Dash() {
  return <div className="text-txt-tertiary text-lg font-light px-1 select-none">–</div>
}
