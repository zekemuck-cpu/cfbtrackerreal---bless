import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Modal from './ui/Modal'
import { getTeamLogoByTid } from '../data/teams'
import { mapCoachPortraitUrl } from '../data/cfb27SaveImport'
import { proxyImageUrl } from '../utils/imageProxy'
import { usePathPrefix } from '../hooks/usePathPrefix'

// Coach.CoachPrestige decodes to raw enum symbols like "Dplus" on dynasties
// synced before the extraction-side formatting existed — normalize
// defensively here too (same table CoachCareer.jsx keeps for its own panel).
const LETTER_GRADE_DISPLAY = {
  Aplus: 'A+', A: 'A', Aminus: 'A-',
  Bplus: 'B+', B: 'B', Bminus: 'B-',
  Cplus: 'C+', C: 'C', Cminus: 'C-',
  Dplus: 'D+', D: 'D', Dminus: 'D-',
  F: 'F', Incomplete: null,
}
const formatGrade = (g) => (g ? (LETTER_GRADE_DISPLAY[g] ?? g) : '—')

const jobSecurityColor = (pct) => {
  if (pct == null) return 'var(--text-tertiary)'
  if (pct >= 75) return 'var(--accent-success, #22c55e)'
  if (pct >= 50) return '#eab308'
  if (pct >= 25) return '#d9770a'
  return 'var(--accent-error, #ef4444)'
}

// Column config drives both the sortable header row and each row's cells —
// `get` returns the raw sortable value (missing data sorts last regardless
// of direction), `format` returns the display string.
const COLUMNS = [
  {
    key: 'prestigeScore', label: 'Prestige Score',
    get: (c) => c.prestigeScore ?? -Infinity,
    format: (c) => (c.prestigeScore != null ? c.prestigeScore.toLocaleString() : '—'),
  },
  {
    key: 'jobSecurityPct', label: 'Job Security',
    get: (c) => c.jobSecurityPct ?? -Infinity,
    format: (c) => (c.jobSecurityPct != null ? `${c.jobSecurityPct}%` : '—'),
    color: (c) => jobSecurityColor(c.jobSecurityPct),
  },
  {
    key: 'prestigeGrade', label: 'Prestige',
    get: (c) => c.prestigeScore ?? -Infinity,
    format: (c) => formatGrade(c.prestigeGrade),
  },
  {
    key: 'wins', label: 'Career',
    get: (c) => c.wins ?? -Infinity,
    format: (c) => `${c.wins ?? 0}-${c.losses ?? 0}`,
  },
  {
    key: 'winPct', label: 'CW%',
    get: (c) => ((c.wins ?? 0) + (c.losses ?? 0) > 0 ? (c.wins ?? 0) / ((c.wins ?? 0) + (c.losses ?? 0)) : -Infinity),
    format: (c) => (((c.wins ?? 0) + (c.losses ?? 0)) > 0 ? ((c.wins ?? 0) / ((c.wins ?? 0) + (c.losses ?? 0))).toFixed(3) : '0.000'),
  },
  {
    key: 'playoffWins', label: 'Playoff',
    get: (c) => c.playoffWins ?? -Infinity,
    format: (c) => `${c.playoffWins ?? 0}-${c.playoffLosses ?? 0}`,
  },
  {
    key: 'playoffWinPct', label: 'PW%',
    get: (c) => ((c.playoffWins ?? 0) + (c.playoffLosses ?? 0) > 0 ? (c.playoffWins ?? 0) / ((c.playoffWins ?? 0) + (c.playoffLosses ?? 0)) : -Infinity),
    format: (c) => (((c.playoffWins ?? 0) + (c.playoffLosses ?? 0)) > 0 ? ((c.playoffWins ?? 0) / ((c.playoffWins ?? 0) + (c.playoffLosses ?? 0))).toFixed(3) : '0.000'),
  },
  { key: 'ncWins', label: 'NC', get: (c) => c.ncWins ?? 0, format: (c) => c.ncWins ?? 0 },
  { key: 'confChampWins', label: 'Conf', get: (c) => c.confChampWins ?? 0, format: (c) => c.confChampWins ?? 0 },
  { key: 'firstRoundDraftPicks', label: '1st Rd', get: (c) => c.firstRoundDraftPicks ?? 0, format: (c) => c.firstRoundDraftPicks ?? 0 },
  { key: 'draftPicks', label: 'Draft', get: (c) => c.draftPicks ?? 0, format: (c) => c.draftPicks ?? 0 },
  { key: 'top5RecruitClasses', label: 'T5 Rec', get: (c) => c.top5RecruitClasses ?? 0, format: (c) => c.top5RecruitClasses ?? 0 },
]

export default function AllCoachesModal({ isOpen, onClose, dynasty, coaches, userTid }) {
  const pathPrefix = usePathPrefix()
  const teamsData = dynasty?.teams || {}
  const [sortKey, setSortKey] = useState('prestigeScore')
  const [sortDir, setSortDir] = useState('desc')

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey)
    if (!col) return coaches || []
    const withValues = (coaches || []).map((c) => ({ c, v: col.get(c) }))
    withValues.sort((a, b) => (sortDir === 'asc' ? a.v - b.v : b.v - a.v))
    return withValues.map((x) => x.c)
  }, [coaches, sortKey, sortDir])

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" title="All Coaches">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-surface-4">
              <th className="text-left px-2 py-2 text-txt-tertiary label-xs whitespace-nowrap">#</th>
              <th className="text-left px-2 py-2 text-txt-tertiary label-xs whitespace-nowrap">Coach</th>
              <th className="text-left px-2 py-2 text-txt-tertiary label-xs whitespace-nowrap">Team</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-left px-2 py-2 text-txt-tertiary label-xs whitespace-nowrap cursor-pointer hover:text-txt-primary transition-colors select-none"
                >
                  {col.label}{sortKey === col.key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const team = teamsData[c.tid]
              const logo = getTeamLogoByTid(c.tid, teamsData)
              const photoUrl = c.genericHeadAssetName ? mapCoachPortraitUrl(c.genericHeadAssetName) : null
              const isUser = userTid != null && Number(c.tid) === Number(userTid)
              return (
                <tr
                  key={`${c.tid}-${c.name}-${i}`}
                  className="border-b border-surface-4/50 hover:bg-surface-2 transition-colors"
                  style={isUser ? { backgroundColor: 'color-mix(in srgb, var(--accent-primary, #3b82f6) 16%, transparent)' } : undefined}
                >
                  <td className="px-2 py-2 text-txt-tertiary tabular-nums">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 bg-surface-3 flex items-center justify-center">
                        {photoUrl
                          ? <img src={proxyImageUrl(photoUrl, 80)} alt="" className="w-full h-full object-cover" />
                          : <span className="text-[10px] font-bold text-txt-tertiary">{(c.name || '?').charAt(0)}</span>}
                      </span>
                      <span className="font-semibold text-txt-primary truncate">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Link to={`${pathPrefix}/team/${c.tid}/${dynasty.currentYear}`} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
                      {logo && <img src={logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />}
                      <span className="truncate text-txt-secondary">{team?.abbr || ''}</span>
                    </Link>
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="px-2 py-2 tabular-nums whitespace-nowrap"
                      style={{ color: col.color ? col.color(c) : 'var(--text-primary)' }}
                    >
                      {col.format(c)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {(!coaches || coaches.length === 0) && (
          <p className="text-txt-tertiary text-sm py-6 text-center">No coach data yet — sync from your CFB27 save to populate this list.</p>
        )}
      </div>
    </Modal>
  )
}
