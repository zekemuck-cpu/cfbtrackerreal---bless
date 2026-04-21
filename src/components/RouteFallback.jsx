export default function RouteFallback() {
  return (
    <div
      className="flex items-center justify-center py-16"
      style={{ animation: 'suspense-delay 0.001s linear 150ms forwards', opacity: 0 }}
    >
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{
          borderColor: 'var(--surface-4)',
          borderTopColor: 'var(--text-secondary)',
        }}
        aria-label="Loading page"
      />
    </div>
  )
}
