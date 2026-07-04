'use client'

import { useEffect, useState } from 'react'
import * as musicService from '../services/musicService'
import type { MusicCategory } from '../types/category'

interface UseMusicCategoriesResult {
  categories: MusicCategory[]
  loading: boolean
  error: string | null
}

// Loads the ordered, active category list once per mount.
export function useMusicCategories(): UseMusicCategoriesResult {
  const [categories, setCategories] = useState<MusicCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    musicService
      .getCategories()
      .then((result) => {
        if (!cancelled) setCategories(result)
      })
      .catch(() => {
        if (!cancelled) setError('Không thể tải danh mục nhạc')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { categories, loading, error }
}
