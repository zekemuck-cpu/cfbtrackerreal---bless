/**
 * OpenAI AI Provider
 */

export const name = 'openai'
export const displayName = 'OpenAI'

export const models = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable, multimodal' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous generation' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast, cheapest' }
]

export const defaultModel = 'gpt-4o-mini'

const BASE_URL = 'https://api.openai.com/v1/chat/completions'

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
        'Authorization': `Bearer ${apiKey}`
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
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature ?? 0.8,
          max_tokens: options.maxTokens ?? 4096,
          top_p: options.topP ?? 0.95,
          stream: true,
          stream_options: { include_usage: true }
        })
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMessage = error.error?.message || 'Failed to generate content'

        // Provide helpful context for common errors
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenAI API key.')
        }
        if (response.status === 429 || errorMessage.toLowerCase().includes('rate limit')) {
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw new Error(`Rate limit hit. ${errorMessage}. Wait a moment and try again.`)
        }
        if (errorMessage.toLowerCase().includes('quota')) {
          throw new Error(`API quota exceeded. ${errorMessage}. Check your OpenAI usage limits.`)
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

              // Get content delta
              const delta = data.choices?.[0]?.delta?.content
              if (delta) {
                fullText += delta
                onChunk(fullText)
              }

              // Capture usage (in final message with stream_options)
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
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
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
