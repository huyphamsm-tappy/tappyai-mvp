'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { playTappyChime } from '@/lib/notifications/chime'
import { createClient } from '@/lib/supabase/client'
import { reconcilePushIdentity } from '@/lib/notifications/pushIdentity'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from(Array.from(rawData).map(c => c.charCodeAt(0)))
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [reconciling, setReconciling] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── `subscribed` means "registered TO ME", and only the server can say so ──
  //
  // 🚨 It used to be `setSubscribed(!!browserSubscription)`. A Web Push
  // subscription belongs to the BROWSER, not the account, so after an account
  // switch this reported ON for someone whose row did not exist — they were
  // never prompted to subscribe, never got their own notifications, and kept
  // receiving the previous account's. That silent-ON is what made the defect
  // self-sustaining, so the browser object is now only a CREDENTIAL SOURCE and
  // the answer comes from the server.
  //
  // FAIL CLOSED. Unknown (offline, 500, still in flight) renders OFF. Being
  // wrongly OFF costs one tap to re-enable; being wrongly ON is the bug.
  const reconcile = useCallback(async () => {
    setReconciling(true)
    try {
      const mine = await reconcilePushIdentity()
      setSubscribed(mine === true)
    } finally {
      setReconciling(false)
    }
  }, [])

  // Permission is genuinely a browser fact, so it is read from the browser.
  // Ownership is not, so it is not.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported')
      setReconciling(false)
      return
    }
    setPermission(Notification.permission as PushPermission)
  }, [])

  // Ownership is asked ONCE PER IDENTITY, driven by the session rather than by
  // mount. Supabase emits INITIAL_SESSION on subscribe, so this covers the first
  // load as well — asking on mount too would send two identical writes on every
  // page view. The same browser with a different person signed in is a different
  // question, and gets asked again.
  const lastUid = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null
      if (uid === lastUid.current) return
      lastUid.current = uid
      if (!uid) {
        // Signed out: nobody owns anything here, and there is no session to
        // authorise asking. Answer locally rather than provoking a 401.
        setSubscribed(false)
        setReconciling(false)
        return
      }
      void reconcile()
    })
    return () => data.subscription.unsubscribe()
  }, [reconcile])

  // Listen for foreground push messages from the SW → play chime
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      // The message is a trigger, not data: it says an identity notification arrived and carries
      // nothing from it. playTappyChime takes no arguments, so there is nothing to pass anyway.
      if (event.data?.type === 'TAPPY_IDENTITY') playTappyChime()
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  const subscribe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser.')
      }

      const perm = await Notification.requestPermission()
      setPermission(perm as PushPermission)
      if (perm !== 'granted') throw new Error('Permission denied')

      const reg = await navigator.serviceWorker.register('/push-sw.js')
      await navigator.serviceWorker.ready

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('VAPID public key not configured')

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      })

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error('Failed to save subscription')

      // Still a server answer, not a browser one: this 200 IS the server saying
      // the claim is now the caller's (the database transferred it away from any
      // previous owner in the same statement).
      setSubscribed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/push-sw.js')
      const sub = await reg?.pushManager.getSubscription()
      // Read the endpoint BEFORE unsubscribing — afterwards the subscription is
      // gone and there is nothing left to name in the request.
      const credential = sub?.endpoint ?? null
      if (sub) await sub.unsubscribe()

      // Explicit provider: this surface is the web one. Without it the route
      // still defaults to webpush, but saying so keeps a future Android caller
      // from inheriting the wrong default by copying this line.
      //
      // The credential scopes the delete to THIS device, so switching push off
      // here cannot switch it off on another browser the same account subscribed
      // from later.
      await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'webpush', ...(credential ? { credential } : {}) }),
      })
      setSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  return { permission, subscribed, reconciling, loading, error, subscribe, unsubscribe }
}
