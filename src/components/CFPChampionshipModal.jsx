import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useDynasty, getGamesByType, GAME_TYPES } from '../context/DynastyContext'
import { teamAbbreviations } from '../data/teamAbbreviations'
import { getTeamLogo } from '../data/teams'
import { TEAMS, getGameTeamInfo } from '../data/teamRegistry'
import { getModalColors } from '../utils/colorUtils'
import { useToast } from './ui/Toast'

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
  const { toast } = useToast()
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
      toast.error('Please enter scores for the game')
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
      toast.error('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const team1Info = getTeamInfoByTid(game.team1Tid)
  const team2Info = getTeamInfoByTid(game.team2Tid)
  const GOLD = '#c9a227'

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-3 sm:p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="w-full max-w-2xl card-elevated flex flex-col max-h-[90dvh] overflow-hidden modal-panel-in"
        role="dialog"
        aria-modal="true"
        aria-label="National Championship"
      >
        {/* Thin gold accent stripe */}
        <div
          className="h-[3px] w-full flex-shrink-0"
          style={{ backgroundColor: GOLD }}
          aria-hidden="true"
        />

        {/* Header */}
        <header className="px-5 sm:px-6 py-4 sm:py-5 border-b border-surface-4 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src={TROPHY_URL}
              alt=""
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain flex-shrink-0 opacity-90"
              aria-hidden="true"
            />
            <div>
              <div
                className="text-txt-tertiary"
                style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700, color: GOLD }}
              >
                {currentYear} CFP Final
              </div>
              <h2 className="font-display text-txt-primary m-0 mt-1" style={{ fontSize: 'clamp(1.35rem, 3.2vw, 1.9rem)', fontWeight: 900, letterSpacing: '-0.02em' }}>
                National Championship
              </h2>
            </div>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-6">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-stretch">
            <ChampTeamCard
              info={team1Info}
              side="left"
              scoreValue={game.team1Score}
              onScoreChange={(v) => handleScoreChange('team1Score', v)}
              scoreDisabled={!game.team1 && !game.team1Tid}
              opponentScore={game.team2Score}
            />

            {/* VS divider */}
            <div className="flex items-center justify-center">
              <div
                className="text-txt-tertiary"
                style={{ fontSize: '11px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 700 }}
              >
                vs
              </div>
            </div>

            <ChampTeamCard
              info={team2Info}
              side="right"
              scoreValue={game.team2Score}
              onScoreChange={(v) => handleScoreChange('team2Score', v)}
              scoreDisabled={!game.team2 && !game.team2Tid}
              opponentScore={game.team1Score}
            />
          </div>
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
            disabled={saving || (!game.team1 && !game.team1Tid) || (!game.team2 && !game.team2Tid)}
            className="px-5 py-2 rounded-md text-sm font-semibold transition-all disabled:opacity-40"
            style={{
              backgroundColor: GOLD,
              color: '#0b0b10',
            }}
          >
            {saving ? 'Saving…' : 'Save Result'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

// --- Local presentational helpers ---

function ChampTeamCard({ info, side, scoreValue, onScoreChange, scoreDisabled, opponentScore }) {
  const GOLD = '#c9a227'
  const accent = info?.backgroundColor || GOLD
  const reverse = side === 'right'

  const myNum = Number(scoreValue)
  const oppNum = Number(opponentScore)
  const bothEntered = scoreValue !== '' && opponentScore !== '' && !Number.isNaN(myNum) && !Number.isNaN(oppNum)
  const isWinner = bothEntered && myNum > oppNum
  const isLoser = bothEntered && myNum < oppNum

  if (!info) {
    return (
      <div className="rounded-md border border-dashed border-surface-4 bg-surface-3 p-4 flex flex-col items-center justify-center text-center min-h-[200px]">
        <span className="font-display text-lg font-bold text-txt-tertiary tracking-tight">TBD</span>
        <p
          className="mt-1 text-txt-muted"
          style={{ fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 600 }}
        >
          Awaiting semifinal
        </p>
      </div>
    )
  }
  return (
    <div
      className="relative rounded-md bg-surface-3 border overflow-hidden p-4 flex flex-col items-center justify-start text-center transition-colors"
      style={{
        borderColor: isWinner ? GOLD : 'var(--surface-4)',
        boxShadow: isWinner ? `0 0 0 1px ${GOLD}` : 'none',
      }}
    >
      <div
        className={`absolute top-0 ${reverse ? 'right-0' : 'left-0'} bottom-0 w-[3px]`}
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />
      {info.logo && (
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full p-1.5 flex items-center justify-center mb-2 flex-shrink-0">
          <img src={info.logo} alt={info.fullMascot} className="w-full h-full object-contain" />
        </div>
      )}
      <div
        className="text-txt-tertiary"
        style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 700 }}
      >
        #{info.seed || '–'} Seed
      </div>
      <div
        className="font-display font-bold text-txt-primary text-sm sm:text-base leading-tight mt-0.5 mb-3"
        style={{ opacity: isLoser ? 0.55 : 1 }}
      >
        {info.fullMascot?.split(' ').slice(-2).join(' ') || info.abbr}
      </div>

      <div
        className="label-xs text-txt-tertiary mb-1"
        style={{ fontSize: '9px', letterSpacing: '2.5px', textTransform: 'uppercase', fontWeight: 700 }}
      >
        Score
      </div>
      <input
        type="number"
        min="0"
        value={scoreValue}
        onChange={(e) => onScoreChange(e.target.value)}
        disabled={scoreDisabled}
        placeholder="0"
        aria-label={`${info.fullMascot || info.abbr} score`}
        className="w-full max-w-[96px] h-14 sm:h-16 text-center font-display font-black text-3xl sm:text-4xl rounded-md bg-surface-2 border text-txt-primary focus:outline-none focus:ring-2 transition-all disabled:opacity-30"
        style={{
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          borderColor: isWinner ? GOLD : 'var(--surface-4)',
          color: isLoser ? 'var(--text-tertiary)' : 'var(--text-primary)',
          '--tw-ring-color': GOLD,
        }}
      />
    </div>
  )
}
