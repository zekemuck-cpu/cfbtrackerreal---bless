/**
 * TeambuilderTeamFields — the per-team form section used at dynasty
 * creation. Renders inline (not in a modal). Used both for the user's
 * primary TB team and for any additional TB teams in the dynasty.
 *
 * The component is fully controlled — the parent owns the team object
 * and the validation result. Errors are displayed per-field with the
 * offending field outlined.
 *
 * Required props:
 *   value      — the team object: { name, abbreviation, logoUrl, primaryColor, secondaryColor, replacesTeam }
 *   onChange   — (field, newValue) => void
 *   errors     — optional { name?, abbreviation?, replacesTeam? } map
 *   fbsOptions — [{ value, label }] for the "replaces team" dropdown
 *   neutralColors — { primary, secondary } passed to ImageUpload
 */

import ImageUpload from './ImageUpload'
import DropdownSelect from './DropdownSelect'
import { Input, Card } from './ui'

export default function TeambuilderTeamFields({
  value,
  onChange,
  errors = {},
  fbsOptions,
  neutralColors,
  showPreview = true,
}) {
  const team = value
  return (
    <div className="space-y-4">
      <div>
        <label className="label-xs text-txt-tertiary block mb-2">Team Name *</label>
        <Input
          type="text"
          value={team.name}
          onChange={e => onChange('name', e.target.value)}
          placeholder="e.g. Springfield Tigers"
          hasError={!!errors.name}
          required
        />
        {errors.name && (
          <p className="text-sm mt-1" style={{ color: 'var(--accent-error)' }}>{errors.name}</p>
        )}
        {!errors.name && (
          <p className="text-xs mt-1 text-txt-tertiary">
            Full team name including mascot (like "Alabama Crimson Tide")
          </p>
        )}
      </div>

      <div>
        <label className="label-xs text-txt-tertiary block mb-2">Abbreviation (2–4 characters) *</label>
        <Input
          type="text"
          value={team.abbreviation}
          onChange={e => onChange('abbreviation', e.target.value.toUpperCase().slice(0, 4))}
          className="font-mono"
          placeholder="e.g. SPFD"
          maxLength={4}
          hasError={!!errors.abbreviation}
          required
        />
        {errors.abbreviation && (
          <p className="text-sm mt-1" style={{ color: 'var(--accent-error)' }}>{errors.abbreviation}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label-xs text-txt-tertiary block mb-2">Primary Color *</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={team.primaryColor}
              onChange={e => onChange('primaryColor', e.target.value)}
              className="w-12 h-10 rounded cursor-pointer"
              style={{ border: '1px solid var(--surface-5)' }}
            />
            <Input
              type="text"
              value={team.primaryColor}
              onChange={e => onChange('primaryColor', e.target.value)}
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
              value={team.secondaryColor}
              onChange={e => onChange('secondaryColor', e.target.value)}
              className="w-12 h-10 rounded cursor-pointer"
              style={{ border: '1px solid var(--surface-5)' }}
            />
            <Input
              type="text"
              value={team.secondaryColor}
              onChange={e => onChange('secondaryColor', e.target.value)}
              className="flex-1 font-mono"
              placeholder="#FFFFFF"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="label-xs text-txt-tertiary block mb-2">Team Logo (Optional)</label>
        <ImageUpload
          value={team.logoUrl}
          onChange={url => onChange('logoUrl', url)}
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
          options={fbsOptions}
          value={team.replacesTeam}
          onChange={v => onChange('replacesTeam', v)}
          placeholder="Select team to replace..."
          required
          teamColors={neutralColors}
        />
        {errors.replacesTeam && (
          <p className="text-sm mt-1" style={{ color: 'var(--accent-error)' }}>{errors.replacesTeam}</p>
        )}
        {!errors.replacesTeam && (
          <p className="text-xs mt-1 text-txt-tertiary">
            This team's slot in conferences and schedules will be taken over by your TeamBuilder team.
          </p>
        )}
      </div>

      {showPreview && team.name && (
        <Card accent="left" padding="md">
          <p className="label-xs text-txt-tertiary mb-2">Preview</p>
          <div className="flex items-center gap-3">
            {team.logoUrl ? (
              <img
                src={team.logoUrl}
                alt={team.name}
                className="w-12 h-12 object-contain rounded"
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div
                className="w-12 h-12 rounded flex items-center justify-center font-bold text-lg tabular"
                style={{
                  backgroundColor: team.primaryColor,
                  color: team.secondaryColor,
                }}
              >
                {team.abbreviation || '?'}
              </div>
            )}
            <div>
              <p className="font-bold text-txt-primary">{team.name || 'Team Name'}</p>
              <p className="text-sm text-txt-tertiary tabular">{team.abbreviation || 'ABBR'}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
