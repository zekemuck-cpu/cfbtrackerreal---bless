import { useState, useMemo, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import RosterHistoryModal from '../../components/RosterHistoryModal'

// Position groups for filtering
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

// Dev trait badge colors
const DEV_TRAIT_COLORS = {
  'Elite': { bg: '#EAB308', text: '#000000' },
  'Star': { bg: '#8B5CF6', text: '#FFFFFF' },
  'Impact': { bg: '#3B82F6', text: '#FFFFFF' },
  'Normal': { bg: '#6B7280', text: '#FFFFFF' }
}

export default function Players() {
  const { id } = useParams()
  const { currentDynasty, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.customTeams)
  const [searchQuery, setSearchQuery] = useState('')
  const [positionFilter, setPositionFilter] = useState('All')
  const [sortBy, setSortBy] = useState('overall')
  const [sortOrder, setSortOrder] = useState('desc')
  const [showRosterHistoryModal, setShowRosterHistoryModal] = useState(false)

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  if (!currentDynasty) return null

  // Get all players from dynasty
  const allPlayers = currentDynasty.players || []

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let result = [...allPlayers]

    // Apply search filter
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

    // Apply position filter
    if (positionFilter !== 'All') {
      const positions = POSITION_GROUPS[positionFilter] || []
      if (positions.length > 0) {
        result = result.filter(player => positions.includes(player.position))
      }
    }

    // Apply sorting - players with missing data always go to bottom
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
        case 'position':
          // Sort by depth chart order, not alphabetical
          // Secondary sort by overall (highest first) within each position
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
          // If same position, sort by overall descending
          if (aPosIdx === bPosIdx) {
            aVal = -(a.overall || 0) // Negative so higher overall comes first
            bVal = -(b.overall || 0)
          } else {
            aVal = aPosIdx
            bVal = bPosIdx
          }
          break
        case 'year':
          const yearOrder = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']
          aVal = yearOrder.indexOf(a.year)
          bVal = yearOrder.indexOf(b.year)
          aMissing = aVal === -1 || !a.year
          bMissing = bVal === -1 || !b.year
          break
        case 'overall':
          aVal = a.overall
          bVal = b.overall
          aMissing = a.overall === undefined || a.overall === null || a.overall === 0
          bMissing = b.overall === undefined || b.overall === null || b.overall === 0
          break
        case 'devTrait':
          const devOrder = ['Elite', 'Star', 'Impact', 'Normal']
          aVal = devOrder.indexOf(a.devTrait)
          bVal = devOrder.indexOf(b.devTrait)
          aMissing = aVal === -1 || !a.devTrait
          bMissing = bVal === -1 || !b.devTrait
          break
        default:
          aVal = a.overall
          bVal = b.overall
          aMissing = a.overall === undefined || a.overall === null || a.overall === 0
          bMissing = b.overall === undefined || b.overall === null || b.overall === 0
      }

      // Always push missing values to bottom regardless of sort direction
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

  // Toggle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'name' ? 'asc' : 'desc')
    }
  }

  // Sort indicator
  const SortIndicator = ({ column }) => {
    if (sortBy !== column) return null
    return (
      <span className="ml-1">
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with Search and Filters */}
      <div className="rounded-lg shadow-lg p-6 bg-gray-800 border-2 border-gray-600">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-white">
            All Players
            <span className="ml-2 text-sm font-normal text-gray-300">
              ({filteredPlayers.length} {filteredPlayers.length === 1 ? 'player' : 'players'})
            </span>
          </h1>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:flex-none sm:w-64">
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Position Filter */}
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="px-4 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white border-2 border-gray-500"
            >
              {Object.keys(POSITION_GROUPS).map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>

            {/* Roster History Button - Owner only (HIDDEN - kept for future use) */}
            {false && !isViewOnly && (
              <button
                onClick={() => setShowRosterHistoryModal(true)}
                className="px-4 py-2 rounded-lg font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Roster History
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Players Table */}
      {filteredPlayers.length > 0 ? (
        <div className="rounded-lg shadow-lg overflow-hidden bg-white border-2 border-gray-300">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-200">
                  <th
                    className="px-4 py-3 text-left font-bold cursor-pointer hover:bg-gray-300 text-gray-700"
                    onClick={() => handleSort('name')}
                  >
                    Player <SortIndicator column="name" />
                  </th>
                  <th
                    className="px-4 py-3 text-center font-bold cursor-pointer hover:bg-gray-300 text-gray-700"
                    onClick={() => handleSort('position')}
                  >
                    Pos <SortIndicator column="position" />
                  </th>
                  <th
                    className="px-4 py-3 text-center font-bold cursor-pointer hover:bg-gray-300 text-gray-700"
                    onClick={() => handleSort('year')}
                  >
                    Year <SortIndicator column="year" />
                  </th>
                  <th
                    className="px-4 py-3 text-center font-bold cursor-pointer hover:bg-gray-300 text-gray-700"
                    onClick={() => handleSort('overall')}
                  >
                    OVR <SortIndicator column="overall" />
                  </th>
                  <th
                    className="px-4 py-3 text-center font-bold cursor-pointer hover:bg-gray-300 text-gray-700"
                    onClick={() => handleSort('devTrait')}
                  >
                    Dev <SortIndicator column="devTrait" />
                  </th>
                  <th className="px-4 py-3 text-left font-bold hidden md:table-cell text-gray-700">
                    Archetype
                  </th>
                  <th className="px-4 py-3 text-left font-bold hidden lg:table-cell text-gray-700">
                    Hometown
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player, idx) => {
                  const devColors = DEV_TRAIT_COLORS[player.devTrait] || DEV_TRAIT_COLORS['Normal']
                  const isEven = idx % 2 === 0

                  return (
                    <tr
                      key={player.pid || player.id || idx}
                      className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${isEven ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`${pathPrefix}/player/${player.pid}`}
                          className="font-semibold text-blue-600 hover:underline flex items-center gap-2"
                        >
                          {player.jerseyNumber && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                              #{player.jerseyNumber}
                            </span>
                          )}
                          {player.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-gray-700">
                        {player.position}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {player.classByYear?.[currentDynasty.currentYear] || player.year}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-1 rounded font-bold text-sm bg-gray-700 text-white">
                          {player.overall}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: devColors.bg,
                            color: devColors.text
                          }}
                        >
                          {player.devTrait}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm text-gray-600">
                        {player.archetype || '-'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600">
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
        </div>
      ) : (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-100 border-2 border-gray-300">
          {allPlayers.length === 0 ? (
            <>
              <div className="mb-4 text-gray-400">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2 text-gray-700">
                No Players Yet
              </h3>
              <p className="max-w-md mx-auto text-gray-600">
                Complete your preseason setup and enter your roster to see players here.
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 text-gray-400">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium mb-2 text-gray-700">
                No Players Found
              </h3>
              <p className="max-w-md mx-auto text-gray-600">
                No players match your search criteria. Try adjusting your filters.
              </p>
              <button
                onClick={() => { setSearchQuery(''); setPositionFilter('All'); }}
                className="mt-4 px-4 py-2 rounded-lg font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-700"
              >
                Clear Filters
              </button>
            </>
          )}
        </div>
      )}

      {/* Roster History Modal */}
      <RosterHistoryModal
        isOpen={showRosterHistoryModal}
        onClose={() => setShowRosterHistoryModal(false)}
        teamColors={teamColors}
      />
    </div>
  )
}
