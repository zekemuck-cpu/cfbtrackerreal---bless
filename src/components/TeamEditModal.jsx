import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import ImageUpload from './ImageUpload'
import { useToast } from './ui/Toast'
import { getContrastTextColor } from '../utils/colorUtils'
import { useDynasty } from '../context/DynastyContext'

/**
 * Team edit modal for a specific (team, year). Two tabs:
 *   1. Info     — season record + conference (saved via saveTeamYearInfo)
 *   2. Branding — name / abbr / colors / logo (saved via updateTeambuilderTeam)
 *
 * A single "Save Changes" button writes whichever fields actually changed.
 * Drop-in replacement for the inline modal that previously lived in
 * TeamYear.jsx.
 */
const CONFERENCE_OPTIONS = [
  'ACC', 'Big Ten', 'Big 12', 'SEC', 'Pac-12',
  'American', 'Conference USA', 'MAC', 'Mountain West',
  'Sun Belt', 'Independent',
]

export default function TeamEditModal({
  isOpen,
  onClose,
  team,
  tid,
  year,
  dynastyTeams,
  initialRecord,
  initialConference,
  onSavedInfo,
  onSavedBranding,
}) {
  const { currentDynasty, saveTeamYearInfo, updateTeambuilderTeam } = useDynasty()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('info')
  const [saving, setSaving] = useState(false)
  const [abbrError, setAbbrError] = useState('')

  // Info tab state
  const [wins, setWins] = useState('')
  const [losses, setLosses] = useState('')
  const [conference, setConference] = useState('')

  // Branding tab state
  const [name, setName] = useState('')
  const [abbr, setAbbr] = useState('')
  const [primary, setPrimary] = useState('#1f2937')
  const [secondary, setSecondary] = useState('#FFFFFF')
  const [logoUrl, setLogoUrl] = useState('')

  // Seed all fields when the modal opens / team changes
  useEffect(() => {
    if (!isOpen) return
    setActiveTab('info')
    setWins(initialRecord?.wins != null ? String(initialRecord.wins) : '')
    setLosses(initialRecord?.losses != null ? String(initialRecord.losses) : '')
    setConference(initialConference || '')
    setName(team?.name || '')
    setAbbr(team?.abbr || '')
    setPrimary(team?.primaryColor || '#1f2937')
    setSecondary(team?.secondaryColor || '#FFFFFF')
    setLogoUrl(team?.logo || '')
    setAbbrError('')
  }, [isOpen, team, initialRecord, initialConference])

  // Validate abbreviation against OTHER teams in this dynasty (allow current)
  const validateAbbr = (next) => {
    const upper = next.toUpperCase().trim()
    if (upper.length === 0) return 'Abbreviation is required'
    if (upper.length < 2 || upper.length > 5) return 'Abbreviation must be 2–5 characters'
    if (dynastyTeams) {
      for (const [otherTid, other] of Object.entries(dynastyTeams)) {
        if (Number(otherTid) === Number(tid)) continue
        if (other?.abbr?.toUpperCase() === upper) {
          return `"${upper}" is already used by ${other.name || 'another team'}`
        }
      }
    }
    return ''
  }

  const handleAbbrChange = (raw) => {
    const next = raw.toUpperCase().slice(0, 5)
    setAbbr(next)
    setAbbrError(validateAbbr(next))
  }

  // Detect what changed
  const infoChanged = useMemo(() => {
    const initWins = initialRecord?.wins != null ? String(initialRecord.wins) : ''
    const initLosses = initialRecord?.losses != null ? String(initialRecord.losses) : ''
    return (
      wins !== initWins ||
      losses !== initLosses ||
      conference !== (initialConference || '')
    )
  }, [wins, losses, conference, initialRecord, initialConference])

  const brandingChanged = useMemo(() => (
    name !== (team?.name || '') ||
    abbr !== (team?.abbr || '') ||
    primary !== (team?.primaryColor || '#1f2937') ||
    secondary !== (team?.secondaryColor || '#FFFFFF') ||
    logoUrl !== (team?.logo || '')
  ), [name, abbr, primary, secondary, logoUrl, team])

  const canSave = !saving && (infoChanged || brandingChanged) && !abbrError && name.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const tasks = []

      if (infoChanged) {
        const info = {}
        if (wins !== '' && losses !== '') {
          info.wins = parseInt(wins, 10)
          info.losses = parseInt(losses, 10)
        } else {
          // Empty == "use calculated record" — no wins/losses written
        }
        if (conference) info.conference = conference
        if (Object.keys(info).length > 0) {
          tasks.push(
            saveTeamYearInfo(currentDynasty.id, team?.abbr, year, info)
              .then(() => onSavedInfo?.(info))
          )
        }
      }

      if (brandingChanged) {
        tasks.push((async () => {
          const result = await updateTeambuilderTeam(currentDynasty.id, tid, {
            name: name.trim(),
            abbreviation: abbr.toUpperCase(),
            primaryColor: primary,
            secondaryColor: secondary,
            logoUrl,
          })
          if (!result?.success) {
            throw new Error(result?.message || 'Failed to update team')
          }
          onSavedBranding?.({ name: name.trim(), abbr: abbr.toUpperCase() })
        })())
      }

      await Promise.all(tasks)
      toast.success('Saved')
      onClose()
    } catch (err) {
      console.error('Failed to save team edits:', err)
      toast.error(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const accent = primary || '#1f2937'
  const accentText = getContrastTextColor(accent)

  return createPortal(
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4 modal-backdrop-in"
      style={{ margin: 0 }}
      onClick={onClose}
    >
      <div
        className="card-elevated max-w-lg w-full max-h-[90dvh] overflow-hidden flex flex-col modal-panel-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-[3px] w-full" style={{ backgroundColor: accent }} aria-hidden="true" />

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-surface-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center bg-white p-[2px] flex-shrink-0"
                style={{ border: `2px solid ${accent}` }}
              >
                <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-display font-black text-sm flex-shrink-0"
                style={{ backgroundColor: accent, color: accentText }}
              >
                {(abbr || '?').slice(0, 3)}
              </div>
            )}
            <div className="min-w-0">
              <div className="display-md text-txt-primary truncate">{name || team?.name || 'Team'}</div>
              <div className="label-xs text-txt-tertiary tracking-widest" style={{ letterSpacing: '2px' }}>
                {year} Season
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1.5 rounded-md text-txt-tertiary hover:text-txt-primary hover:bg-surface-3 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-4 px-2" role="tablist">
          {[
            { key: 'info', label: 'Info' },
            { key: 'branding', label: 'Branding' },
          ].map(t => {
            const isActive = activeTab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`relative px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  isActive ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                }`}
                style={{ letterSpacing: '2px' }}
              >
                {t.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-2 right-2 -bottom-px h-[2px]"
                    style={{ backgroundColor: accent }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === 'info' ? (
            <div className="space-y-5">
              <div>
                <label className="label-sm text-txt-secondary mb-2 block">Season Record</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={wins}
                    onChange={(e) => setWins(e.target.value)}
                    placeholder="W"
                    className="w-24 px-3 py-2 rounded-lg text-center font-display font-black text-xl tabular bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:border-surface-5"
                  />
                  <span className="text-2xl font-bold text-txt-tertiary">–</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={losses}
                    onChange={(e) => setLosses(e.target.value)}
                    placeholder="L"
                    className="w-24 px-3 py-2 rounded-lg text-center font-display font-black text-xl tabular bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:border-surface-5"
                  />
                </div>
                <p className="label-xs text-txt-muted mt-2">
                  Leave blank to use the calculated record
                </p>
              </div>

              <div>
                <label className="label-sm text-txt-secondary mb-2 block">Conference</label>
                <select
                  value={conference}
                  onChange={(e) => setConference(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg font-semibold bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:border-surface-5"
                >
                  <option value="">— Select Conference —</option>
                  {CONFERENCE_OPTIONS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="label-sm text-txt-secondary mb-2 block">Team Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Springfield Tigers"
                  className="w-full px-3 py-2 rounded-lg font-semibold bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:border-surface-5"
                />
              </div>

              <div>
                <label className="label-sm text-txt-secondary mb-2 block">Abbreviation</label>
                <input
                  type="text"
                  value={abbr}
                  onChange={(e) => handleAbbrChange(e.target.value)}
                  placeholder="e.g. SPFD"
                  maxLength={5}
                  className="w-32 px-3 py-2 rounded-lg font-display font-black uppercase tracking-widest bg-surface-3 border text-txt-primary focus:outline-none"
                  style={{
                    borderColor: abbrError ? '#ef4444' : 'var(--surface-4)',
                  }}
                />
                {abbrError && (
                  <p className="text-red-400 text-xs mt-2">{abbrError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-sm text-txt-secondary mb-2 block">Primary Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer border border-surface-4 bg-surface-3"
                    />
                    <input
                      type="text"
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                      placeholder="#1f2937"
                      className="flex-1 px-3 py-2 rounded-lg font-mono text-sm bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:border-surface-5"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-sm text-txt-secondary mb-2 block">Secondary Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={secondary}
                      onChange={(e) => setSecondary(e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer border border-surface-4 bg-surface-3"
                    />
                    <input
                      type="text"
                      value={secondary}
                      onChange={(e) => setSecondary(e.target.value)}
                      placeholder="#FFFFFF"
                      className="flex-1 px-3 py-2 rounded-lg font-mono text-sm bg-surface-3 border border-surface-4 text-txt-primary focus:outline-none focus:border-surface-5"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="label-sm text-txt-secondary mb-2 block">Team Logo</label>
                <ImageUpload
                  value={logoUrl}
                  onChange={(url) => setLogoUrl(url || '')}
                  teamColors={{ primary, secondary }}
                  compact
                />
                <p className="label-xs text-txt-muted mt-2">
                  Upload an image or paste a URL. Square images work best.
                </p>
              </div>

              {/* Live preview */}
              <div
                className="rounded-lg p-4 border"
                style={{
                  borderColor: 'var(--surface-4)',
                  backgroundColor: 'var(--surface-1)',
                }}
              >
                <div className="label-xs text-txt-tertiary uppercase tracking-widest mb-3" style={{ letterSpacing: '2px' }}>
                  Preview
                </div>
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt=""
                      className="w-12 h-12 object-contain rounded bg-white p-1"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded flex items-center justify-center font-display font-black text-base"
                      style={{ backgroundColor: primary, color: getContrastTextColor(primary) }}
                    >
                      {(abbr || '?').slice(0, 3)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-display font-black text-txt-primary truncate">
                      {name || 'Team Name'}
                    </div>
                    <div className="label-xs text-txt-tertiary tabular tracking-widest" style={{ letterSpacing: '2px' }}>
                      {abbr || 'ABBR'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-surface-4 bg-surface-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold bg-surface-3 hover:bg-surface-4 text-txt-secondary transition-colors press"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 rounded-lg font-semibold transition-all press disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: accent, color: accentText }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
