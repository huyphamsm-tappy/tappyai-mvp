'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as musicService from '../services/musicService'
import type { MusicTrack } from '../types/track'

const DEBOUNCE_MS = 300

interface UseMusicSearchResult {
  query: string
  setQuery: (query: string) => void
  results: MusicTrack[]
  loading: boolean
  error: string | null
}

// Search hook: debounces input so typing doesn't fire a request per
// keystroke, and ignores stale responses if a newer query supersedes it.
export function useMusicSearch(): UseMusicSearchResult {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MusicTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    let cancelled = false
    const timer = setTimeout(() => {
      const thisRequest = ++requestId.current
      musicService
        .searchTracks({ query: trimmed })
        .then((result) => {
          if (cancelled || thisRequest !== requestId.current) return
          setResults(result.tracks)
        })
        .catch(() => {
          if (cancelled || thisRequest !== requestId.current) return
          setError('Không thể tìm nhạc')
        })
        .finally(() => {
          if (!cancelled && thisRequest === requestId.current) setLoading(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const updateQuery = useCallback((next: string) => setQuery(next), [])

  return { query, setQuery: updateQuery, results, loading, error }
}
