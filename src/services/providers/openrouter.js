/**
 * OpenRouter AI Provider
 * Unified API access to multiple AI models
 */

export const name = 'openrouter'
export const displayName = 'OpenRouter'

export const models = [
  // Anthropic
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Latest Claude' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', description: 'Fastest Claude' },
  // OpenAI
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flagship' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
  // Meta
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', description: 'Meta open model' },
  // Google
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', description: 'Google via OpenRouter' },
  // Mistral
  { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', description: 'Mistral flagship' },
  // DeepSeek
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', description: 'Very affordable' }
]

export const defaultModel = 'anthropic/claude-3.5-haiku'

const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'

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
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'CFB Dynasty Tracker'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature ?? 0.8,
        max_tokens: options.maxTokens ?? 4096,
        top_p: options.topP ?? 0.95
      })
    })

    if (!response.ok) {
      const error = await response.json()
      const errorMessage = error.error?.message || 'Failed to generate content'

      // Retry on rate limit errors
      if ((response.status === 429 || errorMessage.toLowerCase().includes('rate limit')) && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content

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
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'CFB Dynasty Tracker'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? 0.8,
          max_tokens: options.maxTokens ?? 4096,
          top_p: options.topP ?? 0.95,
          stream: true
        })
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error?.message || 'Failed to generate content'

        // Provide helpful context for common errors
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenRouter API key.')
        }
        if (response.status === 429 || errorMessage.toLowerCase().includes('rate limit')) {
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw new Error(`Rate limit hit. ${errorMessage}. Wait a moment and try again.`)
        }
        if (response.status === 402) {
          throw new Error('Insufficient credits. Please add credits to your OpenRouter account.')
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

              // Get content delta (OpenAI-compatible format)
              const delta = data.choices?.[0]?.delta?.content
              if (delta) {
                fullText += delta
                onChunk(fullText)
              }

              // Capture usage if provided
              if (data.usage) {
                usage = {
                  promptTokens: data.usage.prompt_tokens,
                  outputTokens: data.usage.completion_tokens,
                  totalTokens: data.usage.total_tokens
                }
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
        usage
      }
    } catch (error) {
      // Retry on rate limit errors
      if (error.message?.toLowerCase().includes('rate limit') && attempt < maxRetries - 1) {
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
    // Use a free/cheap model for testing
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'CFB Dynasty Tracker'
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say "Hello" and nothing else.' }],
        max_tokens: 10
      })
    })

    if (!response.ok) {
      return false
    }

    const data = await response.json()
    return !!data.choices?.[0]?.message?.content
  } catch {
    return false
  }
}
