'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import LikeListSheet from '@/app/reviews/LikeListSheet'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function ReviewLikeButton({
  reviewId,
  initialLiked,
  initialCount,
}: {
  reviewId: string
  initialLiked: boolean
  initialCount: number
}) {
  const { t } = useTranslation()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)
    const prev = liked
    const next = !prev
    setLiked(next)
    setCount(c => c + (next ? 1 : -1)) // optimistic
    const revert = () => { setLiked(prev); setCount(c => c + (prev ? 1 : -1)) }
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, { method: 'POST' })

      // fetch() only REJECTS on a network failure — a 401 or 500 resolves
      // normally, so without these guards `data.liked` is undefined on an error
      // body and the reconcile branch below decrements a SECOND time on top of
      // the optimistic one: unlike + 500 dropped the count by 2 while the
      // server never changed. The feed's own handler already guards exactly
      // this (see `like` in src/app/reviews/page.tsx); this page had drifted.
      if (res.status === 401) {
        revert()
        // Browse-only policy: reading is public, interacting needs an account.
        window.location.href = '/login?returnTo=' + encodeURIComponent(`/reviews/${reviewId}`)
        return
      }
      if (!res.ok) throw new Error('like_failed')

      const data = await res.json().catch(() => null)
      if (typeof data?.liked !== 'boolean') throw new Error('bad_response')

      // Reconcile with the server's real state (they differ only if this
      // page's initial state was already stale, e.g. liked in another tab).
      setLiked(data.liked)
      if (data.liked !== next) setCount(c => c + (data.liked ? 1 : -1))
    } catch {
      revert()
    } finally {
      setPending(false)
    }
  }

  // 🔑 The heart and the count are two controls, not one. They used to share a single <button>,
  // so tapping the number toggled the like — a user asking "who liked this?" silently unliked the
  // post instead. The heart keeps the toggle; the number opens the like list.
  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={toggle}
          className="active:scale-90 transition-transform"
          aria-label={liked ? 'Bỏ thích' : 'Thích'}
        >
          <Heart
            size={28}
            className={liked ? 'fill-[#fe2c55] text-[#fe2c55]' : 'text-white'}
            style={{ transition: 'all 0.15s' }}
          />
        </button>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          aria-label={t('reviews.likesOpen')}
          // Same hit-area rule as the feed rail — see `RAction` in feedShared.tsx for the
          // measurement and for why the box is 44 wide but only 24 tall.
          className="text-white text-xs font-semibold drop-shadow-md min-w-[44px] min-h-[24px] flex items-center justify-center active:scale-90 transition-transform"
        >
          {count}
        </button>
      </div>
      {listOpen && <LikeListSheet reviewId={reviewId} onClose={() => setListOpen(false)} />}
    </>
  )
}
