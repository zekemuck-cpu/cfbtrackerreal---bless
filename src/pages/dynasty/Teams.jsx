import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS } from '../../data/teamRegistry'

export default function Teams() {
  const { id } = useParams()
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [searchQuery, setSearchQuery] = useState('')

  if (!currentDynasty) return null

  // Use dynasty.teams if available (new tid-based structure), otherwise fall back to TEAMS
  const teamsSource = currentDynasty.teams || TEAMS

  // Get all FBS teams (filter out FCS teams which have isFCS: true)
  // Teams are already sorted by tid, but we want alphabetical by name
  const allTeams = Object.values(teamsSource)
    .filter(team => !team.isFCS)
    .map(team => ({
      tid: team.tid,
      abbr: team.abbr,
      name: team.name,
      primaryColor: team.primaryColor,
      secondaryColor: team.secondaryColor,
      logo: team.logo,
      isCustom: team.isCustom || false
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filter teams by search
  const filteredTeams = allTeams.filter(team => {
    if (searchQuery === '') return true
    const query = searchQuery.toLowerCase()
    return (
      team.name.toLowerCase().includes(query) ||
      team.abbr.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg shadow-lg p-6 bg-gray-800 border-2 border-gray-600">
        <h1 className="text-2xl font-bold text-white">
          All Teams
        </h1>
        <p className="mt-1 text-gray-300">
          Browse all {allTeams.length} FBS teams
        </p>
      </div>

      {/* Search */}
      <div className="rounded-lg shadow-lg p-4 bg-gray-800 border-2 border-gray-600">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teams by name or abbreviation..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-500 bg-white font-semibold text-lg"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-70 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm font-semibold text-gray-400">
            {filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* Teams Grid */}
      <div className="rounded-lg shadow-lg overflow-hidden bg-gray-800 border-2 border-gray-600">
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredTeams.map(team => (
            <Link
              key={team.tid}
              to={`${pathPrefix}/team/${team.tid}`}
              className="flex items-center gap-3 p-3 rounded-lg hover:scale-[1.02] transition-transform"
              style={{
                backgroundColor: team.primaryColor,
                color: team.secondaryColor
              }}
            >
              {team.logo && (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: `2px solid ${team.secondaryColor}`,
                    padding: '2px'
                  }}
                >
                  <img
                    src={team.logo}
                    alt={`${team.name} logo`}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{team.name}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {filteredTeams.length === 0 && (
        <div className="rounded-lg shadow-lg p-8 text-center bg-gray-800 border-2 border-gray-600">
          <p className="text-gray-400">
            No teams found matching "{searchQuery}"
          </p>
        </div>
      )}
    </div>
  )
}
