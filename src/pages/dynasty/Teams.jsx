import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS } from '../../data/teamRegistry'
import { PageHero, Card, EmptyState, TeamLogo, Input } from '../../components/ui'

export default function Teams() {
  const { currentDynasty } = useDynasty()
  const pathPrefix = usePathPrefix()
  const [searchQuery, setSearchQuery] = useState('')

  if (!currentDynasty) return null

  const teamsSource = currentDynasty.teams || TEAMS

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
      <PageHero
        eyebrow="Browse"
        title="All Teams"
        meta={<span>{allTeams.length} FBS teams</span>}
      />

      {/* Search */}
      <div>
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search teams by name or abbreviation…"
        />
        {searchQuery && (
          <div className="label-xs text-txt-tertiary mt-2">
            {filteredTeams.length} {filteredTeams.length === 1 ? 'team' : 'teams'} found
          </div>
        )}
      </div>

      {/* Teams grid — each card is bordered neutral with a team-color left rail */}
      {filteredTeams.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {filteredTeams.map(team => (
            <Link
              key={team.tid}
              to={`${pathPrefix}/team/${team.tid}`}
              className="group relative flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-md bg-surface-2 hover:bg-surface-3 transition-colors overflow-hidden"
              style={{ border: '1px solid var(--surface-4)' }}
            >
              {/* Left-rail team-color stripe */}
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ backgroundColor: team.primaryColor }}
              />
              {team.logo ? (
                <TeamLogo tid={team.tid} teams={teamsSource} size="md" className="flex-shrink-0 ml-1" />
              ) : (
                <span className="w-6 h-6 flex-shrink-0 ml-1" />
              )}
              <span className="flex-1 min-w-0 text-sm font-semibold text-txt-primary truncate">
                {team.name}
              </span>
              {team.isCustom && (
                <span className="label-xs text-txt-tertiary">CUSTOM</span>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No teams found"
            message={`Nothing matched "${searchQuery}". Try a different search.`}
          />
        </Card>
      )}
    </div>
  )
}
