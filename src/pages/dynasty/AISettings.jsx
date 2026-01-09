import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from '../../context/AuthContext'
import { useDynasty } from '../../context/DynastyContext'
import { useTeamColors } from '../../hooks/useTeamColors'
import { getContrastTextColor } from '../../utils/colorUtils'

export default function AISettings() {
  const { user } = useAuth()
  const { currentDynasty, isViewOnly } = useDynasty()
  const teamColors = useTeamColors(currentDynasty?.teamName)
  const primaryBgText = getContrastTextColor(teamColors.primary)
  const secondaryBgText = getContrastTextColor(teamColors.secondary)

  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState(null)
  const [showKey, setShowKey] = useState(false)

  // Load existing API key on mount
  useEffect(() => {
    const loadApiKey = async () => {
      if (!user?.uid) {
        setLoading(false)
        return
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists() && userDoc.data().geminiApiKey) {
          const key = userDoc.data().geminiApiKey
          setSavedKey(key)
          setApiKey(key)
        }
      } catch (error) {
        console.error('Error loading API key:', error)
      }
      setLoading(false)
    }

    loadApiKey()
  }, [user?.uid])

  // Save API key to Firebase
  const handleSave = async () => {
    if (!user?.uid || !apiKey.trim()) return

    setSaving(true)
    setStatus(null)

    try {
      await setDoc(doc(db, 'users', user.uid), {
        geminiApiKey: apiKey.trim(),
        email: user.email,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      setSavedKey(apiKey.trim())
      setStatus({ success: true, message: 'API key saved successfully!' })
    } catch (error) {
      console.error('Error saving API key:', error)
      setStatus({ success: false, message: 'Failed to save: ' + error.message })
    }

    setSaving(false)
  }

  // Test the API key
  const handleTest = async () => {
    if (!apiKey.trim()) return

    setTesting(true)
    setStatus(null)

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say "Hello! Your API key is working." and nothing else.' }] }]
          })
        }
      )

      if (response.ok) {
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Response received'
        setStatus({ success: true, message: `Key works! ${text}` })
      } else {
        const error = await response.json()
        setStatus({ success: false, message: error.error?.message || 'Invalid API key' })
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
      await setDoc(doc(db, 'users', user.uid), {
        geminiApiKey: null,
        updatedAt: new Date().toISOString()
      }, { merge: true })

      setSavedKey('')
      setApiKey('')
      setStatus({ success: true, message: 'API key removed' })
    } catch (error) {
      console.error('Error removing API key:', error)
      setStatus({ success: false, message: 'Failed to remove: ' + error.message })
    }

    setSaving(false)
  }

  if (!currentDynasty) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: teamColors.primary }}></div>
      </div>
    )
  }

  if (isViewOnly) {
    return (
      <div className="p-6">
        <div className="rounded-lg p-6 text-center" style={{ backgroundColor: teamColors.secondary }}>
          <h2 className="text-xl font-bold mb-2" style={{ color: secondaryBgText }}>AI Settings</h2>
          <p style={{ color: secondaryBgText, opacity: 0.7 }}>AI Settings are not available in view-only mode.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl p-5 sm:p-6"
        style={{
          backgroundColor: teamColors.primary,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${primaryBgText}20` }}
          >
            <svg className="w-6 h-6" fill="none" stroke={primaryBgText} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: primaryBgText }}>
              AI Settings
            </h1>
            <p className="text-sm" style={{ color: primaryBgText, opacity: 0.8 }}>
              Connect Google Gemini to generate AI-powered content
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div
        className="rounded-lg p-4 flex items-center gap-3"
        style={{
          backgroundColor: savedKey ? '#ecfdf5' : '#fef3c7',
          border: `2px solid ${savedKey ? '#10b981' : '#f59e0b'}`
        }}
      >
        <div className={`w-3 h-3 rounded-full ${savedKey ? 'bg-green-500' : 'bg-yellow-500'}`} />
        <span className={savedKey ? 'text-green-800' : 'text-amber-800'}>
          {savedKey ? 'API Key Connected - AI features are enabled!' : 'No API Key - Follow the steps below to enable AI features'}
        </span>
      </div>

      {/* What is this section */}
      <div
        className="rounded-lg p-5"
        style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}
      >
        <h2 className="text-lg font-bold mb-3" style={{ color: secondaryBgText }}>
          What is this?
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: secondaryBgText, opacity: 0.9 }}>
          By connecting your own Google Gemini API key, you can unlock AI-powered features throughout the app.
          Generate season recaps, player bios, game summaries, and more with a single click.
        </p>
        <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: `${teamColors.primary}15` }}>
          <p className="text-sm font-medium" style={{ color: secondaryBgText }}>
            Your key is stored securely in your account and works across all your devices.
          </p>
        </div>
      </div>

      {/* Step by Step Instructions */}
      <div
        className="rounded-lg p-5"
        style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}
      >
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>
          How to Get Your Free API Key
        </h2>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
            >
              1
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: secondaryBgText }}>Create a Google Cloud Project</h3>
              <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
                First, go to{' '}
                <a
                  href="https://console.cloud.google.com/projectcreate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                  style={{ color: teamColors.primary }}
                >
                  console.cloud.google.com/projectcreate
                </a>
                {' '}and create a new project. Give it any name (like "Dynasty Tracker AI") and click <strong>Create</strong>.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
            >
              2
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: secondaryBgText }}>Go to Google AI Studio</h3>
              <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
                Visit{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                  style={{ color: teamColors.primary }}
                >
                  aistudio.google.com/apikey
                </a>
                {' '}and sign in with your Google account (the same one you use for this app).
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
            >
              3
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: secondaryBgText }}>Create an API Key</h3>
              <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
                Click the blue <strong>"Create API key"</strong> button, then select the project you just created from the dropdown.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
            >
              4
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: secondaryBgText }}>Copy Your Key</h3>
              <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
                Your API key will appear (it starts with "AIza..."). Click the copy button next to it.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
              style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
            >
              5
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: secondaryBgText }}>Paste It Below</h3>
              <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
                Paste your API key in the field below and click "Save". That's it - you're done!
              </p>
            </div>
          </div>
        </div>

        {/* Cost info */}
        <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: '#ecfdf5', border: '1px solid #10b981' }}>
          <div className="flex gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="text-green-800 text-sm">
              <p className="font-semibold">100% Free</p>
              <p className="mt-1">Google's Gemini API is free to use. No credit card required. You get 1,500 requests per day - way more than you'll ever need for this app.</p>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Input Section */}
      <div
        className="rounded-lg p-5"
        style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}
      >
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>
          Your API Key
        </h2>

        {loading ? (
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: teamColors.primary }}></div>
            <span style={{ color: secondaryBgText, opacity: 0.7 }}>Loading...</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your API key here (starts with AIza...)"
                  className="w-full px-4 py-3 rounded-lg border-2 focus:outline-none transition-colors font-mono text-sm"
                  style={{
                    borderColor: `${teamColors.primary}50`,
                    backgroundColor: '#fff'
                  }}
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
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={handleSave}
                disabled={saving || !apiKey.trim() || apiKey === savedKey}
                className="px-5 py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: teamColors.primary, color: primaryBgText }}
              >
                {saving ? 'Saving...' : 'Save Key'}
              </button>

              <button
                onClick={handleTest}
                disabled={testing || !apiKey.trim()}
                className="px-5 py-2.5 rounded-lg font-medium text-sm border-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ borderColor: teamColors.primary, color: teamColors.primary }}
              >
                {testing ? 'Testing...' : 'Test Key'}
              </button>

              {savedKey && (
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

            {/* Status message */}
            {status && (
              <div
                className={`mt-4 p-3 rounded-lg text-sm ${status.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}
              >
                {status.success ? '✓' : '✗'} {status.message}
              </div>
            )}
          </>
        )}
      </div>

      {/* FAQ Section */}
      <div
        className="rounded-lg p-5"
        style={{ backgroundColor: teamColors.secondary, border: `2px solid ${teamColors.primary}30` }}
      >
        <h2 className="text-lg font-bold mb-4" style={{ color: secondaryBgText }}>
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>Is this really free?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Yes! Google provides 1,500 free API requests per day. For generating dynasty content, you'd use maybe 10-20 per session at most.
            </p>
          </div>

          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>Is my API key secure?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Your key is stored in your private account data and syncs across your devices. It's only used to generate content for your dynasty.
            </p>
          </div>

          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>Can I revoke the key later?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Yes! You can delete your key from Google AI Studio at any time, or remove it from this app using the "Remove Key" button above.
            </p>
          </div>

          <div>
            <h3 className="font-semibold" style={{ color: secondaryBgText }}>What can I generate with AI?</h3>
            <p className="text-sm mt-1" style={{ color: secondaryBgText, opacity: 0.8 }}>
              Once connected, you'll see "Generate with AI" buttons throughout the app - for season summaries, player bios, game recaps, recruiting class write-ups, and more. (Coming soon!)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
