import { useState } from 'react'
import { useDynasty } from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'

// Stat display configuration
const STAT_DISPLAY = {
  firstDowns: { name: 'First Downs', category: 'offense' },
  rushYardsAllowed: { name: 'Rush Yards Allowed', category: 'defense' },
  passYardsAllowed: { name: 'Pass Yards Allowed', category: 'defense' },
  redZoneAttempts: { name: 'Red Zone Attempts', category: 'offense' },
  redZoneTds: { name: 'Red Zone TDs', category: 'offense' },
  defRzAttempts: { name: 'Def. RZ Attempts', category: 'defense' },
  defRzTds: { name: 'Def. RZ TDs', category: 'defense' },
  thirdDownConversions: { name: '3rd Down Conversions', category: 'offense' },
  thirdDownAttempts: { name: '3rd Down Attempts', category: 'offense' },
  fourthDownConversions: { name: '4th Down Conversions', category: 'offense' },
  fourthDownAttempts: { name: '4th Down Attempts', category: 'offense' },
  twoptConversions: { name: '2pt Conversions', category: 'special' },
  twoptAttempts: { name: '2pt Attempts', category: 'special' },
  penalties: { name: 'Penalties', category: 'discipline' },
  penaltyYardage: { name: 'Penalty Yardage', category: 'discipline' }
}

