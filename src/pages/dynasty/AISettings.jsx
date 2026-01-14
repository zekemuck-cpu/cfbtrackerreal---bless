import { useState, useEffect, useContext } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../../config/firebase'
import { useAuth } from '../../context/AuthContext'
import DynastyContext from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'
import { DEFAULT_GAME_RECAP_INSTRUCTIONS, getApiUsageStats } from '../../services/geminiService'
import { PROVIDER_INFO, getModelsForProvider, getDefaultModel, testApiKey } from '../../services/providers'

// Default neutral colors when not in dynasty context
const NEUTRAL_COLORS = {
  primary: '#1e40af',
  secondary: '#f1f5f9'
}

const PROVIDER_LIST = ['gemini', 'openai', 'anthropic', 'openrouter']

export default function AISettings() {
  const { user } = useAuth()

  // Try to get dynasty context (may be null if standalone)
  const dynastyContext = useContext(DynastyContext)
  const currentDynasty = dynastyContext?.currentDynasty
  const isViewOnly = dynastyContext?.isViewOnly

  // Use team colors if in dynasty, otherwise neutral colors
  const teamColorsFromHook = useTeamColors(currentDynasty?.teamName, currentDynasty?.teams || currentDynasty?.customTeams)
  const teamColors = currentDynasty?.teamName ? teamColorsFromHook : NEUTRAL_COLORS
  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  // Provider & Model selection
  const [selectedProvider, setSelectedProvider] = useState('gemini')
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash')

  // API Key state (per provider)
  const [apiKeys, setApiKeys] = useState({})
  const [currentKeyInput, setCurrentKeyInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(null)
  const [showKey, setShowKey] = useState(false)

  // Custom prompt state
  const [customInstructions, setCustomInstructions] = useState('')
  const [savedInstructions, setSavedInstructions] = useState('')
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptStatus, setPromptStatus] = useState(null)

  // Usage stats state
  const [usageStats, setUsageStats] = useState(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  // Load existing settings on mount
  useEffect(() => {
    const loadUserSettings = async () => {
      if (!user?.uid) {
        setLoading(false)
        return
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          const data = userDoc.data()

          // Load provider preference
          setSelectedProvider(data.aiProvider || 'gemini')
          setSelectedModel(data.aiModel || 'gemini-2.5-flash')

          // Load API keys (new structure + legacy)
          const keys = {
            gemini: data.apiKeys?.gemini || data.geminiApiKey || '',
            openai: data.apiKeys?.openai || '',
            anthropic: data.apiKeys?.anthropic || '',
            openrouter: data.apiKeys?.openrouter || ''
          }
          setApiKeys(keys)
          setCurrentKeyInput(keys[data.aiProvider || 'gemini'] || '')

          // Load custom instructions
          if (data.gameRecapInstructions) {
            setSavedInstructions(data.gameRecapInstructions)
            setCustomInstructions(data.gameRecapInstructions)
          } else {
            setCustomInstructions(DEFAULT_GAME_RECAP_INSTRUCTIONS)
          }
        } else {
          setCustomInstructions(DEFAULT_GAME_RECAP_INSTRUCTIONS)
        }
      } catch (error) {
        console.error('Error loading user settings:', error)
        setCustomInstructions(DEFAULT_GAME_RECAP_INSTRUCTIONS)
      }
      setLoading(false)
    }

    loadUserSettings()
  }, [user?.uid])

  // Update key input when provider changes
  useEffect(() => {
    setCurrentKeyInput(apiKeys[selectedProvider] || '')
    setStatus(null)
  }, [selectedProvider, apiKeys])

  // Load usage stats
  useEffect(() => {
    const loadUsageStats = async () => {
      if (!user?.uid) return
      setLoadingUsage(true)
      try {
        const stats = await getApiUsageStats(user.uid)
        setUsageStats(stats)
      } catch (error) {
        console.error('Error loading usage stats:', error)
      }
      setLoadingUsage(false)
    }
    loadUsageStats()
  }, [user?.uid])

  const refreshUsageStats = async () => {
    if (!user?.uid) return
    setLoadingUsage(true)
    try {
      const stats = await getApiUsageStats(user.uid)
      setUsageStats(stats)
    } catch (error) {
      console.error('Error refreshing usage stats:', error)
    }
    setLoadingUsage(false)
  }

  // Handle provider change
  const handleProviderChange = async (newProvider) => {
    setSelectedProvider(newProvider)
    const defaultModel = getDefaultModel(newProvider)
    setSelectedModel(defaultModel)

    // Save to Firestore
    if (user?.uid) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          aiProvider: newProvider,
          aiModel: defaultModel,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      } catch (error) {
        console.error('Error saving provider preference:', error)
      }
    }
  }

  // Handle model change
  const handleModelChange = async (newModel) => {
    setSelectedModel(newModel)
    if (user?.uid) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          aiModel: newModel,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      } catch (error) {
        console.error('Error saving model preference:', error)
      }
    }
  }

  // Save API key
  const handleSave = async () => {
    if (!user?.uid || !currentKeyInput.trim()) return

    setSaving(true)
    setStatus(null)

    try {
      const updates = {
        [`apiKeys.${selectedProvider}`]: currentKeyInput.trim(),
        aiProvider: selectedProvider,
        aiModel: selectedModel,
        email: user.email,
        updatedAt: new Date().toISOString()
      }

      // Also update legacy field for Gemini
      if (selectedProvider === 'gemini') {
        updates.geminiApiKey = currentKeyInput.trim()
      }

      await setDoc(doc(db, 'users', user.uid), updates, { merge: true })

      setApiKeys(prev => ({ ...prev, [selectedProvider]: currentKeyInput.trim() }))
      setStatus({ success: true, message: 'API key saved successfully!' })
    } catch (error) {
      console.error('Error saving API key:', error)
      setStatus({ success: false, message: 'Failed to save: ' + error.message })
    }

    setSaving(false)
  }

  // Test the API key
  const handleTest = async () => {
    if (!currentKeyInput.trim()) return

    setTesting(true)
    setStatus(null)

    try {
      const isValid = await testApiKey(selectedProvider, currentKeyInput.trim())
      if (isValid) {
        setStatus({ success: true, message: 'API key is valid and working!' })
      } else {
        setStatus({ success: false, message: 'Invalid API key. Please check and try again.' })
      }
    } catch (error) {
      setStatus({ success: false, message: 'Test failed: ' + error.message })
    }

    setTesting(false)
  }

  // Remove API key
  const handleRemove = async () => {
    if (!user?.uid) return

    setSaving(true)
    setStatus(null)

    try {
      const updates = {
        [`apiKeys.${selectedProvider}`]: null,
        updatedAt: new Date().toISOString()
      }

      if (selectedProvider === 'gemini') {
        updates.geminiApiKey = null
      }

      await setDoc(doc(db, 'users', user.uid), updates, { merge: true })

      setApiKeys(prev => ({ ...prev, [selectedProvider]: '' }))
      setCurrentKeyInput('')
      setStatus({ success: true, message: 'API key removed' })
    } catch (error) {
      console.error('Error removing API key:', error)
      setStatus({ success: false, message: 'Failed to remove: ' + error.message })
    }

    setSaving(false)
  }

  // Save custom instructions
  const handleSavePrompt = async () => {
    if (!user?.uid) return

    setSavingPrompt(true)
    setPromptStatus(null)

    try {
      await setDoc(doc(db, 'users', user.uid), {
        gameRecapInstructions: customInstructions,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      setSavedInstructions(customInstructions)
      setPromptStatus({ success: true, message: 'Prompt saved!' })
    } catch (error) {
      console.error('Error saving prompt:', error)
      setPromptStatus({ success: false, message: 'Failed to save: ' + error.message })
    }

    setSavingPrompt(false)
  }

  // Reset to default prompt
  const handleResetPrompt = async () => {
    if (!user?.uid) return
    if (!window.confirm('Reset to default prompt? Your custom changes will be lost.')) return

    setSavingPrompt(true)
    setPromptStatus(null)

    try {
      await setDoc(doc(db, 'users', user.uid), {
        gameRecapInstructions: null,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      setCustomInstructions(DEFAULT_GAME_RECAP_INSTRUCTIONS)
      setSavedInstructions('')
      setPromptStatus({ success: true, message: 'Reset to default!' })
    } catch (error) {
      console.error('Error resetting prompt:', error)
      setPromptStatus({ success: false, message: 'Failed to reset: ' + error.message })
    }

    setSavingPrompt(false)
  }

  // Check if we're in dynasty context and it's view-only
  if (dynastyContext && isViewOnly) {
    return (
      <div className="p-6">
        <div className="rounded-lg p-6 text-center" style={{ backgroundColor: teamColors.secondary }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: secondaryBgText }}>AI Settings</h2>
          <p style={{ color: secondaryBgText, opacity: 0.7 }}>AI Settings are not available in view-only mode.</p>
        </div>
      </div>
    )
  }

  const isStandalone = !dynastyContext || !currentDynasty
  const providerInfo = PROVIDER_INFO[selectedProvider]
  const models = getModelsForProvider(selectedProvider)
  const hasApiKey = !!apiKeys[selectedProvider]

  return (
    <div className="space-y-6">
      {/* Back link for standalone mode */}
      {isStandalone && (
        <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dynasties
        </Link>
      )}

      {/* Header */}
      <div className="rounded-xl p-5 sm:p-6" style={{ backgroundColor: teamColors.primary, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: primaryBgText }}>AI Settings</h1>
        <p className="text-sm mt-1" style={{ color: primaryBgText, opacity: 0.8 }}>
          Configure AI features for generating game recaps and other content
        </p>
      </div>

      {/* Provider Selection */}
      <div className="rounded-lg p-5" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>AI Provider</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PROVIDER_LIST.map(providerName => {
            const info = PROVIDER_INFO[providerName]
            const isSelected = selectedProvider === providerName
            const hasKey = !!apiKeys[providerName]

            return (
              <button
                key={providerName}
                onClick={() => handleProviderChange(providerName)}
                className="p-4 rounded-lg border-2 transition-all text-left"
                style={{
                  borderColor: isSelected ? teamColors.primary : 'transparent',
                  backgroundColor: isSelected ? `${teamColors.primary}15` : '#fff'
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm" style={{ color: secondaryBgText }}>
                    {info.displayName}
                  </span>
                  {hasKey && (
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                  )}
                </div>
                <p className="text-xs" style={{ color: secondaryBgText, opacity: 0.7 }}>
                  {info.description}
                </p>
              </button>
            )
          })}
        </div>

        {/* Model Selection */}
        {models.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2" style={{ color: secondaryBgText }}>Model</label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border-2 bg-white"
              style={{ borderColor: `${teamColors.primary}30` }}
            >
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.description}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Status Banner */}
      <div
        className="rounded-lg p-4 flex items-center gap-3"
        style={{
          backgroundColor: hasApiKey ? '#ecfdf5' : '#fef3c7',
          border: `2px solid ${hasApiKey ? '#10b981' : '#f59e0b'}`
        }}
      >
        <div className={`w-3 h-3 rounded-full ${hasApiKey ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className={hasApiKey ? 'text-green-800' : 'text-amber-800'}>
          {hasApiKey
            ? `${providerInfo.displayName} connected - AI features are enabled!`
            : `No ${providerInfo.displayName} API key - Follow the steps below to enable AI features`
          }
        </span>
      </div>

      {/* Usage Stats Section */}
      {hasApiKey && selectedProvider === 'gemini' && (
        <div className="rounded-lg p-5" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold" style={{ color: secondaryBgText }}>API Usage</h2>
            <button
              onClick={refreshUsageStats}
              disabled={loadingUsage}
              className="text-xs px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
              style={{ backgroundColor: `${teamColors.primary}15`, color: teamColors.primary }}
            >
              {loadingUsage ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {loadingUsage && !usageStats ? (
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: teamColors.primary }}></div>
              <span style={{ color: secondaryBgText, opacity: 0.7 }}>Loading usage data...</span>
            </div>
          ) : usageStats ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: secondaryBgText }}>Today's Requests</span>
                  <span className="text-sm font-bold" style={{ color: secondaryBgText }}>
                    {usageStats.today.requests} / {usageStats.limits.requestsPerDay}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: `${teamColors.primary}20` }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((usageStats.today.requests / usageStats.limits.requestsPerDay) * 100, 100)}%`,
                      backgroundColor: usageStats.today.requests > usageStats.limits.requestsPerDay * 0.8 ? '#ef4444' : teamColors.primary
                    }}
                  />
                </div>
              </div>

              {usageStats.allTime.requests > 0 && (
                <div className="pt-3 border-t" style={{ borderColor: `${teamColors.primary}20` }}>
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: secondaryBgText, opacity: 0.8 }}>All-Time</span>
                    <span style={{ color: secondaryBgText }}>
                      {usageStats.allTime.requests.toLocaleString()} requests
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.7 }}>
              No usage data yet.
            </p>
          )}
        </div>
      )}

      {/* Setup Instructions */}
      <div className="rounded-lg p-5" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>
          Setup {providerInfo.displayName}
        </h2>

        <div className="space-y-3">
          {providerInfo.setupSteps.map((step, idx) => (
            <div key={idx} className="flex gap-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
              >
                {idx + 1}
              </div>
              <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.9 }}>{step}</p>
            </div>
          ))}
        </div>

        <a
          href={providerInfo.setupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
        >
          Go to {providerInfo.displayName}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>

        {selectedProvider === 'gemini' && (
          <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: '#ecfdf5', border: '1px solid #10b981' }}>
            <p className="text-sm text-green-800">
              <strong>Free tier:</strong> 1,500 requests/day - no credit card required!
            </p>
          </div>
        )}
      </div>

      {/* API Key Input */}
      <div className="rounded-lg p-5" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>
          {providerInfo.displayName} API Key
        </h2>

        {loading ? (
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: teamColors.primary }}></div>
            <span style={{ color: secondaryBgText, opacity: 0.7 }}>Loading...</span>
          </div>
        ) : (
          <>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={currentKeyInput}
                onChange={(e) => setCurrentKeyInput(e.target.value)}
                placeholder={providerInfo.keyPlaceholder}
                className="w-full px-4 py-3 pr-12 rounded-lg border-2 focus:outline-none font-mono text-sm"
                style={{ borderColor: `${teamColors.primary}50`, backgroundColor: '#fff' }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showKey ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={handleSave}
                disabled={saving || !currentKeyInput.trim() || currentKeyInput === apiKeys[selectedProvider]}
                className="px-5 py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
              >
                {saving ? 'Saving...' : 'Save Key'}
              </button>

              <button
                onClick={handleTest}
                disabled={testing || !currentKeyInput.trim()}
                className="px-5 py-2.5 rounded-lg font-medium text-sm border-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ borderColor: teamColors.primary, color: teamColors.primary }}
              >
                {testing ? 'Testing...' : 'Test Key'}
              </button>

              {hasApiKey && (
                <button
                  onClick={handleRemove}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: '#dc2626', color: '#fff' }}
                >
                  Remove Key
                </button>
              )}
            </div>

            {status && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${status.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {status.success ? '✓' : '✗'} {status.message}
              </div>
            )}
          </>
        )}
      </div>

      {/* Custom Prompt Editor */}
      <div className="rounded-lg p-5" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}>
        <button
          onClick={() => setShowPromptEditor(!showPromptEditor)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold" style={{ color: secondaryBgText }}>
              Game Recap Prompt
            </h2>
            {savedInstructions && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Customized
              </span>
            )}
          </div>
          <svg
            className={`w-5 h-5 transition-transform ${showPromptEditor ? 'rotate-180' : ''}`}
            fill="none"
            stroke={secondaryBgText}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showPromptEditor && (
          <div className="mt-4 space-y-4">
            <p className="text-sm" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Customize the AI instructions for generating game recaps. Use [HOME_TEAM] as a placeholder.
            </p>

            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={12}
              className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none font-mono text-xs"
              style={{ borderColor: `${teamColors.primary}50`, backgroundColor: '#fff' }}
            />

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSavePrompt}
                disabled={savingPrompt || customInstructions === savedInstructions}
                className="px-5 py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
              >
                {savingPrompt ? 'Saving...' : 'Save Prompt'}
              </button>

              {savedInstructions && (
                <button
                  onClick={handleResetPrompt}
                  disabled={savingPrompt}
                  className="px-5 py-2.5 rounded-lg font-medium text-sm border-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ borderColor: teamColors.primary, color: teamColors.primary }}
                >
                  Reset to Default
                </button>
              )}
            </div>

            {promptStatus && (
              <div className={`p-3 rounded-lg text-sm ${promptStatus.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {promptStatus.success ? '✓' : '✗'} {promptStatus.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div className="rounded-lg p-5" style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>FAQ</h2>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>Is my API key secure?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Yes, your key is stored in your private account data. It's only used to generate content for your dynasty.
            </p>
          </div>

          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>Which provider should I use?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Gemini is recommended for most users (free tier). OpenRouter offers access to many models with pay-per-use pricing.
            </p>
          </div>

          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>Can I switch providers?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Yes! You can save API keys for multiple providers and switch between them anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
