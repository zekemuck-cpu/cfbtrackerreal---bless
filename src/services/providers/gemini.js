/**
 * Google Gemini AI Provider
 */

export const name = 'gemini'
export const displayName = 'Google Gemini'

export const models = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast, efficient (recommended)' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Previous generation flash' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'More capable, slower' }
]

export const defaultModel = 'gemini-2.5-flash'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Generate text (non-streaming)
 */
export async function generate(apiKey, prompt, options = {}) {
  const { model = defaultModel, maxRetries = 3 } = options

  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      `${BASE_URL}/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.8,
            topK: options.topK ?? 40,
            topP: options.topP ?? 0.95,
            maxOutputTokens: options.maxTokens ?? 8192,
          }
        })
      }
    )

    if (!response.ok) {
      const error = await response.json()
      const errorMessage = error.error?.message || 'Failed to generate content'

      // Retry on overloaded errors
      if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('No content generated')
    }

    return text.trim()
  }
}

/**
 * Generate text with streaming
 */
export async function generateStreaming(apiKey, prompt, onChunk, options = {}) {
  const { model = defaultModel, maxRetries = 3 } = options

  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        `${BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: options.temperature ?? 0.8,
              topK: options.topK ?? 40,
              topP: options.topP ?? 0.95,
              maxOutputTokens: options.maxTokens ?? 8192,
            }
          })
        }
      )

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error?.message || 'Failed to generate content'

        // Provide helpful context for common errors
        if (errorMessage.toLowerCase().includes('quota')) {
          throw new Error(`API quota exceeded. ${errorMessage}. Check your Gemini API usage limits at https://aistudio.google.com/`)
        }
        if (errorMessage.toLowerCase().includes('rate limit')) {
          throw new Error(`Rate limit hit. ${errorMessage}. Wait a moment and try again.`)
        }
        if (errorMessage.toLowerCase().includes('token')) {
          throw new Error(`Token limit error. ${errorMessage}. The prompt may be too long.`)
        }

        // Retry on overloaded errors
        if (errorMessage.toLowerCase().includes('overloaded') && attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        throw new Error(errorMessage)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let usageMetadata = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6)
            if (jsonStr.trim() === '[DONE]') continue

            try {
              const data = JSON.parse(jsonStr)
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) {
                fullText += text
                onChunk(fullText)
              }
              // Capture usage metadata (usually in last chunk)
              if (data.usageMetadata) {
                usageMetadata = data.usageMetadata
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }
      }

      if (!fullText) {
        throw new Error('No content generated')
      }

      return {
        text: fullText.trim(),
        usage: usageMetadata ? {
          promptTokens: usageMetadata.promptTokenCount,
          outputTokens: usageMetadata.candidatesTokenCount,
          totalTokens: usageMetadata.totalTokenCount
        } : null
      }
    } catch (error) {
      // Retry on overloaded errors
      if (error.message?.toLowerCase().includes('overloaded') && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}

/**
 * Test if an API key is valid
 */
export async function testKey(apiKey) {
  try {
    const response = await fetch(
      `${BASE_URL}/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "Hello" and nothing else.' }] }]
        })
      }
    )

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    return !!data.candidates?.[0]?.content?.parts?.[0]?.text
  } catch {
    return false
  }
}
