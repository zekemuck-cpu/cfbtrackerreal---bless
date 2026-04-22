/**
 * InlineYearSelect — a year picker disguised as an inline word inside a
 * title. Inherits font, size, weight, and color from its parent so it
 * looks like plain text, with a small chevron affordance to signal it's
 * interactive.
 *
 * Intended usage inside a hero title:
 *
 *   <PageHero
 *     title={
 *       <TitleWithYear
 *         year={displayYear}
 *         years={availableYears}
 *         onChange={setDisplayYear}
 *         label="Top 25"
 *       />
 *     }
 *   />
 */
export default function InlineYearSelect({
  value,
  years,
  onChange,
  className = '',
  ariaLabel = 'Select year',
}) {
  const safeYears = Array.isArray(years) && years.length > 0 ? years : [value]

  return (
    <span className={`relative inline-flex items-baseline ${className}`}>
      <span className="tabular-nums" aria-hidden="true">
        {value}
      </span>
      {/* Dropdown chevron — baseline-aligned, muted */}
      <svg
        className="ml-1 self-center w-[0.5em] h-[0.5em] opacity-60 transition-opacity group-hover:opacity-100"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
          clipRule="evenodd"
        />
      </svg>
      {/* Native select sits on top, invisible but clickable, so the
          year reads as part of the headline while staying keyboard and
          screen-reader accessible. */}
      <select
        value={value}
        onChange={(e) => onChange?.(parseInt(e.target.value, 10))}
        aria-label={ariaLabel}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
      >
        {safeYears.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  )
}

/**
 * TitleWithYear — convenience wrapper that renders the inline year picker
 * followed by a static title string, styled consistently across pages.
 * Use `<PageHero title={<TitleWithYear ... />} />`.
 */
export function TitleWithYear({
  year,
  years,
  onChange,
  label,
  ariaLabel,
  className = '',
}) {
  return (
    <h1
      className={`group display-lg text-txt-primary leading-none m-0 break-words inline-flex items-baseline flex-wrap gap-x-3 ${className}`.trim()}
    >
      <InlineYearSelect
        value={year}
        years={years}
        onChange={onChange}
        ariaLabel={ariaLabel || `Select year for ${label}`}
      />
      <span>{label}</span>
    </h1>
  )
}
