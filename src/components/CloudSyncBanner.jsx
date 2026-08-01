import { useEffect, useState } from 'react'
import { useCloudSyncStatus } from '../hooks/useCloudSyncStatus'

// A persistent, hard-to-miss banner shown while the browser is genuinely
// OFFLINE. This is the visible counterpart to the silent settleOrProceed
// grace period: offline writes are durably queued by persistentLocalCache and
// still show "saved", but they only exist on THIS device until it reconnects —
// closing the browser forever, clearing site data, or switching devices before
// then loses them. Text-based, no decorative icons, per the project UI
// guidelines.
//
// NOTE: the earlier version of this banner keyed off stalled server ACKS and
// false-positived badly (a wedged WebChannel stops acks even though writes
// are safe and still syncing), so it was disabled. navigator.onLine cannot
// false-positive that way: offline is offline. The stalled-ack detection
// stays suppressed; the cloudSyncStatus store is kept for a future revisit.
export default function CloudSyncBanner() {
  // Subscribed for the store side effects / future stalled revisit; the
  // stalled signal is deliberately unused (see note above).
  useCloudSyncStatus()
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-[9998] px-4 py-3 sm:px-6"
      style={{ margin: 0, backgroundColor: '#7c2d12', borderTop: '1px solid #b45309' }}
    >
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-sm font-semibold text-amber-50">
          You&apos;re offline
        </p>
        <p className="text-xs text-amber-100/90 mt-0.5 leading-relaxed">
          Changes are being saved on this device and will sync to the cloud when
          your connection returns. Until then they exist only here — don&apos;t clear
          this browser&apos;s data, and reconnect before switching devices.
        </p>
      </div>
    </div>
  )
}
