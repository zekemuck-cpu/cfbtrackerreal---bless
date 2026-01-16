import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { storageService, STORAGE_TIER } from '../services/storage'
import { getTeamColors } from '../data/teamColors'
import { getTeamLogo } from '../data/teams'
import { getConferenceLogo } from '../data/conferenceLogos'
import { getTeamConference } from '../data/conferenceTeams'
import { getContrastTextColor } from '../utils/colorUtils'
import { TEAMS, getTidFromTeamName } from '../data/teamRegistry'
import ConfirmModal from '../components/ConfirmModal'
import ShareDynastyModal from '../components/ShareDynastyModal'
import BouncingLogos from '../components/BouncingLogos'

// Helper to get team's conference from dynasty data
function getDynastyTeamConference(dynasty) {
  if (!dynasty.teamName) return null

  // FIRST: Use the actual dynasty.conference field - this is the source of truth
  // It gets updated when the coach changes teams
  if (dynasty.conference) {
    return dynasty.conference
  }

  // FALLBACK: Look up conference if dynasty.conference isn't set (legacy data)
  // Get tid - prefer currentTid, fallback to lookup from teamName
  const tid = dynasty.currentTid || getTidFromTeamName(dynasty.teamName, dynasty.teams)
  if (!tid) return null

  // For conference lookup, use the ORIGINAL team's abbreviation (from static TEAMS)
  // This ensures teambuilder teams inherit the replaced team's conference position
  const originalTeamAbbr = TEAMS[tid]?.abbr
  if (!originalTeamAbbr) return null

  // Check custom conferences first (if user has set them)
  if (dynasty.conferences && Object.keys(dynasty.conferences).length > 0) {
    for (const [confName, teams] of Object.entries(dynasty.conferences)) {
      if (teams.includes(originalTeamAbbr)) {
        return confName
      }
    }
  }

  // Fall back to default conference mapping
  return getTeamConference(originalTeamAbbr)
}

// Helper to format relative time (e.g., "2 hours ago")
function getRelativeTime(timestamp) {
  if (!timestamp) return null

  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (weeks < 4) return `${weeks}w ago`
  return `${months}mo ago`
}

// Helper to format phase for display
function formatPhase(phase) {
  switch (phase) {
    case 'preseason': return 'Pre-Season'
    case 'regular_season': return 'Regular Season'
    case 'conference_championship': return 'Conference Championships'
    case 'postseason': return 'Playoffs'
    case 'offseason': return 'Off-Season'
    default: return phase
  }
}

// Helper to format week/phase display
function getWeekPhaseDisplay(dynasty) {
  const phase = formatPhase(dynasty.currentPhase)
  if (dynasty.currentPhase === 'preseason' || dynasty.currentPhase === 'conference_championship') {
    return phase
  }
  if (dynasty.currentPhase === 'postseason') {
    if (dynasty.currentWeek === 5) return 'End of Season Recap'
    return dynasty.currentWeek === 4 ? 'National Championship' : `Bowl Week ${dynasty.currentWeek}`
  }
  if (dynasty.currentPhase === 'offseason') {
    if (dynasty.currentWeek === 1) return 'Players Leaving'
    if (dynasty.currentWeek === 5) return 'National Signing Day'
    if (dynasty.currentWeek >= 2 && dynasty.currentWeek <= 4) return `Recruiting Week ${dynasty.currentWeek - 1} of 4`
    return 'Off-Season'
  }
  return `Week ${dynasty.currentWeek} • ${phase}`
}

