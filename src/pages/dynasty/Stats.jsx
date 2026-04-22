import { useState } from 'react'
import { useDynasty, getUserGamePerspective } from '../../context/DynastyContext'
import { PageHero, Card, EmptyState, SectionHeader, TitleWithYear } from '../../components/ui'

export default function Stats() {
  const { currentDynasty } = useDynasty()
  const [selectedYear, setSelectedYear] = useState(null)

  if (!currentDynasty) return null

  const teamStatsByYear = currentDynasty.teamStatsByYear || {}
  const availableYears = Object.keys(teamStatsByYear)
    .map(y => parseInt(y))
    .sort((a, b) => b - a)

  const displayYear = selectedYear || (availableYears.length > 0 ? availableYears[0] : currentDynasty.currentYear)
  const yearStats = teamStatsByYear[displayYear] || {}

  const pct = (num, den) => {
    if (!den || den === 0) return 'N/A'
    return `${((num || 0) / den * 100).toFixed(1)}%`
  }

  const hasStats = Object.keys(yearStats).length > 0

  return (
    <div className="space-y-6">
      <PageHero
        title={
          availableYears.length > 0 ? (
            <TitleWithYear
              year={displayYear}
              years={availableYears}
              onChange={(y) => setSelectedYear(y)}
              label="Team Statistics"
            />
          ) : (
            "Team Statistics"
          )
        }
        meta={availableYears.length > 0 ? <span className="tabular">Season totals</span> : null}
      />

      {hasStats ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="none">
            <SectionHeader title="Offense" className="px-4 pt-4" />
            <div className="px-4 pb-4 pt-2 space-y-0">
              <StatRow label="First Downs" value={yearStats.firstDowns || 0} />
              <StatRow
                label="Red Zone"
                value={`${yearStats.redZoneTds || 0}/${yearStats.redZoneAttempts || 0}`}
                subValue={pct(yearStats.redZoneTds, yearStats.redZoneAttempts)}
              />
              <StatRow
                label="3rd Down"
                value={`${yearStats.thirdDownConversions || 0}/${yearStats.thirdDownAttempts || 0}`}
                subValue={pct(yearStats.thirdDownConversions, yearStats.thirdDownAttempts)}
              />
              <StatRow
                label="4th Down"
                value={`${yearStats.fourthDownConversions || 0}/${yearStats.fourthDownAttempts || 0}`}
                subValue={pct(yearStats.fourthDownConversions, yearStats.fourthDownAttempts)}
              />
            </div>
          </Card>

          <Card padding="none">
            <SectionHeader title="Defense" className="px-4 pt-4" />
            <div className="px-4 pb-4 pt-2 space-y-0">
              <StatRow label="Rush Yards Allowed" value={yearStats.rushYardsAllowed || 0} />
              <StatRow label="Pass Yards Allowed" value={yearStats.passYardsAllowed || 0} />
              <StatRow
                label="Red Zone Defense"
                value={`${yearStats.defRzTds || 0}/${yearStats.defRzAttempts || 0}`}
                subValue={pct(yearStats.defRzTds, yearStats.defRzAttempts)}
              />
            </div>
          </Card>

          <Card padding="none">
            <SectionHeader title="Special Teams" className="px-4 pt-4" />
            <div className="px-4 pb-4 pt-2 space-y-0">
              <StatRow
                label="2-Point Conversions"
                value={`${yearStats.twoptConversions || 0}/${yearStats.twoptAttempts || 0}`}
                subValue={pct(yearStats.twoptConversions, yearStats.twoptAttempts)}
              />
            </div>
          </Card>

          <Card padding="none">
            <SectionHeader title="Penalties" className="px-4 pt-4" />
            <div className="px-4 pb-4 pt-2 space-y-0">
              <StatRow label="Penalties" value={yearStats.penalties || 0} />
              <StatRow
                label="Penalty Yardage"
                value={yearStats.penaltyYardage || 0}
                subValue={
                  yearStats.penalties
                    ? `${(yearStats.penaltyYardage / yearStats.penalties).toFixed(1)} yds/pen`
                    : ''
                }
              />
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No team statistics yet"
            message="Complete a season and enter team statistics to see detailed stats here."
          />
        </Card>
      )}
    </div>
  )
}

function StatRow({ label, value, subValue }) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: '1px solid var(--surface-4)' }}
    >
      <span className="text-sm text-txt-secondary">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold tabular text-txt-primary">{value}</span>
        {subValue && (
          <span className="ml-2 label-xs text-txt-tertiary">{subValue}</span>
        )}
      </div>
    </div>
  )
}
