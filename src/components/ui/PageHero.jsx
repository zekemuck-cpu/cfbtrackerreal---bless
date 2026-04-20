/**
 * PageHero primitive. Neutral surface + typographic hierarchy — no team-color rail.
 *
 * Props:
 *   title       — string or ReactNode (rendered display-lg if string)
 *   eyebrow     — optional pre-title small label (all-caps)
 *   meta        — optional ReactNode rendered below title
 *   right       — optional ReactNode placed on the right (e.g. stat cluster)
 *   actions     — optional ReactNode below right (e.g. action buttons)
 *   children    — renders inside the hero body (below title+meta), e.g. tabs
 *
 * `accentColor` is accepted for backward compatibility and ignored.
 */
export default function PageHero({
  title,
  eyebrow,
  meta,
  right,
  actions,
  children,
  className = '',
}) {
  return (
    <section className={`card overflow-hidden mb-6 px-6 py-5 sm:px-8 sm:py-6 reveal ${className}`.trim()}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="label-sm text-txt-tertiary mb-1">{eyebrow}</div>
          )}
          {typeof title === 'string' ? (
            <h1 className="display-lg text-txt-primary leading-none m-0 break-words">
              {title}
            </h1>
          ) : (
            title
          )}
          {meta && (
            <div className="mt-2 label-sm text-txt-tertiary flex items-center gap-2 flex-wrap">
              {meta}
            </div>
          )}
        </div>
        {(right || actions) && (
          <div className="flex flex-col sm:items-end gap-3 flex-shrink-0">
            {right}
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
          </div>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </section>
  )
}
