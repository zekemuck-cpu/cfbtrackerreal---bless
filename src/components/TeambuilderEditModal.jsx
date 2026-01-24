import { useState, useEffect, useMemo } from 'react'
import ImageUpload from './ImageUpload'
import { getContrastTextColor, getModalColors } from '../utils/colorUtils'
import { getSelectableTeamsList, getTeamName } from '../data/teamAbbreviations'
import { TEAMS, getOriginalTeamAbbr } from '../data/teamRegistry'

/**
 * Modal for editing a teambuilder team's data.
 * Allows changing: name, abbreviation, colors, logo
 * Cannot change: which team slot (tid) is replaced
 */
export default function TeambuilderEditModal({
  isOpen,
  onClose,
  team,
  tid,
  onSave
}) {
  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    primaryColor: '#FF5500',
    secondaryColor: '#FFFFFF',
    logoUrl: ''
  })
  const [saving, setSaving] = useState(false)
  const [abbrError, setAbbrError] = useState('')

  // Get all FBS team abbreviations for conflict checking
  const allFbsAbbreviations = getSelectableTeamsList()

  // Get the original team that was replaced
  const originalTeamAbbr = getOriginalTeamAbbr(tid)
  const originalTeamName = originalTeamAbbr ? getTeamName(originalTeamAbbr) : TEAMS[tid]?.name

  // Initialize form data when team changes
  useEffect(() => {
    if (team) {
      setFormData({
        name: team.name || '',
        abbreviation: team.abbr || '',
        primaryColor: team.primaryColor || '#FF5500',
        secondaryColor: team.secondaryColor || '#FFFFFF',
        logoUrl: team.logo || ''
      })
      setAbbrError('')
    }
  }, [team])

  // Validate abbreviation against existing FBS teams
  const validateAbbreviation = (abbr) => {
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
      // Allow if it matches the original replaced team (that team slot is ours)
      // Also allow if it's our current abbreviation
      if (conflictingTeam && conflictingTeam !== originalTeamAbbr && conflictingTeam !== team?.abbr) {
        return `"${upperAbbr}" is already used by ${getTeamName(conflictingTeam)}`
      }
    }
    return ''
  }

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Re-validate abbreviation when it changes
      if (field === 'abbreviation') {
        setAbbrError(validateAbbreviation(value))
      }

      return updated
    })
  }

  const isValid = () => {
    return (
      formData.name.trim().length > 0 &&
      formData.abbreviation.length >= 2 &&
      formData.abbreviation.length <= 4 &&
      formData.primaryColor.length > 0 &&
      formData.secondaryColor.length > 0 &&
      !abbrError
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid()) return

    setSaving(true)
    try {
      await onSave({
        name: formData.name.trim(),
        abbreviation: formData.abbreviation.toUpperCase(),
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
        logoUrl: formData.logoUrl
      })
      onClose()
    } catch (error) {
      console.error('Failed to save team:', error)
      alert('Failed to save team: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const teamColors = {
    primary: formData.primaryColor || '#1f2937',
    secondary: formData.secondaryColor || '#ffffff'
  }
  const modalColors = useMemo(() => getModalColors(teamColors), [teamColors.primary, teamColors.secondary])
  const textColor = getContrastTextColor(teamColors.secondary)
  const primaryTextColor = getContrastTextColor(teamColors.primary)

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border"
        style={{
          backgroundColor: modalColors.background,
          borderColor: modalColors.border
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: modalColors.text }}
          >
            Edit Teambuilder Team
          </h2>

          {/* Info box showing which team is replaced */}
          <div
            className="mb-4 p-3 rounded-lg border-2 border-dashed"
            style={{ borderColor: modalColors.inputBorder }}
          >
            <p className="text-sm" style={{ color: modalColors.text }}>
              <span className="font-medium">Replaces:</span> {originalTeamName || 'Unknown'} ({originalTeamAbbr || '?'})
            </p>
            <p className="text-xs mt-1" style={{ color: modalColors.textMuted }}>
              The team slot cannot be changed after dynasty creation.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Team Name */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: modalColors.accent }}
              >
                Team Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none"
                style={{
                  borderColor: modalColors.inputBorder,
                  color: modalColors.text,
                  backgroundColor: modalColors.inputBg
                }}
                placeholder="e.g. Springfield Tigers"
                required
              />
              <p className="text-xs mt-1" style={{ color: modalColors.textMuted }}>
                Full team name including mascot
              </p>
            </div>

            {/* Abbreviation */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: modalColors.accent }}
              >
                Abbreviation (2-4 characters) *
              </label>
              <input
                type="text"
                value={formData.abbreviation}
                onChange={(e) => handleChange('abbreviation', e.target.value.toUpperCase().slice(0, 4))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none font-mono"
                style={{
                  borderColor: abbrError ? '#ef4444' : modalColors.inputBorder,
                  color: modalColors.text,
                  backgroundColor: modalColors.inputBg
                }}
                placeholder="e.g. SPFD"
                maxLength={4}
                required
              />
              {abbrError && (
                <p className="text-red-400 text-sm mt-1">{abbrError}</p>
              )}
            </div>

            {/* Colors Row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: modalColors.accent }}
                >
                  Primary Color *
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                    style={{ borderColor: modalColors.inputBorder }}
                  />
                  <input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                    style={{
                      borderColor: modalColors.inputBorder,
                      color: modalColors.text,
                      backgroundColor: modalColors.inputBg
                    }}
                    placeholder="#FF5500"
                  />
                </div>
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: modalColors.accent }}
                >
                  Secondary Color *
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                    style={{ borderColor: modalColors.inputBorder }}
                  />
                  <input
                    type="text"
                    value={formData.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                    style={{
                      borderColor: modalColors.inputBorder,
                      color: modalColors.text,
                      backgroundColor: modalColors.inputBg
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
                style={{ color: modalColors.accent }}
              >
                Team Logo (Optional)
              </label>
              <ImageUpload
                value={formData.logoUrl}
                onChange={(url) => handleChange('logoUrl', url)}
                teamColors={teamColors}
                compact
              />
              <p className="text-xs mt-1" style={{ color: modalColors.textMuted }}>
                Upload a logo or paste an image URL. Square images work best.
              </p>
            </div>

            {/* Preview Card */}
            {formData.name && (
              <div
                className="mt-4 p-4 rounded-lg border-2"
                style={{
                  borderColor: formData.primaryColor,
                  backgroundColor: formData.secondaryColor
                }}
              >
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: formData.primaryColor }}>Preview</p>
                <div className="flex items-center gap-3">
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt={formData.name}
                      className="w-12 h-12 object-contain rounded"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded flex items-center justify-center font-bold text-lg"
                      style={{
                        backgroundColor: formData.primaryColor,
                        color: formData.secondaryColor
                      }}
                    >
                      {formData.abbreviation || '?'}
                    </div>
                  )}
                  <div>
                    <p className="font-bold" style={{ color: formData.primaryColor }}>
                      {formData.name || 'Team Name'}
                    </p>
                    <p className="text-sm" style={{ color: getContrastTextColor(formData.secondaryColor) }}>
                      {formData.abbreviation || 'ABBR'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving || !isValid()}
                className="flex-1 px-4 py-2 rounded-lg font-semibold transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: modalColors.accent,
                  color: '#ffffff'
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
