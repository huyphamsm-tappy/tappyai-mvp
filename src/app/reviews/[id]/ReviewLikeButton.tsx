'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'

export default function ReviewLikeButton({
  reviewId,
  initialLiked,
  initialCount,
}: {
  reviewId: string
  initialLiked: boolean
  initialCount: number
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)
    const prev = liked
    const next = !prev
    setLiked(next)
    setCount(c => c + (next ? 1 : -1))
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, { method: 'POST' })
      const data = await res.json()
      setLiked(data.liked)
      if (data.liked !== next) setCount(c => c + (data.liked ? 1 : -1))
    } catch {
      setLiked(prev)
      setCount(c => c + (prev ? 1 : -1))
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
      aria-label={liked ? 'Bỏ thích' : 'Thích'}
    >
      <Heart
        size={28}
        className={liked ? 'fill-[#fe2c55] text-[#fe2c55]' : 'text-white'}
        style={{ transition: 'all 0.15s' }}
      />
      <span className="text-white text-xs font-semibold drop-shadow-md">{count}</span>
    </button>
  )
}
