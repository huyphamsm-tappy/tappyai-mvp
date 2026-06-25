'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Header from '@/components/Header'
import BottomNav from '@/components/BottomNav'
import { Star, Camera, X, ArrowLeft, Loader2, CheckCircle } from 'lucide-react'

const MAX_PHOTOS = 3

export default function NewReviewPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [placeName, setPlaceName] = useState('')
  const [placeAddress, setPlaceAddress] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<string[]>([]) // uploaded URLs
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Tối đa ${MAX_PHOTOS} ảnh`)
      return
    }

    setUploading(true)
    setError('')
    try {
      const uploaded: string[] = []
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/reviews/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Lỗi tải ảnh')
        uploaded.push(data.url)
      }
      setPhotos(prev => [...prev, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải ảnh')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [photos.length])

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!rating) { setError('Vui lòng chọn số sao'); return }
    if (!placeName.trim()) { setError('Vui lòng nhập tên địa điểm'); return }
    if (body.trim().length < 20) { setError('Đánh giá phải từ 20 ký tự trở lên'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: `community_${placeName.trim().toLowerCase().replace(/\s+/g, '_')}`,
          placeName: placeName.trim(),
          placeAddress: placeAddress.trim(),
          rating,
          body: body.trim(),
          photos,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi gửi đánh giá')

      setSuccess(true)
      setTimeout(() => router.push('/reviews'), 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi đánh giá')
    } finally {
      setSubmitting(false)
    }
  }

  const displayRating = hoverRating || rating
  const ratingLabels = ['', 'Tệ', 'Không tốt', 'Bình thường', 'Tốt', 'Tuyệt vời']

  if (success) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center px-8">
          <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Đã đăng review!</h2>
          <p className="text-gray-500">Cảm ơn bạn đã chia sẻ trải nghiệm 🙏</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header />

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-950/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/reviews" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="font-bold text-gray-900 dark:text-white">Viết review</h1>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Place name */}
          <div className="card p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Tên địa điểm <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={placeName}
                onChange={e => setPlaceName(e.target.value)}
                placeholder="Quán cà phê, nhà hàng, spa..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 dark:text-white"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Địa chỉ <span className="text-gray-400 text-xs font-normal">(tuỳ chọn)</span>
              </label>
              <input
                type="text"
                value={placeAddress}
                onChange={e => setPlaceAddress(e.target.value)}
                placeholder="Quận 1, TP.HCM..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 dark:text-white"
                maxLength={200}
              />
            </div>
          </div>

          {/* Star rating */}
          <div className="card p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Đánh giá <span className="text-red-400">*</span>
            </p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(i)}
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={`${i} sao`}
                >
                  <Star
                    size={32}
                    className={`transition-colors ${i <= displayRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700'}`}
                  />
                </button>
              ))}
              {displayRating > 0 && (
                <span className="ml-2 text-sm font-medium text-amber-500">{ratingLabels[displayRating]}</span>
              )}
            </div>
          </div>

          {/* Review body */}
          <div className="card p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Trải nghiệm của bạn <span className="text-red-400">*</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Chia sẻ cảm nhận thật của bạn về địa điểm này... (ít nhất 20 ký tự)"
              rows={5}
              maxLength={500}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none dark:text-white"
            />
            <p className={`text-right text-xs mt-1 ${body.length > 480 ? 'text-red-400' : 'text-gray-400'}`}>
              {body.length}/500
            </p>
          </div>

          {/* Photos */}
          <div className="card p-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Ảnh <span className="text-gray-400 text-xs font-normal">(tối đa {MAX_PHOTOS} ảnh)</span>
            </p>

            <div className="flex gap-2 flex-wrap">
              {photos.map((url, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <Image src={url} alt={`Ảnh ${i + 1}`} fill className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                    aria-label="Xoá ảnh"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}

              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <>
                      <Camera size={20} />
                      <span className="text-xs">Thêm ảnh</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoSelect}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || uploading || !rating || !placeName || body.length < 20}
            className="w-full py-3.5 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Đang đăng...
              </>
            ) : (
              'Đăng review'
            )}
          </button>

          <p className="text-center text-xs text-gray-400">
            Review sẽ hiển thị công khai trên feed TappyAI
          </p>
        </form>
      </main>

      <BottomNav />
    </div>
  )
}
