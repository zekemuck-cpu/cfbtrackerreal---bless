import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty, getCurrentCustomConferences } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { PageHero, Card, EmptyState, TeamLogo, Input } from '../../components/ui'
import TeambuilderEditModal from '../../components/TeambuilderEditModal'
import { useToast } from '../../components/ui/Toast'

export default function Teams() {
  const { currentDynasty, updateTeambuilderTeam, addCustomTeam, isViewOnly } = useDynasty()
  const pathPrefix = usePathPrefix()
  const { toast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTid, setEditingTid] = useState(null)
  const [adding, setAdding] = useState(false)

  if (!currentDynasty) return null

  const teamsSource = currentDynasty.teams || TEAMS

  const allTeams = useMemo(() => (
    Object.values(teamsSource)
      // Skip FCS, plus any sparse/orphan team entries that don't have a
      // real name yet — the directory can't render them and the sort
      // below would crash on undefined.localeCompare.
      .filter(team => team && team.name && !team.isFCS)
      .map(team => ({
        tid: team.tid,
        abbr: team.abbr,
        name: team.name,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
        logo: team.logo,
        isCustom: team.isCustom || false
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [teamsSource])

  const filteredTeams = useMemo(() => {
    if (searchQuery === '') return allTeams
    const query = searchQuery.toLowerCase()
    return allTeams.filter(team => (
      team.name.toLowerCase().includes(query) ||
      team.abbr.toLowerCase().includes(query)
    ))
  }, [allTeams, searchQuery])

  // Group teams by conference for the directory layout. Conferences
  // ordered by team count desc (so Power-5 lead, smaller conferences
  // follow). Independents/unknown go last under "Other".
  const customConferences = getCurrentCustomConferences(currentDynasty)
  const groupedByConference = useMemo(() => {
    const groups = new Map()
    filteredTeams.forEach(team => {
      const conf = getTeamConference(team.abbr, customConferences, teamsSource) || 'Other'
      if (!groups.has(conf)) groups.set(conf, [])
      groups.get(conf).push(team)
    })
    // Sort: largest groups first (Power-5 lands at top), 'Other' always last.
    return Array.from(groups.entries())
      .sort(([a, ax], [b, bx]) => {
        if (a === 'Other') return 1
        if (b === 'Other') return -1
        return bx.length - ax.length
      })
  }, [filteredTeams, customConferences, teamsSource])

  const editingTeam = editingTid != null
    ? (teamsSource[editingTid] || TEAMS[editingTid] || null)
    : null

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
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teams…"
              className="sm:w-64"
            />
            {!isViewOnly && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded bg-surface-3 hover:bg-surface-4 text-txt-primary transition-colors flex-shrink-0"
                title="Add a team to this dynasty"
              >
                + Add Team
              </button>
            )}
          </div>
        }
      />

      {filteredTeams.length > 0 ? (
        <div className="space-y-6 stagger-reveal">
          {groupedByConference.map(([confName, teams]) => {
            const confLogo = getConferenceLogo(confName)
            return (
              <section key={confName}>
                {/* Conference header — eyebrow + logo + name + team count.
                    Hairline rule below; the team grid hangs off it. */}
                <div
                  className="flex items-center gap-3 pb-2 mb-3"
                  style={{ borderBottom: '1px solid var(--surface-4)' }}
                >
                  {confLogo && (
                    <img
                      src={confLogo}
                      alt=""
                      className="w-7 h-7 object-contain flex-shrink-0 opacity-90"
                    />
                  )}
                  <h2
                    className="font-display font-bold text-txt-primary leading-none"
                    style={{ fontSize: 'clamp(1rem, 1.5vw, 1.25rem)', letterSpacing: '-0.015em' }}
                  >
                    {confName}
                  </h2>
                  <span
                    className="text-xs font-semibold uppercase tracking-wider text-txt-tertiary tabular-nums"
                    style={{ letterSpacing: '1.5px' }}
                  >
                    {teams.length} {teams.length === 1 ? 'team' : 'teams'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {teams.map(team => (
                    <div
                      key={team.tid}
                      className="team-card group relative flex items-center gap-3 px-3 py-3 rounded-lg bg-surface-2 transition-all duration-200"
                      style={{
                        border: '1px solid var(--surface-4)',
                      }}
                    >
                      <Link
                        to={`${pathPrefix}/team/${team.tid}/${currentDynasty.currentYear}`}
                        className="flex items-center gap-3 flex-1 min-w-0 no-underline"
                      >
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
                        <span className="flex-1 min-w-0 text-sm font-semibold text-txt-primary truncate transition-colors group-hover:text-txt-primary">
                          {team.name}
                        </span>
                      </Link>
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
                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setEditingTid(team.tid)
                          }}
                          className="flex-shrink-0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider rounded text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors"
                          title={`Edit ${team.name}`}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No teams found"
            message={`Nothing matched "${searchQuery}". Try a different search.`}
          />
        </Card>
      )}

      {editingTeam && (
        <TeambuilderEditModal
          isOpen={editingTid != null}
          onClose={() => setEditingTid(null)}
          team={editingTeam}
          tid={editingTid}
          dynastyTeams={teamsSource}
          onSave={async (updates) => {
            const result = await updateTeambuilderTeam(currentDynasty.id, editingTid, updates)
            if (!result.success) throw new Error(result.message)
            toast.success(`${updates.name} updated`)
          }}
        />
      )}

      {adding && (
        <TeambuilderEditModal
          isOpen={adding}
          onClose={() => setAdding(false)}
          team={null}
          tid={null}
          dynastyTeams={teamsSource}
          mode="add"
          onSave={async (updates) => {
            const result = await addCustomTeam(currentDynasty.id, updates)
            if (!result.success) throw new Error(result.message)
            toast.success(`${updates.name} added`)
          }}
        />
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
