/**
 * AI Provider Registry
 * Unified interface for multiple AI providers (Gemini, OpenAI, Anthropic, OpenRouter)
 */

import * as gemini from './gemini'
import * as openai from './openai'
import * as anthropic from './anthropic'
import * as openrouter from './openrouter'

// Provider registry
export const PROVIDERS = {
  gemini,
  openai,
  anthropic,
  openrouter
}

// Provider display info for UI
export const PROVIDER_INFO = {
  gemini: {
    name: 'gemini',
    displayName: 'Google Gemini',
    description: 'Free tier available (1,500 requests/day)',
    keyPrefix: 'AIza',
    keyPlaceholder: 'AIza...',
    setupUrl: 'https://aistudio.google.com/apikey',
    setupSteps: [
      'Click the link below to open Google AI Studio',
      'Sign in with your Google account if prompted',
      'Click "Create API key" button',
      'Select "Create API key in new project" (or choose existing project)',
      'Copy the key (starts with "AIza") and paste it below'
    ]
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    description: 'GPT-4o and other models (paid)',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-proj-...',
    setupUrl: 'https://platform.openai.com/api-keys',
    setupSteps: [
      'Click the link below to open OpenAI API Keys page',
      'Sign in or create an OpenAI account',
      'Click "+ Create new secret key"',
      'Give it a name (optional) and click "Create secret key"',
      'Copy the key immediately (it won\'t be shown again) and paste below'
    ]
  },
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic (Claude)',
    description: 'Claude models (paid)',
    keyPrefix: 'sk-ant-',
    keyPlaceholder: 'sk-ant-...',
    setupUrl: 'https://console.anthropic.com/settings/keys',
    setupSteps: [
      'Click the link below to open Anthropic Console',
      'Sign in or create an Anthropic account',
      'You\'ll land on the API Keys page',
      'Click "Create Key", give it a name, and click "Create Key"',
      'Copy the key (starts with "sk-ant-") and paste it below'
    ]
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Access multiple models with one API key (pay per use)',
    keyPrefix: 'sk-or-',
    keyPlaceholder: 'sk-or-...',
    setupUrl: 'https://openrouter.ai/settings/keys',
    setupSteps: [
      'Click the link below to open OpenRouter',
      'Sign in with Google, GitHub, or create an account',
      'You\'ll land on the API Keys page',
      'Click "Create Key", give it a name, and click "Create"',
      'Copy the key (starts with "sk-or-") and paste it below'
    ]
  }
}

/**
 * Get a provider by name
 */
export function getProvider(providerName) {
  const provider = PROVIDERS[providerName]
  if (!provider) {
    throw new Error(`Unknown AI provider: ${providerName}`)
  }
  return provider
}

/**
 * Get provider info for UI
 */
export function getProviderInfo(providerName) {
  return PROVIDER_INFO[providerName] || null
}

/**
 * Get all available provider names
 */
export function getAvailableProviders() {
  return Object.keys(PROVIDERS)
}

/**
 * Get models for a provider
 */
export function getModelsForProvider(providerName) {
  const provider = PROVIDERS[providerName]
  return provider?.models || []
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(providerName) {
  const provider = PROVIDERS[providerName]
  return provider?.defaultModel || null
}

/**
 * Unified text generation (non-streaming)
 */
export async function generateText(providerName, apiKey, prompt, options = {}) {
  const provider = getProvider(providerName)
  return provider.generate(apiKey, prompt, options)
}

/**
 * Unified text generation (streaming)
 */
export async function generateTextStreaming(providerName, apiKey, prompt, onChunk, options = {}) {
  const provider = getProvider(providerName)
  return provider.generateStreaming(apiKey, prompt, onChunk, options)
}

/**
 * Test an API key for a provider
 */
export async function testApiKey(providerName, apiKey) {
  const provider = getProvider(providerName)
  return provider.testKey(apiKey)
}
