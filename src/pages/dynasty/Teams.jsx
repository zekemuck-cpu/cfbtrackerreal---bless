import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDynasty, getCurrentCustomConferences } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { TEAMS } from '../../data/teamRegistry'
import { getTeamConference } from '../../data/conferenceTeams'
import { getConferenceLogo } from '../../data/conferenceLogos'
import { getSchoolName } from '../../data/teams'
import { getContrastTextColor } from '../../utils/colorUtils'
import { PageHero, Card, EmptyState, Input } from '../../components/ui'
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
        title="All Teams"
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

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-2.5">
                  {teams.map(team => {
                    const color = team.primaryColor || '#374151'
                    const txt = getContrastTextColor(color)
                    const school = getSchoolName(team.abbr, teamsSource) || team.name
                    return (
                    <div
                      key={team.tid}
                      className="team-tile group relative aspect-square rounded-xl overflow-hidden cfb-texture cfb-texture-strong"
                      style={{
                        backgroundColor: color,
                        backgroundImage: 'linear-gradient(150deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 44%), linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.46) 100%)',
                      }}
                    >
                      <Link
                        to={`${pathPrefix}/team/${team.tid}/${currentDynasty.currentYear}`}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2.5 no-underline text-center"
                      >
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center p-1.5 shadow-md flex-shrink-0 transition-transform duration-200 group-hover:scale-105">
                          {team.logo ? (
                            <img src={team.logo} alt="" className="w-full h-full object-contain" loading="lazy" decoding="async" />
                          ) : (
                            <span className="font-display font-black text-base" style={{ color }}>{team.abbr}</span>
                          )}
                        </div>
                        <span
                          className="font-display font-bold leading-tight line-clamp-2"
                          style={{ color: txt, fontSize: 'clamp(0.6875rem, 0.85vw, 0.875rem)', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
                        >
                          {school}
                        </span>
                      </Link>
                      {!isViewOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setEditingTid(team.tid)
                          }}
                          className="absolute top-1.5 right-1.5 px-2 py-1 text-[10px] font-semibold uppercase rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          style={{ letterSpacing: '1px', backgroundColor: 'rgba(0,0,0,0.42)', color: txt }}
                          title={`Edit ${team.name}`}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    )
                  })}
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
        .team-tile {
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          transition: transform 200ms cubic-bezier(0.23,1,0.32,1), box-shadow 200ms ease, filter 200ms ease;
        }
        .team-tile:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 24px rgba(0,0,0,0.4);
          filter: brightness(1.07);
        }
      `}</style>
    </div>
  )
}
