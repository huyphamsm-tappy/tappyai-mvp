'use client'

import { useEffect } from 'react'
import { buildRecord, DIAG_KEY, DIAG_MAX, type ClientErrorRecord } from '@/lib/diag/clientErrorRecord'

// ── TEMPORARY DIAGNOSTIC — remove with the P0 fix ───────────────────────────
//
// PASSIVE observer for the iOS-Safari-only client exception (Zalo session → Chat → BottomNav
// "Trang chủ" → Next's error page). It records; it does not intervene.
//
// 🔑 It must NOT change behaviour:
//   · listeners are added with no `preventDefault()` and no truthy return, so the error keeps
//     propagating and Next still renders exactly the page the owner is seeing;
//   · it is not an ErrorBoundary and catches nothing during render;
//   · every write is inside try/catch so a full or disabled sessionStorage cannot itself throw
//     and become a second bug;
//   · it renders null, so it adds no DOM and cannot affect layout or hydration.
//
// 🔒 Nothing is sent anywhere. Records stay in this tab's sessionStorage and are read by the
// owner at /diag.
export default function ClientErrorDiag() {
  useEffect(() => {
    const write = (rec: ClientErrorRecord) => {
      try {
        const prev = JSON.parse(sessionStorage.getItem(DIAG_KEY) || '[]') as ClientErrorRecord[]
        sessionStorage.setItem(DIAG_KEY, JSON.stringify([...prev, rec].slice(-DIAG_MAX)))
      } catch { /* storage unavailable or full — a diagnostic must never throw */ }
    }

    // A session cookie is httpOnly, so this reports only whether the app THINKS it is signed in,
    // from a non-sensitive DOM signal. Never the user, the id, the email or any token.
    const authed = () => {
      try { return document.cookie.includes('sb-') } catch { return false }
    }

    const onError = (e: ErrorEvent) => {
      write(buildRecord({
        kind: 'error',
        name: e.error?.name,
        message: e.message,
        stack: e.error?.stack,
        pathname: location.pathname,
        visibility: document.visibilityState,
        authed: authed(),
        at: new Date().toISOString(),
      }))
    }

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string; stack?: string } | undefined
      write(buildRecord({
        kind: 'unhandledrejection',
        name: r?.name,
        message: r?.message ?? String(e.reason ?? ''),
        stack: r?.stack,
        pathname: location.pathname,
        visibility: document.visibilityState,
        authed: authed(),
        at: new Date().toISOString(),
      }))
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
