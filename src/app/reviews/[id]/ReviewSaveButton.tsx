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

  // 🚨 `fetch` only REJECTS on a network failure — 401 / 403 / 500 all resolve. So awaiting it
  // bare left the optimistic flip standing on every refused save: an anonymous visitor (403), a
  // signed-out one (401) and a server error all produced a filled amber bookmark for a row that
  // was never written. The catch existed but could not run.
  //
  // The server's own answer wins, exactly as the feed's `save()` already does with the same
  // `{ saved: boolean }` contract; anything else is treated as a failure and rolled back.
  const toggle = async () => {
    if (pending) return
    setPending(true)
    const prev = saved
    setSaved(!prev)
    try {
      const res = await fetch(`/api/reviews/${reviewId}/save`, { method: 'POST' })
      if (!res.ok) throw new Error('save_failed')
      const data = await res.json().catch(() => null)
      if (typeof data?.saved !== 'boolean') throw new Error('save_failed')
      setSaved(data.saved)
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
