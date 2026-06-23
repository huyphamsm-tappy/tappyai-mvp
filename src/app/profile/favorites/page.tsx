'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react'
import BottomNav from '@/components/BottomNav'
import { FavoriteDeleteButton } from './FavoriteDeleteButton'

const TYPE_EMOJI: Record<string, string> = {
  food: '🍜', spa: '💆', hotel: '🏨', travel: '✈️',
  shopping: '🛍️', entertainment: '🎉', cafe: '☕',
}

interface Favorite {
  id: string
  place_id: string
  place_name: string
  place_address: string
  place_type: string
  created_at: string
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function buildServiceUrl(f: Favorite) {
  const slug = f.place_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'place'
  const params = new URLSearchParams({
    name: f.place_name,
    ...(f.place_address && { address: f.place_address }),
    ...(f.place_type && { type: f.place_type }),
    placeId: f.place_id,
  })
  return `/service/${slug}?${params.toString()}`
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/favorites')
      .then(r => r.json())
      .then(d => setFavorites(d.favorites || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleDeleted(placeId: string) {
    setFavorites(prev => prev.filter(f => f.place_id !== placeId))
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
        <Link href="/profile" className="p-1.5 -ml-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Heart size={16} className="text-red-400" />
          Đã lưu
        </h1>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{favorites.length} địa điểm</span>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 animate-pulse h-20" />
            ))}
          </div>
        )}

        {!loading && favorites.length === 0 && (
          <div className="text-center py-20">
            <span className="text-5xl">♡</span>
            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-200">Chưa có địa điểm yêu thích</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 px-6">
              Trong chat, bấm ♡ cạnh nút đặt chỗ để lưu địa điểm vào đây.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 mt-5 px-5 py-2.5 rounded-2xl bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors"
            >
              Khám phá ngay
              <ChevronRight size={16} />
            </Link>
          </div>
        )}

        {!loading && favorites.map(f => (
          <div key={f.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-3 pr-2">
            <Link href={buildServiceUrl(f)} className="flex items-center gap-3 flex-1 min-w-0 p-4">
              <span className="text-2xl shrink-0">{TYPE_EMOJI[f.place_type] || '📍'}</span>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{f.place_name}</p>
                {f.place_address && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{f.place_address}</p>
                )}
                <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">Đã lưu {formatDate(f.created_at)}</p>
              </div>
            </Link>
            <FavoriteDeleteButton placeId={f.place_id} onDeleted={() => handleDeleted(f.place_id)} />
          </div>
        ))}
      </main>

      <BottomNav />
    </div>
  )
}
