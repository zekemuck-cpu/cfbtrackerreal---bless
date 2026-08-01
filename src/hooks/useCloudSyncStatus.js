import { useState, useEffect } from 'react'
import { subscribeSyncStatus, getSyncStatus } from '../utils/cloudSyncStatus'

// Subscribe to the cloud write-sync health store. Returns
// { stalled, stalledCount, oldestStalledAt, lastError } and re-renders only
// when that user-visible shape changes (see cloudSyncStatus.emit).
export function useCloudSyncStatus() {
  const [status, setStatus] = useState(getSyncStatus)
  useEffect(() => subscribeSyncStatus(setStatus), [])
  return status
}
