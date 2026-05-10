import { useState, useEffect, useMemo } from 'react'
import ImageUpload from './ImageUpload'
import { getContrastTextColor, getModalColors } from '../utils/colorUtils'
import { getSelectableTeamsList, getTeamName } from '../data/teamAbbreviations'
import { TEAMS, getOriginalTeamAbbr } from '../data/teamRegistry'
import { useToast } from './ui/Toast'

/**
 * Modal for editing a team's identity (name, abbr, colors, logo).
 *
 * Used for both teambuilder slots and stock FBS teams — the difference
 * is the "Replaces" info box (only shown for TBs) and the modal title.
 * Saves through `updateTeambuilderTeam`, which preserves the
 * `isCustom` flag so FBS overrides don't get reclassified as TBs.
 */
export default function TeambuilderEditModal({
  isOpen,
  onClose,
  team,
  tid,
  onSave,
  // Map of all teams currently in the dynasty (dynasty.teams). Used to
  // detect abbreviation collisions with OTHER teambuilder teams, not just
  // against the static FBS list.
  dynastyTeams = null,
  // 'edit' (default) edits an existing team; 'add' creates a fresh
  // team in the dynasty (no slot replacement, no original-team box).
  mode = 'edit',
}) {
  const isAddMode = mode === 'add'
  const isCustomTB = !!team?.isCustom
  const { toast } = useToast()
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

  // Initialize form data when team changes / when entering add mode
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
    } else if (isAddMode && isOpen) {
      setFormData({
        name: '',
        abbreviation: '',
        primaryColor: '#FF5500',
        secondaryColor: '#FFFFFF',
        logoUrl: ''
      })
      setAbbrError('')
    }
  }, [team, isAddMode, isOpen])

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
      // Also check OTHER teambuilder teams in the same dynasty. Two custom
      // teams sharing an abbr breaks tid-based lookups (getTidFromAbbr can
      // return either one) so we block it outright.
      if (dynastyTeams) {
        for (const [otherTid, otherTeam] of Object.entries(dynastyTeams)) {
          if (Number(otherTid) === Number(tid)) continue
          if (otherTeam?.abbr?.toUpperCase() === upperAbbr) {
            return `"${upperAbbr}" is already used by ${otherTeam.name || 'another team'} in this dynasty`
          }
        }
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
      toast.error('Failed to save team: ' + (error.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const teamColors = {
    primary: formData.primaryColor || '#1f2937',
    secondary: formData.secondaryColor || '#ffffff'
  }
  const modalColors = useMemo(() => getModalColors(teamColors), ['var(--text-primary)', 'var(--surface-3)'])
  const textColor = 'var(--surface-1)'
  const primaryTextColor = 'var(--surface-1)'

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="rounded-lg shadow-xl max-w-lg w-full max-h-[90dvh] overflow-y-auto border"
        style={{
          backgroundColor: 'var(--surface-2)',
          borderColor: 'var(--surface-4)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            {isAddMode ? 'Add Team' : isCustomTB ? 'Edit Teambuilder Team' : 'Edit Team'}
          </h2>

          {/* "Replaces" info box only applies to teambuilder slots. */}
          {isCustomTB && (
            <div
              className="mb-4 p-3 rounded-lg border-2 border-dashed"
              style={{ borderColor: 'var(--surface-4)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                <span className="font-medium">Replaces:</span> {originalTeamName || 'Unknown'} ({originalTeamAbbr || '?'})
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                The team slot cannot be changed after dynasty creation.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Team Name */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Team Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none"
                style={{
                  borderColor: 'var(--surface-4)',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--surface-3)'
                }}
                placeholder="e.g. Springfield Tigers"
                required
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                Full team name including mascot
              </p>
            </div>

            {/* Abbreviation */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Abbreviation (2-4 characters) *
              </label>
              <input
                type="text"
                value={formData.abbreviation}
                onChange={(e) => handleChange('abbreviation', e.target.value.toUpperCase().slice(0, 4))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none font-mono"
                style={{
                  borderColor: abbrError ? '#ef4444' : 'var(--surface-4)',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--surface-3)'
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
                  style={{ color: 'var(--text-primary)' }}
                >
                  Primary Color *
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                    style={{ borderColor: 'var(--surface-4)' }}
                  />
                  <input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                    style={{
                      borderColor: 'var(--surface-4)',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--surface-3)'
                    }}
                    placeholder="#FF5500"
                  />
                </div>
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Secondary Color *
                </label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={formData.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer border"
                    style={{ borderColor: 'var(--surface-4)' }}
                  />
                  <input
                    type="text"
                    value={formData.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                    style={{
                      borderColor: 'var(--surface-4)',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--surface-3)'
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
                style={{ color: 'var(--text-primary)' }}
              >
                Team Logo (Optional)
              </label>
              <ImageUpload
                value={formData.logoUrl}
                onChange={(url) => handleChange('logoUrl', url)}
                teamColors={teamColors}
                compact
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
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
                  backgroundColor: 'var(--text-primary)',
                  color: '#ffffff'
                }}
              >
                {saving ? 'Saving...' : isAddMode ? 'Add Team' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-semibold bg-surface-3 hover:bg-surface-4 text-white transition-colors"
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
