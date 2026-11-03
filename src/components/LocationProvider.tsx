'use client'
import { useEffect } from 'react'
import { readSessionFix, saveSessionFix } from '@/lib/location/currentLocation'

const LOCATION_TTL = 30 * 60 * 1000 // re-request after 30 min

export default function LocationProvider() {
  useEffect(() => {
    if (!navigator.geolocation) return
    // Round 42: only a fix taken in THIS tab session may skip the refresh; one stored by an earlier session is not a reason to skip.
    const existing = readSessionFix()
    if (existing?.ts && Date.now() - existing.ts < LOCATION_TTL) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        let address = ''
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'vi', 'User-Agent': 'TappyAI/1.0 (huypham.sm@gmail.com)' } }
          )
          if (resp.ok) {
            const data = await resp.json()
            address = (data?.display_name as string) || ''
          }
        } catch {}
        saveSessionFix({ lat, lng, address, ts: Date.now() })
      },
      () => { /* denied — do nothing */ },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])
  return null
}
