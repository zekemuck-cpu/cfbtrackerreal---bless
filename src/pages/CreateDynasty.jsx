import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchableSelect from '../components/SearchableSelect'
import DropdownSelect from '../components/DropdownSelect'
import TeambuilderTeamFields from '../components/TeambuilderTeamFields'
import { initializeDynastyTeams, getFBSTeamTids, getTidFromTeamName } from '../data/teamRegistry'
import { getTeamName } from '../data/teamAbbreviations'
import {
  groupExtractedRowsByTid,
  mapExtractedRowToAppPlayer,
  buildRawTeamIdMap,
  mapTeamRatings,
  mapCoachingStaff,
  mapConferences,
  mapScheduleForTeam,
  mapSeasonInfo,
  mapPreseasonTop25,
} from '../data/cfb27SaveImport'
import { uploadAndParseCfb27Save } from '../utils/cfb27SaveUpload'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Input } from '../components/ui'
import { useToast } from '../components/ui/Toast'
import { EDITIONS, DEFAULT_EDITION, getEditionConfig } from '../editions'

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
    // Starting Year defaults to the selected edition's release year (CFB 26 →
    // 2025, CFB 27 → 2026). Switching editions updates it as long as it's still
    // an edition default (a manually-typed custom year is preserved).
    startYear: String(getEditionConfig(DEFAULT_EDITION).releaseYear),
    gameEdition: DEFAULT_EDITION,
    // Console = the plain manual tracker. PC = the auto-sync tracker (roster,
    // ratings, stats, schedule, recruiting, etc. all pulled from a save file).
    // Defaults to Console — PC requires an explicit, deliberate choice (or
    // gets set automatically the moment a save is actually uploaded below).
    platform: 'console',
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

  // ── CFB 27 PC save import (PC players only — console players never see
  // this used; it's a full alternative to entering everything by hand: the
  // save is the source of truth for the roster, team ratings, coaching
  // staff, conferences, schedule, and the dynasty's actual starting
  // year/week/phase). `cfb27Parsed` holds the RAW server response
  // (players + teamRatings + coachingStaff + conferences + season + games)
  // until submit time, so a later Game Edition change still resolves teams
  // against the right edition's tid table — see cfb27Preview below.
  const [cfb27FileName, setCfb27FileName] = useState('')
  const [cfb27Parsed, setCfb27Parsed] = useState(null)
  const [cfb27Status, setCfb27Status] = useState(null) // null | 'uploading' | 'parsing' | 'ready' | 'error'
  const [cfb27Error, setCfb27Error] = useState('')
  const cfb27FileInputRef = useRef(null)

  const cfb27Preview = useMemo(() => {
    const rows = cfb27Parsed?.players
    if (!rows || !rows.length) return null
    const editionTeams = initializeDynastyTeams(formData.gameEdition)
    const { byTid, unresolvedTeamNames } = groupExtractedRowsByTid(rows, editionTeams)
    const playerCount = [...byTid.values()].reduce((sum, r) => sum + r.length, 0)
    return { teamCount: byTid.size, playerCount, unresolvedTeamNames }
  }, [cfb27Parsed, formData.gameEdition])

  const handleCfb27FileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCfb27FileName(file.name)
    setCfb27Parsed(null)
    setCfb27Error('')
    setCfb27Status('uploading')
    try {
      const result = await uploadAndParseCfb27Save(file, {
        onProgress: (stage) => setCfb27Status(stage),
      })
      setCfb27Parsed(result)
      setCfb27Status('ready')
      // A CFB27 save always dictates its own edition, platform, and actual
      // in-save year/week/phase — auto-fill all so nothing needs typing.
      const season = mapSeasonInfo(result.season)
      setFormData(prev => ({
        ...prev,
        gameEdition: 'cfb27',
        platform: 'pc',
        startYear: season ? String(season.year) : prev.startYear,
      }))
    } catch (error) {
      console.error('CFB 27 save import failed:', error)
      setCfb27Error(error.message || 'Import failed')
      setCfb27Status('error')
    } finally {
      e.target.value = '' // allow re-picking the same (or another) file
    }
  }

  const clearCfb27Import = () => {
    setCfb27FileName('')
    setCfb27Parsed(null)
    setCfb27Status(null)
    setCfb27Error('')
  }

  // FBS team-name options for the picker, gated to the chosen edition so
  // edition-only programs (e.g. CFB 27's North Dakota State / Sacramento State,
  // which reclassified to FBS) appear only when that edition is selected.
  // Derived from the registry (not the static name list) so it stays in sync
  // with edition gating automatically. Sorted by name to match prior ordering.
  const teamNameOptions = useMemo(() => {
    const editionTeams = initializeDynastyTeams(formData.gameEdition)
    return getFBSTeamTids(editionTeams).map(tid => editionTeams[tid].name)
  }, [formData.gameEdition])

  // If the picked team isn't available in the newly-selected edition (e.g. the
  // user chose an edition-only team, then switched editions), clear it so the
  // form can't submit a team that doesn't exist in that edition.
  useEffect(() => {
    if (formData.teamName && !teamNameOptions.includes(formData.teamName)) {
      setFormData(prev => ({ ...prev, teamName: '' }))
    }
  }, [teamNameOptions, formData.teamName])

  // FBS teams a TeamBuilder team can replace — gated to the chosen edition from
  // the registry (the single source of truth), so e.g. North Dakota State /
  // Sacramento State are only replaceable in CFB 27. Mirrors teamNameOptions.
  const editionFbsTeams = useMemo(() => {
    const editionTeams = initializeDynastyTeams(formData.gameEdition)
    return getFBSTeamTids(editionTeams).map(tid => editionTeams[tid])
  }, [formData.gameEdition])
  const allFbsAbbreviations = useMemo(() => editionFbsTeams.map(t => t.abbr), [editionFbsTeams])
  const fbsTeamOptions = useMemo(() => editionFbsTeams.map(t => ({
    value: t.abbr,
    label: `${t.name} (${t.abbr})`,
  })), [editionFbsTeams])

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

      // Build everything from the imported save now (not at parse time) so
      // it always uses the Starting Year / Game Edition / team the user
      // actually submitted with — see cfb27Preview's comment above.
      if (cfb27Parsed?.players?.length) {
        const editionTeams = initializeDynastyTeams(dynastyData.gameEdition)
        const { byTid } = groupExtractedRowsByTid(cfb27Parsed.players, editionTeams)
        const year = Number(dynastyData.startYear)
        let pid = 1
        const seededPlayers = []
        for (const [tid, rows] of byTid.entries()) {
          for (const row of rows) {
            seededPlayers.push(mapExtractedRowToAppPlayer(row, { year, pid, tid }))
            pid++
          }
        }
        dynastyData.cfb27SeededPlayers = seededPlayers

        const rawTeamIdMap = buildRawTeamIdMap(cfb27Parsed.players, editionTeams)
        const userTid = mode === 'teambuilder'
          ? null // a TeamBuilder team has no real-world save counterpart
          : getTidFromTeamName(dynastyData.teamName, editionTeams)
        let userRawTeamId = null
        if (userTid != null) {
          for (const [rawId, tid] of rawTeamIdMap.entries()) {
            if (tid === userTid) { userRawTeamId = rawId; break }
          }
        }

        if (userRawTeamId != null) {
          const ratings = mapTeamRatings(cfb27Parsed.teamRatings, userRawTeamId)
          if (ratings) dynastyData.cfb27TeamRatings = ratings
          const staff = mapCoachingStaff(cfb27Parsed.coachingStaff, userRawTeamId)
          if (staff) dynastyData.cfb27CoachingStaff = staff
        }
        if (userTid != null) {
          const scheduleEntries = mapScheduleForTeam(cfb27Parsed.games, rawTeamIdMap, userTid, editionTeams)
          if (scheduleEntries.length) dynastyData.cfb27Schedule = scheduleEntries
        }

        const conferences = mapConferences(cfb27Parsed.conferences, rawTeamIdMap, editionTeams)
        if (Object.keys(conferences).length) dynastyData.cfb27Conferences = conferences

        const season = mapSeasonInfo(cfb27Parsed.season)
        if (season) dynastyData.cfb27Season = season

        const top25 = mapPreseasonTop25(cfb27Parsed.teamRankings, rawTeamIdMap, editionTeams)
        if (top25.length) dynastyData.cfb27PreseasonTop25 = top25
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
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="display-lg text-txt-primary leading-none m-0">Create New Dynasty</h1>
      </div>

      <Card padding="lg">
        {/* Game edition — the highest-level choice. Picks which rule set
            and feature set the dynasty tracks (e.g. CFB 27's Dynasty
            Points / NIL). Locked once created, but switchable later if
            mis-picked. */}
        <div className="mb-6">
          <p className="block text-sm font-medium text-txt-primary mb-2">Game Edition</p>
          {cfb27Parsed && (
            <p className="text-xs text-txt-tertiary mb-2">Set from your imported save — remove the save to change it.</p>
          )}
          <div className="flex w-full rounded-lg p-1 bg-surface-2 border border-surface-4">
            {EDITIONS.map((ed) => {
              const active = formData.gameEdition === ed.key
              return (
                <button
                  key={ed.key}
                  type="button"
                  disabled={!!cfb27Parsed}
                  onClick={() => setFormData(prev => {
                    // Move the Starting Year to the new edition's release year,
                    // but only if the current value is still an edition default
                    // (don't clobber a year the user deliberately typed).
                    const editionDefaultYears = EDITIONS.map(e => String(e.releaseYear))
                    const yearIsDefault = editionDefaultYears.includes(String(prev.startYear))
                    return {
                      ...prev,
                      gameEdition: ed.key,
                      startYear: yearIsDefault ? String(ed.releaseYear) : prev.startYear,
                      // PC (save sync) only exists for CFB 27 — CFB 26 is
                      // Console-only, so switching away from CFB 27 drops
                      // any PC selection back to Console.
                      platform: ed.key === 'cfb27' ? prev.platform : 'console',
                    }
                  })}
                  aria-pressed={active}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    active ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                  }`}
                  style={active ? { backgroundColor: 'var(--surface-4)' } : undefined}
                >
                  {ed.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Platform — Console is the plain manual tracker; PC is the
            auto-sync tracker (roster, ratings, stats, schedule, recruiting,
            all pulled from a save file, all season). PC only exists for
            CFB 27 (that's the only edition with a save-sync path) — CFB 26
            is Console-only. Locked to PC once a save is uploaded below,
            same as Game Edition. */}
        <div className="mb-6">
          <p className="block text-sm font-medium text-txt-primary mb-2">Platform</p>
          {cfb27Parsed ? (
            <p className="text-xs text-txt-tertiary mb-2">Set to PC by your imported save.</p>
          ) : formData.gameEdition !== 'cfb27' && (
            <p className="text-xs text-txt-tertiary mb-2">PC sync is only available on CFB 27 — CFB 26 is Console-only.</p>
          )}
          <div className="flex w-full rounded-lg p-1 bg-surface-2 border border-surface-4">
            {[
              { value: 'console', label: 'Console' },
              { value: 'pc', label: 'PC' },
            ].map((opt) => {
              const active = formData.platform === opt.value
              const locked = !!cfb27Parsed || (opt.value === 'pc' && formData.gameEdition !== 'cfb27')
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={locked}
                  onClick={() => setFormData(prev => ({ ...prev, platform: opt.value }))}
                  aria-pressed={active}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    active ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                  }`}
                  style={active ? { backgroundColor: 'var(--surface-4)' } : undefined}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-txt-tertiary mt-2">
            {formData.platform === 'pc'
              ? 'PC dynasties sync rosters, ratings, stats, and schedules directly from your save file.'
              : 'Console dynasties are entered and updated manually — there is no save file to sync from.'}
          </p>
        </div>

        <div className="mb-6 flex w-full rounded-lg p-1 bg-surface-2 border border-surface-4">
          {[
            { value: 'fbs', label: 'FBS Team' },
            { value: 'teambuilder', label: 'TeamBuilder' },
          ].map((opt) => {
            const active = mode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                aria-pressed={active}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
                  active ? 'text-txt-primary' : 'text-txt-tertiary hover:text-txt-secondary'
                }`}
                style={active ? { backgroundColor: 'var(--surface-4)' } : undefined}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'fbs' ? (
            <div>
              <SearchableSelect
                label="Team Name"
                options={teamNameOptions}
                value={formData.teamName}
                onChange={(value) => setFormData({ ...formData, teamName: value })}
                placeholder="Search for your team..."
                required
                teamColors={neutralColors}
              />

              {/* PC-only, additive import: uploads a CFB 27 save file, parses
                  it server-side, and seeds every resolved team's real roster
                  instead of the bundled/default one. Only shown when Platform
                  is set to PC — Console dynasties have no save file to pick,
                  so this whole box (and the "Choose Save File" button) never
                  appears for them. */}
              {formData.platform === 'pc' && (
                <div className="mt-4 p-4 rounded-lg" style={{ border: '1px dashed var(--surface-5)' }}>
                  <p className="text-sm font-semibold text-txt-primary mb-1">Import CFB 27 Save</p>
                  <p className="text-xs text-txt-tertiary mb-3">
                    Upload your DYNASTY-* save file to seed every team's real roster (ratings, archetypes, dev traits) instead of typing rosters in by hand.
                  </p>

                  <input
                    ref={cfb27FileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleCfb27FileChange}
                  />

                  {!cfb27FileName && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => cfb27FileInputRef.current?.click()}
                    >
                      Choose Save File
                    </Button>
                  )}

                  {cfb27FileName && (
                    <div className="space-y-2">
                      <p className="text-sm text-txt-secondary">{cfb27FileName}</p>

                      {(cfb27Status === 'uploading' || cfb27Status === 'parsing') && (
                        <p className="text-sm text-txt-tertiary">
                          {cfb27Status === 'uploading' ? 'Uploading save...' : 'Parsing save...'}
                        </p>
                      )}

                      {cfb27Status === 'ready' && cfb27Preview && (
                        <p className="text-sm text-txt-secondary">
                          {cfb27Preview.playerCount.toLocaleString()} players parsed across {cfb27Preview.teamCount} teams, plus team ratings, coaching staff, conferences, and your schedule. Starting Year and Game Edition were set from the save.
                          {cfb27Preview.unresolvedTeamNames.length > 0 && (
                            <> {cfb27Preview.unresolvedTeamNames.length} team{cfb27Preview.unresolvedTeamNames.length === 1 ? '' : 's'} not recognized and will be skipped: {cfb27Preview.unresolvedTeamNames.join(', ')}.</>
                          )}
                        </p>
                      )}

                      {cfb27Status === 'error' && (
                        <p className="text-sm" style={{ color: 'var(--danger)' }}>{cfb27Error}</p>
                      )}

                      <Button type="button" variant="outline" size="sm" onClick={clearCfb27Import}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              )}
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
            <label htmlFor="coachName" className="block text-sm font-medium text-txt-primary mb-2">Coach Name</label>
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
            <label htmlFor="startYear" className="block text-sm font-medium text-txt-primary mb-2">Starting Year</label>
            {cfb27Parsed && (
              <p className="text-xs text-txt-tertiary mb-2">Set from your imported save — remove the save to change it.</p>
            )}
            <Input
              type="number"
              id="startYear"
              name="startYear"
              value={formData.startYear}
              onChange={handleChange}
              max="2099"
              required
              disabled={!!cfb27Parsed}
              className="tabular"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={creating || !isFormValid() || cfb27Status === 'uploading' || cfb27Status === 'parsing'}
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
