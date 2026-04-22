import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty, getUserGamePerspective } from '../../context/DynastyContext'
import { getGameTeamInfo } from '../../data/teamRegistry'
import { getTeamLogo, getMascotName } from '../../data/teams'
import {
  PageHero,
  Card,
  EmptyState,
  Modal,
  Badge,
  Stat,
  SectionHeader,
} from '../../components/ui'

const WEEK_LABEL = (game) => {
  if (game.phase === 'postseason') return 'Bowl'
  if (game.phase === 'conf_championship') return 'CCG'
  return `Week ${game.week || '?'}`
}

export default function TeamHistory() {
  const { currentDynasty } = useDynasty()
  const [showGamesModal, setShowGamesModal] = useState(false)
  const [gamesModalType, setGamesModalType] = useState(null)
  const [showFavoriteTooltip, setShowFavoriteTooltip] = useState(false)

  if (!currentDynasty) return null

  const teams = currentDynasty?.teams

  const isWin = (game) => game.perspective?.userWon === true
  const isLoss = (game) => game.perspective && !game.perspective.userWon

  const allTeamGames = (currentDynasty.games || [])
    .map(game => {
      const perspective = getUserGamePerspective(game, currentDynasty)
      return perspective ? { ...game, perspective } : null
    })
    .filter(Boolean)

  const totalWins = allTeamGames.filter(isWin).length
  const totalLosses = allTeamGames.filter(isLoss).length
  const overallRecord = `${totalWins}-${totalLosses}`

  const favoriteGames = allTeamGames.filter(g => g.favoriteStatus === 'favorite')
  const favoriteWins = favoriteGames.filter(isWin).length
  const favoriteLosses = favoriteGames.filter(isLoss).length
  const favoriteRecord = `${favoriteWins}-${favoriteLosses}`

  const underdogGames = allTeamGames.filter(g => g.favoriteStatus === 'underdog')
  const underdogWins = underdogGames.filter(isWin).length
  const underdogLosses = underdogGames.filter(isLoss).length
  const underdogRecord = `${underdogWins}-${underdogLosses}`

  const openGamesModal = (type) => {
    setGamesModalType(type)
    setShowGamesModal(true)
  }

  const getGamesForModal = () => {
    if (gamesModalType === 'favorite') return favoriteGames
    if (gamesModalType === 'underdog') return underdogGames
    return []
  }

  const sortedModalGames = getGamesForModal().sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return (a.week || 0) - (b.week || 0)
  })

  const gamesByYear = sortedModalGames.reduce((acc, game) => {
    const year = game.year || 'Unknown'
    if (!acc[year]) acc[year] = []
    acc[year].push(game)
    return acc
  }, {})

  const seasons = []
  for (let year = currentDynasty.startYear; year <= currentDynasty.currentYear; year++) {
    const seasonGames = (currentDynasty.games || [])
      .filter(g => Number(g.year) === year)
      .map(g => {
        const gPerspective = getUserGamePerspective(g, currentDynasty)
        return gPerspective ? { ...g, perspective: gPerspective } : null
      })
      .filter(Boolean)
    const wins = seasonGames.filter(g => g.perspective?.userWon).length
    const losses = seasonGames.filter(g => g.perspective && !g.perspective.userWon).length

    const roleDisplay = currentDynasty.coachPosition === 'HC' ? 'Head Coach'
      : currentDynasty.coachPosition === 'OC' ? 'Offensive Coordinator'
      : currentDynasty.coachPosition === 'DC' ? 'Defensive Coordinator'
      : 'Head Coach'

    seasons.push({
      year,
      role: roleDisplay,
      school: currentDynasty.teamName,
      conference: currentDynasty.conference,
      wins,
      losses,
      confRank: 'N/A',
      cfpBerth: 'N/A',
      natlChamp: 'N/A',
      firstDowns: 0,
      firstDownsPerGame: 0,
      offensiveYardsPerGame: 0,
      thirdDownPct: 0,
      fourthDownPct: 0,
      penaltyYardsPerGame: 0,
      redzoneTDPct: 0,
      defRedzoneTDPct: 0,
      pointsPerGame: 0,
      pointsAllowedPerGame: 0,
      marginOfVictory: 0,
      passingLeader: { name: 'N/A', yards: 0, teamPassYPG: 0 },
      rushingLeader: { name: 'N/A', yards: 0, teamRushYPG: 0 },
      receivingLeader: { name: 'N/A', yards: 0 },
      tackleLeader: { name: 'N/A', tackles: 0 },
      tflLeader: { name: 'N/A', tfls: 0, teamTFLsPerGame: 0 },
      sackLeader: { name: 'N/A', sacks: 0, teamSacksPerGame: 0 },
      intLeader: { name: 'N/A', ints: 0, teamIntsPerGame: 0 }
    })
  }

  seasons.reverse()

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={currentDynasty.teamName}
        title="Team History"
        meta={
          <>
            <span className="tabular">{overallRecord}</span>
            <span>all-time</span>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <Stat label="Overall Record" value={overallRecord} size="lg" align="left" />
        </Card>

        <Card
          className="cursor-pointer hover:bg-surface-3 transition-colors relative"
          onClick={() => openGamesModal('favorite')}
        >
          <div className="flex items-start justify-between">
            <Stat label="As Favorite" value={favoriteRecord} size="lg" align="left" />
            <button
              type="button"
              className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center transition-colors hover:bg-surface-4"
              style={{
                backgroundColor: 'var(--surface-3)',
                color: 'var(--text-tertiary)',
              }}
              onMouseEnter={(e) => { e.stopPropagation(); setShowFavoriteTooltip(true) }}
              onMouseLeave={(e) => { e.stopPropagation(); setShowFavoriteTooltip(false) }}
              onClick={(e) => { e.stopPropagation(); setShowFavoriteTooltip(!showFavoriteTooltip) }}
              aria-label="How is favorite status calculated?"
            >
              ?
            </button>
          </div>
          <div className="mt-2 label-xs text-txt-tertiary">Click to view games</div>
          {showFavoriteTooltip && (
            <div
              className="absolute z-50 p-3 rounded-md text-left text-xs w-64 left-4 right-4 sm:left-auto sm:right-4"
              style={{
                backgroundColor: 'var(--surface-3)',
                border: '1px solid var(--surface-5)',
                color: 'var(--text-secondary)',
                top: '100%',
                marginTop: '8px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
              }}
            >
              <div className="font-semibold text-txt-primary mb-1">How is this calculated?</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Ranked vs unranked: ranked team is favorite</li>
                <li>Both ranked: lower rank is favorite</li>
                <li>Both unranked: higher overall rating is favorite</li>
                <li>Home team gets +5 ranking or +3 overall boost</li>
              </ul>
            </div>
          )}
        </Card>

        <Card
          className="cursor-pointer hover:bg-surface-3 transition-colors"
          onClick={() => openGamesModal('underdog')}
        >
          <Stat label="As Underdog" value={underdogRecord} size="lg" align="left" />
          <div className="mt-2 label-xs text-txt-tertiary">Click to view games</div>
        </Card>
      </div>

      {seasons.length === 0 ? (
        <Card>
          <EmptyState
            title="No seasons yet"
            message="Start playing to build your team history."
          />
        </Card>
      ) : (
        seasons.map((season) => (
          <Card key={season.year} padding="none" accent="left">
            <div className="p-5">
              <div
                className="flex flex-wrap items-baseline gap-3 pb-4 mb-4"
                style={{ borderBottom: '1px solid var(--surface-4)' }}
              >
                <h3 className="text-display-md text-txt-primary m-0">{season.year}</h3>
                <span className="label-sm text-txt-secondary">{season.role}</span>
                <span className="text-txt-tertiary">·</span>
                <span className="label-sm text-txt-secondary">{season.conference}</span>
                <span className="text-txt-tertiary">·</span>
                <span className="tabular font-semibold text-txt-primary">
                  {season.wins}-{season.losses}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                <Stat label="Conf. Rank" value={season.confRank} size="md" align="left" />
                <Stat label="CFP Berth" value={season.cfpBerth} size="md" align="left" />
                <Stat label="Nat'l Champ" value={season.natlChamp} size="md" align="left" />
                <Stat label="Points/Game" value={season.pointsPerGame || '—'} size="md" align="left" />
                <Stat label="Points Allowed" value={season.pointsAllowedPerGame || '—'} size="md" align="left" />
                <Stat
                  label="Margin"
                  value={season.marginOfVictory > 0
                    ? `+${season.marginOfVictory}`
                    : (season.marginOfVictory || '—')}
                  size="md"
                  align="left"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div>
                  <SectionHeader title="Offensive Statistics" size="sm" />
                  <div className="grid grid-cols-2 gap-0">
                    <OffRow label="First Downs" value={season.firstDowns || '—'} />
                    <OffRow label="First Downs/Game" value={season.firstDownsPerGame || '—'} />
                    <OffRow label="Offensive Yds/Game" value={season.offensiveYardsPerGame || '—'} />
                    <OffRow label="3rd Down %" value={season.thirdDownPct ? `${season.thirdDownPct}%` : '—'} />
                    <OffRow label="4th Down %" value={season.fourthDownPct ? `${season.fourthDownPct}%` : '—'} />
                    <OffRow label="Penalty Yds/Game" value={season.penaltyYardsPerGame || '—'} />
                    <OffRow label="Redzone TD %" value={season.redzoneTDPct ? `${season.redzoneTDPct}%` : '—'} />
                    <OffRow label="DEF Redzone TD %" value={season.defRedzoneTDPct ? `${season.defRedzoneTDPct}%` : '—'} />
                  </div>
                </div>

                <div>
                  <SectionHeader title="Statistical Leaders" size="sm" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <LeaderCard
                      label="Passing"
                      name={season.passingLeader.name}
                      statValue={season.passingLeader.yards > 0 ? `${season.passingLeader.yards} yds` : '—'}
                      sub={`Team Pass YPG: ${season.passingLeader.teamPassYPG || '—'}`}
                    />
                    <LeaderCard
                      label="Rushing"
                      name={season.rushingLeader.name}
                      statValue={season.rushingLeader.yards > 0 ? `${season.rushingLeader.yards} yds` : '—'}
                      sub={`Team Rush YPG: ${season.rushingLeader.teamRushYPG || '—'}`}
                    />
                    <LeaderCard
                      label="Receiving"
                      name={season.receivingLeader.name}
                      statValue={season.receivingLeader.yards > 0 ? `${season.receivingLeader.yards} yds` : '—'}
                    />
                    <LeaderCard
                      label="Tackles"
                      name={season.tackleLeader.name}
                      statValue={season.tackleLeader.tackles > 0 ? season.tackleLeader.tackles : '—'}
                    />
                    <LeaderCard
                      label="TFL"
                      name={season.tflLeader.name}
                      statValue={season.tflLeader.tfls > 0 ? season.tflLeader.tfls : '—'}
                      sub={`Team TFLs/Game: ${season.tflLeader.teamTFLsPerGame || '—'}`}
                    />
                    <LeaderCard
                      label="Sacks"
                      name={season.sackLeader.name}
                      statValue={season.sackLeader.sacks > 0 ? season.sackLeader.sacks : '—'}
                      sub={`Team Sacks/Game: ${season.sackLeader.teamSacksPerGame || '—'}`}
                    />
                    <LeaderCard
                      label="INT"
                      name={season.intLeader.name}
                      statValue={season.intLeader.ints > 0 ? season.intLeader.ints : '—'}
                      sub={`Team INTs/Game: ${season.intLeader.teamIntsPerGame || '—'}`}
                    />
                  </div>
                </div>
              </div>

              {season.year === currentDynasty.currentYear && (
                <div className="mt-4 label-xs text-txt-tertiary">
                  Season in progress — statistics will update as data is tracked.
                </div>
              )}
            </div>
          </Card>
        ))
      )}

      <Modal
        isOpen={showGamesModal}
        onClose={() => setShowGamesModal(false)}
        title={`Games as ${gamesModalType === 'favorite' ? 'Favorite' : 'Underdog'}`}
        size="lg"
      >
        <div className="mb-4 label-xs text-txt-tertiary tabular">
          {sortedModalGames.length} game{sortedModalGames.length !== 1 ? 's' : ''}
        </div>

        {sortedModalGames.length === 0 ? (
          <EmptyState
            title="No games found"
            message={`No games found as ${gamesModalType === 'favorite' ? 'favorite' : 'underdog'}.`}
          />
        ) : (
          <div className="space-y-5">
            {Object.entries(gamesByYear).sort((a, b) => Number(b[0]) - Number(a[0])).map(([year, games]) => (
              <div key={year}>
                <h4 className="text-sm font-semibold text-txt-primary mb-2">
                  {year} Season
                </h4>
                <Card padding="none">
                  {games.map((game, idx) => {
                    const won = isWin(game)
                    const weekLabel = WEEK_LABEL(game)
                    const oppTid = game.perspective?.opponentTid
                    const oppInfo = oppTid ? getGameTeamInfo(teams, oppTid) : null
                    const oppAbbr = oppInfo?.abbr || game.opponent || ''
                    const oppMascot = getMascotName(oppTid ?? oppAbbr, teams) || oppAbbr
                    const oppLogo = (oppMascot && getTeamLogo(oppMascot, teams)) ||
                      (oppAbbr && getTeamLogo(oppAbbr, teams)) || null
                    const location = game.perspective?.isHome
                      ? 'Home'
                      : game.perspective?.isAway ? 'Away' : 'Neutral'

                    return (
                      <Link
                        key={idx}
                        to={`/dynasty/${currentDynasty.id}/game/${game.id || idx}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-surface-3 transition-colors"
                        style={{
                          borderBottom: idx < games.length - 1 ? '1px solid var(--surface-4)' : 'none',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant={won ? 'success' : 'danger'} size="md">
                            {won ? 'W' : 'L'}
                          </Badge>
                          {oppLogo && (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white p-[2px] flex-shrink-0">
                              <img src={oppLogo} alt="" className="w-full h-full object-contain" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-txt-primary truncate">
                              vs {oppMascot || oppAbbr || 'Unknown'}
                            </div>
                            <div className="label-xs text-txt-tertiary">
                              {weekLabel} · {location}
                            </div>
                          </div>
                        </div>
                        <div className="tabular font-semibold text-sm text-txt-primary flex-shrink-0 ml-3">
                          {game.perspective?.userScore ?? '—'} – {game.perspective?.opponentScore ?? '—'}
                        </div>
                      </Link>
                    )
                  })}
                </Card>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

function OffRow({ label, value }) {
  return (
    <div
      className="flex items-center justify-between py-2 px-1"
      style={{ borderBottom: '1px solid var(--surface-4)' }}
    >
      <span className="text-xs text-txt-tertiary">{label}</span>
      <span className="text-sm font-semibold tabular text-txt-primary">{value}</span>
    </div>
  )
}

function LeaderCard({ label, name, statValue, sub }) {
  return (
    <div
      className="p-3 rounded-md"
      style={{
        backgroundColor: 'var(--surface-2)',
        border: '1px solid var(--surface-4)',
      }}
    >
      <div className="label-xs text-txt-tertiary mb-1">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm text-txt-primary truncate">{name}</span>
        <span className="tabular font-semibold text-sm text-txt-primary flex-shrink-0">{statValue}</span>
      </div>
      {sub && <div className="label-xs text-txt-tertiary mt-1">{sub}</div>}
    </div>
  )
}
