import { createContext, useCallback, useContext, useRef, useState } from 'react'
import Modal from './Modal'
import Button from './Button'

/**
 * Confirm dialog / replacement for window.confirm().
 *
 * Usage:
 *   <ConfirmProvider>{app}</ConfirmProvider>
 *   const { confirm } = useConfirm()
 *   const ok = await confirm({
 *     title: 'Revert Week',
 *     message: 'This will remove any game data from the current week. Continue?',
 *     confirmLabel: 'Revert',
 *     variant: 'danger',
 *   })
 *   if (!ok) return
 *
 * Returns a Promise<boolean>. Only one dialog shows at a time; a second
 * call resolves the first with `false` and replaces it.
 */

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolverRef = useRef(null)

  const confirm = useCallback((opts) => {
    // If a dialog is already open, resolve the old one with false.
    if (resolverRef.current) {
      try { resolverRef.current(false) } catch {}
      resolverRef.current = null
    }
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setState(opts)
    })
  }, [])

  const close = useCallback((result) => {
    if (resolverRef.current) {
      resolverRef.current(result)
      resolverRef.current = null
    }
    setState(null)
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <Modal
          isOpen
          onClose={() => close(false)}
          title={state.title || 'Confirm'}
          size={state.size || 'sm'}
          footer={
            <>
              <Button variant="ghost" onClick={() => close(false)}>
                {state.cancelLabel || 'Cancel'}
              </Button>
              <Button
                variant={state.variant === 'danger' ? 'danger' : 'primary'}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirmLabel || 'Confirm'}
              </Button>
            </>
          }
        >
          <p className="text-txt-secondary text-sm whitespace-pre-line m-0">
            {state.message}
          </p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    // Soft fallback: until the provider mounts, fall back to window.confirm
    // so existing call sites keep working.
    return {
      confirm: async ({ message }) => window.confirm(message),
    }
  }
  return ctx
}
