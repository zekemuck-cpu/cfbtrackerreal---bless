/**
 * Card primitive. Three elevation tiers. No decorative team-color accent edges —
 * hierarchy comes from typography + surface tier, not colored stripes.
 *
 * Variants:
 *   default  — surface-2, no border. (flat)
 *   bordered — surface-2 + 1px surface-4 border.
 *   elevated — surface-3 + surface-5 border + shadow. For floating / modal-adjacent.
 *
 * Padding:
 *   padding="none" | "sm" | "md" (default) | "lg".
 *
 * The `accent` prop is accepted for backward compatibility and ignored.
 */
export default function Card({
  variant = 'bordered',
  // eslint-disable-next-line no-unused-vars
  accent,
  padding = 'md',
  interactive = false,
  className = '',
  children,
  as: Tag = 'div',
  ...rest
}) {
  const variantClass = {
    default: 'card',
    bordered: 'card-bordered',
    elevated: 'card-elevated',
  }[variant] || 'card-bordered'

  const paddingClass = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  }[padding] || 'p-4'

  const interactiveClass = interactive
    ? 'lift cursor-pointer hover:border-surface-5'
    : ''

  return (
    <Tag
      className={`${variantClass} ${paddingClass} ${interactiveClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  )
}
