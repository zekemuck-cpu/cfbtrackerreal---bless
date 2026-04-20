import { useState, useEffect, useContext } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { db } from '../../config/firebase'
import { useAuth } from '../../context/AuthContext'
import DynastyContext from '../../context/DynastyContext'
import { DEFAULT_GAME_RECAP_INSTRUCTIONS, getApiUsageStats } from '../../services/geminiService'
import { PROVIDER_INFO, getModelsForProvider, getDefaultModel, testApiKey } from '../../services/providers'
import {
  PageHero,
  Card,
  SectionHeader,
  Button,
  Badge,
  Input,
  Select,
  Textarea,
  useConfirm,
} from '../../components/ui'

const PROVIDER_LIST = ['gemini', 'openai', 'anthropic', 'openrouter']

export default function AISettings() {
  const { user } = useAuth()
  const { confirm } = useConfirm()

  const dynastyContext = useContext(DynastyContext)
  const currentDynasty = dynastyContext?.currentDynasty
  const isViewOnly = dynastyContext?.isViewOnly

  const [selectedProvider, setSelectedProvider] = useState('gemini')
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash')

  const [apiKeys, setApiKeys] = useState({})
  const [currentKeyInput, setCurrentKeyInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(null)
  const [showKey, setShowKey] = useState(false)

  const [customInstructions, setCustomInstructions] = useState('')
  const [savedInstructions, setSavedInstructions] = useState('')
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptStatus, setPromptStatus] = useState(null)

  const [usageStats, setUsageStats] = useState(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

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

          setSelectedProvider(data.aiProvider || 'gemini')
          setSelectedModel(data.aiModel || 'gemini-2.5-flash')

          const keys = {
            gemini: data.apiKeys?.gemini || data.geminiApiKey || '',
            openai: data.apiKeys?.openai || '',
            anthropic: data.apiKeys?.anthropic || '',
            openrouter: data.apiKeys?.openrouter || ''
          }
          setApiKeys(keys)
          setCurrentKeyInput(keys[data.aiProvider || 'gemini'] || '')

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

  useEffect(() => {
    setCurrentKeyInput(apiKeys[selectedProvider] || '')
    setStatus(null)
  }, [selectedProvider, apiKeys])

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

  const handleProviderChange = async (newProvider) => {
    setSelectedProvider(newProvider)
    const defaultModel = getDefaultModel(newProvider)
    setSelectedModel(defaultModel)

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

  const handleResetPrompt = async () => {
    if (!user?.uid) return
    const ok = await confirm({
      title: 'Reset Prompt',
      message: 'Reset to default prompt? Your custom changes will be lost.',
      confirmLabel: 'Reset',
      variant: 'danger',
    })
    if (!ok) return

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

  if (dynastyContext && isViewOnly) {
    return (
      <div className="space-y-4">
        <PageHero title="AI Settings" meta="View-only mode" />
        <Card>
          <p className="text-sm text-txt-secondary m-0">
            AI Settings are not available in view-only mode.
          </p>
        </Card>
      </div>
    )
  }

  const isStandalone = !dynastyContext || !currentDynasty
  const providerInfo = PROVIDER_INFO[selectedProvider]
  const models = getModelsForProvider(selectedProvider)
  const hasApiKey = !!apiKeys[selectedProvider]

  return (
    <div className="space-y-4">
      {isStandalone && (
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-txt-tertiary hover:text-txt-primary transition-colors"
        >
          ← Back to Dynasties
        </Link>
      )}

      <PageHero
        eyebrow="Settings"
        title="AI Settings"
        meta="Configure AI features for generating game recaps and other content"
      />

      <Card>
        <SectionHeader title="AI Provider" size="sm" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROVIDER_LIST.map(providerName => {
            const info = PROVIDER_INFO[providerName]
            const isSelected = selectedProvider === providerName
            const hasKey = !!apiKeys[providerName]

            return (
              <button
                key={providerName}
                onClick={() => handleProviderChange(providerName)}
                className="relative p-3 rounded-md text-left transition-colors hover:bg-surface-3"
                style={{
                  backgroundColor: isSelected ? 'var(--team-primary-faded)' : 'var(--surface-2)',
                  border: isSelected
                    ? '1px solid var(--team-primary)'
                    : '1px solid var(--surface-4)',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-txt-primary">
                    {info.displayName}
                  </span>
                  {hasKey && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: 'var(--accent-success)' }}
                    />
                  )}
                </div>
                <p className="text-xs text-txt-tertiary m-0">{info.description}</p>
              </button>
            )
          })}
        </div>

        {models.length > 0 && (
          <div className="mt-4">
            <label className="label-sm text-txt-secondary block mb-1.5">Model</label>
            <Select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full sm:w-auto"
            >
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name} — {model.description}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      <Card
        style={{
          borderColor: hasApiKey ? 'var(--accent-success)' : 'var(--accent-warning)',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: hasApiKey
                ? 'var(--accent-success)'
                : 'var(--accent-warning)',
            }}
          />
          <span className="text-sm text-txt-primary">
            {hasApiKey
              ? `${providerInfo.displayName} connected — AI features are enabled.`
              : `No ${providerInfo.displayName} API key — Follow the steps below to enable AI features.`}
          </span>
        </div>
      </Card>

      {hasApiKey && selectedProvider === 'gemini' && (
        <Card>
          <SectionHeader
            title="API Usage"
            size="sm"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshUsageStats}
                disabled={loadingUsage}
              >
                {loadingUsage ? 'Loading…' : 'Refresh'}
              </Button>
            }
          />
          {loadingUsage && !usageStats ? (
            <p className="text-sm text-txt-tertiary m-0">Loading usage data…</p>
          ) : usageStats ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-txt-secondary">Today's Requests</span>
                  <span className="text-sm font-semibold tabular text-txt-primary">
                    {usageStats.today.requests} / {usageStats.limits.requestsPerDay}
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--surface-4)' }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min((usageStats.today.requests / usageStats.limits.requestsPerDay) * 100, 100)}%`,
                      backgroundColor:
                        usageStats.today.requests > usageStats.limits.requestsPerDay * 0.8
                          ? 'var(--accent-error)'
                          : 'var(--team-primary)',
                    }}
                  />
                </div>
              </div>

              {usageStats.allTime.requests > 0 && (
                <div
                  className="pt-3"
                  style={{ borderTop: '1px solid var(--surface-4)' }}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-txt-tertiary">All-Time</span>
                    <span className="tabular text-txt-primary">
                      {usageStats.allTime.requests.toLocaleString()} requests
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-txt-tertiary m-0">No usage data yet.</p>
          )}
        </Card>
      )}

      <Card>
        <SectionHeader title={`Setup ${providerInfo.displayName}`} size="sm" />
        <div className="space-y-3">
          {providerInfo.setupSteps.map((step, idx) => (
            <div key={idx} className="flex gap-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold tabular"
                style={{
                  backgroundColor: 'var(--team-primary-faded)',
                  color: 'var(--team-primary)',
                }}
              >
                {idx + 1}
              </div>
              <p className="text-sm text-txt-secondary m-0 pt-0.5">{step}</p>
            </div>
          ))}
        </div>

        <a
          href={providerInfo.setupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4"
        >
          <Button variant="primary" size="sm">
            Go to {providerInfo.displayName}
          </Button>
        </a>

        {selectedProvider === 'gemini' && (
          <div
            className="mt-4 p-3 rounded-md text-sm"
            style={{
              backgroundColor: 'var(--surface-3)',
              border: '1px solid var(--surface-4)',
              color: 'var(--text-secondary)',
            }}
          >
            <strong className="text-txt-primary">Free tier:</strong> 1,500 requests/day — no credit card required.
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title={`${providerInfo.displayName} API Key`} size="sm" />
        {loading ? (
          <p className="text-sm text-txt-tertiary m-0">Loading…</p>
        ) : (
          <>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={currentKeyInput}
                onChange={(e) => setCurrentKeyInput(e.target.value)}
                placeholder={providerInfo.keyPlaceholder}
                className="font-mono pr-16"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider text-txt-tertiary hover:text-txt-primary transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !currentKeyInput.trim() || currentKeyInput === apiKeys[selectedProvider]}
              >
                {saving ? 'Saving…' : 'Save Key'}
              </Button>

              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing || !currentKeyInput.trim()}
              >
                {testing ? 'Testing…' : 'Test Key'}
              </Button>

              {hasApiKey && (
                <Button
                  variant="danger"
                  onClick={handleRemove}
                  disabled={saving}
                >
                  Remove Key
                </Button>
              )}
            </div>

            {status && (
              <div
                className="mt-4 p-3 rounded-md text-sm"
                style={{
                  backgroundColor: 'var(--surface-3)',
                  border: `1px solid ${status.success ? 'var(--accent-success)' : 'var(--accent-error)'}`,
                  color: status.success ? 'var(--accent-success)' : 'var(--accent-error)',
                }}
              >
                {status.message}
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <button
          onClick={() => setShowPromptEditor(!showPromptEditor)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-txt-primary m-0">
              Game Recap Prompt
            </h2>
            {savedInstructions && (
              <Badge variant="accent" size="sm">Customized</Badge>
            )}
          </div>
          <span className="text-sm text-txt-tertiary">
            {showPromptEditor ? '▾' : '▸'}
          </span>
        </button>

        {showPromptEditor && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-txt-secondary m-0">
              Customize the AI instructions for generating game recaps. Use [HOME_TEAM] as a placeholder.
            </p>

            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={handleSavePrompt}
                disabled={savingPrompt || customInstructions === savedInstructions}
              >
                {savingPrompt ? 'Saving…' : 'Save Prompt'}
              </Button>

              {savedInstructions && (
                <Button
                  variant="outline"
                  onClick={handleResetPrompt}
                  disabled={savingPrompt}
                >
                  Reset to Default
                </Button>
              )}
            </div>

            {promptStatus && (
              <div
                className="p-3 rounded-md text-sm"
                style={{
                  backgroundColor: 'var(--surface-3)',
                  border: `1px solid ${promptStatus.success ? 'var(--accent-success)' : 'var(--accent-error)'}`,
                  color: promptStatus.success ? 'var(--accent-success)' : 'var(--accent-error)',
                }}
              >
                {promptStatus.message}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title="FAQ" size="sm" />
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm text-txt-primary m-0">Is my API key secure?</h3>
            <p className="text-sm text-txt-secondary mt-1 m-0">
              Yes, your key is stored in your private account data. It's only used to generate content for your dynasty.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-txt-primary m-0">Which provider should I use?</h3>
            <p className="text-sm text-txt-secondary mt-1 m-0">
              Gemini is recommended for most users (free tier). OpenRouter offers access to many models with pay-per-use pricing.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-txt-primary m-0">Can I switch providers?</h3>
            <p className="text-sm text-txt-secondary mt-1 m-0">
              Yes. You can save API keys for multiple providers and switch between them anytime.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
