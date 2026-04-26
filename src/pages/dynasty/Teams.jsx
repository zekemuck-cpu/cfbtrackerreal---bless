import { useState, useMemo } from 'react'
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

  const allTeams = useMemo(() => (
    Object.values(teamsSource)
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
  ), [teamsSource])

  const filteredTeams = useMemo(() => {
    if (searchQuery === '') return allTeams
    const query = searchQuery.toLowerCase()
    return allTeams.filter(team => (
      team.name.toLowerCase().includes(query) ||
      team.abbr.toLowerCase().includes(query)
    ))
  }, [allTeams, searchQuery])

  return (
    <div className="space-y-6 page-enter">
      <PageHero
        eyebrow="Directory"
        title="All Teams"
        meta={
          <>
            <span className="tabular">{allTeams.length}</span>
            <span>FBS teams</span>
            {searchQuery && (
              <>
                <span className="text-txt-tertiary">·</span>
                <span className="tabular">{filteredTeams.length}</span>
                <span>matching</span>
              </>
            )}
          </>
        }
        actions={
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search teams…"
            className="sm:w-64"
          />
        }
      />

      {filteredTeams.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 stagger-reveal">
          {filteredTeams.map(team => (
            <Link
              key={team.tid}
              to={`${pathPrefix}/team/${team.tid}/${currentDynasty.currentYear}`}
              className="team-card group relative flex items-center gap-3 pl-4 pr-3 py-3 rounded-lg bg-surface-2 transition-all duration-200"
              style={{
                border: '1px solid var(--rule-soft, var(--surface-4))',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-200 group-hover:w-[5px]"
                style={{ backgroundColor: team.primaryColor }}
              />
              {team.logo ? (
                <TeamLogo
                  tid={team.tid}
                  teams={teamsSource}
                  size="md"
                  className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
                />
              ) : (
                <span className="w-6 h-6 flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0 text-sm font-semibold text-txt-primary truncate transition-colors group-hover:text-white">
                {team.name}
              </span>
              {team.isCustom && (
                <span
                  className="label-xs flex-shrink-0 px-1.5 py-0.5 rounded"
                  style={{
                    fontSize: '9px',
                    letterSpacing: '1.5px',
                    backgroundColor: 'var(--surface-3)',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  CUSTOM
                </span>
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

      <style>{`
        .team-card:hover {
          background-color: var(--surface-3);
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--surface-5) 50%, transparent);
        }
      `}</style>
    </div>
  )
}
