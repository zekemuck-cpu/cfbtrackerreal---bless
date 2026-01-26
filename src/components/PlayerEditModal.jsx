import { useState, useEffect, useRef, useMemo } from 'react'
import { getContrastTextColor } from '../utils/colorUtils'
import { getCurrentTeamAbbr, getTidFromAbbr, getAbbrFromTid, TEAMS } from '../data/teamRegistry'
import { getPlayerBoxScoreTotals } from '../context/DynastyContext'
import PlayerTimelineEditor from './PlayerTimelineEditor'

/**
 * PlayerEditModalNew - Completely redesigned player editor
 *
 * Design principles:
 * - Tab-based navigation for clear organization
 * - Visual player card showing current state
 * - Most important info visible first
 * - Clean, modern, mobile-friendly design
 * - Smart grouping of related fields
 */

// Tab configuration
const TABS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'career', label: 'Career', icon: 'timeline' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'awards', label: 'Awards', icon: 'trophy' },
]

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
  { value: 'confOPOY', label: 'Conference Offensive POY', tier: 'conf' },
  { value: 'confDPOY', label: 'Conference Defensive POY', tier: 'conf' },
  { value: 'confFreshmanOY', label: 'Conference Freshman of the Year', tier: 'conf' },
  { value: 'allConf1st', label: 'All-Conference 1st Team', tier: 'conf' },
  { value: 'allConf2nd', label: 'All-Conference 2nd Team', tier: 'conf' },
  { value: 'allConfFr', label: 'Freshman All-Conference', tier: 'conf' },
  { value: 'confPOW', label: 'Conference Player of the Week', tier: 'weekly' },
  { value: 'nationalPOW', label: 'National Player of the Week', tier: 'weekly' },
]

// Icon components
const Icons = {
  user: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  ),
  timeline: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  ),
  chart: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  ),
  trophy: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  ),
  camera: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
  close: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  ),
  check: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  ),
  sync: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  ),
  plus: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  ),
  trash: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  ),
}

// Dev trait badge colors
const DEV_TRAIT_COLORS = {
  Elite: { bg: '#fbbf24', text: '#000' },
  Star: { bg: '#a855f7', text: '#fff' },
  Impact: { bg: '#3b82f6', text: '#fff' },
  Normal: { bg: '#6b7280', text: '#fff' },
}

