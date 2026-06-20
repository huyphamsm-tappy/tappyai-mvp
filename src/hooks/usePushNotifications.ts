'use client'

import { useState, useEffect, useCallback } from 'react'
import { playTappyChime } from '@/lib/notifications/chime'

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialise state from browser on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission as PushPermission)

    // Check if already subscribed
    navigator.serviceWorker.getRegistration('/push-sw.js').then(async reg => {
      if (!reg) return
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    })
  }, [])

  // Listen for foreground push messages from the SW → play chime
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'TAPPY_PUSH') playTappyChime()
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
      if (sub) await sub.unsubscribe()

      await fetch('/api/notifications/subscribe', { method: 'DELETE' })
      setSubscribed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  return { permission, subscribed, loading, error, subscribe, unsubscribe }
}
