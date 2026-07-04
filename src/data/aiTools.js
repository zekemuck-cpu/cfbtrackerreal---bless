// AI assistants the user can send the copied prompt + screenshots to. The
// "Open" button in every data-entry modal links to the selected one; the choice
// is remembered on the device. All of these accept image uploads + a text prompt.
export const AI_TOOLS = [
  { key: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { key: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com' },
  { key: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { key: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com' },
  { key: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai' },
]

const STORAGE_KEY = 'preferredAiTool'

export function getPreferredAiKey() {
  try {
    const k = localStorage.getItem(STORAGE_KEY)
    if (k && AI_TOOLS.some((t) => t.key === k)) return k
  } catch { /* localStorage blocked */ }
  return AI_TOOLS[0].key // Claude by default
}

export function setPreferredAiKey(key) {
  try { localStorage.setItem(STORAGE_KEY, key) } catch { /* noop */ }
}

export function getAiTool(key) {
  return AI_TOOLS.find((t) => t.key === key) || AI_TOOLS[0]
}

// Image-generation AIs — for the score-graphic flow (the user copies a prompt,
// generates an image, then pastes it back). Each links to that tool's image
// surface. Remembered on the device SEPARATELY from the text-prompt AI (its own
// storage key) since the best image model isn't necessarily the best text one.
export const IMAGE_AI_TOOLS = [
  { key: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/images/' },
  { key: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { key: 'grok', name: 'Grok', url: 'https://grok.com' },
  { key: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/images/create' },
]
