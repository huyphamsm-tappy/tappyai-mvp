'use client'
import { useEffect } from 'react'

const LOCATION_TTL = 30 * 60 * 1000 // re-request after 30 min

export default function LocationProvider() {
  useEffect(() => {
    if (!navigator.geolocation) return
    try {
      const existing = localStorage.getItem('tappy_location')
      if (existing) {
        const parsed = JSON.parse(existing)
        if (parsed.ts && Date.now() - parsed.ts < LOCATION_TTL) return
      }
    } catch {}
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
        localStorage.setItem('tappy_location', JSON.stringify({ lat, lng, address, ts: Date.now() }))
      },
      () => { /* denied — do nothing */ },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])
  return null
}
