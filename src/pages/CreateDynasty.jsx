import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchableSelect from '../components/SearchableSelect'
import DropdownSelect from '../components/DropdownSelect'
import ImageUpload from '../components/ImageUpload'
import { teams } from '../data/teams'
import { getSelectableTeamsList, getTeamName } from '../data/teamAbbreviations'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { PageHero, Card, Button, Tabs, Input } from '../components/ui'

export default function CreateDynasty() {
  const navigate = useNavigate()
  const { createDynasty } = useDynasty()
  const { user } = useAuth()

  const [mode, setMode] = useState('fbs')

  const [formData, setFormData] = useState({
    teamName: '',
    coachName: '',
    coachPosition: 'HC',
    startYear: '2025'
  })

  const [teambuilderTeam, setTeambuilderTeam] = useState({
    name: '',
    abbreviation: '',
    logoUrl: '',
    primaryColor: '#FF5500',
    secondaryColor: '#FFFFFF',
    replacesTeam: ''
  })

  const [creating, setCreating] = useState(false)
  const [abbrError, setAbbrError] = useState('')

  const allFbsAbbreviations = getSelectableTeamsList()

  const validateAbbreviation = (abbr, replacesTeam) => {
    const upperAbbr = abbr.toUpperCase()
    if (upperAbbr.length > 0 && upperAbbr.length < 2) {
      return 'Abbreviation must be 2-4 characters'
    }
    if (upperAbbr.length > 4) {
      return 'Abbreviation must be 2-4 characters'
    }
    if (upperAbbr.length >= 2) {
      const conflictingTeam = allFbsAbbreviations.find(fbs => fbs === upperAbbr)
      if (conflictingTeam && conflictingTeam !== replacesTeam) {
        return `"${upperAbbr}" is already used by ${getTeamName(conflictingTeam)}`
      }
    }
    return ''
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleTeambuilderChange = (field, value) => {
    setTeambuilderTeam(prev => {
      const updated = { ...prev, [field]: value }

      if (field === 'abbreviation' || field === 'replacesTeam') {
        const abbr = field === 'abbreviation' ? value : prev.abbreviation
        const replaces = field === 'replacesTeam' ? value : prev.replacesTeam
        setAbbrError(validateAbbreviation(abbr, replaces))
      }

      return updated
    })
  }

  const isTeambuilderValid = () => {
    return (
      teambuilderTeam.name.trim().length > 0 &&
      teambuilderTeam.abbreviation.length >= 2 &&
      teambuilderTeam.abbreviation.length <= 4 &&
      teambuilderTeam.replacesTeam.length > 0 &&
      teambuilderTeam.primaryColor.length > 0 &&
      teambuilderTeam.secondaryColor.length > 0 &&
      !abbrError
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCreating(true)

    try {
      let dynastyData = { ...formData }

      if (mode === 'teambuilder') {
        const abbr = teambuilderTeam.abbreviation.toUpperCase()
        dynastyData.teamName = teambuilderTeam.name
        dynastyData.customTeams = {
          [abbr]: {
            name: teambuilderTeam.name,
            abbreviation: abbr,
            logoUrl: teambuilderTeam.logoUrl,
            backgroundColor: teambuilderTeam.primaryColor,
            textColor: teambuilderTeam.secondaryColor,
            primaryColor: teambuilderTeam.primaryColor,
            secondaryColor: teambuilderTeam.secondaryColor,
            replacesTeam: teambuilderTeam.replacesTeam
          }
        }
      }

      const newDynasty = await createDynasty(dynastyData)
      navigate(`/dynasty/${newDynasty.id}`)
    } catch (error) {
      console.error('Failed to create dynasty:', error)
      alert(`Failed to create dynasty: ${error.message}`)
      setCreating(false)
    }
  }

  const fbsTeamOptions = getSelectableTeamsList().map(abbr => ({
    value: abbr,
    label: `${getTeamName(abbr)} (${abbr})`
  }))

  const neutralColors = { primary: 'var(--team-primary)', secondary: 'var(--team-secondary)' }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageHero eyebrow="New Dynasty" title="Create New Dynasty" />

      <Card>
        {user ? (
          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-3)', borderLeft: '3px solid var(--accent-success)' }}>
            <p className="label-sm text-txt-primary mb-1">Google Sheets Integration Enabled</p>
            <p className="text-sm text-txt-secondary">
              Your dynasty will automatically create a Google Sheet for schedule and roster management.
            </p>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--surface-3)', borderLeft: '3px solid var(--accent-warning)' }}>
            <p className="label-sm text-txt-primary mb-1">Sign in for Google Sheets</p>
            <p className="text-sm text-txt-secondary">
              Sign in with Google to enable automatic Google Sheets creation for your dynasty. Otherwise, you'll use the built-in spreadsheet.
            </p>
          </div>
        )}

        <div className="mb-6">
          <Tabs
            variant="pill"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'fbs', label: 'FBS Team' },
              { value: 'teambuilder', label: 'Teambuilder' },
            ]}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'fbs' ? (
            <div>
              <SearchableSelect
                label="Team Name"
                options={teams}
                value={formData.teamName}
                onChange={(value) => setFormData({ ...formData, teamName: value })}
                placeholder="Search for your team..."
                required
                teamColors={neutralColors}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-lg" style={{ border: '1px dashed var(--surface-5)' }}>
                <p className="text-sm text-txt-secondary">
                  Create your teambuilder team to replace an existing FBS team. Your team will take that team's place in conferences and schedules.
                </p>
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-2">Team Name *</label>
                <Input
                  type="text"
                  value={teambuilderTeam.name}
                  onChange={(e) => handleTeambuilderChange('name', e.target.value)}
                  placeholder="e.g. Springfield Tigers"
                  required
                />
                <p className="text-xs mt-1 text-txt-tertiary">
                  Full team name including mascot (like "Alabama Crimson Tide")
                </p>
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-2">Abbreviation (2-4 characters) *</label>
                <Input
                  type="text"
                  value={teambuilderTeam.abbreviation}
                  onChange={(e) => handleTeambuilderChange('abbreviation', e.target.value.toUpperCase().slice(0, 4))}
                  className="font-mono"
                  placeholder="e.g. SPFD"
                  maxLength={4}
                  hasError={!!abbrError}
                  required
                />
                {abbrError && (
                  <p className="text-sm mt-1" style={{ color: 'var(--accent-error)' }}>{abbrError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-xs text-txt-tertiary block mb-2">Primary Color *</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={teambuilderTeam.primaryColor}
                      onChange={(e) => handleTeambuilderChange('primaryColor', e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer"
                      style={{ border: '1px solid var(--surface-5)' }}
                    />
                    <Input
                      type="text"
                      value={teambuilderTeam.primaryColor}
                      onChange={(e) => handleTeambuilderChange('primaryColor', e.target.value)}
                      className="flex-1 font-mono"
                      placeholder="#FF5500"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-xs text-txt-tertiary block mb-2">Secondary Color *</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={teambuilderTeam.secondaryColor}
                      onChange={(e) => handleTeambuilderChange('secondaryColor', e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer"
                      style={{ border: '1px solid var(--surface-5)' }}
                    />
                    <Input
                      type="text"
                      value={teambuilderTeam.secondaryColor}
                      onChange={(e) => handleTeambuilderChange('secondaryColor', e.target.value)}
                      className="flex-1 font-mono"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-2">Team Logo (Optional)</label>
                <ImageUpload
                  value={teambuilderTeam.logoUrl}
                  onChange={(url) => handleTeambuilderChange('logoUrl', url)}
                  teamColors={neutralColors}
                  compact
                />
                <p className="text-xs mt-1 text-txt-tertiary">
                  Upload a logo or paste an image URL. Square images work best.
                </p>
              </div>

              <div>
                <label className="label-xs text-txt-tertiary block mb-2">Replaces Team *</label>
                <DropdownSelect
                  options={fbsTeamOptions}
                  value={teambuilderTeam.replacesTeam}
                  onChange={(value) => handleTeambuilderChange('replacesTeam', value)}
                  placeholder="Select team to replace..."
                  required
                  teamColors={neutralColors}
                />
                <p className="text-xs mt-1 text-txt-tertiary">
                  Your team will take this team's slot in conferences and schedules.
                </p>
              </div>

              {teambuilderTeam.name && (
                <Card accent="left" padding="md">
                  <p className="label-xs text-txt-tertiary mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    {teambuilderTeam.logoUrl ? (
                      <img
                        src={teambuilderTeam.logoUrl}
                        alt={teambuilderTeam.name}
                        className="w-12 h-12 object-contain rounded"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded flex items-center justify-center font-bold text-lg tabular"
                        style={{
                          backgroundColor: teambuilderTeam.primaryColor,
                          color: teambuilderTeam.secondaryColor
                        }}
                      >
                        {teambuilderTeam.abbreviation || '?'}
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-txt-primary">
                        {teambuilderTeam.name || 'Team Name'}
                      </p>
                      <p className="text-sm text-txt-tertiary tabular">
                        {teambuilderTeam.abbreviation || 'ABBR'}
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          <div>
            <label htmlFor="coachName" className="label-xs text-txt-tertiary block mb-2">Coach Name</label>
            <Input
              type="text"
              id="coachName"
              name="coachName"
              value={formData.coachName}
              onChange={handleChange}
              placeholder="Coach Smith"
              required
            />
          </div>

          <div>
            <DropdownSelect
              label="Coaching Position"
              options={[
                { value: 'HC', label: 'Head Coach (HC)' },
                { value: 'OC', label: 'Offensive Coordinator (OC)' },
                { value: 'DC', label: 'Defensive Coordinator (DC)' }
              ]}
              value={formData.coachPosition}
              onChange={(value) => setFormData({ ...formData, coachPosition: value })}
              placeholder="Search positions..."
              required
              teamColors={neutralColors}
            />
          </div>

          <div>
            <label htmlFor="startYear" className="label-xs text-txt-tertiary block mb-2">Starting Year</label>
            <Input
              type="number"
              id="startYear"
              name="startYear"
              value={formData.startYear}
              onChange={handleChange}
              min="2024"
              max="2099"
              required
              className="tabular"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={creating || (mode === 'teambuilder' && !isTeambuilderValid()) || (mode === 'fbs' && !formData.teamName)}
            >
              {creating ? 'Creating Dynasty...' : 'Create Dynasty'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
