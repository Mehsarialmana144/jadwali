import { useEffect, useRef } from 'react'

/**
 * Re-runs `callback` whenever the tab/window regains focus or becomes
 * visible again, so data doesn't go stale after switching tabs, editing
 * in another tab, or leaving the app idle. Registers listeners once and
 * always calls the latest callback (no need to memoize it).
 */
export function useRefetchOnFocus(callback) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    function handleFocus() {
      callbackRef.current()
    }
    function handleVisibility() {
      if (document.visibilityState === 'visible') callbackRef.current()
    }
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])
}
