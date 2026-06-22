'use client'

import { useState } from 'react'
import { Star, Send, CheckCircle2, Loader2 } from 'lucide-react'

interface Props {
  placeId: string
  placeName: string
  placeAddress?: string
}

export function BookingReviewButton({ placeId, placeName, placeAddress }: Props) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!rating) { setError('Vui lòng chọn số sao.'); return }
    if (body.trim().length < 20) { setError('Đánh giá phải có ít nhất 20 ký tự.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, placeName, placeAddress, rating, body: body.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
      } else {
        setError(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.')
      }
    } catch {
      setError('Không thể kết nối. Vui lòng thử lại.')
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs font-medium">
        <CheckCircle2 size={13} />
        Đã đánh giá!
      </div>
    )
  }

  return (
    <div className="w-full">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
        >
          <Star size={12} />
          Đánh giá
        </button>
      ) : (
        <div className="w-full bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Đánh giá {placeName}</p>

          {/* Star picker */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setRating(s)}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(0)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  size={22}
                  className={s <= (hover || rating)
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-gray-300 dark:text-gray-600'}
                />
              </button>
            ))}
          </div>

          {/* Body */}
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Chia sẻ trải nghiệm của bạn... (20–500 ký tự)"
            className="w-full rounded-xl border border-amber-200 dark:border-amber-800/40 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{body.trim().length}/500</span>
          </div>

          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Gửi đánh giá
            </button>
            <button
              onClick={() => { setOpen(false); setError('') }}
              className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
