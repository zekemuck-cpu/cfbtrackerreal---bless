import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchableSelect from '../components/SearchableSelect'
import DropdownSelect from '../components/DropdownSelect'
import ImageUpload from '../components/ImageUpload'
import { teams } from '../data/teams'
import { getSelectableTeamsList, getTeamName } from '../data/teamAbbreviations'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { getTeamColors } from '../data/teamColors'
import { getContrastTextColor } from '../utils/colorUtils'

export default function CreateDynasty() {
  const navigate = useNavigate()
  const { createDynasty } = useDynasty()
  const { user } = useAuth()

  // Mode: 'fbs' for existing team, 'teambuilder' for custom team
  const [mode, setMode] = useState('fbs')

  const [formData, setFormData] = useState({
    teamName: '',
    coachName: '',
    coachPosition: 'HC',
    startYear: '2025'
  })

  // Teambuilder team data (matches FBS team structure exactly)
  const [teambuilderTeam, setTeambuilderTeam] = useState({
    name: '',              // Full name like "Springfield Tigers" (matches FBS format)
    abbreviation: '',      // 2-4 chars like "SPFD"
    logoUrl: '',
    primaryColor: '#FF5500',    // Maps to backgroundColor in FBS
    secondaryColor: '#FFFFFF',  // Maps to textColor in FBS
    replacesTeam: ''       // FBS team abbreviation being replaced
  })

  const [creating, setCreating] = useState(false)
  const [abbrError, setAbbrError] = useState('')

  // Get all FBS team abbreviations for conflict checking
  const allFbsAbbreviations = getSelectableTeamsList()

  // Validate abbreviation against existing FBS teams (except the one being replaced)
  const validateAbbreviation = (abbr, replacesTeam) => {
    const upperAbbr = abbr.toUpperCase()
    if (upperAbbr.length > 0 && upperAbbr.length < 2) {
      return 'Abbreviation must be 2-4 characters'
    }
    if (upperAbbr.length > 4) {
      return 'Abbreviation must be 2-4 characters'
    }
    // Check if abbreviation conflicts with any FBS team still in the dynasty
    if (upperAbbr.length >= 2) {
      const conflictingTeam = allFbsAbbreviations.find(fbs => fbs === upperAbbr)
      // Allow if it matches the team being replaced (that team is going away)
      if (conflictingTeam && conflictingTeam !== replacesTeam) {
        return `"${upperAbbr}" is already used by ${getTeamName(conflictingTeam)}`
      }
    }
    return ''
  }

  // Get colors based on mode
  const selectedTeamColors = mode === 'teambuilder'
    ? { primary: teambuilderTeam.primaryColor || '#1f2937', secondary: teambuilderTeam.secondaryColor || '#ffffff' }
    : (formData.teamName
        ? getTeamColors(formData.teamName)
        : { primary: '#1f2937', secondary: '#ffffff' })

  const textColor = getContrastTextColor(selectedTeamColors.secondary)
  const primaryTextColor = getContrastTextColor(selectedTeamColors.primary)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleTeambuilderChange = (field, value) => {
    setTeambuilderTeam(prev => {
      const updated = { ...prev, [field]: value }

      // Re-validate abbreviation when either abbreviation or replacesTeam changes
      if (field === 'abbreviation' || field === 'replacesTeam') {
        const abbr = field === 'abbreviation' ? value : prev.abbreviation
        const replaces = field === 'replacesTeam' ? value : prev.replacesTeam
        setAbbrError(validateAbbreviation(abbr, replaces))
      }

      return updated
    })
  }

  // Validate teambuilder form
  const isTeambuilderValid = () => {
    return (
      teambuilderTeam.name.trim().length > 0 &&
      teambuilderTeam.abbreviation.length >= 2 &&
      teambuilderTeam.abbreviation.length <= 4 &&
      teambuilderTeam.replacesTeam.length > 0 &&
      teambuilderTeam.primaryColor.length > 0 &&
      teambuilderTeam.secondaryColor.length > 0 &&
      !abbrError  // No abbreviation conflicts
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCreating(true)

    try {
      let dynastyData = { ...formData }

      if (mode === 'teambuilder') {
        // Use teambuilder team data (matches FBS structure)
        const abbr = teambuilderTeam.abbreviation.toUpperCase()
        dynastyData.teamName = teambuilderTeam.name
        dynastyData.customTeams = {
          [abbr]: {
            name: teambuilderTeam.name,
            abbreviation: abbr,
            logoUrl: teambuilderTeam.logoUrl,
            // Use same field names as FBS teams for consistency
            backgroundColor: teambuilderTeam.primaryColor,
            textColor: teambuilderTeam.secondaryColor,
            // Also store as primaryColor/secondaryColor for explicit clarity
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

  // Get list of FBS teams for replacement dropdown
  const fbsTeamOptions = getSelectableTeamsList().map(abbr => ({
    value: abbr,
    label: `${getTeamName(abbr)} (${abbr})`
  }))

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-lg shadow-lg p-8 transition-colors duration-300"
        style={{
          backgroundColor: selectedTeamColors.secondary,
          border: `3px solid ${selectedTeamColors.primary}`
        }}
      >
        <h1
          className="text-3xl font-bold mb-6 transition-colors duration-300"
          style={{ color: selectedTeamColors.primary }}
        >
          Create New Dynasty
        </h1>

        {user ? (
          <div className="mb-6 p-4 rounded-lg bg-green-50 border-2 border-green-500">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-green-900">Google Sheets Integration Enabled</p>
                <p className="text-sm text-green-700 mt-1">
                  Your dynasty will automatically create a Google Sheet for schedule and roster management.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-lg bg-yellow-50 border-2 border-yellow-500">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-yellow-900">Sign in for Google Sheets</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Sign in with Google to enable automatic Google Sheets creation for your dynasty. Otherwise, you'll use the built-in spreadsheet.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="mb-6">
          <div className="flex gap-2 p-1 rounded-lg" style={{ backgroundColor: `${selectedTeamColors.primary}15` }}>
            <button
              type="button"
              onClick={() => setMode('fbs')}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                mode === 'fbs' ? 'shadow-md' : 'hover:bg-white/50'
              }`}
              style={{
                backgroundColor: mode === 'fbs' ? selectedTeamColors.primary : 'transparent',
                color: mode === 'fbs' ? primaryTextColor : selectedTeamColors.primary
              }}
            >
              FBS Team
            </button>
            <button
              type="button"
              onClick={() => setMode('teambuilder')}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                mode === 'teambuilder' ? 'shadow-md' : 'hover:bg-white/50'
              }`}
              style={{
                backgroundColor: mode === 'teambuilder' ? selectedTeamColors.primary : 'transparent',
                color: mode === 'teambuilder' ? primaryTextColor : selectedTeamColors.primary
              }}
            >
              Teambuilder
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'fbs' ? (
            // FBS Team Selection
            <div>
              <SearchableSelect
                label="Team Name"
                options={teams}
                value={formData.teamName}
                onChange={(value) => setFormData({ ...formData, teamName: value })}
                placeholder="Search for your team..."
                required
                teamColors={selectedTeamColors}
              />
            </div>
          ) : (
            // Teambuilder Form
            <div className="space-y-4">
              <div className="p-4 rounded-lg border-2 border-dashed" style={{ borderColor: `${selectedTeamColors.primary}40` }}>
                <p className="text-sm" style={{ color: textColor }}>
                  Create your teambuilder team to replace an existing FBS team. Your team will take that team's place in conferences and schedules.
                </p>
              </div>

              {/* Team Name (Full name like "Springfield Tigers") */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: selectedTeamColors.primary }}
                >
                  Team Name *
                </label>
                <input
                  type="text"
                  value={teambuilderTeam.name}
                  onChange={(e) => handleTeambuilderChange('name', e.target.value)}
                  className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:outline-none"
                  style={{
                    borderColor: `${selectedTeamColors.primary}40`,
                    color: textColor,
                    backgroundColor: 'transparent'
                  }}
                  placeholder="e.g. Springfield Tigers"
                  required
                />
                <p className="text-xs mt-1" style={{ color: textColor, opacity: 0.7 }}>
                  Full team name including mascot (like "Alabama Crimson Tide")
                </p>
              </div>

              {/* Abbreviation */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: selectedTeamColors.primary }}
                >
                  Abbreviation (2-4 characters) *
                </label>
                <input
                  type="text"
                  value={teambuilderTeam.abbreviation}
                  onChange={(e) => handleTeambuilderChange('abbreviation', e.target.value.toUpperCase().slice(0, 4))}
                  className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:outline-none font-mono"
                  style={{
                    borderColor: abbrError ? '#ef4444' : `${selectedTeamColors.primary}40`,
                    color: textColor,
                    backgroundColor: 'transparent'
                  }}
                  placeholder="e.g. SPFD"
                  maxLength={4}
                  required
                />
                {abbrError && (
                  <p className="text-red-500 text-sm mt-1">{abbrError}</p>
                )}
              </div>

              {/* Colors Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: selectedTeamColors.primary }}
                  >
                    Primary Color *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={teambuilderTeam.primaryColor}
                      onChange={(e) => handleTeambuilderChange('primaryColor', e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer border-2"
                      style={{ borderColor: `${selectedTeamColors.primary}40` }}
                    />
                    <input
                      type="text"
                      value={teambuilderTeam.primaryColor}
                      onChange={(e) => handleTeambuilderChange('primaryColor', e.target.value)}
                      className="flex-1 px-3 py-2 border-2 rounded-lg font-mono text-sm"
                      style={{
                        borderColor: `${selectedTeamColors.primary}40`,
                        color: textColor,
                        backgroundColor: 'transparent'
                      }}
                      placeholder="#FF5500"
                    />
                  </div>
                </div>
                <div>
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: selectedTeamColors.primary }}
                  >
                    Secondary Color *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={teambuilderTeam.secondaryColor}
                      onChange={(e) => handleTeambuilderChange('secondaryColor', e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer border-2"
                      style={{ borderColor: `${selectedTeamColors.primary}40` }}
                    />
                    <input
                      type="text"
                      value={teambuilderTeam.secondaryColor}
                      onChange={(e) => handleTeambuilderChange('secondaryColor', e.target.value)}
                      className="flex-1 px-3 py-2 border-2 rounded-lg font-mono text-sm"
                      style={{
                        borderColor: `${selectedTeamColors.primary}40`,
                        color: textColor,
                        backgroundColor: 'transparent'
                      }}
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>
              </div>

              {/* Logo Upload */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: selectedTeamColors.primary }}
                >
                  Team Logo (Optional)
                </label>
                <ImageUpload
                  value={teambuilderTeam.logoUrl}
                  onChange={(url) => handleTeambuilderChange('logoUrl', url)}
                  teamColors={selectedTeamColors}
                  compact
                />
                <p className="text-xs mt-1" style={{ color: textColor, opacity: 0.7 }}>
                  Upload a logo or paste an image URL. Square images work best.
                </p>
              </div>

              {/* Replace Team */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: selectedTeamColors.primary }}
                >
                  Replaces Team *
                </label>
                <DropdownSelect
                  options={fbsTeamOptions}
                  value={teambuilderTeam.replacesTeam}
                  onChange={(value) => handleTeambuilderChange('replacesTeam', value)}
                  placeholder="Select team to replace..."
                  required
                  teamColors={selectedTeamColors}
                />
                <p className="text-xs mt-1" style={{ color: textColor, opacity: 0.7 }}>
                  Your team will take this team's slot in conferences and schedules.
                </p>
              </div>

              {/* Preview Card */}
              {teambuilderTeam.name && (
                <div
                  className="mt-4 p-4 rounded-lg border-2"
                  style={{
                    borderColor: teambuilderTeam.primaryColor,
                    backgroundColor: teambuilderTeam.secondaryColor
                  }}
                >
                  <p className="text-xs uppercase tracking-wide mb-2" style={{ color: teambuilderTeam.primaryColor }}>Preview</p>
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
                        className="w-12 h-12 rounded flex items-center justify-center font-bold text-lg"
                        style={{
                          backgroundColor: teambuilderTeam.primaryColor,
                          color: teambuilderTeam.secondaryColor
                        }}
                      >
                        {teambuilderTeam.abbreviation || '?'}
                      </div>
                    )}
                    <div>
                      <p className="font-bold" style={{ color: teambuilderTeam.primaryColor }}>
                        {teambuilderTeam.name || 'Team Name'}
                      </p>
                      <p className="text-sm" style={{ color: getContrastTextColor(teambuilderTeam.secondaryColor) }}>
                        {teambuilderTeam.abbreviation || 'ABBR'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="coachName"
              className="block text-sm font-medium mb-2 transition-colors duration-300"
              style={{ color: selectedTeamColors.primary }}
            >
              Coach Name
            </label>
            <input
              type="text"
              id="coachName"
              name="coachName"
              value={formData.coachName}
              onChange={handleChange}
              className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:outline-none transition-colors"
              style={{
                borderColor: `${selectedTeamColors.primary}40`,
                color: textColor,
                backgroundColor: 'transparent'
              }}
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
              teamColors={selectedTeamColors}
            />
          </div>

          <div>
            <label
              htmlFor="startYear"
              className="block text-sm font-medium mb-2 transition-colors duration-300"
              style={{ color: selectedTeamColors.primary }}
            >
              Starting Year
            </label>
            <input
              type="number"
              id="startYear"
              name="startYear"
              value={formData.startYear}
              onChange={handleChange}
              min="2024"
              max="2099"
              className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:outline-none transition-colors"
              style={{
                borderColor: `${selectedTeamColors.primary}40`,
                color: textColor,
                backgroundColor: 'transparent'
              }}
              required
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={creating || (mode === 'teambuilder' && !isTeambuilderValid()) || (mode === 'fbs' && !formData.teamName)}
              className="flex-1 px-6 py-3 rounded-lg font-semibold transition-colors shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: selectedTeamColors.primary,
                color: primaryTextColor
              }}
            >
              {creating ? 'Creating Dynasty...' : 'Create Dynasty'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-6 py-3 border-2 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              style={{
                borderColor: selectedTeamColors.primary,
                color: selectedTeamColors.primary
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
