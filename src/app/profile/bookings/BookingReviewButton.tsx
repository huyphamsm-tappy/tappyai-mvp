'use client'

import { useState, useRef } from 'react'
import { Star, Send, CheckCircle2, Loader2, ImagePlus, X } from 'lucide-react'

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
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    const allowed = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .slice(0, 3 - photos.length)
    const newItems = allowed.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPhotos(prev => [...prev, ...newItems].slice(0, 3))
  }

  function removePhoto(idx: number) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSubmit = async () => {
    if (!rating) { setError('Vui lòng chọn số sao.'); return }
    if (body.trim().length < 20) { setError('Đánh giá phải có ít nhất 20 ký tự.'); return }
    setError('')
    setLoading(true)
    try {
      // Upload photos first
      const uploadedUrls: string[] = []
      for (const { file } of photos) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/reviews/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (res.ok && data.url) uploadedUrls.push(data.url)
        else { setError(data.error || 'Không thể tải ảnh lên.'); setLoading(false); return }
      }

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, placeName, placeAddress, rating, body: body.trim(), photos: uploadedUrls }),
      })
      const data = await res.json()
      if (res.ok) {
        setDone(true)
        photos.forEach(p => URL.revokeObjectURL(p.preview))
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
            <span className="text-xs text-gray-400">{body.trim().length}/500</span>
          </div>

          {/* Photo upload */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {photos.map((p, idx) => (
                <div key={idx} className="relative w-16 h-16 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-amber-200 dark:border-amber-800/40" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 text-white flex items-center justify-center"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {photos.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 flex flex-col items-center justify-center gap-0.5 text-amber-500 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
                >
                  <ImagePlus size={16} />
                  <span className="text-xs font-medium">Thêm ảnh</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            {photos.length > 0 && (
              <p className="text-xs text-gray-400">Tối đa 3 ảnh · Mỗi ảnh dưới 5MB</p>
            )}
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
              onClick={() => { setOpen(false); setError(''); photos.forEach(p => URL.revokeObjectURL(p.preview)); setPhotos([]) }}
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