export default function Home() {
  const { dynasties, deleteDynasty, importDynasty, exportDynasty, updateDynasty, createDynasty, loading } = useDynasty()
  const { user, isPremium, upgradeToPremium, manageSubscription } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [upgrading, setUpgrading] = useState(false)

  // Sort dynasties by lastModified (most recent first)
  const sortedDynasties = [...dynasties].sort((a, b) => {
    const aTime = a.lastModified || 0
    const bTime = b.lastModified || 0
    return bTime - aTime
  })
  const [dynastyToDelete, setDynastyToDelete] = useState(null)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null) // { stage, message, progress, detail }
  const [showDeleteAllConfirm1, setShowDeleteAllConfirm1] = useState(false)
  const [showDeleteAllConfirm2, setShowDeleteAllConfirm2] = useState(false)
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
  const [deletingAll, setDeletingAll] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareDynasty, setShareDynasty] = useState(null)
  const [showStorageToggle, setShowStorageToggle] = useState(false)
  const currentStorageTier = storageService.getTier()
  const fileInputRef = useRef(null)
  const hasDynasties = dynasties.length > 0
  const nonStarredDynasties = dynasties.filter(d => !d.favorite)
  const hasNonStarred = nonStarredDynasties.length > 0

  // Handle copying a dynasty from view mode
  useEffect(() => {
    const importCopy = searchParams.get('importCopy')
    if (importCopy === 'true' && createDynasty) {
      const copyData = localStorage.getItem('dynastyCopyData')
      if (copyData) {
        try {
          const dynastyData = JSON.parse(copyData)
          // Create the new dynasty with the copied data
          createDynasty(dynastyData).then((newDynasty) => {
            // Clear localStorage
            localStorage.removeItem('dynastyCopyData')
            // Clear query param
            setSearchParams({})
            // Navigate to the new dynasty
            if (newDynasty?.id) {
              navigate(`/dynasty/${newDynasty.id}`)
            }
          }).catch((error) => {
            console.error('Error creating copied dynasty:', error)
            alert('Failed to copy dynasty. Please try again.')
            localStorage.removeItem('dynastyCopyData')
            setSearchParams({})
          })
        } catch (error) {
          console.error('Error parsing dynasty copy data:', error)
          localStorage.removeItem('dynastyCopyData')
          setSearchParams({})
        }
      } else {
        // No copy data found, just clear the param
        setSearchParams({})
      }
    }
  }, [searchParams, createDynasty, setSearchParams, navigate])

  const handleDeleteClick = (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    setDynastyToDelete(dynasty)
  }

  const handleConfirmDelete = () => {
    if (dynastyToDelete) {
      // If it's a favorite, require extra confirmation
      if (dynastyToDelete.favorite) {
        setShowFinalConfirm(true)
      } else {
        deleteDynasty(dynastyToDelete.id)
        setDynastyToDelete(null)
      }
    }
  }

  const handleFinalConfirmDelete = () => {
    if (dynastyToDelete && confirmText === dynastyToDelete.teamName) {
      deleteDynasty(dynastyToDelete.id)
      setDynastyToDelete(null)
      setShowFinalConfirm(false)
      setConfirmText('')
    }
  }

  const handleCancelFinalConfirm = () => {
    setShowFinalConfirm(false)
    setConfirmText('')
  }

  const handleExportClick = (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    exportDynasty(dynasty.id)
  }

  const handleFavoriteClick = async (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    // Skip updating lastModified so starring doesn't change the sort order
    if (!updateDynasty) {
      console.error('updateDynasty is not available')
      return
    }
    try {
      const newFavorite = !dynasty.favorite
      console.log('Toggling favorite for dynasty:', dynasty.id, 'from', dynasty.favorite, 'to', newFavorite)
      await updateDynasty(dynasty.id, { favorite: newFavorite }, { skipLastModified: true })
      console.log('Favorite toggled successfully')
    } catch (error) {
      console.error('Error toggling favorite:', error)
    }
  }

  const handleShareClick = (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    setShareDynasty(dynasty)
    setShowShareModal(true)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportProgress({ stage: 'starting', message: 'Starting import...', progress: 0 })

    try {
      await importDynasty(file, (progress) => {
        setImportProgress(progress)
      })

      // Brief pause to show 100% complete
      await new Promise(resolve => setTimeout(resolve, 500))

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Error importing dynasty:', error)
      alert(error.message || 'Failed to import dynasty. Please check the file and try again.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  // Delete All Non-Starred handlers
  const handleDeleteAllClick = () => {
    if (hasNonStarred) {
      setShowDeleteAllConfirm1(true)
    }
  }

  const handleDeleteAllConfirm1 = () => {
    setShowDeleteAllConfirm1(false)
    setShowDeleteAllConfirm2(true)
  }

  const handleDeleteAllConfirm2 = async () => {
    if (deleteAllConfirmText !== 'DELETE ALL') return

    setDeletingAll(true)
    try {
      // Delete all non-starred dynasties
      for (const dynasty of nonStarredDynasties) {
        await deleteDynasty(dynasty.id)
      }
    } catch (error) {
      console.error('Error deleting dynasties:', error)
      alert('Failed to delete some dynasties. Please try again.')
    } finally {
      setDeletingAll(false)
      setShowDeleteAllConfirm2(false)
      setDeleteAllConfirmText('')
    }
  }

  const handleCancelDeleteAll = () => {
    setShowDeleteAllConfirm1(false)
    setShowDeleteAllConfirm2(false)
    setDeleteAllConfirmText('')
  }

  // Show loading state while dynasties are being fetched
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-gray-700 border-t-orange-500 rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading dynasties...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Bouncing logos background - full edge to edge */}
      <BouncingLogos />

      {/* Main content - centered with padding */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-6">
      {!hasDynasties ? (
        <div className="text-center py-16">
          <h1 className="text-3xl font-bold text-white mb-6">
            CFB Dynasty Tracker
          </h1>
          <div className="flex gap-4 justify-center">
            <Link
              to="/create"
              className="inline-block bg-orange-600 text-white px-8 py-4 rounded-lg font-semibold transition-colors hover:bg-orange-500 shadow-lg"
            >
              Create Dynasty
            </Link>
            <button
              onClick={handleImportClick}
              disabled={importing}
              className="inline-block bg-gray-700 text-white px-8 py-4 rounded-lg font-semibold transition-colors hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-600"
            >
              {importing ? 'Importing...' : 'Import Dynasty'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Subscription Status */}
          <div className="mt-8 max-w-md mx-auto">
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center justify-center gap-3">
                {isPremium ? (
                  <>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-600 text-white">
                      Premium
                    </span>
                    <span className="text-xs text-gray-400">Cloud sync enabled</span>
                    {user && (
                      <button
                        onClick={() => manageSubscription()}
                        className="px-3 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"
                      >
                        Manage
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-200">
                      Free
                    </span>
                    <span className="text-xs text-gray-400">Local storage</span>
                    {user ? (
                      <button
                        onClick={async () => {
                          setUpgrading(true)
                          try {
                            await upgradeToPremium()
                          } catch (error) {
                            console.error('Upgrade error:', error)
                            alert('Failed to start upgrade. Please try again.')
                          } finally {
                            setUpgrading(false)
                          }
                        }}
                        disabled={upgrading}
                        className="px-3 py-1 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
                      >
                        {upgrading ? 'Loading...' : 'Upgrade $4.99/mo'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">Sign in to upgrade</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Storage Tier Toggle (Dev Tool) */}
          <div className="mt-4">
            <button
              onClick={() => setShowStorageToggle(!showStorageToggle)}
              className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 mx-auto"
            >
              <svg className={`w-3 h-3 transition-transform ${showStorageToggle ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Dev: {currentStorageTier === STORAGE_TIER.FREE ? 'IndexedDB' : 'Firebase'}
            </button>
            {showStorageToggle && (
              <div className="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700 max-w-xs mx-auto">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => {
                      storageService.setTier(STORAGE_TIER.FREE)
                      window.location.reload()
                    }}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                      currentStorageTier === STORAGE_TIER.FREE
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    IndexedDB
                  </button>
                  <button
                    onClick={() => {
                      storageService.setTier(STORAGE_TIER.PREMIUM)
                      window.location.reload()
                    }}
                    className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                      currentStorageTier === STORAGE_TIER.PREMIUM
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    Firebase
                  </button>
                </div>
                <button
                  onClick={() => {
                    storageService.clearPersistedTier()
                    window.location.reload()
                  }}
                  className="w-full px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600"
                >
                  Reset to Default
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Your Dynasties</h1>
            <div className="flex gap-2 flex-wrap">
              <Link
                to="/create"
                className="bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm transition-colors hover:bg-orange-500 shadow-md"
              >
                + New
              </Link>
              <button
                onClick={handleImportClick}
                disabled={importing}
                className="bg-gray-600 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm transition-colors hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="hidden sm:inline">{importing ? 'Importing...' : 'Import'}</span>
              </button>
              {hasNonStarred && (
                <button
                  onClick={handleDeleteAllClick}
                  className="bg-red-600 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm transition-colors hover:bg-red-700 flex items-center gap-1 sm:gap-2"
                  title={`Delete ${nonStarredDynasties.length} non-starred dynasties`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="hidden sm:inline">Delete All</span>
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Subscription Status & Storage */}
          <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPremium ? (
                  <>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-600 text-white">
                      Premium
                    </span>
                    <span className="text-xs text-gray-400">Cloud sync enabled</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-200">
                      Free
                    </span>
                    <span className="text-xs text-gray-400">Local storage only</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {user && !isPremium && (
                  <button
                    onClick={async () => {
                      setUpgrading(true)
                      try {
                        await upgradeToPremium()
                      } catch (error) {
                        console.error('Upgrade error:', error)
                        alert('Failed to start upgrade. Please try again.')
                      } finally {
                        setUpgrading(false)
                      }
                    }}
                    disabled={upgrading}
                    className="px-3 py-1 rounded text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
                  >
                    {upgrading ? 'Loading...' : 'Upgrade $4.99/mo'}
                  </button>
                )}
                {user && isPremium && (
                  <button
                    onClick={() => manageSubscription()}
                    className="px-3 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"
                  >
                    Manage
                  </button>
                )}
                {!user && (
                  <span className="text-xs text-gray-500">Sign in to upgrade</span>
                )}
              </div>
            </div>

            {/* Dev Storage Toggle (collapsible) */}
            <div className="mt-2 pt-2 border-t border-gray-700">
              <button
                onClick={() => setShowStorageToggle(!showStorageToggle)}
                className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
              >
                <svg className={`w-3 h-3 transition-transform ${showStorageToggle ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Dev: {currentStorageTier === STORAGE_TIER.FREE ? 'IndexedDB' : 'Firebase'}
              </button>
              {showStorageToggle && (
                <div className="mt-2 p-2 bg-gray-900 rounded border border-gray-700">
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => {
                        storageService.setTier(STORAGE_TIER.FREE)
                        window.location.reload()
                      }}
                      className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                        currentStorageTier === STORAGE_TIER.FREE
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      IndexedDB
                    </button>
                    <button
                      onClick={() => {
                        storageService.setTier(STORAGE_TIER.PREMIUM)
                        window.location.reload()
                      }}
                      className={`flex-1 px-2 py-1 rounded text-xs font-medium ${
                        currentStorageTier === STORAGE_TIER.PREMIUM
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Firebase
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      storageService.clearPersistedTier()
                      window.location.reload()
                    }}
                    className="w-full px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4">
            {sortedDynasties.map((dynasty) => {
              const teams = dynasty.teams || dynasty.customTeams
              const colors = getTeamColors(dynasty.teamName, teams)
              // For teambuilder teams, get logo from teams/customTeams; otherwise use standard lookup
              let logoUrl = null
              if (teams) {
                // Try tid-based lookup first
                if (dynasty.currentTid && dynasty.teams?.[dynasty.currentTid]) {
                  logoUrl = dynasty.teams[dynasty.currentTid].logo
                } else {
                  // Legacy lookup by name
                  const teambuilderTeam = Object.values(teams).find(t => t.name === dynasty.teamName)
                  if (teambuilderTeam) {
                    logoUrl = teambuilderTeam.logoUrl || teambuilderTeam.logo
                  }
                }
              }
              if (!logoUrl) {
                logoUrl = getTeamLogo(dynasty.teamName, teams)
              }
              const relativeTime = getRelativeTime(dynasty.lastModified)
              const weekPhase = getWeekPhaseDisplay(dynasty)
              const conference = getDynastyTeamConference(dynasty)
              const textColor = getContrastTextColor(colors.primary)
              return (
                <div
                  key={dynasty.id}
                  className="rounded-xl p-3 sm:p-5 transition-all hover:scale-[1.02] shadow-lg hover:shadow-xl"
                  style={{
                    backgroundColor: colors.primary,
                    border: `2px solid ${colors.secondary}`,
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
                  }}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <Link
                      to={`/dynasty/${dynasty.id}`}
                      className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0"
                    >
                      {logoUrl && (
                        <div
                          className="w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: '#FFFFFF',
                            border: `2px solid ${colors.secondary}`,
                            padding: '2px'
                          }}
                        >
                          <img
                            src={logoUrl}
                            alt={`${dynasty.teamName} logo`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <h2
                          className="text-sm sm:text-lg font-bold truncate"
                          style={{ color: textColor }}
                        >
                          {dynasty.teamName}
                        </h2>
                        <div className="flex items-center gap-1 sm:gap-2">
                          {conference && getConferenceLogo(conference) && (
                            <img
                              src={getConferenceLogo(conference)}
                              alt={`${conference} logo`}
                              className="w-3 h-3 sm:w-4 sm:h-4 object-contain opacity-80 flex-shrink-0"
                            />
                          )}
                          <p
                            className="text-[11px] sm:text-sm opacity-80 truncate"
                            style={{ color: textColor }}
                          >
                            {conference ? `${conference} • ` : ''}{dynasty.currentYear}
                          </p>
                        </div>
                        <p
                          className="text-[10px] sm:text-xs mt-0.5 opacity-70 truncate"
                          style={{ color: textColor }}
                        >
                          {weekPhase}
                          {relativeTime && <span className="ml-1 sm:ml-2">• {relativeTime}</span>}
                        </p>
                      </div>
                    </Link>

                    {/* Action buttons - inline on all sizes */}
                      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        {/* Favorite button */}
                        <button
                          onClick={(e) => handleFavoriteClick(e, dynasty)}
                          className="p-1.5 sm:p-2 rounded-lg hover:bg-black hover:bg-opacity-20 transition-colors"
                          style={{ color: textColor }}
                          title={dynasty.favorite ? "Remove from favorites" : "Add to favorites"}
                        >
                          {dynasty.favorite ? (
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                          )}
                        </button>

                        {/* Download Backup button */}
                        <button
                          onClick={(e) => handleExportClick(e, dynasty)}
                          className="p-1.5 sm:p-2 rounded-lg hover:bg-black hover:bg-opacity-20 transition-colors"
                          style={{ color: textColor }}
                          title="Download Backup"
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>

                        {/* Share Dynasty button */}
                        <button
                          onClick={(e) => handleShareClick(e, dynasty)}
                          className="p-1.5 sm:p-2 rounded-lg hover:bg-black hover:bg-opacity-20 transition-colors"
                          style={{ color: textColor }}
                          title="Share Dynasty"
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteClick(e, dynasty)}
                          className="p-1.5 sm:p-2 rounded-lg hover:bg-black hover:bg-opacity-20 transition-colors"
                          style={{ color: textColor }}
                          title="Delete Dynasty"
                        >
                          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      </div>

      <ConfirmModal
        isOpen={!!dynastyToDelete && !showFinalConfirm}
        onClose={() => setDynastyToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={dynastyToDelete?.favorite ? "Delete Favorited Dynasty?" : "Delete Dynasty?"}
        message={
          dynastyToDelete?.favorite
            ? `WARNING: "${dynastyToDelete?.teamName}" is marked as a favorite! Are you absolutely sure you want to delete this dynasty? This action cannot be undone.`
            : `Are you sure you want to delete the ${dynastyToDelete?.teamName} dynasty? This action cannot be undone.`
        }
        confirmText={dynastyToDelete?.favorite ? "Continue" : "Delete"}
        cancelText="Cancel"
        confirmButtonColor="#ef4444"
      />

      {/* Extra confirmation modal for favorites - requires typing dynasty name */}
      {showFinalConfirm && dynastyToDelete && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCancelFinalConfirm}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-red-600 mb-4">
              Final Confirmation Required
            </h2>
            <p className="text-gray-700 mb-4">
              This is a <strong>favorited dynasty</strong>. To confirm deletion, please type the dynasty name exactly:
            </p>
            <p className="text-lg font-bold text-gray-900 mb-4 bg-gray-100 p-2 rounded">
              {dynastyToDelete.teamName}
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type dynasty name here..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg mb-4 focus:border-red-500 focus:outline-none"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleFinalConfirmDelete}
                disabled={confirmText !== dynastyToDelete.teamName}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: confirmText === dynastyToDelete.teamName ? '#ef4444' : '#9ca3af' }}
              >
                Permanently Delete
              </button>
              <button
                onClick={handleCancelFinalConfirm}
                className="flex-1 px-4 py-2 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All - First Confirmation */}
      {showDeleteAllConfirm1 && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCancelDeleteAll}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                Delete All Non-Starred Dynasties?
              </h2>
            </div>
            <p className="text-gray-700 mb-4">
              You are about to delete <strong className="text-red-600">{nonStarredDynasties.length} {nonStarredDynasties.length === 1 ? 'dynasty' : 'dynasties'}</strong> that are not starred.
            </p>
            <div className="bg-gray-100 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
              <p className="text-sm font-medium text-gray-600 mb-2">Dynasties to be deleted:</p>
              <ul className="text-sm text-gray-800 space-y-1">
                {nonStarredDynasties.map(d => (
                  <li key={d.id} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                    {d.teamName}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Starred dynasties will not be affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAllConfirm1}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Continue
              </button>
              <button
                onClick={handleCancelDeleteAll}
                className="flex-1 px-4 py-2 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All - Second/Final Confirmation */}
      {showDeleteAllConfirm2 && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCancelDeleteAll}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-red-600">
                Final Confirmation
              </h2>
            </div>
            <p className="text-gray-700 mb-4">
              This action <strong>cannot be undone</strong>. All {nonStarredDynasties.length} non-starred {nonStarredDynasties.length === 1 ? 'dynasty' : 'dynasties'} will be permanently deleted.
            </p>
            <p className="text-gray-700 mb-2">
              To confirm, type <strong className="font-mono bg-gray-100 px-2 py-0.5 rounded">DELETE ALL</strong> below:
            </p>
            <input
              type="text"
              value={deleteAllConfirmText}
              onChange={(e) => setDeleteAllConfirmText(e.target.value)}
              placeholder="Type DELETE ALL here..."
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg mb-4 focus:border-red-500 focus:outline-none font-mono"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAllConfirm2}
                disabled={deleteAllConfirmText !== 'DELETE ALL' || deletingAll}
                className="flex-1 px-4 py-2 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: deleteAllConfirmText === 'DELETE ALL' ? '#ef4444' : '#9ca3af' }}
              >
                {deletingAll ? 'Deleting...' : `Delete ${nonStarredDynasties.length} ${nonStarredDynasties.length === 1 ? 'Dynasty' : 'Dynasties'}`}
              </button>
              <button
                onClick={handleCancelDeleteAll}
                disabled={deletingAll}
                className="flex-1 px-4 py-2 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Dynasty Modal */}
      {shareDynasty && (
        <ShareDynastyModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setShareDynasty(null)
          }}
          teamColors={getTeamColors(shareDynasty.teamName, shareDynasty.teams || shareDynasty.customTeams) || { primary: '#1e40af', secondary: '#dbeafe' }}
          dynasty={shareDynasty}
        />
      )}

      {/* Import Progress Modal - blocks all interaction until complete */}
      {importing && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]">
          <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importing Dynasty
              </h2>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-300 font-medium">
                    {importProgress?.message || 'Starting...'}
                  </span>
                  <span className="text-orange-400 font-bold">
                    {importProgress?.progress || 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-orange-500 to-orange-400"
                    style={{ width: `${importProgress?.progress || 0}%` }}
                  />
                </div>
              </div>

              {/* Stage indicator */}
              <div className="space-y-2">
                {['parsing', 'creating', 'players', 'games', 'complete'].map((stage, index) => {
                  const stageLabels = {
                    parsing: 'Reading file',
                    creating: 'Creating dynasty',
                    players: 'Importing players',
                    games: 'Importing games',
                    complete: 'Complete'
                  }
                  const currentStageIndex = ['parsing', 'creating', 'players', 'games', 'complete'].indexOf(importProgress?.stage || 'starting')
                  const isComplete = index < currentStageIndex
                  const isCurrent = importProgress?.stage === stage
                  const isPending = index > currentStageIndex

                  return (
                    <div key={stage} className={`flex items-center gap-3 ${isPending ? 'opacity-40' : ''}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isComplete ? 'bg-green-500' :
                        isCurrent ? 'bg-orange-500' :
                        'bg-gray-600'
                      }`}>
                        {isComplete ? (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isCurrent ? (
                          <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <span className="w-2 h-2 bg-gray-400 rounded-full" />
                        )}
                      </div>
                      <span className={`text-sm ${
                        isComplete ? 'text-green-400' :
                        isCurrent ? 'text-white font-medium' :
                        'text-gray-500'
                      }`}>
                        {stageLabels[stage]}
                        {isCurrent && importProgress?.detail && (
                          <span className="text-gray-400 ml-2">({importProgress.detail})</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Warning message */}
              <div className="mt-6 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                <p className="text-yellow-300 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Please wait until import completes. Do not close this page.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
