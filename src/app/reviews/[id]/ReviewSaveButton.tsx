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
    setSaved(!prev) // optimistic
    try {
      const res = await fetch(`/api/reviews/${reviewId}/save`, { method: 'POST' })

      // fetch() only REJECTS on a network failure — a 401 or 500 resolves
      // normally. Without these checks the optimistic setSaved above was never
      // undone on an error: this page is public (getSaveStatus returns false
      // for anonymous visitors rather than gating), so an anonymous user could
      // tap Save, watch the bookmark fill amber, and have nothing saved and no
      // login prompt. The feed's own save handler already guards this way
      // (see `save` in src/app/reviews/page.tsx); this page had drifted from it.
      if (res.status === 401) {
        setSaved(prev)
        // Browse-only policy: reading is public, interacting needs an account.
        window.location.href = '/login?returnTo=' + encodeURIComponent(`/reviews/${reviewId}`)
        return
      }
      if (!res.ok) throw new Error('save_failed')

      // Trust the server's reported state over the optimistic guess.
      const data = await res.json().catch(() => null)
      if (typeof data?.saved === 'boolean') setSaved(data.saved)
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
