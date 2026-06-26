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
      className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform"
      aria-label={liked ? 'Bỏ thích' : 'Thích'}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: liked ? 'rgba(255,107,53,0.25)' : 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          transition: 'background 0.2s',
        }}
      >
        <Heart
          size={24}
          className={liked ? 'fill-[#ff6b35] text-[#ff6b35]' : 'text-white'}
          style={{ transition: 'all 0.2s' }}
        />
      </div>
      <span className="text-white text-xs font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
        {count}
      </span>
    </button>
  )
}
