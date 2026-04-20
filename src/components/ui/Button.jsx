import { forwardRef } from 'react'
import { getContrastTextColor } from '../../utils/colorUtils'

/**
 * Button primitive.
 *
 * Variants:
 *   primary   — team-primary fill, contrast text (for CTAs; use sparingly)
 *   secondary — surface-3 fill with surface-5 border (default action)
 *   ghost     — no fill, hover surface-3
 *   danger    — danger fill
 *   outline   — transparent fill with surface-5 border
 *
 * Sizes: sm | md (default) | lg
 *
 * The primary variant reads team color from --team-primary, so it
 * automatically picks up the page's team theme. Pass an explicit
 * `accentColor` to override.
 */
const SIZE_CLASSES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold ' +
  'transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ' +
  'active:scale-[0.97] will-change-transform ' +
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 whitespace-nowrap'

const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    accentColor,
    className = '',
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md

  let variantClass = ''
  let style = {}

  switch (variant) {
    case 'primary': {
      const fill = accentColor || 'var(--team-primary)'
      const text = accentColor ? getContrastTextColor(accentColor) : undefined
      variantClass = 'hover:opacity-90 active:opacity-100 focus-visible:ring-team-primary'
      style = {
        backgroundColor: fill,
        color: text || 'var(--text-primary)',
      }
      break
    }
    case 'danger':
      variantClass = 'bg-danger text-white hover:opacity-90 focus-visible:ring-danger'
      break
    case 'outline':
      variantClass = 'bg-transparent border border-surface-5 text-txt-primary hover:bg-surface-3 focus-visible:ring-surface-5'
      break
    case 'ghost':
      variantClass = 'bg-transparent text-txt-primary hover:bg-surface-3 focus-visible:ring-surface-5'
      break
    case 'secondary':
    default:
      variantClass = 'bg-surface-3 border border-surface-5 text-txt-primary hover:bg-surface-4 focus-visible:ring-surface-5'
      break
  }

  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE} ${sizeClass} ${variantClass} ${className}`.trim()}
      style={style}
      {...props}
    >
      {children}
    </button>
  )
})

export default Button
