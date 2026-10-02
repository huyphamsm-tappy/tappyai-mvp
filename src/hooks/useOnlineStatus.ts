'use client'

import { useEffect, useState } from 'react'

/**
 * P4-15 — is the browser online?
 *
 * `navigator.onLine` is a weak signal: it reports whether the device has a network interface, not
 * whether the internet is reachable. It is deliberately used here only to DISABLE a control and
 * explain why, never to conclude that a request failed — a false "online" simply means the user
 * gets the normal error path, which already preserves their message. Treating it as authoritative
 * would be worse than not using it at all.
 *
 * Starts optimistic (`true`) so a server render and the first client paint agree; the real value
 * arrives in the effect. Anything else produces a hydration mismatch and a flash of "you are
 * offline" for every user.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  return online
}
