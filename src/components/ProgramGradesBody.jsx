import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getTeamLogoByTid, stripMascotFromName, getMascotName } from '../data/teams'
import { getAbbrFromTid } from '../data/teamRegistry'
import { Card, EmptyState } from './ui'

// EA's own letter grades (Aplus/Aminus/Bplus/... down to F) -> a display
// label + color tier. Verified against a real save via Team.MySchoolTrackingTable.
function formatGrade(raw) {
  if (!raw) return { label: '—', color: 'var(--text-tertiary)' }
  const letter = raw[0]
  const modifier = raw.endsWith('plus') ? '+' : raw.endsWith('minus') ? '-' : ''
  const label = `${letter}${modifier}`
  const colors = {
    A: '#22c55e',
    B: '#84cc16',
    C: '#f59e0b',
    D: '#f97316',
    F: '#ef4444',
  }
  return { label, color: colors[letter] || 'var(--text-tertiary)' }
}

const GRADE_COLUMNS = [
  { key: 'conferencePrestigeGrade', label: 'Conf. Prestige' },
  { key: 'coachPrestigeGrade', label: 'Coach Prestige' },
  { key: 'coachStabilityGrade', label: 'Coach Stability' },
  { key: 'academicPrestigeGrade', label: 'Academics' },
  { key: 'athleticFacilitiesGrade', label: 'Facilities' },
  { key: 'brandExposureGrade', label: 'Brand Exposure' },
  { key: 'programTraditionGrade', label: 'Tradition' },
  { key: 'stadiumAtmosphereGrade', label: 'Atmosphere' },
  { key: 'championshipContenderGrade', label: 'Contender' },
]

function GradeChip({ raw }) {
  const { label, color } = formatGrade(raw)
  return (
    <span
      className="inline-flex items-center justify-center w-9 h-7 rounded text-xs font-black tabular"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {label}
    </span>
  )
}

/**
 * Shows the viewed team's own program/school grades plus a sortable
 * whole-league comparison table. Sourced from CFB27 sync — see
 * cfb27SaveSync.js's mapSchoolGrades / extractPlayers.cjs's
 * buildLeagueSchoolGrades (Team.MySchoolTrackingTable). No page chrome, so
 * it can be toggled inline on TeamYear.jsx's recruiting tab, same pattern
 * as TopClassesBody on the Commitments page.
 */
export function ProgramGradesBody({ dynasty, tid, year, pathPrefix }) {
  const [sortKey, setSortKey] = useState('conferencePrestigeGrade')
  const teamsSource = dynasty?.teams || {}

  const viewedGrades = teamsSource?.[tid]?.byYear?.[year]?.schoolGrades || null

  const rows = useMemo(() => {
    const out = []
    for (const [tidStr, team] of Object.entries(teamsSource)) {
      const grades = team?.byYear?.[year]?.schoolGrades
      if (!grades) continue
      const rowTid = Number(tidStr)
      const mascotName = team?.name || getMascotName(rowTid, teamsSource)
      const abbr = team?.abbr || getAbbrFromTid(teamsSource, rowTid)
      out.push({
        tid: rowTid,
        name: stripMascotFromName(mascotName) || mascotName || abbr || `Team ${rowTid}`,
        logo: getTeamLogoByTid(rowTid, teamsSource),
        grades,
      })
    }
    return out
  }, [teamsSource, year])

  // Grade letters sort worst-to-best alphabetically if reversed with modifier
  // weight — simplest correct approach is a small ordinal map.
  const gradeRank = (raw) => {
    if (!raw) return -1
    const order = ['F', 'Dminus', 'D', 'Dplus', 'Cminus', 'C', 'Cplus', 'Bminus', 'B', 'Bplus', 'Aminus', 'A', 'Aplus']
    const idx = order.indexOf(raw)
    return idx === -1 ? -1 : idx
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => gradeRank(b.grades[sortKey]) - gradeRank(a.grades[sortKey])),
    [rows, sortKey]
  )

  if (!viewedGrades && rows.length === 0) {
    return (
      <Card>
        <EmptyState title="No Program Grades Yet" message="Sync from your CFB27 save to populate program/school grades." />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {viewedGrades && (
        <Card padding="sm">
          <div className="px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-txt-secondary">This Team</div>
          <div className="flex flex-wrap gap-3 px-2 pb-2">
            {GRADE_COLUMNS.map((c) => (
              <div key={c.key} className="flex flex-col items-center gap-1">
                <GradeChip raw={viewedGrades[c.key]} />
                <span className="text-[10px] text-txt-tertiary text-center leading-tight" style={{ maxWidth: 64 }}>{c.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-txt-tertiary">
                <th className="text-left px-2 py-1.5">Team</th>
                {GRADE_COLUMNS.map((c) => (
                  <th key={c.key} className="px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => setSortKey(c.key)}
                      className={`whitespace-nowrap transition-colors ${sortKey === c.key ? 'text-txt-primary' : 'hover:text-txt-secondary'}`}
                    >
                      {c.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-4">
              {sorted.map((r) => (
                <tr
                  key={r.tid}
                  style={Number(r.tid) === Number(tid) ? { boxShadow: 'inset 0 0 0 1px var(--accent-warning)' } : undefined}
                >
                  <td className="px-2 py-1.5">
                    {pathPrefix ? (
                      <Link
                        to={`${pathPrefix}/team/${r.tid}/${year}?tab=recruiting`}
                        className="flex items-center gap-2 no-underline hover:opacity-80"
                      >
                        <span className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 flex items-center justify-center">
                          {r.logo ? <img src={r.logo} alt="" className="w-full h-full object-contain" /> : null}
                        </span>
                        <span className="font-semibold text-txt-primary truncate">{r.name}</span>
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-white p-0.5 flex-shrink-0 flex items-center justify-center">
                          {r.logo ? <img src={r.logo} alt="" className="w-full h-full object-contain" /> : null}
                        </span>
                        <span className="font-semibold text-txt-primary truncate">{r.name}</span>
                      </div>
                    )}
                  </td>
                  {GRADE_COLUMNS.map((c) => (
                    <td key={c.key} className="px-1 py-1.5 text-center">
                      <GradeChip raw={r.grades[c.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
