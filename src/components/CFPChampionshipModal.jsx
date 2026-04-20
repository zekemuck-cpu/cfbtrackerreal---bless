import { useState, useEffect, useMemo } from 'react'
import { useDynasty, getGamesByType, GAME_TYPES } from '../context/DynastyContext'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo } from '../data/teams'
import { TEAMS, getGameTeamInfo } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'

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

const TROPHY_URL = 'https://i.imgur.com/3goz1NK.png'

export default function CFPChampionshipModal({ isOpen, onClose, onSave, currentYear, teamColors }) {
  const { currentDynasty } = useDynasty()
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors])
  const [game, setGame] = useState({
    id: 'championship',
    bowlName: 'National Championship',
    team1: '',
    team2: '',
    team1Score: '',
    team2Score: ''
  })
  const [saving, setSaving] = useState(false)

  // Get seed by tid
  const getSeedByTid = (tid) => {
    const cfpSeeds = currentDynasty?.cfpSeedsByYear?.[currentYear] || []
    const seedEntry = cfpSeeds.find(s => s.tid === tid)
    return seedEntry?.seed || null
  }

  // Get team info for display by tid
  const teams = currentDynasty?.teams || TEAMS
  const getTeamInfoByTid = (tid) => {
    if (!tid) return null
    const teamData = getGameTeamInfo(teams, tid)
    if (!teamData) return null
    const abbr = teamData.abbr
    const mascotName = mascotMap[abbr] || teamData.name
    const logo = teamData.logo || (mascotName ? getTeamLogo(mascotName, teams) : null)
    return {
      abbr,
      tid,
      name: teamData?.name || abbr,
      fullMascot: mascotName,
      backgroundColor: teamData?.primaryColor || teamAbbreviations[abbr]?.backgroundColor || '#4B5563',
      textColor: teamData?.secondaryColor || teamAbbreviations[abbr]?.textColor || '#FFFFFF',
      logo,
      seed: getSeedByTid(tid)
    }
  }

  // Initialize game with teams from semifinal results
  useEffect(() => {
    if (isOpen) {
      // Read from games[] array (unified source of truth)
      const sfResults = getGamesByType(currentDynasty, GAME_TYPES.CFP_SEMIFINAL, currentYear)
      const existingChampGames = getGamesByType(currentDynasty, GAME_TYPES.CFP_CHAMPIONSHIP, currentYear)
      const existingChamp = existingChampGames[0]

      // Fallback to cfpResultsByYear for backwards compatibility with old data
      const legacySFResults = currentDynasty?.cfpResultsByYear?.[currentYear]?.semifinals || []
      const legacyChamp = currentDynasty?.cfpResultsByYear?.[currentYear]?.championship?.[0]

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
        // Fallback: compute from scores
        if (game.team1Score !== undefined && game.team2Score !== undefined) {
          const t1 = game.team1Tid ? getGameTeamInfo(teams, game.team1Tid)?.abbr : game.team1
          const t2 = game.team2Tid ? getGameTeamInfo(teams, game.team2Tid)?.abbr : game.team2
          return game.team1Score > game.team2Score ? t1 : t2
        }
        return ''
      }

      // Helper to get winner TID from a game
      const getGameWinnerTid = (game) => {
        if (!game) return null
        // Try winnerTid first
        if (game.winnerTid) return game.winnerTid
        // Compute from scores
        if (game.team1Score !== undefined && game.team2Score !== undefined) {
          return Number(game.team1Score) > Number(game.team2Score) ? game.team1Tid : game.team2Tid
        }
        return null
      }

      if (existingChamp) {
        setGame(existingChamp)
      } else if (legacyChamp) {
        setGame(legacyChamp)
      } else {
        // Get winners from semifinals - find by cfpSlot (most reliable), then fallback to bowl name
        const bowlConfig = currentDynasty?.cfpBowlConfigByYear?.[currentYear] || {}
        const sf1BowlName = bowlConfig.sf1 || 'Peach Bowl'
        const sf2BowlName = bowlConfig.sf2 || 'Fiesta Bowl'

        // Find SF1 (cfpsf1) - winner of 1/4 bracket side
        const sf1Game = sfResults.find(g => g && g.cfpSlot === 'cfpsf1') ||
                        sfResults.find(g => g && g.bowlName === sf1BowlName) ||
                        legacySFResults.find(g => g && g.bowlName === sf1BowlName) ||
                        legacySFResults.find(g => g && g.bowlName === 'Peach Bowl')

        // Find SF2 (cfpsf2) - winner of 2/3 bracket side
        const sf2Game = sfResults.find(g => g && g.cfpSlot === 'cfpsf2') ||
                        sfResults.find(g => g && g.bowlName === sf2BowlName) ||
                        legacySFResults.find(g => g && g.bowlName === sf2BowlName) ||
                        legacySFResults.find(g => g && g.bowlName === 'Fiesta Bowl')

        setGame({
          id: 'championship',
          bowlName: 'National Championship',
          team1: getGameWinner(sf1Game),
          team2: getGameWinner(sf2Game),
          team1Tid: getGameWinnerTid(sf1Game),  // Include tid for rendering
          team2Tid: getGameWinnerTid(sf2Game),  // Include tid for rendering
          team1Score: '',
          team2Score: ''
        })
      }
    }
  }, [isOpen, currentYear, currentDynasty])

  // Prevent body scroll when modal is open
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

  const handleScoreChange = (field, value) => {
    setGame(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    // Check for teams by either abbreviation or tid
    const hasTeam1 = game.team1 || game.team1Tid
    const hasTeam2 = game.team2 || game.team2Tid
    if (!hasTeam1 || !hasTeam2 || game.team1Score === '' || game.team2Score === '') {
      alert('Please enter scores for the game')
      return
    }

    setSaving(true)
    try {
      // Get team abbreviations from tid if not present
      const team1Abbr = game.team1 || (game.team1Tid ? getGameTeamInfo(teams, game.team1Tid)?.abbr : '')
      const team2Abbr = game.team2 || (game.team2Tid ? getGameTeamInfo(teams, game.team2Tid)?.abbr : '')
      const team1Score = parseInt(game.team1Score)
      const team2Score = parseInt(game.team2Score)

      const processedGame = {
        ...game,
        team1: team1Abbr,
        team2: team2Abbr,
        team1Score,
        team2Score,
        winner: team1Score > team2Score ? team1Abbr : team2Abbr,
        winnerTid: team1Score > team2Score ? game.team1Tid : game.team2Tid,
        seed1: getSeedByTid(game.team1Tid),
        seed2: getSeedByTid(game.team2Tid)
      }

      await onSave([processedGame])
      onClose()
    } catch (error) {
      console.error('Error saving National Championship result:', error)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const team1Info = getTeamInfoByTid(game.team1Tid)
  const team2Info = getTeamInfoByTid(game.team2Tid)

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] py-8 px-4 sm:p-4"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-4rem)] sm:max-h-[90vh] overflow-auto border"
        style={{
          backgroundColor: modalColors.background,
          borderColor: modalColors.border
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header with Trophy */}
        <div
          className="relative px-6 py-8 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)'
          }}
        >
          {/* Decorative elements */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-40 h-40 bg-white rounded-full translate-x-1/2 translate-y-1/2" />
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-black/60 hover:text-black hover:bg-black/10 rounded-full p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Trophy */}
          <div className="relative z-10">
            <img
              src={TROPHY_URL}
              alt="National Championship Trophy"
              className="w-24 h-24 mx-auto mb-4 object-contain drop-shadow-lg"
            />
            <h2 className="text-3xl font-black text-black tracking-tight">
              National Championship
            </h2>
            <p className="text-black/70 font-semibold mt-1">
              {currentYear} College Football Playoff
            </p>
          </div>
        </div>

        {/* Game Content */}
        <div className="p-6">
          {/* Matchup Display */}
          <div className="flex items-stretch gap-4">
            {/* Team 1 */}
            <div className="flex-1">
              {team1Info ? (
                <div
                  className="rounded-xl p-5 h-full flex flex-col items-center justify-center text-center"
                  style={{
                    backgroundColor: team1Info.backgroundColor,
                    boxShadow: `0 8px 32px ${team1Info.backgroundColor}60`
                  }}
                >
                  {team1Info.logo && (
                    <div className="w-20 h-20 bg-white rounded-full p-2 flex items-center justify-center mb-3 shadow-lg">
                      <img
                        src={team1Info.logo}
                        alt={team1Info.fullMascot}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="text-xs font-bold opacity-70 mb-1" style={{ color: team1Info.textColor }}>
                    #{team1Info.seed} Seed
                  </div>
                  <div className="text-lg font-bold leading-tight" style={{ color: team1Info.textColor }}>
                    {team1Info.fullMascot?.split(' ').slice(-2).join(' ') || team1Info.abbr}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-5 bg-surface-3 h-full flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 bg-surface-4 rounded-full flex items-center justify-center mb-3">
                    <span className="text-3xl text-txt-muted">?</span>
                  </div>
                  <span className="text-lg font-semibold text-txt-muted">TBD</span>
                  <p className="text-xs text-txt-muted mt-1">Awaiting semifinal result</p>
                </div>
              )}
            </div>

            {/* Score Inputs */}
            <div className="flex flex-col items-center justify-center gap-3">
              <input
                type="number"
                min="0"
                value={game.team1Score}
                onChange={(e) => handleScoreChange('team1Score', e.target.value)}
                className="w-20 h-20 text-center text-3xl font-black rounded-xl border-3 focus:outline-none focus:ring-4 focus:ring-yellow-500/50 transition-all"
                style={{
                  backgroundColor: team1Info?.backgroundColor || '#374151',
                  color: team1Info?.textColor || '#fff',
                  borderColor: '#FFD700'
                }}
                placeholder="0"
                disabled={!game.team1 && !game.team1Tid}
              />
              <div className="text-2xl font-black text-yellow-500">VS</div>
              <input
                type="number"
                min="0"
                value={game.team2Score}
                onChange={(e) => handleScoreChange('team2Score', e.target.value)}
                className="w-20 h-20 text-center text-3xl font-black rounded-xl border-3 focus:outline-none focus:ring-4 focus:ring-yellow-500/50 transition-all"
                style={{
                  backgroundColor: team2Info?.backgroundColor || '#374151',
                  color: team2Info?.textColor || '#fff',
                  borderColor: '#FFD700'
                }}
                placeholder="0"
                disabled={!game.team2 && !game.team2Tid}
              />
            </div>

            {/* Team 2 */}
            <div className="flex-1">
              {team2Info ? (
                <div
                  className="rounded-xl p-5 h-full flex flex-col items-center justify-center text-center"
                  style={{
                    backgroundColor: team2Info.backgroundColor,
                    boxShadow: `0 8px 32px ${team2Info.backgroundColor}60`
                  }}
                >
                  {team2Info.logo && (
                    <div className="w-20 h-20 bg-white rounded-full p-2 flex items-center justify-center mb-3 shadow-lg">
                      <img
                        src={team2Info.logo}
                        alt={team2Info.fullMascot}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="text-xs font-bold opacity-70 mb-1" style={{ color: team2Info.textColor }}>
                    #{team2Info.seed} Seed
                  </div>
                  <div className="text-lg font-bold leading-tight" style={{ color: team2Info.textColor }}>
                    {team2Info.fullMascot?.split(' ').slice(-2).join(' ') || team2Info.abbr}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl p-5 bg-surface-3 h-full flex flex-col items-center justify-center text-center">
                  <div className="w-20 h-20 bg-surface-4 rounded-full flex items-center justify-center mb-3">
                    <span className="text-3xl text-txt-muted">?</span>
                  </div>
                  <span className="text-lg font-semibold text-txt-muted">TBD</span>
                  <p className="text-xs text-txt-muted mt-1">Awaiting semifinal result</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t" style={{ borderColor: modalColors.border }}>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || (!game.team1 && !game.team1Tid) || (!game.team2 && !game.team2Tid)}
              className="flex-1 px-6 py-4 rounded-xl font-bold transition-all hover:opacity-90 disabled:opacity-50 text-lg text-white"
              style={{
                backgroundColor: modalColors.accent
              }}
            >
              {saving ? 'Saving...' : 'Crown the Champion'}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-4 rounded-xl font-bold bg-surface-3 hover:bg-surface-4 text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
