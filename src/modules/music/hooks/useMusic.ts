'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as musicService from '../services/musicService'
import type { MusicTrack } from '../types/track'

interface UseMusicOptions {
  categoryId?: string
  limit?: number
}

interface UseMusicResult {
  tracks: MusicTrack[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

// Browse hook: paginated track listing, optionally filtered by category.
export function useMusic(options: UseMusicOptions = {}): UseMusicResult {
  const { categoryId, limit } = options
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    setPage(0)
    setTracks([])
  }, [categoryId])

  useEffect(() => {
    let cancelled = false
    const thisRequest = ++requestId.current
    setLoading(true)
    setError(null)

    musicService
      .browseTracks({ categoryId, page, limit })
      .then((result) => {
        if (cancelled || thisRequest !== requestId.current) return // unmounted or stale response, ignore
        setTracks((prev) => (page === 0 ? result.tracks : [...prev, ...result.tracks]))
        setHasMore(result.hasMore)
      })
      .catch(() => {
        if (cancelled || thisRequest !== requestId.current) return
        setError('Không thể tải danh sách nhạc')
      })
      .finally(() => {
        if (!cancelled && thisRequest === requestId.current) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [categoryId, page, limit])

  const loadMore = useCallback(() => {
    if (!loading && hasMore) setPage((p) => p + 1)
  }, [loading, hasMore])

  return { tracks, loading, error, hasMore, loadMore }
}
