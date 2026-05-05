import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchableSelect from '../components/SearchableSelect'
import DropdownSelect from '../components/DropdownSelect'
import TeambuilderTeamFields from '../components/TeambuilderTeamFields'
import { teams } from '../data/teams'
import { getSelectableTeamsList, getTeamName } from '../data/teamAbbreviations'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { PageHero, Card, Button, Tabs, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'

const newBlankTeambuilder = () => ({
  name: '',
  abbreviation: '',
  logoUrl: '',
  primaryColor: '#FF5500',
  secondaryColor: '#FFFFFF',
  replacesTeam: '',
})

export default function CreateDynasty() {
  const navigate = useNavigate()
  const { createDynasty } = useDynasty()
  const { user } = useAuth()
  const { toast } = useToast()

  const [mode, setMode] = useState('fbs')

  const [formData, setFormData] = useState({
    teamName: '',
    coachName: '',
    coachPosition: 'HC',
    startYear: '2025',
  })

  // The list of TeamBuilder teams in this dynasty.
  //   FBS mode: list is purely additional teams (default empty).
  //   TeamBuilder mode: every TB team in the dynasty; ONE of them is
  //                     marked as the user's own via primaryIndex.
  // The list starts empty and an auto-effect below seeds slot 0 the
  // moment the user picks the TeamBuilder tab.
  const [teambuilders, setTeambuilders] = useState([])

  // Which TB card is "the user's team" in TeamBuilder mode. The user
  // can re-pick at any time via a radio on each card. Defaults to the
  // first card; ignored in FBS mode (where the FBS dropdown is the
  // user's team).
  const [primaryIndex, setPrimaryIndex] = useState(0)

  // When the user enters TeamBuilder mode, ensure there's at least one
  // editable card on screen (the primary team). Doesn't fire in FBS mode
  // — extras stay opt-in via the + button.
  useEffect(() => {
    if (mode === 'teambuilder' && teambuilders.length === 0) {
      setTeambuilders([newBlankTeambuilder()])
      setPrimaryIndex(0)
    }
  }, [mode, teambuilders.length])

  const [creating, setCreating] = useState(false)

  const allFbsAbbreviations = getSelectableTeamsList()
  const fbsTeamOptions = allFbsAbbreviations.map(abbr => ({
    value: abbr,
    label: `${getTeamName(abbr)} (${abbr})`,
  }))

  // ── helpers ────────────────────────────────────────────────────────

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const updateTeambuilder = (idx, field, value) => {
    setTeambuilders(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }

  const addTeambuilder = () => {
    setTeambuilders(prev => [...prev, newBlankTeambuilder()])
  }

  const removeTeambuilder = (idx) => {
    // In TeamBuilder mode at least one card must remain (the user's
    // own team). Block when removing the only card; otherwise allow
    // and re-anchor primaryIndex if needed.
    if (mode === 'teambuilder' && teambuilders.length === 1) return
    setTeambuilders(prev => prev.filter((_, i) => i !== idx))
    setPrimaryIndex(prev => {
      if (idx === prev) return 0       // primary removed → fall back to first
      if (idx < prev) return prev - 1  // shift down to keep pointing at the same card
      return prev
    })
  }

  // ── validation ─────────────────────────────────────────────────────
  //
  // Run on every render so inline errors stay live as the user types.
  // Errors are returned as a parallel array of { name, abbreviation,
  // replacesTeam } objects, indexed by team position.
  const validateTeambuilders = (list, fbsTeam) => {
    const errors = list.map(() => ({}))
    const upperFbs = (fbsTeam || '').toUpperCase()

    list.forEach((t, idx) => {
      const upperAbbr = (t.abbreviation || '').toUpperCase().trim()

      // Name
      if (!t.name.trim()) {
        // empty name is allowed silently — submit-time check catches it
      }

      // Abbreviation length
      if (upperAbbr.length > 0 && (upperAbbr.length < 2 || upperAbbr.length > 4)) {
        errors[idx].abbreviation = 'Abbreviation must be 2–4 characters'
      }

      // Abbreviation conflicts with an FBS team that we're NOT replacing
      // (matching the team you replace is fine — that slot is yours).
      if (upperAbbr.length >= 2 && allFbsAbbreviations.includes(upperAbbr) && upperAbbr !== (t.replacesTeam || '').toUpperCase()) {
        errors[idx].abbreviation = `"${upperAbbr}" is the FBS abbr for ${getTeamName(upperAbbr)}`
      }

      // Abbreviation conflicts with another TB team's abbr
      if (upperAbbr.length >= 2) {
        for (let j = 0; j < list.length; j++) {
          if (j === idx) continue
          const otherAbbr = (list[j].abbreviation || '').toUpperCase().trim()
          if (otherAbbr === upperAbbr) {
            errors[idx].abbreviation = `Same abbreviation as TeamBuilder #${j + 1}`
            break
          }
        }
      }

      // replacesTeam conflict — two TB teams cannot both replace the
      // same FBS slot, since they'd collide at the same tid.
      if (t.replacesTeam) {
        for (let j = 0; j < list.length; j++) {
          if (j === idx) continue
          if (list[j].replacesTeam === t.replacesTeam) {
            errors[idx].replacesTeam = `TeamBuilder #${j + 1} already replaces ${getTeamName(t.replacesTeam)}`
            break
          }
        }
        // In FBS mode, can't replace the team the user is playing as.
        if (upperFbs && t.replacesTeam === upperFbs) {
          errors[idx].replacesTeam = `That's the team you're playing as`
        }
      }
    })

    return errors
  }

  const teambuilderErrors = validateTeambuilders(teambuilders, formData.teamName)

  // The list we actually persist depends on mode. In FBS mode any
  // fully-blank rows the user added are silently dropped (extras are
  // optional). In TB mode every visible card must validate — a blank
  // card has no meaning when the user is committing to building TB
  // teams, so we require the user to either fill it or Remove it.
  const effectiveTeambuilders = (() => {
    if (mode === 'teambuilder') return teambuilders
    return teambuilders.filter(t => t.name.trim() || t.abbreviation.trim() || t.replacesTeam)
  })()

  const isTeambuilderRowValid = (t, idx, errors) => {
    return (
      t.name.trim().length > 0 &&
      t.abbreviation.length >= 2 &&
      t.abbreviation.length <= 4 &&
      t.replacesTeam.length > 0 &&
      t.primaryColor.length > 0 &&
      t.secondaryColor.length > 0 &&
      Object.keys(errors[idx] || {}).length === 0
    )
  }

  const isFormValid = () => {
    if (!formData.coachName.trim() || !formData.startYear) return false

    if (mode === 'fbs') {
      if (!formData.teamName) return false
      // Any TB rows the user added must each individually validate.
      return effectiveTeambuilders.every((t, i) =>
        isTeambuilderRowValid(t, teambuilders.indexOf(t), teambuilderErrors)
      )
    }

    // TeamBuilder mode: the first slot is required and every filled-in
    // row must validate.
    if (effectiveTeambuilders.length === 0) return false
    return effectiveTeambuilders.every((t, i) =>
      isTeambuilderRowValid(t, teambuilders.indexOf(t), teambuilderErrors)
    )
  }

  // ── submit ─────────────────────────────────────────────────────────

  const buildCustomTeamsMap = (list) => {
    const out = {}
    for (const t of list) {
      const abbr = t.abbreviation.toUpperCase().trim()
      if (!abbr) continue
      out[abbr] = {
        name: t.name.trim(),
        abbreviation: abbr,
        logoUrl: t.logoUrl,
        backgroundColor: t.primaryColor,
        textColor: t.secondaryColor,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        replacesTeam: t.replacesTeam,
      }
    }
    return out
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setCreating(true)

    try {
      let dynastyData = { ...formData }

      if (mode === 'teambuilder') {
        // The user's team is whichever card has the radio selected.
        const primary = teambuilders[primaryIndex] || teambuilders[0]
        dynastyData.teamName = primary.name
        dynastyData.customTeams = buildCustomTeamsMap(teambuilders)
      } else if (effectiveTeambuilders.length > 0) {
        // FBS mode with extra TBs (e.g. user is Tennessee but they want
        // Stony Brook + Albany also in the dynasty as TeamBuilder teams).
        dynastyData.customTeams = buildCustomTeamsMap(effectiveTeambuilders)
      }

      const newDynasty = await createDynasty(dynastyData)
      navigate(`/dynasty/${newDynasty.id}`)
    } catch (error) {
      console.error('Failed to create dynasty:', error)
      toast.error(`Failed to create dynasty: ${error.message}`)
      setCreating(false)
    }
  }

  const neutralColors = { primary: 'var(--text-primary)', secondary: 'var(--surface-3)' }

  // ── render helpers ────────────────────────────────────────────────

  // Renders a single TB team's editing card. In TeamBuilder mode every
  // card has a "I'm playing as this team" radio so the primary can be
  // re-anchored at any time; in FBS mode the radio is hidden because
  // the user's team is the FBS dropdown above.
  const renderTeambuilderCard = (team, idx) => {
    const isPrimary = mode === 'teambuilder' && idx === primaryIndex
    const showRadio = mode === 'teambuilder'
    const isOnlyCardInTbMode = mode === 'teambuilder' && teambuilders.length === 1
    const cardKey = `tb-${idx}`
    return (
      <Card
        key={cardKey}
        accent={isPrimary ? 'top' : undefined}
        padding="md"
      >
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="label-xs text-txt-tertiary" style={{ letterSpacing: '1.5px' }}>
              TeamBuilder Team {teambuilders.length > 1 ? `#${idx + 1}` : ''}
            </p>
            {showRadio && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="primaryTeambuilder"
                  checked={isPrimary}
                  onChange={() => setPrimaryIndex(idx)}
                  className="cursor-pointer"
                />
                <span className={`text-sm font-semibold ${isPrimary ? 'text-txt-primary' : 'text-txt-secondary'}`}>
                  {isPrimary ? "You're playing as this team" : "I'm playing as this team"}
                </span>
              </label>
            )}
            {!showRadio && (
              <p className="text-xs text-txt-tertiary mt-1">
                Adds another custom team that exists in the dynasty alongside the FBS teams.
              </p>
            )}
          </div>
          {!isOnlyCardInTbMode && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => removeTeambuilder(idx)}
            >
              Remove
            </Button>
          )}
        </div>
        <TeambuilderTeamFields
          value={team}
          onChange={(field, value) => updateTeambuilder(idx, field, value)}
          errors={teambuilderErrors[idx]}
          fbsOptions={fbsTeamOptions}
          neutralColors={neutralColors}
        />
      </Card>
    )
  }

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
              { value: 'teambuilder', label: 'TeamBuilder' },
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
            <div className="p-4 rounded-lg" style={{ border: '1px dashed var(--surface-5)' }}>
              <p className="text-sm text-txt-secondary">
                Your TeamBuilder team will replace an existing FBS team and take its place in conferences and schedules. You can add more TeamBuilder teams below if your dynasty has multiple custom teams.
              </p>
            </div>
          )}

          {/* TeamBuilder list — always rendered when:
              - mode === 'teambuilder' (need at least the primary), OR
              - the user has added one or more "additional" TB teams in FBS mode. */}
          {(mode === 'teambuilder' || effectiveTeambuilders.length > 0 || teambuilders.length > 0) && (
            <div className="space-y-4">
              {teambuilders.map((t, idx) => renderTeambuilderCard(t, idx))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={addTeambuilder}>
              + Add another TeamBuilder team
            </Button>
            <p className="text-xs text-txt-tertiary">
              Each TeamBuilder team replaces one FBS team's slot.
            </p>
          </div>

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
                { value: 'DC', label: 'Defensive Coordinator (DC)' },
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
              disabled={creating || !isFormValid()}
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
