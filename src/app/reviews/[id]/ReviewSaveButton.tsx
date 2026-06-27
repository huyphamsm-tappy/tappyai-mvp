'use client'

import { useState } from 'react'
import { Bookmark } from 'lucide-react'

export default function ReviewSaveButton({
  reviewId,
  initialSaved,
}: {
  reviewId: string
  initialSaved: boolean
}) {
  const [saved, setSaved] = useState(initialSaved)
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    if (pending) return
    setPending(true)
    const prev = saved
    setSaved(!prev)
    try {
      await fetch(`/api/reviews/${reviewId}/save`, { method: 'POST' })
    } catch {
      setSaved(prev)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
      aria-label={saved ? 'Bỏ lưu' : 'Lưu'}
    >
      <Bookmark
        size={24}
        className={saved ? 'fill-amber-400 text-amber-400' : 'text-white'}
        style={{ transition: 'all 0.15s' }}
      />
      <span className="text-white text-xs font-semibold drop-shadow-md">Lưu</span>
    </button>
  )
}
