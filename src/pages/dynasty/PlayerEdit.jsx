import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useDynasty, getPlayerBoxScoreTotals } from '../../context/DynastyContext'
import { usePathPrefix } from '../../hooks/usePathPrefix'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { getCurrentTeamAbbr, getTidFromAbbr, getAbbrFromTid, TEAMS } from '../../data/teamRegistry'
import { getTeamLogo, getMascotName } from '../../data/teams'
import PlayerTimelineEditor from '../../components/PlayerTimelineEditor'

/**
 * PlayerEdit - Full page player editor with polished UI
 * Matches the app's team-colored design language
 */

// Position options
const POSITIONS = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS', 'K', 'P']

// Class options
const CLASSES = ['Fr', 'RS Fr', 'So', 'RS So', 'Jr', 'RS Jr', 'Sr', 'RS Sr']

// Dev trait options
const DEV_TRAITS = ['Elite', 'Star', 'Impact', 'Normal']

// States
const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC']

// Archetype options grouped by position type
const ARCHETYPES = {
  QB: ['Dual Threat', 'Pocket Passer', 'Backfield Creator'],
  HB: ['Backfield Threat', 'Contact Seeker', 'East/West Playmaker', 'Elusive Bruiser', 'North/South Receiver', 'Pure Runner'],
  FB: ['Blocking', 'Utility'],
  WR: ['Contested Specialist', 'Elusive Route Runner', 'Gadget', 'Gritty Possession', 'Physical Route Runner', 'Route Artist', 'Speedster'],
  TE: ['Possession', 'Pure Blocker', 'Pure Possession', 'Vertical Threat'],
  OL: ['Agile', 'Pass Protector', 'Raw Strength', 'Ground and Pound', 'Well Rounded'],
  DL: ['Edge Setter', 'Gap Specialist', 'Power Rusher', 'Pure Power', 'Speed Rusher'],
  LB: ['Lurker', 'Signal Caller', 'Thumper'],
  CB: ['Boundary', 'Bump and Run', 'Field', 'Zone'],
  S: ['Box Specialist', 'Coverage Specialist', 'Hybrid'],
  K: ['Accurate', 'Power'],
  P: ['Accurate', 'Power'],
}

// Award options
const AWARD_OPTIONS = [
  { value: 'heisman', label: 'Heisman Trophy', tier: 'elite' },
  { value: 'heismanFinalist', label: 'Heisman Finalist', tier: 'elite' },
  { value: 'cfpChampMVP', label: 'CFP Championship MVP', tier: 'elite' },
  { value: 'allAm1st', label: 'All-American 1st Team', tier: 'major' },
  { value: 'allAm2nd', label: 'All-American 2nd Team', tier: 'major' },
  { value: 'allAmFr', label: 'Freshman All-American', tier: 'major' },
  { value: 'bowlMVP', label: 'Bowl Game MVP', tier: 'major' },
  { value: 'confPOY', label: 'Conference Player of the Year', tier: 'conf' },
  { value: 'confOffPOY', label: 'Conference Offensive POY', tier: 'conf' },
  { value: 'confDefPOY', label: 'Conference Defensive POY', tier: 'conf' },
  { value: 'allConf1st', label: 'All-Conference 1st Team', tier: 'conf' },
  { value: 'allConf2nd', label: 'All-Conference 2nd Team', tier: 'conf' },
  { value: 'weeklyHonor', label: 'Player of the Week', tier: 'weekly' },
]