export default function PlayerEditModalNew({
  isOpen,
  onClose,
  player,
  teamColors,
  onSave,
  onSyncAllPlayers,
  defaultSchool,
  dynasty
}) {
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState({})
  const [selectedStatsYear, setSelectedStatsYear] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [justSynced, setJustSynced] = useState(false)
  const fileInputRef = useRef(null)
  const initializedRef = useRef(null)

  // Get available years for stats
  const availableYears = useMemo(() => {
    if (!dynasty) return []
    const yearsSet = new Set()
    if (dynasty.currentYear) yearsSet.add(dynasty.currentYear)
    if (player?.statsByYear) {
      Object.keys(player.statsByYear).forEach(year => yearsSet.add(parseInt(year)))
    }
    return Array.from(yearsSet).sort((a, b) => b - a)
  }, [dynasty, player])

  // Get box score totals for sync comparison
  const userTeamAbbr = dynasty ? (getCurrentTeamAbbr(dynasty) || dynasty.teamName) : null
  const boxScoreTotals = useMemo(() => {
    if (!player?.name || !dynasty?.games || !selectedStatsYear || !userTeamAbbr) return null
    return getPlayerBoxScoreTotals(player.name, dynasty.games, selectedStatsYear, userTeamAbbr)
  }, [player?.name, dynasty?.games, selectedStatsYear, userTeamAbbr])

  // Check if stats are out of sync
  const statsOutOfSync = useMemo(() => {
    if (!boxScoreTotals || justSynced) return false
    const currentStats = player?.statsByYear?.[selectedStatsYear] || {}
    if ((currentStats.gamesPlayed || 0) !== (boxScoreTotals.gamesPlayed || 0)) return true
    return false
  }, [boxScoreTotals, player?.statsByYear, selectedStatsYear, justSynced])

  // Get position group for archetype filtering
  const getPositionGroup = (pos) => {
    if (['LT', 'LG', 'C', 'RG', 'RT'].includes(pos)) return 'OL'
    if (['LEDG', 'REDG', 'DT'].includes(pos)) return 'DL'
    if (['SAM', 'MIKE', 'WILL'].includes(pos)) return 'LB'
    if (['FS', 'SS'].includes(pos)) return 'S'
    return pos
  }

  // Get archetypes for current position
  const currentArchetypes = useMemo(() => {
    const group = getPositionGroup(formData.position)
    return ARCHETYPES[group] || Object.values(ARCHETYPES).flat()
  }, [formData.position])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  // Helper to get stats for a year
  const getYearStats = (year) => {
    const yearStr = year?.toString()
    const playerYearStats = player?.statsByYear?.[year] || player?.statsByYear?.[yearStr] || {}

    return {
      gamesPlayed: playerYearStats.gamesPlayed || 0,
      passing: playerYearStats.passing || {},
      rushing: playerYearStats.rushing || {},
      receiving: playerYearStats.receiving || {},
      defense: playerYearStats.defense || {},
      kicking: playerYearStats.kicking || {},
      punting: playerYearStats.punting || {},
      kickReturn: playerYearStats.kickReturn || {},
      puntReturn: playerYearStats.puntReturn || {},
    }
  }

  // Initialize form data when modal opens
  useEffect(() => {
    const playerId = player?.id || player?.name
    if (player && isOpen && initializedRef.current !== playerId) {
      initializedRef.current = playerId
      setJustSynced(false)
      setActiveTab('profile')

      const defaultYear = dynasty?.currentYear || availableYears[0]
      setSelectedStatsYear(defaultYear)

      const yearStats = getYearStats(defaultYear)
      const splitName = (name) => {
        if (!name) return { firstName: '', lastName: '' }
        const parts = name.trim().split(/\s+/)
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
      }
      const { firstName, lastName } = splitName(player.name)

      setFormData({
        // Basic
        pictureUrl: player.pictureUrl || '',
        firstName: player.firstName || firstName,
        lastName: player.lastName || lastName,
        position: player.position || '',
        archetype: player.archetype || '',
        jerseyNumber: player.jerseyNumber || '',
        overall: player.overall || '',
        year: player.year || '',
        devTrait: player.devTrait || 'Normal',
        height: player.height || '',
        weight: player.weight || '',
        hometown: player.hometown || '',
        state: player.state || '',

        // Recruiting
        recruitYear: player.recruitYear || '',
        stars: player.stars || '',
        positionRank: player.positionRank || '',
        stateRank: player.stateRank || '',
        nationalRank: player.nationalRank || '',
        previousTeam: player.previousTeam || '',
        isRecruit: player.isRecruit || false,
        isPortal: player.isPortal || false,
        gemBust: player.gemBust || '',

        // Development
        overallProgression: player.overallProgression || '',
        draftRound: player.draftRound || '',

        // Career
        teamHistory: player.teamHistory || [],
        teamsByYear: player.teamsByYear || {},
        entryYear: player.entryYear || '',
        entryClass: player.entryClass || '',
        redshirtYear: player.redshirtYear || '',
        classByYear: player.classByYear || {},
        overallByYear: player.overallByYear || {},

        // Awards
        accolades: player.accolades || [],

        // Stats (current year)
        stats: yearStats,

        // Notes
        notes: player.notes || '',
      })
    }

    if (!isOpen) {
      initializedRef.current = null
    }
  }, [player, isOpen, dynasty, availableYears])

  // Handle year change for stats
  const handleYearChange = (year) => {
    setSelectedStatsYear(year)
    setJustSynced(false)
    const yearStats = getYearStats(year)
    setFormData(prev => ({ ...prev, stats: yearStats }))
  }

  // Upload image to ImgBB
  const uploadToImgBB = async (file) => {
    const apiKey = import.meta.env.VITE_IMGBB_API_KEY || '1369fa0365731b13c5330a26fedf569c'
    const formDataUpload = new FormData()
    formDataUpload.append('image', file)
    formDataUpload.append('key', apiKey)

    try {
      setUploading(true)
      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formDataUpload
      })
      const data = await response.json()
      if (data.success) {
        setFormData(prev => ({ ...prev, pictureUrl: data.data.url }))
        setShowImageUpload(false)
      } else {
        alert('Upload failed: ' + (data.error?.message || 'Unknown error'))
      }
    } catch (error) {
      alert('Upload failed: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  // Handle paste for image upload
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) await uploadToImgBB(file)
        return
      }
    }
  }

  // Sync stats from box scores
  const handleSync = () => {
    if (!boxScoreTotals) return
    setFormData(prev => ({
      ...prev,
      stats: {
        gamesPlayed: boxScoreTotals.gamesPlayed || 0,
        passing: boxScoreTotals.passing || {},
        rushing: boxScoreTotals.rushing || {},
        receiving: boxScoreTotals.receiving || {},
        defense: boxScoreTotals.defense || {},
        kicking: boxScoreTotals.kicking || {},
        punting: boxScoreTotals.punting || {},
        kickReturn: boxScoreTotals.kickReturn || {},
        puntReturn: boxScoreTotals.puntReturn || {},
      }
    }))
    setJustSynced(true)
  }

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault()
    const num = (val) => parseFloat(val) || 0

    // Build year stats in internal format
    const yearStats = {
      year: selectedStatsYear,
      gamesPlayed: num(formData.stats?.gamesPlayed),
      passing: formData.stats?.passing || {},
      rushing: formData.stats?.rushing || {},
      receiving: formData.stats?.receiving || {},
      defense: formData.stats?.defense || {},
      kicking: formData.stats?.kicking || {},
      punting: formData.stats?.punting || {},
      kickReturn: formData.stats?.kickReturn || {},
      puntReturn: formData.stats?.puntReturn || {},
    }

    const updatedPlayer = {
      ...player,
      pictureUrl: formData.pictureUrl,
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
      position: formData.position,
      archetype: formData.archetype,
      jerseyNumber: formData.jerseyNumber,
      overall: num(formData.overall),
      year: formData.year,
      devTrait: formData.devTrait,
      height: formData.height,
      weight: formData.weight ? num(formData.weight) : null,
      hometown: formData.hometown,
      state: formData.state,
      recruitYear: formData.recruitYear ? num(formData.recruitYear) : null,
      stars: num(formData.stars),
      positionRank: num(formData.positionRank),
      stateRank: num(formData.stateRank),
      nationalRank: num(formData.nationalRank),
      previousTeam: formData.previousTeam,
      isRecruit: formData.isRecruit,
      isPortal: formData.isPortal,
      gemBust: formData.gemBust,
      overallProgression: formData.overallProgression,
      draftRound: formData.draftRound,
      teamHistory: formData.teamHistory || [],
      teamsByYear: formData.teamsByYear,
      entryYear: formData.entryYear ? num(formData.entryYear) : null,
      entryClass: formData.entryClass || null,
      redshirtYear: formData.redshirtYear ? num(formData.redshirtYear) : null,
      classByYear: formData.classByYear || {},
      overallByYear: formData.overallByYear || {},
      accolades: (formData.accolades || []).filter(a => a.year && a.award),
      notes: formData.notes,
      isHonorOnly: false,
    }

    onSave(updatedPlayer, yearStats)
  }

  if (!isOpen) return null

  const primaryText = getContrastTextColor(teamColors.primary)
  const secondaryText = getContrastTextColor(teamColors.secondary)

  // Styled input component
  const Input = ({ label, name, value, onChange, type = 'text', placeholder, className = '' }) => (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-white text-gray-900 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none transition-colors text-sm"
      />
    </div>
  )

  // Styled select component
  const Select = ({ label, name, value, onChange, options, placeholder = 'Select...', className = '' }) => (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        className="w-full px-3 py-2.5 bg-white text-gray-900 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none transition-colors text-sm appearance-none cursor-pointer"
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
            {typeof opt === 'object' ? opt.label : opt}
          </option>
        ))}
      </select>
    </div>
  )

  const handleFieldChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  // Profile Tab Content
  const ProfileTab = () => (
    <div className="space-y-6">
      {/* Core Info Card */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Core Info</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="First Name" name="firstName" value={formData.firstName} onChange={handleFieldChange} />
          <Input label="Last Name" name="lastName" value={formData.lastName} onChange={handleFieldChange} />
          <Input label="Jersey #" name="jerseyNumber" value={formData.jerseyNumber} onChange={handleFieldChange} />
          <Input label="Overall" name="overall" value={formData.overall} onChange={handleFieldChange} type="number" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Select label="Position" name="position" value={formData.position} onChange={handleFieldChange} options={POSITIONS} />
          <Select label="Archetype" name="archetype" value={formData.archetype} onChange={handleFieldChange} options={currentArchetypes} />
          <Select label="Class" name="year" value={formData.year} onChange={handleFieldChange} options={CLASSES} />
          <Select label="Dev Trait" name="devTrait" value={formData.devTrait} onChange={handleFieldChange} options={DEV_TRAITS} />
        </div>
      </div>

      {/* Physical & Origin Card */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Physical & Origin</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="Height" name="height" value={formData.height} onChange={handleFieldChange} placeholder="6'2&quot;" />
          <Input label="Weight" name="weight" value={formData.weight} onChange={handleFieldChange} placeholder="220" />
          <Input label="Hometown" name="hometown" value={formData.hometown} onChange={handleFieldChange} />
          <Select label="State" name="state" value={formData.state} onChange={handleFieldChange} options={STATES} />
        </div>
      </div>

      {/* Recruiting Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wide">Recruiting</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Input label="Recruit Year" name="recruitYear" value={formData.recruitYear} onChange={handleFieldChange} placeholder="2025" />
          <Input label="Stars" name="stars" value={formData.stars} onChange={handleFieldChange} type="number" />
          <Input label="Pos Rank" name="positionRank" value={formData.positionRank} onChange={handleFieldChange} type="number" />
          <Input label="State Rank" name="stateRank" value={formData.stateRank} onChange={handleFieldChange} type="number" />
          <Input label="Nat'l Rank" name="nationalRank" value={formData.nationalRank} onChange={handleFieldChange} type="number" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Select label="Gem/Bust" name="gemBust" value={formData.gemBust} onChange={handleFieldChange} options={[
            { value: '', label: 'Neither' },
            { value: 'Gem', label: 'Gem' },
            { value: 'Bust', label: 'Bust' },
          ]} />
          <Input label="Transfer From" name="previousTeam" value={formData.previousTeam} onChange={handleFieldChange} />
          <Input label="OVR Progression" name="overallProgression" value={formData.overallProgression} onChange={handleFieldChange} />
          <Input label="Draft Round" name="draftRound" value={formData.draftRound} onChange={handleFieldChange} />
        </div>
        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isRecruit || false}
              onChange={(e) => handleFieldChange('isRecruit', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-600">Is Recruit</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isPortal || false}
              onChange={(e) => handleFieldChange('isPortal', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
            />
            <span className="text-sm text-gray-600">Portal Transfer</span>
          </label>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Notes</h3>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          placeholder="Add any notes about this player..."
          rows={3}
          className="w-full px-4 py-3 bg-white text-gray-900 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none transition-colors text-sm resize-none"
        />
      </div>
    </div>
  )

  // Career Tab Content
  const CareerTab = () => {
    const currentYear = dynasty?.currentYear || new Date().getFullYear()
    const teamHistory = formData.teamHistory || []
    const hasLegacyData = Object.keys(formData.teamsByYear || {}).length > 0 && teamHistory.length === 0

    const migrateFromTeamsByYear = () => {
      const teamsByYear = formData.teamsByYear || {}
      const years = Object.keys(teamsByYear).map(y => parseInt(y)).filter(y => !isNaN(y)).sort((a, b) => a - b)
      if (years.length === 0) return

      const stints = []
      let currentStint = null

      for (const year of years) {
        const teamValue = teamsByYear[String(year)] || teamsByYear[year]
        const tid = getTidFromAbbr(teamValue) || teamValue
        const tidNum = Number(tid)

        if (!currentStint || currentStint.teamTid !== tidNum) {
          if (currentStint) {
            currentStint.toYear = year - 1
            currentStint.reason = 'transfer'
          }
          currentStint = {
            teamTid: tidNum,
            fromYear: year,
            toYear: null,
            reason: null,
            entryType: stints.length === 0 ? (formData.isPortal ? 'portal_in' : 'recruited') : 'transfer'
          }
          stints.push(currentStint)
        }
      }

      setFormData(prev => ({ ...prev, teamHistory: stints }))
    }

    // Calculate years the player has been active
    const getActiveYears = () => {
      const years = new Set()
      // From teamHistory
      teamHistory.forEach(stint => {
        const from = stint.fromYear
        const to = stint.toYear || currentYear
        for (let y = from; y <= to; y++) {
          years.add(y)
        }
      })
      // From classByYear
      Object.keys(formData.classByYear || {}).forEach(y => years.add(parseInt(y)))
      // From teamsByYear (legacy)
      Object.keys(formData.teamsByYear || {}).forEach(y => years.add(parseInt(y)))
      return Array.from(years).sort((a, b) => a - b)
    }

    const activeYears = getActiveYears()

    // Update class for a specific year
    const updateClassForYear = (year, newClass) => {
      setFormData(prev => ({
        ...prev,
        classByYear: {
          ...prev.classByYear,
          [year]: newClass
        }
      }))
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

    // Auto-fill classes based on entry info
    const autoFillClasses = () => {
      if (!formData.entryYear || !formData.entryClass) return

      const newClassByYear = { ...formData.classByYear }
      const entryYearNum = parseInt(formData.entryYear)
      const isRS = formData.entryClass.startsWith('RS ')
      const baseClass = isRS ? formData.entryClass.replace('RS ', '') : formData.entryClass

      const normalOrder = ['Fr', 'So', 'Jr', 'Sr']
      const rsOrder = ['RS Fr', 'RS So', 'RS Jr', 'RS Sr']
      const order = isRS ? rsOrder : normalOrder

      let baseIndex = normalOrder.indexOf(baseClass)
      if (baseIndex === -1) baseIndex = 0

      activeYears.forEach(year => {
        const yearsSinceEntry = year - entryYearNum
        if (yearsSinceEntry < 0) return

        // Check if redshirted
        const redshirtYear = formData.redshirtYear ? parseInt(formData.redshirtYear) : null
        let useRS = isRS
        if (redshirtYear && year > redshirtYear && !isRS) {
          useRS = true
        }

        const effectiveOrder = useRS ? rsOrder : normalOrder
        let classIndex = baseIndex + yearsSinceEntry
        if (redshirtYear && year > redshirtYear && !isRS) {
          classIndex = baseIndex + yearsSinceEntry - 1
        }

        if (classIndex >= 0 && classIndex < effectiveOrder.length) {
          newClassByYear[year] = effectiveOrder[classIndex]
        }
      })

      setFormData(prev => ({ ...prev, classByYear: newClassByYear }))
    }

    return (
      <div className="space-y-4">
        {/* Entry Information */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <h4 className="text-sm font-bold text-blue-800 mb-3">Entry Information</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Entry Year</label>
              <input
                type="number"
                value={formData.entryYear || ''}
                onChange={(e) => handleFieldChange('entryYear', parseInt(e.target.value) || '')}
                placeholder={String(currentYear - 3)}
                className="w-full px-3 py-2 bg-white text-gray-900 rounded-lg border border-blue-200 focus:border-blue-400 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Entry Class</label>
              <select
                value={formData.entryClass || ''}
                onChange={(e) => handleFieldChange('entryClass', e.target.value)}
                className="w-full px-3 py-2 bg-white text-gray-900 rounded-lg border border-blue-200 focus:border-blue-400 focus:outline-none text-sm"
              >
                <option value="">Select...</option>
                {CLASSES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-blue-700 mb-1">Redshirt Year</label>
              <input
                type="number"
                value={formData.redshirtYear || ''}
                onChange={(e) => handleFieldChange('redshirtYear', parseInt(e.target.value) || '')}
                placeholder="None"
                className="w-full px-3 py-2 bg-white text-gray-900 rounded-lg border border-blue-200 focus:border-blue-400 focus:outline-none text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={autoFillClasses}
                disabled={!formData.entryYear || !formData.entryClass}
                className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Auto-Fill Classes
              </button>
            </div>
          </div>
        </div>

        {/* Class by Year */}
        {activeYears.length > 0 && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
            <h4 className="text-sm font-bold text-gray-700 mb-3">Class by Season</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {activeYears.map(year => (
                <div key={year} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-gray-200">
                  <span className="text-sm font-medium text-gray-600 w-12">{year}</span>
                  <select
                    value={formData.classByYear?.[year] || ''}
                    onChange={(e) => updateClassForYear(year, e.target.value)}
                    className="flex-1 px-2 py-1 bg-gray-50 text-gray-900 rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-sm"
                  >
                    <option value="">-</option>
                    {CLASSES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overall by Season */}
        {activeYears.length > 0 && (
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
            <h4 className="text-sm font-bold text-blue-800 mb-3">Overall by Season</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {activeYears.map(year => (
                <div key={year} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-blue-200">
                  <span className="text-sm font-medium text-gray-600 w-12">{year}</span>
                  <input
                    type="number"
                    min="40"
                    max="99"
                    value={formData.overallByYear?.[year] || ''}
                    onChange={(e) => updateOverallForYear(year, e.target.value)}
                    placeholder="OVR"
                    className="flex-1 px-2 py-1 bg-gray-50 text-gray-900 rounded border border-gray-200 focus:border-blue-400 focus:outline-none text-sm w-16"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {hasLegacyData && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <p className="text-sm text-amber-800 mb-3">
              This player has legacy career data. Convert it to the new timeline format.
            </p>
            <button
              type="button"
              onClick={migrateFromTeamsByYear}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              Convert ({Object.keys(formData.teamsByYear || {}).length} years)
            </button>
          </div>
        )}

        <PlayerTimelineEditor
          teamHistory={teamHistory}
          onChange={(newHistory) => setFormData(prev => ({ ...prev, teamHistory: newHistory }))}
          teams={dynasty?.teams}
          currentYear={currentYear}
          primaryColor={teamColors.primary}
          playerName={`${formData.firstName} ${formData.lastName}`}
          classByYear={formData.classByYear}
          overallByYear={formData.overallByYear}
        />
      </div>
    )
  }

  // Stats Tab Content
  const StatsTab = () => {
    const stats = formData.stats || {}

    const updateStat = (category, field, value) => {
      setFormData(prev => ({
        ...prev,
        stats: {
          ...prev.stats,
          [category]: {
            ...(prev.stats?.[category] || {}),
            [field]: parseFloat(value) || 0
          }
        }
      }))
    }

    const StatGroup = ({ title, category, fields, color = 'gray' }) => (
      <div className={`bg-gradient-to-br from-${color}-50 to-${color}-100 rounded-2xl p-4 space-y-3`}>
        <h4 className={`text-xs font-bold text-${color}-700 uppercase tracking-wide`}>{title}</h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input
                type="number"
                value={stats[category]?.[key] || ''}
                onChange={(e) => updateStat(category, key, e.target.value)}
                className="w-full px-2.5 py-2 bg-white text-gray-900 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <div className="space-y-4">
        {/* Year Selector & Sync */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-100 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Season:</span>
            <select
              value={selectedStatsYear || ''}
              onChange={(e) => handleYearChange(parseInt(e.target.value))}
              className="px-3 py-1.5 bg-white text-gray-900 rounded-lg border border-gray-300 text-sm font-medium"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          {boxScoreTotals && (
            <div className="flex items-center gap-2">
              {statsOutOfSync ? (
                <button
                  type="button"
                  onClick={handleSync}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons.sync}</svg>
                  Sync from Box Scores
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons.check}</svg>
                  In Sync
                </span>
              )}
            </div>
          )}
        </div>

        {/* Games Played */}
        <div className="bg-gray-100 rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Games Played</label>
            <input
              type="number"
              value={stats.gamesPlayed || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                stats: { ...prev.stats, gamesPlayed: parseInt(e.target.value) || 0 }
              }))}
              className="w-full px-3 py-2 bg-white text-gray-900 rounded-lg border border-gray-200 text-sm"
            />
          </div>
        </div>

        {/* Stat Categories */}
        <StatGroup
          title="Passing"
          category="passing"
          color="blue"
          fields={[
            { key: 'cmp', label: 'CMP' },
            { key: 'att', label: 'ATT' },
            { key: 'yds', label: 'YDS' },
            { key: 'td', label: 'TD' },
            { key: 'int', label: 'INT' },
            { key: 'lng', label: 'LNG' },
          ]}
        />

        <StatGroup
          title="Rushing"
          category="rushing"
          color="green"
          fields={[
            { key: 'car', label: 'CAR' },
            { key: 'yds', label: 'YDS' },
            { key: 'td', label: 'TD' },
            { key: 'lng', label: 'LNG' },
          ]}
        />

        <StatGroup
          title="Receiving"
          category="receiving"
          color="purple"
          fields={[
            { key: 'rec', label: 'REC' },
            { key: 'yds', label: 'YDS' },
            { key: 'td', label: 'TD' },
            { key: 'lng', label: 'LNG' },
          ]}
        />

        <StatGroup
          title="Defense"
          category="defense"
          color="red"
          fields={[
            { key: 'soloTkl', label: 'Solo' },
            { key: 'astTkl', label: 'Ast' },
            { key: 'tfl', label: 'TFL' },
            { key: 'sacks', label: 'Sacks' },
            { key: 'int', label: 'INT' },
            { key: 'pd', label: 'PD' },
            { key: 'ff', label: 'FF' },
            { key: 'fr', label: 'FR' },
          ]}
        />

        <StatGroup
          title="Kicking"
          category="kicking"
          color="amber"
          fields={[
            { key: 'fgm', label: 'FGM' },
            { key: 'fga', label: 'FGA' },
            { key: 'xpm', label: 'XPM' },
            { key: 'xpa', label: 'XPA' },
            { key: 'lng', label: 'LNG' },
          ]}
        />
      </div>
    )
  }

  // Awards Tab Content
  const AwardsTab = () => {
    const accolades = formData.accolades || []
    const playerYears = Object.keys(formData.teamsByYear || {})
      .map(y => parseInt(y))
      .filter(y => !isNaN(y))
      .sort((a, b) => a - b)

    const yearOptions = playerYears.length > 0 ? playerYears : [dynasty?.currentYear || new Date().getFullYear()]

    const handleAdd = () => {
      setFormData(prev => ({
        ...prev,
        accolades: [...(prev.accolades || []), { year: yearOptions[yearOptions.length - 1], award: '' }]
      }))
    }

    const handleUpdate = (index, field, value) => {
      const updated = [...accolades]
      updated[index] = { ...updated[index], [field]: value }
      setFormData(prev => ({ ...prev, accolades: updated }))
    }

    const handleRemove = (index) => {
      setFormData(prev => ({
        ...prev,
        accolades: prev.accolades.filter((_, i) => i !== index)
      }))
    }

    const getTierColor = (tier) => {
      switch (tier) {
        case 'elite': return 'from-yellow-100 to-amber-100 border-yellow-300'
        case 'major': return 'from-purple-100 to-indigo-100 border-purple-300'
        case 'conf': return 'from-blue-100 to-cyan-100 border-blue-300'
        case 'weekly': return 'from-gray-100 to-slate-100 border-gray-300'
        default: return 'from-gray-50 to-gray-100 border-gray-200'
      }
    }

    // Group awards by tier for display
    const groupedAwards = {
      elite: AWARD_OPTIONS.filter(a => a.tier === 'elite'),
      major: AWARD_OPTIONS.filter(a => a.tier === 'major'),
      conf: AWARD_OPTIONS.filter(a => a.tier === 'conf'),
      weekly: AWARD_OPTIONS.filter(a => a.tier === 'weekly'),
    }

    return (
      <div className="space-y-4">
        {/* Current Awards */}
        {accolades.length > 0 ? (
          <div className="space-y-2">
            {accolades.map((accolade, index) => {
              const awardInfo = AWARD_OPTIONS.find(a => a.value === accolade.award)
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r border ${getTierColor(awardInfo?.tier)}`}
                >
                  <select
                    value={accolade.year || ''}
                    onChange={(e) => handleUpdate(index, 'year', parseInt(e.target.value))}
                    className="px-3 py-2 bg-white text-gray-900 rounded-lg border border-gray-200 text-sm font-medium"
                  >
                    {yearOptions.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <select
                    value={accolade.award || ''}
                    onChange={(e) => handleUpdate(index, 'award', e.target.value)}
                    className="flex-1 px-3 py-2 bg-white text-gray-900 rounded-lg border border-gray-200 text-sm"
                  >
                    <option value="">Select Award...</option>
                    <optgroup label="Elite">
                      {groupedAwards.elite.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Major">
                      {groupedAwards.major.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Conference">
                      {groupedAwards.conf.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Weekly">
                      {groupedAwards.weekly.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons.trash}</svg>
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-xl">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons.trophy}</svg>
            <p className="text-sm text-gray-500">No awards yet</p>
          </div>
        )}

        {/* Add Award Button */}
        <button
          type="button"
          onClick={handleAdd}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons.plus}</svg>
          <span className="font-medium">Add Award</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 overflow-y-auto"
      style={{ margin: 0 }}
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)', height: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header with Player Card */}
          <div
            className="relative px-5 py-4 flex-shrink-0"
            style={{ backgroundColor: teamColors.primary }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/20 transition-colors"
              style={{ color: primaryText }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons.close}</svg>
            </button>

            {/* Player Info */}
            <div className="flex items-center gap-4">
              {/* Photo */}
              <button
                type="button"
                onClick={() => setShowImageUpload(!showImageUpload)}
                className="relative group flex-shrink-0"
              >
                {formData.pictureUrl ? (
                  <img
                    src={formData.pictureUrl}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover border-3 group-hover:opacity-80 transition-opacity"
                    style={{ borderColor: teamColors.secondary }}
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center group-hover:opacity-80 transition-opacity"
                    style={{ backgroundColor: `${teamColors.secondary}40` }}
                  >
                    <svg className="w-8 h-8" fill="none" stroke={primaryText} viewBox="0 0 24 24" strokeWidth={1.5}>{Icons.user}</svg>
                  </div>
                )}
                <div
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: teamColors.secondary }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke={secondaryText} viewBox="0 0 24 24" strokeWidth={2}>{Icons.camera}</svg>
                </div>
              </button>

              {/* Name & Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold truncate" style={{ color: primaryText }}>
                  {formData.firstName || formData.lastName ? `${formData.firstName} ${formData.lastName}` : 'New Player'}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {formData.position && (
                    <span className="text-sm font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${teamColors.secondary}30`, color: primaryText }}>
                      {formData.position}
                    </span>
                  )}
                  {formData.overall && (
                    <span className="text-sm font-bold" style={{ color: primaryText }}>
                      {formData.overall} OVR
                    </span>
                  )}
                  {formData.devTrait && DEV_TRAIT_COLORS[formData.devTrait] && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: DEV_TRAIT_COLORS[formData.devTrait].bg,
                        color: DEV_TRAIT_COLORS[formData.devTrait].text
                      }}
                    >
                      {formData.devTrait}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Image Upload Popover */}
            {showImageUpload && (
              <div className="absolute left-4 top-full mt-2 bg-white rounded-xl shadow-xl p-4 z-10 w-80">
                <input
                  type="text"
                  value={formData.pictureUrl || ''}
                  onChange={(e) => handleFieldChange('pictureUrl', e.target.value)}
                  onPaste={handlePaste}
                  placeholder="Paste image URL or Ctrl+V to paste image..."
                  className="w-full px-3 py-2 bg-gray-50 text-gray-900 rounded-lg border border-gray-200 text-sm mb-2"
                />
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && uploadToImgBB(e.target.files[0])}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImageUpload(false)}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 px-2 flex-shrink-0 bg-gray-50">
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{Icons[tab.icon]}</svg>
                <span className="hidden sm:inline">{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {activeTab === 'profile' && <ProfileTab />}
            {activeTab === 'career' && <CareerTab />}
            {activeTab === 'stats' && <StatsTab />}
            {activeTab === 'awards' && <AwardsTab />}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-5 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl font-semibold text-white transition-colors"
              style={{ backgroundColor: teamColors.primary }}
            >
              Save Player
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
