import { useState, useMemo, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty, getPlayerClassForYear } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import RosterHistoryModal from '../../components/RosterHistoryModal'
import { PageHero, Card, EmptyState, Input, Select, Badge, Button } from '../../components/ui'

const POSITION_GROUPS = {
  'All': [],
  'Offense': ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'],
  'Defense': ['LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS'],
  'Special Teams': ['K', 'P'],
  'QB': ['QB'],
  'RB': ['HB', 'FB'],
  'WR': ['WR'],
  'TE': ['TE'],
  'OL': ['LT', 'LG', 'C', 'RG', 'RT'],
  'DL': ['LEDG', 'REDG', 'DT'],
  'LB': ['SAM', 'MIKE', 'WILL'],
  'DB': ['CB', 'FS', 'SS'],
  'K/P': ['K', 'P']
}

const DEV_TRAIT_VARIANT = {
  'Elite': 'warning',
  'Star': 'default',
  'Impact': 'default',
  'Normal': 'outline'
}

export default function Players() {
  const { id } = useParams()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [positionFilter, setPositionFilter] = useState('All')
  const [sortBy, setSortBy] = useState('overall')
  const [sortOrder, setSortOrder] = useState('desc')
  const [showRosterHistoryModal, setShowRosterHistoryModal] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  if (!currentDynasty) return null

  const allPlayers = currentDynasty.players || []

  const filteredPlayers = useMemo(() => {
    let result = [...allPlayers]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(player => {
        const name = (player.name || '').toLowerCase()
        const position = (player.position || '').toLowerCase()
        const hometown = (player.hometown || '').toLowerCase()
        const state = (player.state || '').toLowerCase()
        const jerseyNumber = (player.jerseyNumber || '').toString()
        const archetype = (player.archetype || '').toLowerCase()

        return name.includes(query) ||
               position.includes(query) ||
               hometown.includes(query) ||
               state.includes(query) ||
               jerseyNumber === query ||
               archetype.includes(query)
      })
    }

    if (positionFilter !== 'All') {
      const positions = POSITION_GROUPS[positionFilter] || []
      if (positions.length > 0) {
        result = result.filter(player => positions.includes(player.position))
      }
    }

    result.sort((a, b) => {
      let aVal, bVal
      let aMissing = false
      let bMissing = false

      switch (sortBy) {
        case 'name':
          aVal = (a.name || '').toLowerCase()
          bVal = (b.name || '').toLowerCase()
          aMissing = !a.name
          bMissing = !b.name
          break
        case 'position': {
          const positionOrder = [
            'QB', 'HB', 'FB', 'WR', 'TE',
            'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG',
            'LE', 'RE', 'LEDG', 'REDG', 'EDGE', 'DT',
            'LOLB', 'MLB', 'ROLB', 'SAM', 'MIKE', 'WILL', 'OLB', 'LB',
            'CB', 'FS', 'SS', 'S', 'K', 'P'
          ]
          const aPosIdx = positionOrder.indexOf(a.position)
          const bPosIdx = positionOrder.indexOf(b.position)
          aMissing = aPosIdx === -1 || !a.position
          bMissing = bPosIdx === -1 || !b.position
          if (aPosIdx === bPosIdx) {
            aVal = -(a.overall || 0)
            bVal = -(b.overall || 0)
          } else {
            aVal = aPosIdx
            bVal = bPosIdx
          }
          break
        }
        case 'year': {
          const yearOrder = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']
          aVal = yearOrder.indexOf(a.year)
          bVal = yearOrder.indexOf(b.year)
          aMissing = aVal === -1 || !a.year
          bMissing = bVal === -1 || !b.year
          break
        }
        case 'overall':
          aVal = a.overall
          bVal = b.overall
          aMissing = a.overall === undefined || a.overall === null || a.overall === 0
          bMissing = b.overall === undefined || b.overall === null || b.overall === 0
          break
        case 'devTrait': {
          const devOrder = ['Elite', 'Star', 'Impact', 'Normal']
          aVal = devOrder.indexOf(a.devTrait)
          bVal = devOrder.indexOf(b.devTrait)
          aMissing = aVal === -1 || !a.devTrait
          bMissing = bVal === -1 || !b.devTrait
          break
        }
        default:
          aVal = a.overall
          bVal = b.overall
          aMissing = a.overall === undefined || a.overall === null || a.overall === 0
          bMissing = b.overall === undefined || b.overall === null || b.overall === 0
      }

      if (aMissing && bMissing) return 0
      if (aMissing) return 1
      if (bMissing) return -1

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      }
    })

    return result
  }, [allPlayers, searchQuery, positionFilter, sortBy, sortOrder])

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'name' ? 'asc' : 'desc')
    }
  }

  const SortIndicator = ({ column }) => {
    if (sortBy !== column) {
      return <span className="ml-1 opacity-0 group-hover:opacity-40 transition-opacity">↕</span>
    }
    return (
      <span
        className="ml-1 inline-block transition-transform duration-200"
        style={{
          color: 'var(--text-primary)',
          transform: sortOrder === 'asc' ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        ▾
      </span>
    )
  }

  const SortableTh = ({ column, children, align = 'left', hidden }) => (
    <th
      onClick={() => handleSort(column)}
      className={`group px-4 py-3 label-xs text-txt-tertiary text-${align} cursor-pointer hover:text-txt-primary transition-colors whitespace-nowrap select-none ${hidden || ''}`}
      style={{ letterSpacing: '2px', fontSize: '10px' }}
    >
      {children}
      <SortIndicator column={column} />
    </th>
  )

  return (
    <div className="space-y-4 page-enter">
      <PageHero
        eyebrow="Roster Directory"
        title="All Players"
        meta={
          <>
            <span className="tabular">{filteredPlayers.length}</span>
            <span>{filteredPlayers.length === 1 ? 'player' : 'players'}</span>
            {(searchQuery || positionFilter !== 'All') && (
              <>
                <span className="text-txt-tertiary">·</span>
                <span className="tabular">{allPlayers.length}</span>
                <span>total</span>
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="sm:w-56"
            />
            <Select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
            >
              {Object.keys(POSITION_GROUPS).map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </Select>
          </div>
        }
      />

      {filteredPlayers.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--surface-4)',
                    backgroundColor: 'var(--surface-1)',
                  }}
                >
                  <SortableTh column="name">Player</SortableTh>
                  <SortableTh column="position" align="center">Pos</SortableTh>
                  <SortableTh column="year" align="center">Year</SortableTh>
                  <SortableTh column="overall" align="center">OVR</SortableTh>
                  <SortableTh column="devTrait" align="center">Dev</SortableTh>
                  <th
                    className="px-4 py-3 label-xs text-txt-tertiary text-left hidden md:table-cell"
                    style={{ letterSpacing: '2px', fontSize: '10px' }}
                  >
                    Archetype
                  </th>
                  <th
                    className="px-4 py-3 label-xs text-txt-tertiary text-left hidden lg:table-cell"
                    style={{ letterSpacing: '2px', fontSize: '10px' }}
                  >
                    Hometown
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player, idx) => {
                  // Tiered OVR color treatment — broadcast scorebug data
                  // emphasis: elite ratings stand out at a glance, sub-80s
                  // recede. Same tier drives the jersey-chip color so the
                  // row reads as a unit.
                  const ovr = player.overall || 0
                  const tier = ovr >= 90 ? 'elite' : ovr >= 85 ? 'star' : ovr >= 80 ? 'starter' : ovr > 0 ? 'depth' : 'none'
                  const ovrColor = tier === 'elite' ? '#34d399'
                    : tier === 'star' ? 'var(--text-primary)'
                    : tier === 'starter' ? 'var(--text-primary)'
                    : tier === 'depth' ? 'var(--text-tertiary)'
                    : 'var(--text-muted)'
                  const ovrSize = tier === 'elite' ? '20px' : tier === 'star' ? '18px' : '17px'

                  return (
                    <tr
                      key={player.pid || player.id || idx}
                      className="player-row transition-colors"
                      style={{ borderBottom: idx < filteredPlayers.length - 1 ? '1px solid var(--surface-4)' : 'none' }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`${pathPrefix}/player/${player.pid}`}
                          className="font-semibold hover:underline flex items-center gap-2 group"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {player.jerseyNumber && (
                            <span
                              className="label-xs tabular px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{
                                fontSize: '10px',
                                backgroundColor: 'var(--surface-3)',
                                color: 'var(--text-secondary)',
                                fontWeight: 700,
                                minWidth: '28px',
                                textAlign: 'center',
                              }}
                            >
                              {player.jerseyNumber}
                            </span>
                          )}
                          <span className="transition-transform duration-200 group-hover:translate-x-0.5">{player.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-bold text-txt-primary tabular">
                        {player.position}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-txt-secondary tabular">
                        {getPlayerClassForYear(player, currentDynasty.currentYear) || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {player.overall ? (
                          <span
                            className="tabular font-display font-black"
                            style={{
                              color: ovrColor,
                              fontSize: ovrSize,
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {player.overall}
                          </span>
                        ) : (
                          <span className="text-txt-tertiary">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {player.devTrait && (
                          <Badge variant={DEV_TRAIT_VARIANT[player.devTrait] || 'outline'} size="sm">
                            {player.devTrait}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-txt-secondary">
                        {player.archetype || '-'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-txt-secondary">
                        {player.hometown && player.state
                          ? `${player.hometown}, ${player.state}`
                          : player.hometown || player.state || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title={allPlayers.length === 0 ? 'No players yet' : 'No players found'}
            message={
              allPlayers.length === 0
                ? 'Complete your preseason setup and enter your roster to see players here.'
                : 'No players match your search criteria. Try adjusting your filters.'
            }
            action={
              allPlayers.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => { setSearchQuery(''); setPositionFilter('All'); }}
                >
                  Clear Filters
                </Button>
              )
            }
          />
        </Card>
      )}

      <RosterHistoryModal
        isOpen={showRosterHistoryModal}
        onClose={() => setShowRosterHistoryModal(false)}
        teamColors={teamColors}
      />

      <style>{`
        .player-row:hover {
          background-color: var(--surface-3);
          box-shadow: inset 3px 0 0 var(--surface-5);
        }
      `}</style>
    </div>
  )
}
