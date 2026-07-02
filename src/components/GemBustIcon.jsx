// Small faceted diamond/gem icon shown next to a prospect's name when their
// Gem/Bust scouting read is set — green for Gem, red for Bust.
export default function GemBustIcon({ type, className = '' }) {
  if (type !== 'Gem' && type !== 'Bust') return null
  const color = type === 'Gem' ? '#22E065' : '#E3242B'
  return (
    <svg
      viewBox="0 0 24 22"
      title={type}
      className={`absolute -top-2.5 -right-3 w-3.5 h-3.5 ${className}`}
    >
      <polygon points="7,3 17,3 22,8 12,21 2,8" fill={color} />
      <path d="M2,8 L22,8 M7,3 L12,8 M17,3 L12,8 M12,8 L12,21" stroke="rgba(0,0,0,0.4)" strokeWidth="0.7" fill="none" strokeLinejoin="round" />
    </svg>
  )
}
