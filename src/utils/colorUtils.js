/**
 * Convert hex color to RGB values
 */
export function hexToRgb(hex) {
  // Remove # if present
  hex = hex.replace('#', '')

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  return { r, g, b }
}

/**
 * Calculate relative luminance of a color
 * Based on WCAG guidelines
 */
export function getLuminance(r, g, b) {
  // Normalize RGB values
  const [rs, gs, bs] = [r, g, b].map(val => {
    val = val / 255
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  })

  // Calculate luminance
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Determine if a color is light or dark
 * Returns true if the color is light (needs dark text)
 */
export function isLightColor(hexColor) {
  const { r, g, b } = hexToRgb(hexColor)
  const luminance = getLuminance(r, g, b)

  // Threshold of 0.5 - colors with luminance > 0.5 are considered light
  return luminance > 0.5
}

/**
 * Is this color very dark (near-black / dark navy / dark maroon)?
 * Used to decide when a team logo sitting ON this color needs a white
 * plate behind it — a black-on-black logo otherwise vanishes. Threshold is
 * low (0.12) so only genuinely dark team colors trigger it; mid-tone team
 * colors (green, red, blue) leave logos plate-free.
 */
export function isDarkColor(hexColor, threshold = 0.12) {
  if (!hexColor || typeof hexColor !== 'string' || !hexColor.match(/^#[0-9A-Fa-f]{6}$/)) {
    return false
  }
  const { r, g, b } = hexToRgb(hexColor)
  return getLuminance(r, g, b) < threshold
}

/**
 * Get the appropriate text color (black or white) based on background color
 */
export function getContrastTextColor(backgroundColor) {
  // Handle undefined/null/invalid colors - default to black text
  if (!backgroundColor || typeof backgroundColor !== 'string' || !backgroundColor.match(/^#[0-9A-Fa-f]{6}$/)) {
    return '#000000'
  }
  return isLightColor(backgroundColor) ? '#000000' : '#ffffff'
}

/**
 * Calculate contrast ratio between two colors
 */
export function getContrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1)
  const rgb2 = hexToRgb(color2)

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b)
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b)

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Mix two colors together
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @param {number} ratio - Mix ratio (0 = all color1, 1 = all color2)
 */
export function mixColors(color1, color2, ratio) {
  const rgb1 = hexToRgb(color1)
  const rgb2 = hexToRgb(color2)

  const r = Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio)
  const g = Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio)
  const b = Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Get a dark modal background color based on team colors
 * If secondary is light, creates a dark tinted background using primary color
 * If secondary is already dark, uses it directly
 * @param {Object} teamColors - Object with primary and secondary colors
 * @returns {Object} Modal colors { background, text, accent, border, headerBg }
 */
export function getModalColors(teamColors) {
  const secondary = teamColors?.secondary || '#ffffff'
  const primary = teamColors?.primary || '#374151'

  const isSecondaryLight = isLightColor(secondary)
  const darkBase = '#1a1a2e' // Deep navy-gray

  let background, headerBg

  if (isSecondaryLight) {
    // Secondary is light (like white) - create a dark tinted background
    // Mix the primary color with dark base to create a subtle team-tinted dark background
    background = mixColors(darkBase, primary, 0.15)
    headerBg = mixColors(darkBase, primary, 0.25)
  } else {
    // Secondary is already dark - use it but ensure it's dark enough
    const { r, g, b } = hexToRgb(secondary)
    const luminance = getLuminance(r, g, b)

    if (luminance > 0.2) {
      // Slightly too light, darken it
      background = mixColors(secondary, darkBase, 0.5)
      headerBg = mixColors(secondary, darkBase, 0.3)
    } else {
      background = secondary
      headerBg = mixColors(secondary, primary, 0.2)
    }
  }

  return {
    background,
    headerBg,
    text: '#ffffff',
    textMuted: '#9ca3af', // gray-400
    accent: primary,
    border: mixColors(primary, '#ffffff', 0.3),
    inputBg: mixColors(background, '#000000', 0.3),
    inputBorder: mixColors(primary, '#ffffff', 0.2)
  }
}
