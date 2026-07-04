'use client'

import { useEffect, useRef, useState } from 'react'
import * as musicService from '../services/musicService'
import type { MusicTrack } from '../types/track'

interface UseMusicTrackResult {
  track: MusicTrack | null
  loading: boolean
  error: string | null
}

// Loads a single track by id.
export function useMusicTrack(trackId: string | null): UseMusicTrackResult {
  const [track, setTrack] = useState<MusicTrack | null>(null)
  const [loading, setLoading] = useState(!!trackId)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!trackId) {
      setTrack(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const thisRequest = ++requestId.current
    setLoading(true)
    setError(null)

    musicService
      .getTrack(trackId)
      .then((result) => {
        if (cancelled || thisRequest !== requestId.current) return
        setTrack(result)
      })
      .catch(() => {
        if (cancelled || thisRequest !== requestId.current) return
        setError('Không thể tải bài hát')
      })
      .finally(() => {
        if (!cancelled && thisRequest === requestId.current) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [trackId])

  return { track, loading, error }
}