export default function PlayerEdit() {
  const { id: dynastyId, pid } = useParams()
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const { dynasties, currentDynasty, updatePlayer, isViewOnly } = useDynasty()

  // Get the correct dynasty (handle both direct access and view mode)
  const dynasty = useMemo(() => {
    if (dynastyId) {
      return currentDynasty?.id === dynastyId ? currentDynasty : dynasties?.find(d => d.id === dynastyId)
    }
    return currentDynasty
  }, [dynastyId, currentDynasty, dynasties])

  // Get team info for colors - use player's team, not dynasty's current team
  const playerTeamName = useMemo(() => {
    if (!playerTeamTid) return null
    // playerTeamTid could be a tid (number) or abbr (string)
    return getMascotName(playerTeamTid, dynasty?.teams) || dynasty?.teamName || ''
  }, [playerTeamTid, dynasty?.teams, dynasty?.teamName])

  const teamColors = useTeamColors(playerTeamName, dynasty?.teams)
  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Find player - try both string and number pid matching
  const player = useMemo(() => {
    if (!dynasty?.players) return null
    // Try exact match first, then try parseInt for numeric pids
    return dynasty.players.find(p => p.pid === pid) ||
           dynasty.players.find(p => p.pid === parseInt(pid))
  }, [dynasty?.players, pid])

  // Get player's team for colors (not dynasty's current team)
  const currentYear = dynasty?.currentYear
  const playerTeamTid = useMemo(() => {
    if (!player) return null
    // Check teamsByYear first, then fall back to player.team
    return (currentYear && player?.teamsByYear?.[currentYear]) ||
           (currentYear && player?.teamsByYear?.[String(currentYear)]) ||
           player?.team ||
           player?.teams?.[0] ||
           dynasty?.currentTid
  }, [player, currentYear, dynasty?.currentTid])

  // State
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedStatsYear, setSelectedStatsYear] = useState(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const initializedRef = useRef(null)
  const fileInputRef = useRef(null)

  // Get available years for stats
  const availableYears = useMemo(() => {
    const yearsSet = new Set()
    if (dynasty?.startYear) yearsSet.add(dynasty.startYear)
    if (dynasty?.currentYear) yearsSet.add(dynasty.currentYear)
    if (player?.statsByYear) {
      Object.keys(player.statsByYear).forEach(year => yearsSet.add(parseInt(year)))
    }
    return Array.from(yearsSet).sort((a, b) => b - a)
  }, [dynasty, player])

  // Get box score totals for sync comparison
  const boxScoreTotals = useMemo(() => {
    if (!player?.name || !dynasty) return null
    const year = selectedStatsYear || dynasty.currentYear
    return getPlayerBoxScoreTotals(player.name, dynasty.games || [], year)
  }, [player, dynasty, selectedStatsYear])

  // Initialize form data when player changes
  useEffect(() => {
    if (!player || initializedRef.current === player.pid) return
    initializedRef.current = player.pid

    const currentYear = dynasty?.currentYear || new Date().getFullYear()
    const yearStats = player.statsByYear?.[currentYear] || player.stats || {}

    setFormData({
      // Basic Info
      firstName: player.firstName || player.name?.split(' ')[0] || '',
      lastName: player.lastName || player.name?.split(' ').slice(1).join(' ') || '',
      position: player.position || '',
      year: player.year || '',
      overall: player.overall || '',
      archetype: player.archetype || '',
      jerseyNumber: player.jerseyNumber || '',
      devTrait: player.devTrait || '',
      pictureUrl: player.pictureUrl || '',

      // Background
      hometown: player.hometown || '',
      homeState: player.homeState || '',
      height: player.height || '',
      weight: player.weight || '',

      // Tenure
      entryYear: player.entryYear || player.recruitYear || '',
      entryClass: player.entryClass || '',
      redshirtYear: player.redshirtYear || '',
      teamHistory: player.teamHistory || [],
      classByYear: player.classByYear || {},
      overallByYear: player.overallByYear || {},

      // Awards
      accolades: player.accolades || [],

      // Stats for current year
      stats: { ...yearStats },

      // Notes
      notes: player.notes || '',
    })

    setSelectedStatsYear(currentYear)
  }, [player, dynasty?.currentYear])

  // Helper to get archetypes for current position
  const getArchetypesForPosition = (pos) => {
    if (!pos) return []
    if (['LT', 'LG', 'C', 'RG', 'RT'].includes(pos)) return ARCHETYPES.OL
    if (['LEDG', 'REDG', 'DT'].includes(pos)) return ARCHETYPES.DL
    if (['SAM', 'MIKE', 'WILL'].includes(pos)) return ARCHETYPES.LB
    if (['FS', 'SS'].includes(pos)) return ARCHETYPES.S
    return ARCHETYPES[pos] || []
  }

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, pictureUrl: reader.result }))
        setShowImageUpload(false)
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error uploading image:', error)
      setUploading(false)
    }
  }

  // Update overall for a specific year
  const updateOverallForYear = (year, newOverall) => {
    setFormData(prev => ({
      ...prev,
      overallByYear: {
        ...prev.overallByYear,
        [year]: newOverall ? parseInt(newOverall) : null
      }
    }))
  }

  // Add accolade
  const addAccolade = () => {
    setFormData(prev => ({
      ...prev,
      accolades: [...(prev.accolades || []), { year: dynasty?.currentYear || '', award: '' }]
    }))
  }

  // Remove accolade
  const removeAccolade = (index) => {
    setFormData(prev => ({
      ...prev,
      accolades: prev.accolades.filter((_, i) => i !== index)
    }))
  }

  // Update accolade
  const updateAccolade = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      accolades: prev.accolades.map((a, i) => i === index ? { ...a, [field]: value } : a)
    }))
  }

  // Handle save
  const handleSave = async () => {
    if (!player || saving) return
    setSaving(true)

    const num = (v) => v ? parseInt(v) : null

    const updatedPlayer = {
      ...player,
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
      position: formData.position,
      year: formData.year,
      overall: num(formData.overall),
      archetype: formData.archetype,
      jerseyNumber: formData.jerseyNumber,
      devTrait: formData.devTrait,
      pictureUrl: formData.pictureUrl,
      hometown: formData.hometown,
      homeState: formData.homeState,
      height: formData.height,
      weight: num(formData.weight),
      entryYear: num(formData.entryYear),
      entryClass: formData.entryClass,
      redshirtYear: formData.redshirtYear ? num(formData.redshirtYear) : null,
      teamHistory: formData.teamHistory || [],
      classByYear: formData.classByYear || {},
      overallByYear: formData.overallByYear || {},
      accolades: (formData.accolades || []).filter(a => a.year && a.award),
      notes: formData.notes,
      isHonorOnly: false,
    }

    // Update stats for selected year
    const statsYear = selectedStatsYear || dynasty?.currentYear
    if (statsYear) {
      updatedPlayer.statsByYear = {
        ...player.statsByYear,
        [statsYear]: formData.stats
      }
    }

    try {
      await updatePlayer(player.pid, updatedPlayer)
      navigate(`${pathPrefix}/player/${pid}`)
    } catch (error) {
      console.error('Error saving player:', error)
    } finally {
      setSaving(false)
    }
  }

  // Handle cancel
  const handleCancel = () => {
    navigate(`${pathPrefix}/player/${pid}`)
  }

  // Loading state
  if (!dynasty) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  // Player not found
  if (!player) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-red-800 mb-2">Player Not Found</h2>
          <p className="text-red-600 mb-4">The player you're looking for doesn't exist.</p>
          <Link to={`${pathPrefix}/players`} className="text-red-600 hover:underline">
            Back to Players
          </Link>
        </div>
      </div>
    )
  }

  // View only mode
  if (isViewOnly) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-yellow-800 mb-2">View Only Mode</h2>
          <p className="text-yellow-600 mb-4">You cannot edit players in view-only mode.</p>
          <Link to={`${pathPrefix}/player/${pid}`} className="text-yellow-600 hover:underline">
            Back to Player
          </Link>
        </div>
      </div>
    )
  }

  // Get team logo
  const teamName = dynasty?.teams?.[dynasty?.currentTid]?.name ||
                   dynasty?.teamName ||
                   teamAbbr
  const teamLogo = getTeamLogo(teamName, dynasty?.teams)

  // Tab configuration
  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'career', label: 'Career' },
    { id: 'stats', label: 'Stats' },
    { id: 'awards', label: 'Awards' },
  ]

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-40 shadow-lg"
        style={{ backgroundColor: teamColors.primary, borderBottom: `4px solid ${teamColors.secondary}` }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            {/* Player Image or Placeholder */}
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{
                backgroundColor: `${teamColors.secondary}40`,
                border: `2px solid ${teamColors.secondary}`
              }}
            >
              {formData.pictureUrl ? (
                <img
                  src={formData.pictureUrl}
                  alt={player.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span
                  className="text-2xl font-bold"
                  style={{ color: primaryText, opacity: 0.5 }}
                >
                  {(formData.firstName?.[0] || '') + (formData.lastName?.[0] || '')}
                </span>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <h1
                className="text-xl font-bold truncate"
                style={{ color: primaryText }}
              >
                {formData.firstName} {formData.lastName}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {teamLogo && (
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.9)', padding: '2px' }}
                  >
                    <img src={teamLogo} alt="" className="w-full h-full object-contain" />
                  </div>
                )}
                <span
                  className="text-sm font-medium"
                  style={{ color: primaryText, opacity: 0.85 }}
                >
                  #{formData.jerseyNumber || '?'} {formData.position || 'N/A'} | {formData.year || 'N/A'}
                </span>
                {formData.overall && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: teamColors.secondary,
                      color: secondaryText
                    }}
                  >
                    {formData.overall} OVR
                  </span>
                )}
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg hover:opacity-70 transition-opacity flex-shrink-0"
              style={{ color: primaryText }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2.5 rounded-t-lg text-sm font-semibold transition-all whitespace-nowrap"
                style={{
                  backgroundColor: activeTab === tab.id ? teamColors.secondary : 'transparent',
                  color: activeTab === tab.id ? secondaryText : primaryText,
                  opacity: activeTab === tab.id ? 1 : 0.7
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Basic Info Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Basic Information
                </h2>
              </div>

              <div className="p-5 space-y-5">
                {/* Name Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={formData.firstName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={formData.lastName || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="Smith"
                    />
                  </div>
                </div>

                {/* Position, Class, Jersey, OVR Row */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Position
                    </label>
                    <select
                      value={formData.position || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value, archetype: '' }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">--</option>
                      {POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Class
                    </label>
                    <select
                      value={formData.year || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">--</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Jersey #
                    </label>
                    <input
                      type="text"
                      value={formData.jerseyNumber || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, jerseyNumber: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Overall
                    </label>
                    <input
                      type="number"
                      min="40"
                      max="99"
                      value={formData.overall || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, overall: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="85"
                    />
                  </div>
                </div>

                {/* Archetype, Dev Trait Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Archetype
                    </label>
                    <select
                      value={formData.archetype || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, archetype: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                      disabled={!formData.position}
                    >
                      <option value="">Select archetype</option>
                      {getArchetypesForPosition(formData.position).map(arch => (
                        <option key={arch} value={arch}>{arch}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Dev Trait
                    </label>
                    <select
                      value={formData.devTrait || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, devTrait: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">Select trait</option>
                      {DEV_TRAITS.map(trait => (
                        <option key={trait} value={trait}>{trait}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Player Photo Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Player Photo
                </h2>
              </div>

              <div className="p-5">
                <div className="flex items-center gap-5">
                  {/* Current Photo */}
                  <div
                    className="w-24 h-24 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{
                      backgroundColor: formData.pictureUrl ? 'transparent' : '#f1f5f9',
                      border: '2px dashed #cbd5e1'
                    }}
                  >
                    {formData.pictureUrl ? (
                      <img
                        src={formData.pictureUrl}
                        alt="Player"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-400 text-xs text-center px-2">No photo</span>
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1 space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                      style={{
                        backgroundColor: teamColors.primary,
                        color: primaryText
                      }}
                    >
                      {uploading ? 'Uploading...' : 'Upload Photo'}
                    </button>

                    {formData.pictureUrl && (
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, pictureUrl: '' }))}
                        className="ml-3 px-4 py-2 rounded-lg text-sm font-semibold bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                      >
                        Remove
                      </button>
                    )}

                    <p className="text-xs text-gray-500">
                      Supports JPG, PNG. Max 2MB recommended.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Background
                </h2>
              </div>

              <div className="p-5 space-y-5">
                {/* Hometown Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Hometown
                    </label>
                    <input
                      type="text"
                      value={formData.hometown || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, hometown: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="Dallas"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      State
                    </label>
                    <select
                      value={formData.homeState || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, homeState: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">Select state</option>
                      {STATES.map(state => (
                        <option key={state} value={state}>{state}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Physical Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Height
                    </label>
                    <input
                      type="text"
                      value={formData.height || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="6'2&quot;"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Weight (lbs)
                    </label>
                    <input
                      type="number"
                      value={formData.weight || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="220"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Notes
                </h2>
              </div>

              <div className="p-5">
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 resize-none"
                  placeholder="Add notes about this player..."
                />
              </div>
            </div>
          </div>
        )}

        {/* Career Tab */}
        {activeTab === 'career' && (
          <div className="space-y-6">
            {/* Entry Info Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Entry Information
                </h2>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Entry Year
                    </label>
                    <input
                      type="number"
                      value={formData.entryYear || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, entryYear: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="2024"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Entry Class
                    </label>
                    <select
                      value={formData.entryClass || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, entryClass: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 bg-white"
                    >
                      <option value="">Select class</option>
                      {CLASSES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Redshirt Year
                    </label>
                    <input
                      type="number"
                      value={formData.redshirtYear || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, redshirtYear: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900"
                      placeholder="None"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Overall by Season Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Overall by Season
                </h2>
              </div>

              <div className="p-5">
                {availableYears.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {availableYears.map(year => (
                      <div
                        key={year}
                        className="rounded-lg p-3"
                        style={{ backgroundColor: `${teamColors.primary}08`, border: `1px solid ${teamColors.primary}20` }}
                      >
                        <div className="text-xs font-semibold text-gray-500 mb-1">{year}</div>
                        <input
                          type="number"
                          min="40"
                          max="99"
                          value={formData.overallByYear?.[year] || ''}
                          onChange={(e) => updateOverallForYear(year, e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-gray-200 focus:border-blue-500 focus:outline-none text-center text-lg font-bold text-gray-900"
                          placeholder="--"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">No seasons available</p>
                )}
              </div>
            </div>

            {/* Team History Card */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Team History
                </h2>
              </div>

              <div className="p-5">
                <PlayerTimelineEditor
                  player={player}
                  teams={dynasty?.teams || TEAMS}
                  currentYear={dynasty?.currentYear}
                  classByYear={formData.classByYear || {}}
                  overallByYear={formData.overallByYear || {}}
                  onTeamHistoryChange={(newHistory) => setFormData(prev => ({ ...prev, teamHistory: newHistory }))}
                  editable={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* Year Selector */}
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Season Stats
                </h2>
                <select
                  value={selectedStatsYear || ''}
                  onChange={(e) => {
                    const year = parseInt(e.target.value)
                    setSelectedStatsYear(year)
                    const yearStats = player.statsByYear?.[year] || {}
                    setFormData(prev => ({ ...prev, stats: { ...yearStats } }))
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-white/30"
                  style={{
                    backgroundColor: teamColors.secondary,
                    color: secondaryText
                  }}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="p-5">
                {boxScoreTotals && (
                  <div
                    className="mb-5 p-4 rounded-lg"
                    style={{ backgroundColor: `${teamColors.primary}10`, border: `1px solid ${teamColors.primary}30` }}
                  >
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Box Score Totals (Auto-calculated)
                    </div>
                    <div className="text-sm text-gray-600">
                      {boxScoreTotals.gamesPlayed} games played
                      {boxScoreTotals.passing?.yds > 0 && ` | ${boxScoreTotals.passing.yds} pass yds`}
                      {boxScoreTotals.rushing?.yds > 0 && ` | ${boxScoreTotals.rushing.yds} rush yds`}
                      {boxScoreTotals.receiving?.yds > 0 && ` | ${boxScoreTotals.receiving.yds} rec yds`}
                    </div>
                  </div>
                )}

                {/* Stat Input Grid - Passing */}
                {['QB'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Passing</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'passComp', label: 'Comp' },
                        { key: 'passAtt', label: 'Att' },
                        { key: 'passYds', label: 'Yards' },
                        { key: 'passTD', label: 'TD' },
                        { key: 'passInt', label: 'INT' },
                        { key: 'passLong', label: 'Long' },
                        { key: 'sacked', label: 'Sacked' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rushing */}
                {['QB', 'HB', 'FB', 'WR', 'TE'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Rushing</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'rushAtt', label: 'Carries' },
                        { key: 'rushYds', label: 'Yards' },
                        { key: 'rushTD', label: 'TD' },
                        { key: 'rushLong', label: 'Long' },
                        { key: 'fumbles', label: 'Fumbles' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Receiving */}
                {['HB', 'FB', 'WR', 'TE'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Receiving</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'receptions', label: 'Rec' },
                        { key: 'recYds', label: 'Yards' },
                        { key: 'recTD', label: 'TD' },
                        { key: 'recLong', label: 'Long' },
                        { key: 'drops', label: 'Drops' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Defense */}
                {['LEDG', 'REDG', 'DT', 'SAM', 'MIKE', 'WILL', 'CB', 'FS', 'SS'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Defense</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'tackles', label: 'Tackles' },
                        { key: 'tfl', label: 'TFL' },
                        { key: 'sacks', label: 'Sacks' },
                        { key: 'ints', label: 'INT' },
                        { key: 'pd', label: 'Pass Def' },
                        { key: 'ff', label: 'Forced Fum' },
                        { key: 'fr', label: 'Fum Rec' },
                        { key: 'defTD', label: 'Def TD' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kicking */}
                {['K', 'P'].includes(formData.position) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
                      {formData.position === 'K' ? 'Kicking' : 'Punting'}
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                      {formData.position === 'K' ? [
                        { key: 'fgm', label: 'FG Made' },
                        { key: 'fga', label: 'FG Att' },
                        { key: 'fgLong', label: 'FG Long' },
                        { key: 'xpm', label: 'XP Made' },
                        { key: 'xpa', label: 'XP Att' },
                      ] : [
                        { key: 'punts', label: 'Punts' },
                        { key: 'puntYds', label: 'Yards' },
                        { key: 'puntLong', label: 'Long' },
                        { key: 'puntIn20', label: 'In 20' },
                        { key: 'touchbacks', label: 'TB' },
                      ].map(stat => (
                        <div key={stat.key}>
                          <label className="block text-xs text-gray-500 mb-1">{stat.label}</label>
                          <input
                            type="number"
                            value={formData.stats?.[stat.key] || ''}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              stats: { ...prev.stats, [stat.key]: e.target.value ? parseInt(e.target.value) : '' }
                            }))}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Games Played */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">General</h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Games</label>
                      <input
                        type="number"
                        value={formData.stats?.gamesPlayed || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          stats: { ...prev.stats, gamesPlayed: e.target.value ? parseInt(e.target.value) : '' }
                        }))}
                        className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Snaps</label>
                      <input
                        type="number"
                        value={formData.stats?.snapsPlayed || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          stats: { ...prev.stats, snapsPlayed: e.target.value ? parseInt(e.target.value) : '' }
                        }))}
                        className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Awards Tab */}
        {activeTab === 'awards' && (
          <div className="space-y-6">
            <div
              className="rounded-xl overflow-hidden shadow-sm"
              style={{ backgroundColor: 'white', border: `2px solid ${teamColors.primary}20` }}
            >
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ backgroundColor: teamColors.primary }}
              >
                <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: primaryText }}>
                  Awards & Accolades
                </h2>
                <button
                  onClick={addAccolade}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: teamColors.secondary,
                    color: secondaryText
                  }}
                >
                  + Add Award
                </button>
              </div>

              <div className="p-5">
                {(formData.accolades || []).length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 text-4xl mb-3">🏆</div>
                    <p className="text-gray-500 mb-4">No awards yet</p>
                    <button
                      onClick={addAccolade}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                      style={{
                        backgroundColor: teamColors.primary,
                        color: primaryText
                      }}
                    >
                      Add First Award
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.accolades.map((accolade, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 rounded-lg"
                        style={{ backgroundColor: `${teamColors.primary}08`, border: `1px solid ${teamColors.primary}15` }}
                      >
                        <div className="w-20">
                          <input
                            type="number"
                            value={accolade.year || ''}
                            onChange={(e) => updateAccolade(index, 'year', e.target.value)}
                            className="w-full px-2 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-center text-gray-900"
                            placeholder="Year"
                          />
                        </div>
                        <div className="flex-1">
                          <select
                            value={accolade.award || ''}
                            onChange={(e) => updateAccolade(index, 'award', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
                          >
                            <option value="">Select award</option>
                            <optgroup label="Elite Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'elite').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Major Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'major').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Conference Awards">
                              {AWARD_OPTIONS.filter(a => a.tier === 'conf').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Weekly Honors">
                              {AWARD_OPTIONS.filter(a => a.tier === 'weekly').map(award => (
                                <option key={award.value} value={award.value}>{award.label}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                        <button
                          onClick={() => removeAccolade(index)}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Footer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 shadow-2xl"
        style={{
          backgroundColor: teamColors.secondary,
          borderTop: `3px solid ${teamColors.primary}`
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              color: secondaryText,
              border: `2px solid ${secondaryText}40`
            }}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-2.5 rounded-lg text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: teamColors.primary,
              color: primaryText,
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
