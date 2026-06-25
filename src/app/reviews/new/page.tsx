'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Star, Camera, X, ArrowLeft, Loader2, CheckCircle, MapPin, Plus } from 'lucide-react'

const MAX_PHOTOS = 6

export default function NewReviewPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const [body, setBody] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [placeName, setPlaceName] = useState('')
  const [showPlaceInput, setShowPlaceInput] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) {
      setError('Toi da ' + MAX_PHOTOS + ' anh')
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
        if (!res.ok) throw new Error(data.error || 'Loi tai anh')
        uploaded.push(data.url)
      }
      setPhotos(prev => [...prev, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loi tai anh')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [photos.length])

  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx))

  const canPost = body.trim().length > 0 || photos.length > 0

  const handleSubmit = async () => {
    if (!canPost) return
    setError('')
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?returnTo=/reviews/new'); return }

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: placeName.trim()
            ? 'community_' + placeName.trim().toLowerCase().replace(/\s+/g, '_')
            : 'post_' + Date.now(),
          placeName: placeName.trim() || 'Chia se',
          placeAddress: '',
          rating: rating || 0,
          body: body.trim(),
          photos,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Loi dang bai')
      setSuccess(true)
      setTimeout(() => router.push('/reviews'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Loi dang bai')
    } finally {
      setSubmitting(false)
    }
  }

  const displayRating = hoverRating || rating
  const ratingLabels = ['', 'Te', 'Khong tot', 'Binh thuong', 'Tot', 'Tuyet voi']

  if (success) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center px-8">
          <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Da dang bai!</h2>
          <p className="text-gray-500">Cam on ban da chia se</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col">
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link href="/reviews" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-white">Bai viet moi</h1>
        <button
          onClick={handleSubmit}
          disabled={!canPost || submitting || uploading}
          className="px-4 py-1.5 rounded-full bg-primary-500 hover:bg-primary-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white text-sm font-semibold transition-all"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : 'Dang'}
        </button>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
        <div>
          {photos.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full aspect-square max-h-72 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-primary-500 hover:border-primary-300 transition-all"
            >
              {uploading ? (
                <Loader2 size={32} className="animate-spin text-primary-400" />
              ) : (
                <>
                  <Camera size={40} />
                  <span className="text-sm font-medium">Them anh / video</span>
                  <span className="text-xs text-gray-400">Toi da {MAX_PHOTOS} anh</span>
                </>
              )}
            </button>
          ) : (
            <div className={"grid gap-1.5 " + (photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
              {photos.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                  <Image src={url} alt={"Anh " + (i + 1)} fill className="object-cover" sizes="33vw" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X size={13} className="text-white" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-primary-500 hover:border-primary-300 transition-all disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={24} />}
                </button>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
        </div>

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Chia se trai nghiem, cam nhan cua ban..."
          rows={4}
          maxLength={1000}
          className="w-full px-0 py-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed"
        />
        {body.length > 0 && (
          <p className="text-right text-xs text-gray-400">{body.length}/1000</p>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800" />

        <div>
          <button
            type="button"
            onClick={() => setShowPlaceInput(v => !v)}
            className="flex items-center gap-2 text-sm text-primary-500 font-medium hover:text-primary-600 transition-colors"
          >
            <MapPin size={16} />
            {placeName ? placeName : 'Them dia diem'}
            {placeName && <X size={14} className="text-gray-400" onClick={e => { e.stopPropagation(); setPlaceName(''); setShowPlaceInput(false) }} />}
          </button>
          {showPlaceInput && (
            <input
              type="text"
              value={placeName}
              onChange={e => setPlaceName(e.target.value)}
              placeholder="Ten quan, nha hang, dia diem..."
              autoFocus
              maxLength={100}
              className="mt-2 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => { setShowRating(v => !v); if (showRating) setRating(0) }}
            className="flex items-center gap-2 text-sm text-primary-500 font-medium hover:text-primary-600 transition-colors"
          >
            <Star size={16} />
            {rating > 0 ? (rating + ' sao - ' + ratingLabels[rating]) : 'Them danh gia sao'}
            {rating > 0 && <X size={14} className="text-gray-400" onClick={e => { e.stopPropagation(); setRating(0) }} />}
          </button>
          {showRating && (
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(i => (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => { setRating(i); setShowRating(false) }}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <Star size={30} className={"transition-colors " + (i <= displayRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700')} />
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
