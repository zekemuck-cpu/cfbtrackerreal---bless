/**
 * Type-safe comparison utilities for week/year values
 * These handle the common case where values might be strings or numbers
 */

/**
 * Compare two week values for equality (handles string/number mismatch)
 * @param {string|number} a - First week value
 * @param {string|number} b - Second week value
 * @returns {boolean} True if weeks are equal
 */
export function isSameWeek(a, b) {
  if (a == null || b == null) return false
  return Number(a) === Number(b)
}

/**
 * Compare two year values for equality (handles string/number mismatch)
 * @param {string|number} a - First year value
 * @param {string|number} b - Second year value
 * @returns {boolean} True if years are equal
 */
export function isSameYear(a, b) {
  if (a == null || b == null) return false
  return Number(a) === Number(b)
}

/**
 * Check if a game matches the given week and year
 * @param {Object} game - Game object with week and year properties
 * @param {string|number} week - Week to match
 * @param {string|number} year - Year to match
 * @returns {boolean} True if game matches
 */
export function isGameInWeekYear(game, week, year) {
  if (!game) return false
  return isSameWeek(game.week, week) && isSameYear(game.year, year)
}

/**
 * Check if a game is in the given year
 * @param {Object} game - Game object with year property
 * @param {string|number} year - Year to match
 * @returns {boolean} True if game is in year
 */
export function isGameInYear(game, year) {
  if (!game) return false
  return isSameYear(game.year, year)
}
