import { forwardRef } from 'react'

/**
 * Form primitives: Input, Select, Textarea, and FormField wrapper.
 *
 * Usage:
 *   <FormField label="Jersey #" hint="Optional">
 *     <Input value={jersey} onChange={...} placeholder="12" />
 *   </FormField>
 *
 * All share the same surface-2 + surface-4 border visual language,
 * with focus ring in team-primary. Sizes: sm | md (default) | lg.
 */

const INPUT_BASE =
  'w-full bg-surface-2 text-txt-primary placeholder:text-txt-tertiary transition-shadow focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-60 disabled:cursor-not-allowed'

const SIZE_CLASS = {
  sm: 'px-2 py-1 text-xs rounded-sm',
  md: 'px-3 py-2 text-sm rounded-md',
  lg: 'px-4 py-2.5 text-base rounded-md',
}

function borderStyle(hasError) {
  return {
    border: `1px solid ${hasError ? 'var(--accent-error)' : 'var(--surface-4)'}`,
  }
}

export const Input = forwardRef(function Input(
  { size = 'md', hasError, className = '', style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`${INPUT_BASE} ${SIZE_CLASS[size] || SIZE_CLASS.md} ${className}`.trim()}
      style={{ ...borderStyle(hasError), ...style }}
      {...rest}
    />
  )
})

export const Textarea = forwardRef(function Textarea(
  { size = 'md', hasError, className = '', style, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`${INPUT_BASE} ${SIZE_CLASS[size] || SIZE_CLASS.md} resize-y ${className}`.trim()}
      style={{ ...borderStyle(hasError), ...style }}
      {...rest}
    />
  )
})

export const Select = forwardRef(function Select(
  { size = 'md', hasError, className = '', style, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`${INPUT_BASE} ${SIZE_CLASS[size] || SIZE_CLASS.md} appearance-none pr-8 bg-no-repeat ${className}`.trim()}
      style={{
        ...borderStyle(hasError),
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\' stroke=\'%236e6e78\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M6 8l4 4 4-4\'/%3E%3C/svg%3E")',
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1.25rem',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  )
})

/**
 * FormField — label + control + optional hint or error message.
 * Wrap any of the above inputs (or a third-party control like DropdownSelect).
 */
export default function FormField({
  label,
  hint,
  error,
  required,
  className = '',
  children,
  htmlFor,
}) {
  const showError = !!error
  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      {label && (
        <label htmlFor={htmlFor} className="label-sm text-txt-secondary">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      {children}
      {showError ? (
        <div className="text-xs text-danger">{error}</div>
      ) : hint ? (
        <div className="text-xs text-txt-tertiary">{hint}</div>
      ) : null}
    </div>
  )
}