export default function Stats() {
  const { currentDynasty } = useDynasty()
  const teamColors = useTeamColors(currentDynasty?.teamName, currentDynasty?.customTeams)
  const [selectedYear, setSelectedYear] = useState(null)

  if (!currentDynasty) return null

  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Calculate records
  const getSeasonRecord = (year) => {
    const seasonGames = (currentDynasty.games || []).filter(g => g.year === year)
    const wins = seasonGames.filter(g => g.result === 'win').length
    const losses = seasonGames.filter(g => g.result === 'loss').length
    return { wins, losses, total: `${wins}-${losses}` }
  }

  const getAllTimeRecord = () => {
    const games = currentDynasty.games || []
    const wins = games.filter(g => g.result === 'win').length
    const losses = games.filter(g => g.result === 'loss').length
    return { wins, losses, total: `${wins}-${losses}` }
  }

  // Get available years with team stats
  const teamStatsByYear = currentDynasty.teamStatsByYear || {}
  const availableYears = Object.keys(teamStatsByYear)
    .map(y => parseInt(y))
    .sort((a, b) => b - a)

  // Set default year to most recent
  const displayYear = selectedYear || (availableYears.length > 0 ? availableYears[0] : currentDynasty.currentYear)
  const yearStats = teamStatsByYear[displayYear] || {}

  const seasonRecord = getSeasonRecord(displayYear)
  const allTimeRecord = getAllTimeRecord()

  // Calculate derived stats
  const getRedZonePercentage = () => {
    if (!yearStats.redZoneAttempts || yearStats.redZoneAttempts === 0) return 'N/A'
    const pct = ((yearStats.redZoneTds || 0) / yearStats.redZoneAttempts * 100).toFixed(1)
    return `${pct}%`
  }

  const getThirdDownPercentage = () => {
    if (!yearStats.thirdDownAttempts || yearStats.thirdDownAttempts === 0) return 'N/A'
    const pct = ((yearStats.thirdDownConversions || 0) / yearStats.thirdDownAttempts * 100).toFixed(1)
    return `${pct}%`
  }

  const getFourthDownPercentage = () => {
    if (!yearStats.fourthDownAttempts || yearStats.fourthDownAttempts === 0) return 'N/A'
    const pct = ((yearStats.fourthDownConversions || 0) / yearStats.fourthDownAttempts * 100).toFixed(1)
    return `${pct}%`
  }

  const getDefRedZonePercentage = () => {
    if (!yearStats.defRzAttempts || yearStats.defRzAttempts === 0) return 'N/A'
    const pct = ((yearStats.defRzTds || 0) / yearStats.defRzAttempts * 100).toFixed(1)
    return `${pct}%`
  }

  const getTwoPtPercentage = () => {
    if (!yearStats.twoptAttempts || yearStats.twoptAttempts === 0) return 'N/A'
    const pct = ((yearStats.twoptConversions || 0) / yearStats.twoptAttempts * 100).toFixed(1)
    return `${pct}%`
  }

  // Check if we have stats for this year
  const hasStats = Object.keys(yearStats).length > 0

  return (
    <div className="space-y-6">
      {/* Year Selector Header */}
      {availableYears.length > 0 && (
        <div
          className="rounded-lg shadow-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ backgroundColor: teamColors.secondary }}
        >
          <h2 className="text-xl font-bold" style={{ color: teamColors.primary }}>
            Team Statistics
          </h2>

          <select
            value={displayYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-4 py-2 rounded-lg font-semibold cursor-pointer focus:outline-none focus:ring-2"
            style={{
              backgroundColor: teamColors.primary,
              color: primaryBgText,
              border: `2px solid ${primaryBgText}40`
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year} Season
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Team Stats */}
      {hasStats ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Offensive Stats */}
          <div
            className="rounded-lg shadow-lg overflow-hidden"
            style={{ backgroundColor: teamColors.secondary }}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: teamColors.primary }}
            >
              <svg className="w-6 h-6" fill="none" stroke={primaryBgText} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-lg font-bold" style={{ color: primaryBgText }}>
                Offense
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <StatRow label="First Downs" value={yearStats.firstDowns || 0} textColor={secondaryBgText} />
              <StatRow
                label="Red Zone"
                value={`${yearStats.redZoneTds || 0}/${yearStats.redZoneAttempts || 0}`}
                subValue={getRedZonePercentage()}
                textColor={secondaryBgText}
              />
              <StatRow
                label="3rd Down Conversions"
                value={`${yearStats.thirdDownConversions || 0}/${yearStats.thirdDownAttempts || 0}`}
                subValue={getThirdDownPercentage()}
                textColor={secondaryBgText}
              />
              <StatRow
                label="4th Down Conversions"
                value={`${yearStats.fourthDownConversions || 0}/${yearStats.fourthDownAttempts || 0}`}
                subValue={getFourthDownPercentage()}
                textColor={secondaryBgText}
              />
            </div>
          </div>

          {/* Defensive Stats */}
          <div
            className="rounded-lg shadow-lg overflow-hidden"
            style={{ backgroundColor: teamColors.secondary }}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: '#6B7280' }}
            >
              <svg className="w-6 h-6" fill="none" stroke="#FFFFFF" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-lg font-bold text-white">
                Defense
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <StatRow label="Rush Yards Allowed" value={yearStats.rushYardsAllowed || 0} textColor={secondaryBgText} />
              <StatRow label="Pass Yards Allowed" value={yearStats.passYardsAllowed || 0} textColor={secondaryBgText} />
              <StatRow
                label="Red Zone Defense"
                value={`${yearStats.defRzTds || 0}/${yearStats.defRzAttempts || 0}`}
                subValue={getDefRedZonePercentage()}
                textColor={secondaryBgText}
              />
            </div>
          </div>

          {/* Special Teams / Other */}
          <div
            className="rounded-lg shadow-lg overflow-hidden"
            style={{ backgroundColor: teamColors.secondary }}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: '#3B82F6' }}
            >
              <svg className="w-6 h-6" fill="none" stroke="#FFFFFF" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <h3 className="text-lg font-bold text-white">
                Special Teams
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <StatRow
                label="2-Point Conversions"
                value={`${yearStats.twoptConversions || 0}/${yearStats.twoptAttempts || 0}`}
                subValue={getTwoPtPercentage()}
                textColor={secondaryBgText}
              />
            </div>
          </div>

          {/* Penalties */}
          <div
            className="rounded-lg shadow-lg overflow-hidden"
            style={{ backgroundColor: teamColors.secondary }}
          >
            <div
              className="px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: '#EF4444' }}
            >
              <svg className="w-6 h-6" fill="none" stroke="#FFFFFF" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-lg font-bold text-white">
                Penalties
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <StatRow label="Penalties" value={yearStats.penalties || 0} textColor={secondaryBgText} />
              <StatRow
                label="Penalty Yardage"
                value={yearStats.penaltyYardage || 0}
                subValue={yearStats.penalties ? `${(yearStats.penaltyYardage / yearStats.penalties).toFixed(1)} yds/pen` : ''}
                textColor={secondaryBgText}
              />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg shadow-lg p-8 text-center"
          style={{ backgroundColor: teamColors.secondary }}
        >
          <div style={{ color: secondaryBgText, opacity: 0.5 }} className="mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ color: secondaryBgText }}>
            No Team Statistics Yet
          </h3>
          <p style={{ color: secondaryBgText, opacity: 0.8 }}>
            Complete a season and enter team statistics to see detailed stats here.
          </p>
        </div>
      )}
    </div>
  )
}

// Helper component for stat rows
function StatRow({ label, value, subValue, textColor }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
      <span className="text-sm font-medium" style={{ color: textColor, opacity: 0.8 }}>
        {label}
      </span>
      <div className="text-right">
        <span className="font-bold" style={{ color: textColor }}>
          {value}
        </span>
        {subValue && (
          <span className="ml-2 text-sm" style={{ color: textColor, opacity: 0.7 }}>
            {subValue}
          </span>
        )}
      </div>
    </div>
  )
}
