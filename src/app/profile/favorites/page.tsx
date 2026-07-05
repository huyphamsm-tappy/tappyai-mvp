'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Heart, Bookmark } from 'lucide-react'
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

interface SavedReview {
  id: string
  place_name: string | null
  body: string | null
  photos: string[] | null
  thumbnail: string | null
  content_type: string | null
  saved_at: string
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
  const [saved, setSaved] = useState<SavedReview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Saved library (MFS 4.11) = Favorites (places, a preference signal) + saved reviews
    // (a reference/bookmark), fetched together and shown as two kinds under one home.
    Promise.all([
      fetch('/api/favorites').then(r => { if (!r.ok) throw new Error('fav'); return r.json() }),
      fetch('/api/reviews/saved').then(r => { if (!r.ok) throw new Error('saved'); return r.json() }),
    ])
      .then(([fav, sv]) => { setFavorites(fav.favorites || []); setSaved(sv.reviews || []) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  function handleDeleted(placeId: string) {
    setFavorites(prev => prev.filter(f => f.place_id !== placeId))
  }

  const total = favorites.length + saved.length

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
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{total} mục</span>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 animate-pulse h-20" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-20">
            <p className="font-semibold text-gray-700 dark:text-gray-200">Không tải được mục đã lưu</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Vui lòng thử lại sau nhé.</p>
          </div>
        )}

        {!loading && !error && total === 0 && (
          <div className="text-center py-20">
            <span className="text-5xl">♡</span>
            <p className="mt-4 font-semibold text-gray-700 dark:text-gray-200">Chưa lưu gì cả</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 px-6">
              Bấm ♡ để lưu địa điểm yêu thích, hoặc 🔖 để lưu bài viết muốn xem lại — tất cả sẽ nằm ở đây.
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

        {/* Favorites — places the user loves (a preference signal, MFS 4.10) */}
        {!loading && !error && favorites.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1">
              <Heart size={12} className="text-red-400" /> Địa điểm yêu thích
            </h2>
            {favorites.map(f => (
              <div key={f.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-3 pr-2">
                <Link href={buildServiceUrl(f)} className="flex items-center gap-3 flex-1 min-w-0 p-4">
                  <span className="text-2xl shrink-0">{TYPE_EMOJI[f.place_type] || '📍'}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{f.place_name}</p>
                    {f.place_address && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{f.place_address}</p>
                    )}
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Đã lưu {formatDate(f.created_at)}</p>
                  </div>
                </Link>
                <FavoriteDeleteButton placeId={f.place_id} onDeleted={() => handleDeleted(f.place_id)} />
              </div>
            ))}
          </section>
        )}

        {/* Saved reviews — a reference/bookmark to revisit (MFS 4.9) */}
        {!loading && !error && saved.length > 0 && (
          <section className="space-y-3 pt-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1">
              <Bookmark size={12} className="text-primary-500" /> Bài viết đã lưu
            </h2>
            {saved.map(s => (
              <Link
                key={s.id}
                href={`/reviews/${s.id}`}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-3 p-4"
              >
                {s.thumbnail || (s.photos && s.photos[0]) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnail || s.photos![0]} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-xl shrink-0">📝</span>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{s.place_name || 'Bài viết'}</p>
                  {s.body && <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 mt-0.5">{s.body}</p>}
                  <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Đã lưu {formatDate(s.saved_at)}</p>
                </div>
              </Link>
            ))}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
