import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS } from '../../data/teamRegistry'
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 stagger-reveal">
          {filteredTeams.map(team => (
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
