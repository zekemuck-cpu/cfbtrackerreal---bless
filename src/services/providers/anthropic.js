/**
 * Anthropic (Claude) AI Provider
 */

export const name = 'anthropic'
export const displayName = 'Anthropic (Claude)'

export const models = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest, most capable' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest, most affordable' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Previous flagship' }
]

export const defaultModel = 'claude-3-5-haiku-20241022'

const BASE_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

/**
 * Generate text (non-streaming)
 */
export async function generate(apiKey, prompt, options = {}) {
  const { model = defaultModel, maxRetries = 3 } = options

  if (!apiKey) {
    throw new Error('No API key provided')
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.8
      })
    })

    if (!response.ok) {
      const error = await response.json()
      const errorMessage = error.error?.message || 'Failed to generate content'

      // Retry on overloaded errors
      if ((response.status === 529 || errorMessage.toLowerCase().includes('overloaded')) && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text

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
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens ?? 4096,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? 0.8,
          stream: true
        })
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error?.message || 'Failed to generate content'

        // Provide helpful context for common errors
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your Anthropic API key.')
        }
        if (response.status === 429 || errorMessage.toLowerCase().includes('rate limit')) {
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw new Error(`Rate limit hit. ${errorMessage}. Wait a moment and try again.`)
        }
        if (response.status === 529 || errorMessage.toLowerCase().includes('overloaded')) {
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw new Error(`API overloaded. ${errorMessage}. Please try again shortly.`)
        }

        throw new Error(errorMessage)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let usage = null

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

              // Handle different event types
              if (data.type === 'content_block_delta') {
                const delta = data.delta?.text
                if (delta) {
                  fullText += delta
                  onChunk(fullText)
                }
              }

              // Capture usage from message_delta event (final)
              if (data.type === 'message_delta' && data.usage) {
                usage = {
                  promptTokens: null, // Not provided in delta
                  outputTokens: data.usage.output_tokens,
                  totalTokens: null
                }
              }

              // Capture full usage from message_start
              if (data.type === 'message_start' && data.message?.usage) {
                usage = {
                  promptTokens: data.message.usage.input_tokens,
                  outputTokens: usage?.outputTokens || 0,
                  totalTokens: null
                }
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }
      }

      // Calculate total tokens if we have both
      if (usage && usage.promptTokens !== null && usage.outputTokens !== null) {
        usage.totalTokens = usage.promptTokens + usage.outputTokens
      }

      if (!fullText) {
        throw new Error('No content generated')
      }

      return {
        text: fullText.trim(),
        usage
      }
    } catch (error) {
      // Retry on overloaded/rate limit errors
      if ((error.message?.toLowerCase().includes('overloaded') || error.message?.toLowerCase().includes('rate limit')) && attempt < maxRetries - 1) {
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
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "Hello" and nothing else.' }]
      })
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    return !!data.content?.[0]?.text
  } catch {
    return false
  }
}
