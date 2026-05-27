import { rematchStrategy } from './rematchStrategy'
import { gamePreview } from './gamePreview'
import { playerSpotlight } from './playerSpotlight'
import { positionGroup } from './positionGroup'
import { seasonReview } from './seasonReview'
import { customSandbox } from './customSandbox'

export const TEMPLATES = [
  rematchStrategy,
  gamePreview,
  playerSpotlight,
  positionGroup,
  seasonReview,
  customSandbox,
]

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || null
}
