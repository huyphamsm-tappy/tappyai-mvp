'use client'

// The people who like a post — opened by tapping the like COUNT.
//
// 🔑 It is the count's control, never the heart's. The heart stays the like toggle on every
// surface; this sheet is what the number does. Before it existed the number had no behaviour of
// its own, so tapping it did whatever its parent did: toggled the like, or navigated to the post.
//
// Shell deliberately copied from SoundSheet — the other overlay that opens on top of the black
// feed AND on top of the light/dark pages. Same bottom-sheet-on-mobile / centred-dialog-on-desktop
// geometry and the same surface colours, so this is not a second visual language.

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { X, Loader2, Heart } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/useTranslation'

export interface Liker {
  id: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

interface LikesResponse {
  likers: Liker[]
  next_cursor: string | null
}

export default function LikeListSheet({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [likers, setLikers] = useState<Liker[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (before: string | null) => {
    try {
      const qs = before ? `?before=${encodeURIComponent(before)}` : ''
      const res = await fetch(`/api/reviews/${reviewId}/likes${qs}`)
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as LikesResponse
      // Append on paging, replace on first load — `before` doubles as "is this a page 2+".
      setLikers(prev => (before ? [...prev, ...(data.likers ?? [])] : data.likers ?? []))
      setCursor(data.next_cursor ?? null)
    } catch {
      setError(true)
    }
  }, [reviewId])

  useEffect(() => {
    let alive = true
    setLoading(true)
    load(null).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [load])

  // Escape closes, matching every other dismissible overlay in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    await load(cursor)
    setLoadingMore(false)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reviews.likesTitle')}
        className="fixed z-[70] bg-white dark:bg-gray-900 overflow-y-auto
          bottom-0 left-0 right-0 rounded-t-3xl max-h-[70dvh]
          md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[420px] md:max-h-[70vh] md:rounded-2xl md:shadow-2xl"
      >
        <div className="sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur z-10 px-5 pt-3 pb-3 flex items-center justify-center border-b border-gray-100 dark:border-gray-800">
          <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full md:hidden" />
          <p className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5 mt-1 md:mt-0">
            <Heart size={14} className="fill-[#fe2c55] text-[#fe2c55]" />
            {t('reviews.likesTitle')}
          </p>
          <button onClick={onClose} aria-label={t('reviews.likesClose')} className="absolute right-4 top-3 p-1">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-3 pb-8">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 size={22} className="animate-spin text-gray-400" />
            </div>
          )}

          {!loading && error && (
            <p className="text-center text-sm text-gray-500 py-8">{t('reviews.likesError')}</p>
          )}

          {!loading && !error && likers.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">{t('reviews.likesEmpty')}</p>
          )}

          {!loading && !error && likers.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {likers.map(u => {
                // A liker with no profile row (an anonymous session) still counts, so it is shown
                // under the same fallback name the feed and the inbox already use for them.
                const name = u.full_name || t('reviews.anonymous')
                return (
                  <li key={u.id} className="flex items-center gap-3 py-2.5">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt=""
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full flex-shrink-0 bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</span>
                  </li>
                )
              })}
            </ul>
          )}

          {!loading && !error && cursor && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-3 w-full text-sm font-semibold text-gray-500 dark:text-gray-400 py-2 disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('reviews.likesMore')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
