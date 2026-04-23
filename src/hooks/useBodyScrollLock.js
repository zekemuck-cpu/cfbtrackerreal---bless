import { useEffect } from 'react'

// Lock body scroll while a modal is open. When multiple modals stack, the
// lock is refcounted so closing an inner modal doesn't unlock the outer one.
let lockCount = 0
let savedOverflow = ''
let savedPaddingRight = ''

function acquire() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow
    savedPaddingRight = document.body.style.paddingRight
    // Reserve scrollbar width so page doesn't visually jump when the
    // scrollbar disappears.
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth
    if (scrollbarW > 0) {
      document.body.style.paddingRight = `${scrollbarW}px`
    }
    document.body.style.overflow = 'hidden'
  }
  lockCount++
}

function release() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow
    document.body.style.paddingRight = savedPaddingRight
  }
}

export function useBodyScrollLock(isOpen) {
  useEffect(() => {
    if (!isOpen) return
    acquire()
    return release
  }, [isOpen])
}
