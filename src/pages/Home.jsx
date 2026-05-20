import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useDynasty, getTeamConferenceForDynasty } from '../context/DynastyContext'
import { useAuth } from '../context/AuthContext'
import { getTeamLogo } from '../data/teams'
import { getConferenceLogo } from '../data/conferenceLogos'
import { TEAMS, getTidFromTeamName } from '../data/teamRegistry'
import ConfirmModal from '../components/ConfirmModal'
import ShareDynastyModal from '../components/ShareDynastyModal'
import StorageSwitchModal from '../components/StorageSwitchModal'
import BouncingLogos from '../components/BouncingLogos'
import { Button, Badge, Modal, Input, LoadingState, ContactCTA } from '../components/ui'
import { useToast } from '../components/ui/Toast'

function getDynastyTeamConference(dynasty) {
  if (!dynasty.teamName) return null
  const tid = dynasty.currentTid || getTidFromTeamName(dynasty.teamName, dynasty.teams)
  if (!tid) return dynasty.conference || null
  const originalTeamAbbr = TEAMS[tid]?.abbr
  if (!originalTeamAbbr) return dynasty.conference || null
  return getTeamConferenceForDynasty(dynasty, originalTeamAbbr)
}

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
  const { dynasties, deleteDynasty, importDynasty, importDynastyFromUrl, exportDynasty, updateDynasty, createDynasty, migrateDynastyStorage, loading, cloudSyncing } = useDynasty()
  const { user, isPremium, upgradeToPremium, manageSubscription } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [upgrading, setUpgrading] = useState(false)
  const [storageSwitchDynasty, setStorageSwitchDynasty] = useState(null)

  const sortedDynasties = [...dynasties].sort((a, b) => {
    const aTime = a.lastModified || 0
    const bTime = b.lastModified || 0
    return bTime - aTime
  })
  const [dynastyToDelete, setDynastyToDelete] = useState(null)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [showUrlImport, setShowUrlImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [showDeleteAllConfirm1, setShowDeleteAllConfirm1] = useState(false)
  const [showDeleteAllConfirm2, setShowDeleteAllConfirm2] = useState(false)
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
  const [deletingAll, setDeletingAll] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareDynasty, setShareDynasty] = useState(null)
  const [togglingFavoriteId, setTogglingFavoriteId] = useState(null)
  const [deletingDynastyId, setDeletingDynastyId] = useState(null)
  const fileInputRef = useRef(null)
  const hasDynasties = dynasties.length > 0
  const nonStarredDynasties = dynasties.filter(d => !d.favorite)
  const hasNonStarred = nonStarredDynasties.length > 0

  useEffect(() => {
    const importCopy = searchParams.get('importCopy')
    if (importCopy === 'true' && createDynasty) {
      const copyData = localStorage.getItem('dynastyCopyData')
      if (copyData) {
        try {
          const dynastyData = JSON.parse(copyData)
          createDynasty(dynastyData).then((newDynasty) => {
            localStorage.removeItem('dynastyCopyData')
            setSearchParams({})
            if (newDynasty?.id) {
              navigate(`/dynasty/${newDynasty.id}`)
            }
          }).catch((error) => {
            console.error('Error creating copied dynasty:', error)
            toast.error('Failed to copy dynasty. Please try again.')
            localStorage.removeItem('dynastyCopyData')
            setSearchParams({})
          })
        } catch (error) {
          console.error('Error parsing dynasty copy data:', error)
          localStorage.removeItem('dynastyCopyData')
          setSearchParams({})
        }
      } else {
        setSearchParams({})
      }
    }
  }, [searchParams, createDynasty, setSearchParams, navigate])

  const handleDeleteClick = (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    setDynastyToDelete(dynasty)
  }

  const handleConfirmDelete = async () => {
    if (dynastyToDelete) {
      if (dynastyToDelete.favorite) {
        setShowFinalConfirm(true)
      } else {
        setDeletingDynastyId(dynastyToDelete.id)
        try {
          await deleteDynasty(dynastyToDelete.id)
        } finally {
          setDeletingDynastyId(null)
          setDynastyToDelete(null)
        }
      }
    }
  }

  const handleFinalConfirmDelete = async () => {
    if (dynastyToDelete && confirmText === dynastyToDelete.teamName) {
      setDeletingDynastyId(dynastyToDelete.id)
      try {
        await deleteDynasty(dynastyToDelete.id)
      } finally {
        setDeletingDynastyId(null)
        setDynastyToDelete(null)
        setShowFinalConfirm(false)
        setConfirmText('')
      }
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
    if (!updateDynasty) {
      console.error('updateDynasty is not available')
      return
    }
    setTogglingFavoriteId(dynasty.id)
    try {
      const newFavorite = !dynasty.favorite
      await updateDynasty(dynasty.id, { favorite: newFavorite }, { skipLastModified: true })
    } catch (error) {
      console.error('Error toggling favorite:', error)
    } finally {
      setTogglingFavoriteId(null)
    }
  }

  const handleShareClick = (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isPremium) {
      toast.info('Sharing dynasties is a Premium feature. Upgrade in Account.')
      return
    }
    setShareDynasty(dynasty)
    setShowShareModal(true)
  }

  const handleStorageClick = (e, dynasty) => {
    e.preventDefault()
    e.stopPropagation()
    setStorageSwitchDynasty(dynasty)
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

      await new Promise(resolve => setTimeout(resolve, 500))

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Error importing dynasty:', error)
      toast.error(error.message || 'Failed to import dynasty. Please check the file and try again.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleUrlImport = async () => {
    if (!importUrl.trim()) return

    setShowUrlImport(false)
    setImporting(true)
    setImportProgress({ stage: 'starting', message: 'Starting import...', progress: 0 })

    try {
      await importDynastyFromUrl(importUrl.trim(), (progress) => {
        setImportProgress(progress)
      })

      await new Promise(resolve => setTimeout(resolve, 500))
      setImportUrl('')
    } catch (error) {
      console.error('Error importing dynasty from URL:', error)
      toast.error(error.message || 'Failed to import dynasty from URL.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const TEST_DYNASTY_URL = 'https://www.dropbox.com/scl/fi/diy17iuqkximxmgcpb21o/UK_2034_Week8.json?rlkey=oc0zrps5kl5p7cei8dbbs4zof&st=08t6uqwi&dl=0'

  const handleTestImport = async () => {
    setImporting(true)
    setImportProgress({ stage: 'starting', message: 'Starting import...', progress: 0 })

    try {
      await importDynastyFromUrl(TEST_DYNASTY_URL, (progress) => {
        setImportProgress(progress)
      })

      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      console.error('Error importing test dynasty:', error)
      toast.error(error.message || 'Failed to import test dynasty.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

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
      for (let i = 0; i < nonStarredDynasties.length; i++) {
        const dynasty = nonStarredDynasties[i]
        await deleteDynasty(dynasty.id)
        if (i < nonStarredDynasties.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } catch (error) {
      console.error('Error deleting dynasties:', error)
      toast.error('Failed to delete some dynasties. Please try again.')
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

  // Show the spinner while local is loading, OR while cloud is still
  // syncing and we have nothing to display yet. Without the cloud-sync
  // gate, cloud-only users would see "no dynasties yet — create one"
  // for ~10s on cold reopens (between the empty local read finishing
  // and the first Firestore snapshot arriving), which reads as "my
  // dynasties are gone." Once we have at least one dynasty in hand
  // (either local or first cloud snapshot), drop the spinner so users
  // can interact with what's loaded while the rest streams in.
  if (loading || (cloudSyncing && dynasties.length === 0)) {
    return (
      <div className="min-h-[calc(100dvh-4rem)] flex items-center justify-center">
        <LoadingState message="Loading dynasties..." />
      </div>
    )
  }

  // Compact week / phase descriptor for the meta line. Returns the most
  // useful label for the current point in the season — week number when
  // applicable, otherwise the phase name itself.
  const weekShortFor = (dynasty) => {
    if (dynasty.currentPhase === 'regular_season') return `Week ${dynasty.currentWeek}`
    if (dynasty.currentPhase === 'preseason') return 'Preseason'
    if (dynasty.currentPhase === 'conference_championship') return 'Conf Championship'
    if (dynasty.currentPhase === 'postseason') {
      if (dynasty.currentWeek === 5) return 'Recap'
      return dynasty.currentWeek === 4 ? 'National Championship' : `Bowl Week ${dynasty.currentWeek}`
    }
    if (dynasty.currentPhase === 'offseason') {
      if (dynasty.currentWeek === 1) return 'Players Leaving'
      if (dynasty.currentWeek === 5) return 'National Signing Day'
      if (dynasty.currentWeek >= 2 && dynasty.currentWeek <= 4) return `Recruiting Week ${dynasty.currentWeek - 1}`
    }
    return null
  }

  return (
    <div className="atmosphere relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <BouncingLogos subtle />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {!hasDynasties ? (
          <div className="page-enter">
            <h1
              className="font-display text-txt-primary leading-[0.9] mb-4"
              style={{
                fontWeight: 900,
                fontSize: 'clamp(2.5rem, 7vw, 4rem)',
                letterSpacing: '-0.035em',
              }}
            >
              Dynasty Tracker
            </h1>
            <p className="text-base sm:text-lg text-txt-secondary leading-relaxed max-w-2xl mb-8">
              Track your EA College Football dynasty — box scores, recruiting,
              postseason, all preserved across the years.
            </p>

            {/* Three premium CTAs — refined buttons, not sharp ledger cells. */}
            <div className="flex flex-wrap items-center gap-3 mb-10">
              <Link to="/create" className="btn-refined btn-refined--solid btn-refined--lg">
                Create dynasty
              </Link>
              <button
                type="button"
                onClick={handleImportClick}
                disabled={importing}
                className="btn-refined btn-refined--lg"
              >
                {importing ? 'Importing…' : 'Import file'}
              </button>
              <button
                type="button"
                onClick={() => setShowUrlImport(true)}
                disabled={importing}
                className="btn-refined btn-refined--lg"
              >
                Import from URL
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Sample dynasty — ghost CTA */}
            <div className="max-w-3xl space-y-3">
              <div className="ghost-card">
                <div className="px-5 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-4">
                  <h3 className="font-display text-sm sm:text-base font-semibold text-txt-secondary leading-tight min-w-0">
                    Try a sample dynasty (my own personal one)
                  </h3>
                  <button
                    type="button"
                    onClick={handleTestImport}
                    disabled={importing}
                    className="btn-refined flex-shrink-0"
                  >
                    {importing ? 'Loading…' : 'Load sample'}
                  </button>
                </div>
              </div>

              {/* Account / premium card */}
              <div className="media-card">
                <div className="px-5 py-4 sm:px-6 sm:py-5 flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-sm text-txt-secondary">
                    {isPremium
                      ? 'Premium — cloud sync enabled.'
                      : 'Free — local-only storage. Upgrade to sync across devices.'}
                  </p>
                  {isPremium ? (
                    user && (
                      <button
                        type="button"
                        onClick={() => manageSubscription()}
                        className="btn-refined"
                      >
                        Manage subscription
                      </button>
                    )
                  ) : user ? (
                    <button
                      type="button"
                      disabled={upgrading}
                      onClick={async () => {
                        setUpgrading(true)
                        try {
                          await upgradeToPremium()
                        } catch (error) {
                          console.error('Upgrade error:', error)
                          toast.error('Failed to start upgrade. Please try again.')
                        } finally {
                          setUpgrading(false)
                        }
                      }}
                      className="btn-refined btn-refined--solid"
                    >
                      {upgrading ? 'Loading…' : 'Upgrade $4.99 / mo'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-10 max-w-3xl">
              <ContactCTA />
            </div>
          </div>
        ) : (
          <div className="page-enter">
            {/* Title + action strap on a single row. The count beside the
                title is functional info (not a magazine kicker), giving the
                heading more presence without adding decorative chrome. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mb-6 sm:mb-8">
              <h1
                className="font-display text-txt-primary leading-none m-0"
                style={{
                  fontWeight: 900,
                  fontSize: 'clamp(2rem, 5vw, 3rem)',
                  letterSpacing: '-0.035em',
                }}
              >
                Your Dynasties
              </h1>

              <div className="flex flex-wrap items-center gap-2">
                <Link to="/create" className="btn-refined btn-refined--solid">
                  + New
                </Link>
                <button
                  type="button"
                  onClick={handleImportClick}
                  disabled={importing}
                  className="btn-refined"
                >
                  {importing ? 'Importing…' : 'Import'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowUrlImport(true)}
                  disabled={importing}
                  className="btn-refined"
                >
                  URL
                </button>
                {hasNonStarred && (
                  <button
                    type="button"
                    onClick={handleDeleteAllClick}
                    className="btn-refined btn-refined--danger"
                  >
                    Delete unstarred
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

            <div className="stagger-reveal space-y-3">
              {sortedDynasties.map((dynasty) => {
                const teamsData = dynasty.teams || dynasty.customTeams
                let logoUrl = null
                if (teamsData) {
                  if (dynasty.currentTid && dynasty.teams?.[dynasty.currentTid]) {
                    logoUrl = dynasty.teams[dynasty.currentTid].logo
                  } else {
                    const teambuilderTeam = Object.values(teamsData).find(t => t.name === dynasty.teamName)
                    if (teambuilderTeam) {
                      logoUrl = teambuilderTeam.logoUrl || teambuilderTeam.logo
                    }
                  }
                }
                if (!logoUrl) {
                  logoUrl = getTeamLogo(dynasty.teamName, teamsData)
                }
                const relativeTime = getRelativeTime(dynasty.lastModified)
                const weekShort = weekShortFor(dynasty)
                const conference = getDynastyTeamConference(dynasty)

                const isCloudReadOnly = dynasty.storageType === 'cloud' && !isPremium
                const storageBadgeVariant = isCloudReadOnly ? 'warning' : (dynasty.storageType === 'cloud' ? 'info' : 'outline')
                const storageBadgeTitle = isCloudReadOnly
                  ? 'Cloud dynasty (read-only without Premium)'
                  : dynasty.storageType === 'cloud'
                    ? 'Stored in cloud (syncs across devices)'
                    : 'Stored locally (this device only)'
                const storageBadgeText = isCloudReadOnly ? 'Read-only' : dynasty.storageType === 'cloud' ? 'Cloud' : 'Local'

                return (
                  <div
                    key={dynasty.id}
                    className="media-card group relative"
                  >
                    {/* Whole-card click target sits behind the action affordances. */}
                    <Link
                      to={`/dynasty/${dynasty.id}`}
                      aria-label={`Open ${dynasty.teamName} dynasty`}
                      className="absolute inset-0 z-0 rounded-lg focus-visible:outline-2 focus-visible:outline-surface-5"
                    />

                    <div className="relative z-10 px-4 py-4 sm:px-5 sm:py-5 flex items-center gap-4 sm:gap-5 pointer-events-none">
                      {/* Logo */}
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt=""
                          aria-hidden="true"
                          className="w-12 h-12 sm:w-14 sm:h-14 object-contain flex-shrink-0"
                        />
                      )}

                      {/* Name + meta */}
                      <div className="flex-1 min-w-0">
                        <h2
                          className="font-display font-bold text-txt-primary truncate leading-tight mb-1"
                          style={{ fontSize: 'clamp(1.0625rem, 2.5vw, 1.375rem)', letterSpacing: '-0.015em' }}
                        >
                          {dynasty.teamName}
                        </h2>
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-txt-secondary tabular-nums truncate">
                          {conference && getConferenceLogo(conference) && (
                            <img
                              src={getConferenceLogo(conference)}
                              alt=""
                              className="w-3.5 h-3.5 object-contain opacity-70 flex-shrink-0"
                            />
                          )}
                          {conference && (
                            <>
                              <span className="truncate">{conference}</span>
                              
                            </>
                          )}
                          <span>{dynasty.currentYear}</span>
                          {weekShort && (
                            <>
                              
                              <span className="truncate">{weekShort}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right side: time + storage + scoreboard divider + actions.
                          pointer-events re-enabled so individual buttons are
                          clickable without firing the whole-card link. */}
                      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 pointer-events-auto">
                        <div className="hidden sm:flex flex-col items-end gap-1">
                          {relativeTime && (
                            <span className="text-xs text-txt-tertiary tabular-nums">
                              {relativeTime}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleStorageClick(e, dynasty)}
                            title={storageBadgeTitle}
                          >
                            <Badge variant={storageBadgeVariant} size="sm">{storageBadgeText}</Badge>
                          </button>
                        </div>

                        {/* Scoreboard-style divider — separates data from controls */}
                        <span aria-hidden="true" className="hidden sm:block self-stretch w-px bg-surface-4" />

                        <div className="flex items-center gap-0 sm:gap-0.5 text-txt-tertiary opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleFavoriteClick(e, dynasty)}
                            disabled={togglingFavoriteId === dynasty.id}
                            className="p-1.5 sm:p-2 rounded-md hover:bg-surface-4 hover:text-txt-primary transition-colors disabled:opacity-50"
                            title={dynasty.favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {togglingFavoriteId === dynasty.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : dynasty.favorite ? (
                              <svg className="w-4 h-4" fill="var(--accent-warning)" stroke="var(--accent-warning)" viewBox="0 0 24 24">
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            )}
                          </button>

                          <button
                            onClick={(e) => handleExportClick(e, dynasty)}
                            className="p-1.5 sm:p-2 rounded-md hover:bg-surface-4 hover:text-txt-primary transition-colors hidden sm:block"
                            title="Download backup"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>

                          <button
                            onClick={(e) => handleShareClick(e, dynasty)}
                            className="p-1.5 sm:p-2 rounded-md hover:bg-surface-4 hover:text-txt-primary transition-colors hidden sm:block"
                            title="Share dynasty"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                          </button>

                          <button
                            onClick={(e) => handleDeleteClick(e, dynasty)}
                            disabled={deletingDynastyId === dynasty.id}
                            className="p-1.5 sm:p-2 rounded-md hover:bg-[color-mix(in_srgb,var(--accent-error)_15%,var(--surface-4))] hover:text-[color:var(--accent-error)] transition-colors disabled:opacity-50"
                            title="Delete dynasty"
                          >
                            {deletingDynastyId === dynasty.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Sample dynasty — ghost-card style so it reads as a CTA /
                offer, not as another tracked dynasty. Lighter visual
                weight than the actual dynasty cards above. */}
            <div className="mt-6 ghost-card">
              <div className="px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-4">
                <h3 className="font-display text-sm sm:text-base font-semibold text-txt-secondary tracking-tight leading-tight min-w-0">
                  Try a sample dynasty (my own personal one)
                </h3>
                <button
                  type="button"
                  onClick={handleTestImport}
                  disabled={importing}
                  className="btn-refined flex-shrink-0"
                >
                  {importing ? 'Loading…' : 'Load sample'}
                </button>
              </div>
            </div>

            <div className="mt-10">
              <ContactCTA />
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!dynastyToDelete && !showFinalConfirm}
        onClose={() => setDynastyToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={dynastyToDelete?.favorite ? 'Delete Favorited Dynasty?' : 'Delete Dynasty?'}
        message={
          dynastyToDelete?.favorite
            ? `WARNING: "${dynastyToDelete?.teamName}" is marked as a favorite. Are you absolutely sure you want to delete this dynasty? This action cannot be undone.`
            : `Are you sure you want to delete the ${dynastyToDelete?.teamName} dynasty? This action cannot be undone.`
        }
        confirmText={dynastyToDelete?.favorite ? 'Continue' : 'Delete'}
        cancelText="Cancel"
        confirmButtonColor="#ef4444"
        loading={deletingDynastyId === dynastyToDelete?.id}
      />

      <Modal
        isOpen={showFinalConfirm && !!dynastyToDelete}
        onClose={handleCancelFinalConfirm}
        title="Final Confirmation Required"
        size="sm"
      >
        <p className="mb-4 text-txt-secondary">
          This is a <strong className="text-txt-primary">favorited dynasty</strong>. To confirm deletion, please type the dynasty name exactly:
        </p>
        <p className="text-lg font-bold mb-4 p-2 rounded-lg text-txt-primary" style={{ backgroundColor: 'var(--surface-3)' }}>
          {dynastyToDelete?.teamName}
        </p>
        <Input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type dynasty name here..."
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <Button
            variant="danger"
            className="flex-1"
            disabled={confirmText !== dynastyToDelete?.teamName || deletingDynastyId}
            onClick={handleFinalConfirmDelete}
          >
            {deletingDynastyId ? 'Deleting...' : 'Permanently Delete'}
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleCancelFinalConfirm} disabled={deletingDynastyId}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteAllConfirm1}
        onClose={handleCancelDeleteAll}
        title="Delete All Non-Starred Dynasties?"
        size="sm"
      >
        <p className="mb-4 text-txt-secondary">
          You are about to delete <strong style={{ color: 'var(--accent-error)' }} className="tabular">{nonStarredDynasties.length}</strong> {nonStarredDynasties.length === 1 ? 'dynasty' : 'dynasties'} that are not starred.
        </p>
        <div className="rounded-lg p-3 mb-4 max-h-32 overflow-y-auto" style={{ backgroundColor: 'var(--surface-3)' }}>
          <p className="label-xs text-txt-tertiary mb-2">Dynasties to be deleted</p>
          <ul className="text-sm space-y-1 text-txt-primary">
            {nonStarredDynasties.map(d => (
              <li key={d.id} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--accent-error)' }}></span>
                {d.teamName}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm mb-4 text-txt-muted">Starred dynasties will not be affected.</p>
        <div className="flex gap-3">
          <Button variant="danger" className="flex-1" onClick={handleDeleteAllConfirm1}>Continue</Button>
          <Button variant="outline" className="flex-1" onClick={handleCancelDeleteAll}>Cancel</Button>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteAllConfirm2}
        onClose={handleCancelDeleteAll}
        title="Final Confirmation"
        size="sm"
      >
        <p className="mb-4 text-txt-secondary">
          This action <strong className="text-txt-primary">cannot be undone</strong>. All <span className="tabular">{nonStarredDynasties.length}</span> non-starred {nonStarredDynasties.length === 1 ? 'dynasty' : 'dynasties'} will be permanently deleted.
        </p>
        <p className="mb-2 text-txt-secondary">
          To confirm, type <strong className="font-mono px-2 py-0.5 rounded text-txt-primary" style={{ backgroundColor: 'var(--surface-3)' }}>DELETE ALL</strong> below:
        </p>
        <Input
          type="text"
          value={deleteAllConfirmText}
          onChange={(e) => setDeleteAllConfirmText(e.target.value)}
          placeholder="Type DELETE ALL here..."
          className="font-mono"
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <Button
            variant="danger"
            className="flex-1"
            disabled={deleteAllConfirmText !== 'DELETE ALL' || deletingAll}
            onClick={handleDeleteAllConfirm2}
          >
            {deletingAll ? 'Deleting...' : `Delete ${nonStarredDynasties.length} ${nonStarredDynasties.length === 1 ? 'Dynasty' : 'Dynasties'}`}
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleCancelDeleteAll} disabled={deletingAll}>
            Cancel
          </Button>
        </div>
      </Modal>

      {shareDynasty && (
        <ShareDynastyModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setShareDynasty(null)
          }}
          teamColors={{ primary: 'var(--text-primary)', secondary: 'var(--surface-3)' }}
          dynasty={shareDynasty}
        />
      )}

      <Modal
        isOpen={showUrlImport}
        onClose={() => { setShowUrlImport(false); setImportUrl('') }}
        title="Import from URL"
        size="sm"
      >
        <p className="text-sm mb-4 text-txt-secondary">
          Paste a direct link to a dynasty JSON file. Supports Dropbox, GitHub, and other direct download links.
        </p>
        <Input
          type="url"
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          placeholder="https://dl.dropboxusercontent.com/..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && importUrl.trim()) {
              handleUrlImport()
            }
          }}
        />
        <div className="text-xs mt-4 mb-4 space-y-1 text-txt-muted">
          <p>Supported link formats:</p>
          <p>Dropbox — share link or dl.dropboxusercontent.com</p>
          <p>GitHub — raw file link or blob link</p>
          <p>Any direct link to a .json file</p>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" className="flex-1" disabled={!importUrl.trim()} onClick={handleUrlImport}>
            Import
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => { setShowUrlImport(false); setImportUrl('') }}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={importing}
        onClose={() => {}}
        title="Importing Dynasty"
        size="sm"
        hideClose
      >
        {/* Hero progress — big tabular numeral, hairline rule */}
        <div className="mb-6">
          <div className="flex items-end justify-between mb-3 gap-4">
            <span className="label-xs text-txt-tertiary truncate">
              {importProgress?.message || 'Preparing…'}
            </span>
            <span
              className="font-outfit font-black tabular-nums text-4xl leading-none"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
            >
              {importProgress?.progress || 0}
              <span className="text-txt-tertiary text-base font-normal ml-0.5">%</span>
            </span>
          </div>
          {/* Hairline progress — 2px, no rounding, neutral fill */}
          <div className="h-[2px] w-full" style={{ backgroundColor: 'var(--surface-4)' }}>
            <div
              className="h-full transition-[width] duration-500 ease-out"
              style={{ width: `${importProgress?.progress || 0}%`, backgroundColor: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Stage list — editorial numbered rows */}
        <div>
          {['parsing', 'creating', 'players', 'games', 'complete'].map((stage, index) => {
            const stageLabels = {
              parsing: 'Reading file',
              creating: 'Creating dynasty',
              players: 'Importing players',
              games: 'Importing games',
              complete: 'Complete',
            }
            const order = ['parsing', 'creating', 'players', 'games', 'complete']
            const currentStageIndex = order.indexOf(importProgress?.stage || 'starting')
            const isComplete = index < currentStageIndex
            const isCurrent = importProgress?.stage === stage

            const numberColor = isCurrent
              ? 'var(--text-primary)'
              : isComplete
              ? 'var(--txt-secondary)'
              : 'var(--txt-tertiary)'

            const labelColor = isCurrent
              ? 'var(--txt-primary)'
              : isComplete
              ? 'var(--txt-secondary)'
              : 'var(--txt-tertiary)'

            const statusLabel = isComplete ? 'Done' : isCurrent ? 'Active' : '—'
            const statusColor = isComplete
              ? 'var(--txt-tertiary)'
              : isCurrent
              ? 'var(--text-primary)'
              : 'var(--txt-tertiary)'

            return (
              <div
                key={stage}
                className="flex items-baseline gap-4 py-2.5"
                style={{
                  borderTop: index === 0 ? 'none' : '1px solid var(--rule-soft)',
                  borderLeft: isCurrent ? '2px solid var(--text-primary)' : '2px solid transparent',
                  paddingLeft: '0.75rem',
                  transition: 'border-color 200ms ease',
                }}
              >
                <span
                  className="font-outfit font-black tabular-nums text-sm w-6 flex-shrink-0"
                  style={{ color: numberColor, letterSpacing: '-0.01em' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={`text-sm flex-1 min-w-0 truncate ${isCurrent ? 'font-semibold' : 'font-normal'}`}
                  style={{ color: labelColor }}
                >
                  {stageLabels[stage]}
                  {isCurrent && importProgress?.detail && (
                    <span className="text-txt-tertiary ml-2 font-normal">{importProgress.detail}</span>
                  )}
                </span>
                <span
                  className="label-xs flex-shrink-0"
                  style={{ color: statusColor, letterSpacing: '0.12em' }}
                >
                  {statusLabel}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footnote — tracked all-caps, no colored pill */}
        <p className="label-xs text-txt-tertiary mt-5 text-center m-0">
          Keep this window open while the import completes
        </p>
      </Modal>

      <StorageSwitchModal
        isOpen={!!storageSwitchDynasty}
        onClose={() => setStorageSwitchDynasty(null)}
        dynasty={storageSwitchDynasty}
        isPremium={isPremium}
        onMigrate={migrateDynastyStorage}
        onUpgrade={async () => {
          setStorageSwitchDynasty(null)
          if (upgradeToPremium) {
            setUpgrading(true)
            try {
              await upgradeToPremium()
            } finally {
              setUpgrading(false)
            }
          }
        }}
      />
    </div>
  )
}
