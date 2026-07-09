'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { upload } from '@vercel/blob/client'
import {
  Star, Camera, X, ArrowLeft, Loader2,
  MapPin, Plus, Video, Link2, XCircle, Music,
} from 'lucide-react'
import { TappyMascot } from '@/components/TappyMascot'
import {
  MusicPickerSheet, MusicThumbnail, MusicDuration, useMusicTrack,
  type MusicSelection,
} from '@/modules/music'
import { useTranslation } from '@/lib/i18n/useTranslation'

const MAX_PHOTOS = 6
const MAX_VIDEO_SIZE = 50 * 1024 * 1024   // 50 MB
const MAX_VIDEO_DURATION = 15              // seconds — the limit SHOWN to the user (hint + error)
// Actual reject threshold: a clip the user trimmed to "15s" often measures 15.04–15.9s
// once encoded, so accept a small tolerance above the advertised limit. This is a
// backend-only allowance — never surfaced in the UI (the user always sees 15s).
const MAX_VIDEO_DURATION_ACCEPT = 17      // seconds
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/* ─── helpers ─── */

function detectSource(url: string): 'youtube' | 'tiktok' | 'facebook' | null {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch')) return 'facebook'
  return null
}

function extractYoutubeId(url: string): string | null {
  return url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? null
}

// Reading duration/thumbnail from a <video> can hang forever if the browser loads
// metadata but never fires `onseeked` (seen with some .mov/codec files, esp. on
// mobile Safari). A timeout guarantees these promises always settle so the upload
// UI can never freeze at "Đang tạo thumbnail…". 20s is generous for a ≤50MB clip.
const MEDIA_READ_TIMEOUT_MS = 20000
const THUMB_TIMEOUT_MS = 8000        // hard cap on thumbnail decode/seek — never freeze the UI
const THUMB_UPLOAD_TIMEOUT_MS = 15000 // hard cap on the (best-effort) thumbnail blob upload

/* Structured pipeline instrumentation. Every video stage emits START, then
   SUCCESS or FAIL with elapsed TIME (ms) and, on failure, the ERROR. Prefixed
   so prod logs can be filtered with `[video-pipeline]`. */
type VStage =
  | 'select' | 'validate-format' | 'validate-size' | 'validate-duration'
  | 'thumbnail-generate' | 'thumbnail-upload' | 'video-upload' | 'ai-process' | 'submit-review'
function vstart(stage: VStage, extra?: Record<string, unknown>): number {
  console.info(`[video-pipeline] ${stage} START`, extra ?? {})
  return (typeof performance !== 'undefined' ? performance.now() : Date.now())
}
function vok(stage: VStage, t0: number, extra?: Record<string, unknown>) {
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  console.info(`[video-pipeline] ${stage} SUCCESS`, { ms, ...(extra ?? {}) })
}
function vfail(stage: VStage, t0: number, error: unknown, extra?: Record<string, unknown>) {
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  console.error(`[video-pipeline] ${stage} FAIL`, { ms, error: (error as Error)?.message ?? String(error), ...(extra ?? {}) })
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      fn()
    }
    const timer = setTimeout(() => done(() => reject(new Error('duration timeout'))), MEDIA_READ_TIMEOUT_MS)
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () => done(() => resolve(video.duration))
    video.onerror = () => done(() => reject(new Error('cannot read video')))
  })
}

function generateVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const ms = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    let drawn = false
    const finish = (fn: () => void, tag: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      console.info(`[video-pipeline:thumb] settle(${tag}) @${ms()}ms`)
      fn()
    }
    // Hard cap: guarantees the promise ALWAYS settles, so the UI can never
    // freeze at "Đang tạo thumbnail…" regardless of codec/format quirks.
    const timer = setTimeout(() => {
      console.warn(`[video-pipeline:thumb] TIMEOUT @${ms()}ms readyState=${video.readyState} dims=${video.videoWidth}x${video.videoHeight}`)
      finish(() => reject(new Error('thumbnail timeout')), 'timeout')
    }, THUMB_TIMEOUT_MS)

    const draw = (via: string) => {
      if (drawn || settled) return
      drawn = true
      console.info(`[video-pipeline:thumb] draw(${via}) @${ms()}ms dims=${video.videoWidth}x${video.videoHeight} rs=${video.readyState}`)
      try {
        // No renderable video track (audio-only, or an undecodable codec) —
        // fail gracefully so the caller continues WITHOUT a thumbnail.
        if (!video.videoWidth || !video.videoHeight) {
          finish(() => reject(new Error('no video dimensions')), 'no-dims'); return
        }
        const MAX_DIM = 1280
        const scale = Math.min(MAX_DIM / video.videoWidth, MAX_DIM / video.videoHeight, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { finish(() => reject(new Error('no 2d context')), 'no-ctx'); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        console.info(`[video-pipeline:thumb] drawImage ok @${ms()}ms → toBlob`)
        canvas.toBlob(
          blob => {
            console.info(`[video-pipeline:thumb] toBlob cb @${ms()}ms bytes=${blob?.size ?? 0}`)
            finish(() => (blob ? resolve(blob) : reject(new Error('toBlob null'))), 'toblob')
          },
          'image/jpeg',
          0.82,
        )
      } catch (e) {
        console.error(`[video-pipeline:thumb] draw threw @${ms()}ms`, e)
        finish(() => reject(e), 'draw-throw')
      }
    }

    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      console.info(`[video-pipeline:thumb] loadedmetadata @${ms()}ms dur=${video.duration} dims=${video.videoWidth}x${video.videoHeight}`)
      // Seek to a small, guaranteed-in-range time to force one decoded frame.
      // Seeking to 0.5 would be out of range for sub-0.5s clips (→ 'seeked'
      // never fires) and invalid when duration is Infinity/NaN.
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      const target = dur ? Math.min(0.1, dur / 2) : 0.1
      try {
        console.info(`[video-pipeline:thumb] set currentTime=${target} @${ms()}ms`)
        video.currentTime = target
      } catch (e) {
        console.warn(`[video-pipeline:thumb] currentTime threw @${ms()}ms — drawing current frame`, e)
        draw('metadata-fallback')
      }
    }
    video.onseeked = () => { console.info(`[video-pipeline:thumb] seeked @${ms()}ms`); draw('seeked') }
    video.onerror = () => {
      console.error(`[video-pipeline:thumb] video error @${ms()}ms`, video.error)
      finish(() => reject(new Error('video decode error')), 'error')
    }
    console.info(`[video-pipeline:thumb] start @${ms()}ms size=${file.size} type=${file.type}`)
    video.src = url
  })
}

// Displays a selected MusicSelection as a card (cover, title, artist,
// duration, remove). Fetches the track's own display metadata via
// useMusicTrack since MusicSelection itself only carries {trackId, startSec,
// volume}. Feature-owned composition of the Music Module's exported dumb
// display primitives — not a Music Module component.
function SelectedMusicCard({
  trackId, onReplace, onRemove,
}: { trackId: string; onReplace: () => void; onRemove: () => void }) {
  const { track } = useMusicTrack(trackId)
  const { t } = useTranslation()
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onReplace}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onReplace() } }}
      aria-label={t('reviewNew.selectedMusicAria')}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-left transition-colors hover:border-[#fe2c55]/50"
    >
      <MusicThumbnail coverUrl={track?.coverUrl ?? null} title={track?.title ?? ''} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{track?.title ?? t('reviewNew.loading')}</p>
        {track?.artist && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{track.artist}</p>}
      </div>
      {track && <MusicDuration seconds={track.durationSec} className="flex-shrink-0 text-xs text-gray-400" />}
      <button
        type="button"
        aria-label={t('reviewNew.removeMusic')}
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="flex-shrink-0 rounded-full p-1 text-gray-400 hover:text-red-500"
      >
        <X size={16} />
      </button>
    </div>
  )
}

/* ─── page ─── */

export default function NewReviewPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const uploadControllerRef = useRef<AbortController | null>(null)
  const supabase = createClient()

  /* shared */
  const [body, setBody] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [placeName, setPlaceName] = useState('')
  const [showPlaceInput, setShowPlaceInput] = useState(false)
  const [showRating, setShowRating] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  /* media mode */
  const [mediaMode, setMediaMode] = useState<'photo' | 'video' | 'url'>('photo')

  /* photo */
  const [photos, setPhotos] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)

  /* video upload */
  const [media_url, setMedia_url] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [thumbPreview, setThumbPreview] = useState('')
  // Revoke the thumbnail preview object URL on change / reset / unmount.
  useEffect(() => {
    if (!thumbPreview) return
    return () => URL.revokeObjectURL(thumbPreview)
  }, [thumbPreview])
  const [uploadProgress, setUploadProgress] = useState(0)
  type UploadStep = '' | 'thumb' | 'video' | 'ai' | 'done'
  const [uploadStep, setUploadStep] = useState<UploadStep>('')

  /* url source */
  const [source_url, setSource_url] = useState('')
  const [source_type, setSource_type] = useState<'youtube' | 'tiktok' | 'facebook'>('youtube')
  const [urlMeta, setUrlMeta] = useState<{ thumbnail_url: string; title: string } | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)

  /* ai suggestions */
  const [aiHashtags, setAiHashtags] = useState<string[]>([])

  /* music */
  const [music, setMusic] = useState<MusicSelection | null>(null)
  const [musicPickerOpen, setMusicPickerOpen] = useState(false)
  const [hasOpenedMusicPicker, setHasOpenedMusicPicker] = useState(false)
  const openMusicPicker = () => { setHasOpenedMusicPicker(true); setMusicPickerOpen(true) }

  // "Sử dụng âm thanh này" deep-link from a sound page (/reviews/new?sound=ID):
  // preselect that track so the composer opens with the soundtrack attached.
  // Read from window.location (not useSearchParams) so this statically-rendered
  // page needs no Suspense boundary. Defaults match the selection panel.
  useEffect(() => {
    const sound = new URLSearchParams(window.location.search).get('sound')
    if (sound) setMusic({ trackId: sound, startSec: 0, volume: 1 })
  }, [])

  const resetVideoState = () => {
    setMedia_url(''); setThumbnail(''); setThumbPreview('')
    setUploadStep(''); setUploadProgress(0); setAiHashtags([])
  }

  /* ─── Photo upload ─── */
  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) { setError(t('reviewNew.maxPhotos', { n: String(MAX_PHOTOS) })); return }
    setPhotoUploading(true); setError('')
    try {
      const uploaded: string[] = []
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/reviews/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('reviewNew.photoUploadError'))
        uploaded.push(data.url)
      }
      setPhotos(prev => [...prev, ...uploaded])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reviewNew.photoUploadError'))
    } finally {
      setPhotoUploading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }, [photos.length])

  /* ─── Video upload ─── */
  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (videoInputRef.current) videoInputRef.current.value = ''
    if (!file) return
    setError('')
    vstart('select', { name: file.name, sizeMB: +(file.size / 1048576).toFixed(2), type: file.type })

    /* Stage: validate — format / size / duration */
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      vfail('validate-format', performance.now(), new Error('unsupported type'), { type: file.type })
      setError(t('reviewNew.videoUnsupportedFormat')); return
    }
    if (file.size > MAX_VIDEO_SIZE) {
      vfail('validate-size', performance.now(), new Error('too large'), { sizeMB: +(file.size / 1048576).toFixed(2) })
      setError(t('reviewNew.videoTooLarge')); return
    }
    const tDur = vstart('validate-duration')
    let duration: number
    try { duration = await getVideoDuration(file); vok('validate-duration', tDur, { duration: +duration.toFixed(2) }) }
    catch (e) { vfail('validate-duration', tDur, e); setError(t('reviewNew.videoReadError')); return }
    // Reject on the tolerant threshold, but the error the user sees still says 15s.
    if (duration > MAX_VIDEO_DURATION_ACCEPT) {
      vfail('validate-duration', tDur, new Error('too long'), { duration: +duration.toFixed(2), max: MAX_VIDEO_DURATION_ACCEPT })
      setError(t('reviewNew.videoTooLong', { n: String(MAX_VIDEO_DURATION) })); return
    }

    resetVideoState()

    /* 1. Generate + upload thumbnail — best-effort. A poster frame is nice-to-have;
       if the browser can't decode one, the video must still upload and play. */
    setUploadStep('thumb')
    let thumbUrl = ''
    const tThumbGen = vstart('thumbnail-generate')
    try {
      const thumbBlob = await generateVideoThumbnail(file)
      vok('thumbnail-generate', tThumbGen, { bytes: thumbBlob.size })
      setThumbPreview(URL.createObjectURL(thumbBlob))
      const thumbFile = new File([thumbBlob], 'thumb.jpg', { type: 'image/jpeg' })
      const tThumbUp = vstart('thumbnail-upload')
      // Bound the (best-effort) thumbnail upload too: the 'thumb' UI state covers
      // this call, so a stalled blob upload would otherwise freeze the UI at
      // "Đang tạo thumbnail…" just as an unresolved decode would.
      const thumbAbort = new AbortController()
      const thumbTimer = setTimeout(() => thumbAbort.abort(), THUMB_UPLOAD_TIMEOUT_MS)
      try {
        const result = await upload(`thumbnails/${Date.now()}.jpg`, thumbFile, {
          access: 'public',
          handleUploadUrl: '/api/upload/video',
          clientPayload: 'thumbnail',
          abortSignal: thumbAbort.signal,
        })
        thumbUrl = result.url
        setThumbnail(thumbUrl)
        vok('thumbnail-upload', tThumbUp, { url: result.url })
      } catch (e) {
        vfail('thumbnail-upload', tThumbUp, e)
        throw e
      } finally {
        clearTimeout(thumbTimer)
      }
    } catch (e) {
      // Non-fatal: log and continue to the video upload without a poster thumbnail.
      vfail('thumbnail-generate', tThumbGen, e, { note: 'continuing without thumbnail' })
    }

    /* 2. Upload video with progress */
    const controller = new AbortController()
    uploadControllerRef.current = controller
    setUploadStep('video'); setUploadProgress(0)

    const tVideo = vstart('video-upload', { sizeMB: +(file.size / 1048576).toFixed(2), type: file.type })
    try {
      const ext = file.name.split('.').pop() || 'mp4'
      const result = await upload(`videos/${Date.now()}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/video',
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }: { percentage: number }) =>
          setUploadProgress(Math.round(percentage)),
      })
      setMedia_url(result.url)
      vok('video-upload', tVideo, { url: result.url })

      /* 3. AI processing (non-blocking — failure is OK) */
      setUploadStep('ai')
      const tAi = vstart('ai-process')
      try {
        const aiRes = await fetch('/api/explore/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thumbnail_url: thumbUrl,
            caption: body.trim() || undefined,
          }),
        })
        if (aiRes.ok) {
          const ai = await aiRes.json()
          if (Array.isArray(ai.hashtags) && ai.hashtags.length > 0) setAiHashtags(ai.hashtags)
          if (!body.trim() && typeof ai.caption === 'string' && ai.caption) setBody(ai.caption)
          vok('ai-process', tAi, { hashtags: Array.isArray(ai.hashtags) ? ai.hashtags.length : 0 })
        } else {
          vfail('ai-process', tAi, new Error(`HTTP ${aiRes.status}`), { note: 'non-blocking' })
        }
      } catch (e) { vfail('ai-process', tAi, e, { note: 'non-blocking' }) }

      setUploadStep('done')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        vfail('video-upload', tVideo, e, { note: 'user aborted' })
        setError(t('reviewNew.uploadCancelled'))
      } else {
        vfail('video-upload', tVideo, e)
        setError(t('reviewNew.videoUploadError'))
      }
      resetVideoState()
    } finally {
      uploadControllerRef.current = null
    }
  }

  const cancelUpload = () => uploadControllerRef.current?.abort()

  /* ─── URL source ─── */
  const triggerUrlAI = async (thumbnail_url: string, title: string) => {
    if (!thumbnail_url && !title) return
    try {
      const aiRes = await fetch('/api/explore/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thumbnail_url: thumbnail_url || undefined,
          title: title || undefined,
          caption: body.trim() || undefined,
        }),
      })
      if (aiRes.ok) {
        const ai = await aiRes.json()
        if (Array.isArray(ai.hashtags) && ai.hashtags.length > 0) setAiHashtags(ai.hashtags)
        if (!body.trim() && typeof ai.caption === 'string' && ai.caption) setBody(ai.caption)
      }
    } catch { /* non-blocking */ }
  }

  const handleUrlChange = async (val: string) => {
    setSource_url(val); setUrlMeta(null); setAiHashtags([])
    const trimmed = val.trim()
    if (!trimmed) return

    const detected = detectSource(trimmed)
    if (!detected) return
    setSource_type(detected)

    if (detected === 'youtube') {
      const id = extractYoutubeId(trimmed)
      if (id) {
        const thumb = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
        setUrlMeta({ thumbnail_url: thumb, title: '' })
        triggerUrlAI(thumb, '')
      }
      return
    }

    if (detected === 'tiktok') {
      setFetchingMeta(true)
      try {
        const res = await fetch(`/api/explore/oembed?url=${encodeURIComponent(trimmed)}`)
        const data = await res.json()
        const thumb = data.thumbnail_url || ''
        const title = data.title || ''
        setUrlMeta({ thumbnail_url: thumb, title })
        triggerUrlAI(thumb, title)
      } catch { setUrlMeta({ thumbnail_url: '', title: '' }) }
      finally { setFetchingMeta(false) }
      return
    }

    // Facebook: best-effort OG image via server proxy (may be empty if page requires login)
    if (detected === 'facebook') {
      setFetchingMeta(true)
      try {
        const res = await fetch(`/api/explore/oembed?url=${encodeURIComponent(trimmed)}`)
        const data = await res.json()
        const thumb = data.thumbnail_url || ''
        const title = data.title || ''
        setUrlMeta({ thumbnail_url: thumb, title })
        triggerUrlAI(thumb, title)
      } catch { setUrlMeta({ thumbnail_url: '', title: '' }) }
      finally { setFetchingMeta(false) }
    }
  }

  /* ─── Submit ─── */
  const isUploading = uploadStep === 'thumb' || uploadStep === 'video' || uploadStep === 'ai'

  const canPost = (() => {
    if (mediaMode === 'photo') return body.trim().length > 0 || photos.length > 0
    if (mediaMode === 'video') return uploadStep === 'done'
    if (mediaMode === 'url') return !!source_url.trim() && !!detectSource(source_url)
    return false
  })()

  const handleSubmit = async () => {
    if (!canPost || submitting) return
    setError(''); setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?returnTo=/reviews/new'); return }

      const placeId = mediaMode === 'photo' && placeName.trim()
        ? 'community_' + placeName.trim().toLowerCase().replace(/\s+/g, '_')
        : `${mediaMode}_${Date.now()}`

      const payload: Record<string, unknown> = {
        placeId,
        placeName: placeName.trim() || 'Chia sẻ',
        placeAddress: '',
        rating: rating || 0,
        body: body.trim(),
      }

      if (music) {
        payload.music = { version: 1, trackId: music.trackId, startSec: music.startSec, volume: music.volume }
      }

      if (mediaMode === 'photo') {
        payload.photos = photos
        payload.content_type = 'photo'
      } else if (mediaMode === 'video') {
        payload.content_type = 'video'
        payload.media_url = media_url
        payload.thumbnail = thumbnail
        payload.source_type = 'upload'
        if (aiHashtags.length > 0) payload.hashtags = aiHashtags
      } else {
        payload.content_type = 'video'
        payload.media_url = source_url
        payload.source_type = source_type
        payload.source_url = source_url
        payload.thumbnail = urlMeta?.thumbnail_url || ''
        if (aiHashtags.length > 0) payload.hashtags = aiHashtags
      }

      const tSubmit = vstart('submit-review', { content_type: payload.content_type, hasMedia: !!payload.media_url })
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { vfail('submit-review', tSubmit, new Error(data.error || `HTTP ${res.status}`)); throw new Error(data.error || t('reviewNew.postError')) }
      vok('submit-review', tSubmit)
      setSuccess(true)
      // Land on the author's own profile grid, where the just-posted clip is at
      // the top — the default "for-you" feed is trending-ranked, so a brand-new
      // 0-engagement post isn't there and users thought the upload had failed.
      setTimeout(() => router.push('/reviews?tab=profile'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reviewNew.postError'))
    } finally {
      setSubmitting(false)
    }
  }

  const displayRating = hoverRating || rating
  const ratingLabels = [
    '',
    t('reviewNew.rating1'),
    t('reviewNew.rating2'),
    t('reviewNew.rating3'),
    t('reviewNew.rating4'),
    t('reviewNew.rating5'),
  ]

  /* ─── Success screen ─── */
  if (success) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center px-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl overflow-hidden select-none">
            <TappyMascot pose="success" size={64} eager />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('reviewNew.successTitle')}</h2>
          <p className="text-gray-500">{t('reviewNew.successSubtitle')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <Link href="/reviews" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft size={22} />
        </Link>
        <h1 className="font-bold text-gray-900 dark:text-white">{t('reviewNew.headerTitle')}</h1>
        <button
          onClick={handleSubmit}
          disabled={!canPost || submitting || isUploading}
          className="py-3 px-6 rounded-full bg-[#fe2c55] hover:bg-[#ef2950] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white text-sm font-semibold transition-all"
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : t('reviewNew.post')}
        </button>
      </div>

      <div className="flex-1 container-content py-4 space-y-4">

        {/* Media mode tabs */}
        <div className="flex bg-gray-100 dark:bg-gray-900 rounded-xl p-1 gap-1">
          {([
            { id: 'photo', icon: <Camera size={15} />, label: t('reviewNew.tabPhoto') },
            { id: 'video', icon: <Video size={15} />, label: t('reviewNew.tabVideo') },
            { id: 'url',   icon: <Link2 size={15} />, label: t('reviewNew.tabLink') },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => { if (!isUploading) { setMediaMode(tab.id); setError('') } }}
              disabled={isUploading}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-2 rounded-lg transition-colors ${
                mediaMode === tab.id
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── Photo tab ── */}
        {mediaMode === 'photo' && (
          <div>
            {photos.length === 0 ? (
              <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-[#fe2c55] hover:border-[#fe2c55]/50 transition-all">
                {photoUploading
                  ? <Loader2 size={32} className="animate-spin text-[#fe2c55]" />
                  : <>
                      <Camera size={40} />
                      <span className="text-sm font-medium">{t('reviewNew.addPhoto')}</span>
                      <span className="text-xs text-gray-400">{t('reviewNew.maxPhotos', { n: String(MAX_PHOTOS) })}</span>
                    </>}
              </button>
            ) : (
              <div className={`grid gap-1.5 ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {photos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden">
                    <Image src={url} alt="" fill className="object-cover" sizes="33vw" />
                    <button type="button" onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                      <X size={13} className="text-white" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#fe2c55] hover:border-[#fe2c55]/50 disabled:opacity-50 transition-all">
                    {photoUploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={24} />}
                  </button>
                )}
              </div>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
          </div>
        )}

        {/* ── Video tab ── */}
        {mediaMode === 'video' && (
          <div>
            {/* Empty state */}
            {uploadStep === '' && (
              <button type="button" onClick={() => videoInputRef.current?.click()}
                className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-[#fe2c55] hover:border-[#fe2c55]/50 transition-all">
                <Video size={40} />
                <span className="text-sm font-medium">{t('reviewNew.selectVideo')}</span>
                <span className="text-xs text-gray-400">{t('reviewNew.videoHint')}</span>
              </button>
            )}

            {/* Uploading */}
            {(uploadStep === 'thumb' || uploadStep === 'video' || uploadStep === 'ai') && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {thumbPreview && (
                  <div className="relative w-full aspect-video bg-black">
                    <img src={thumbPreview} alt="" className="w-full h-full object-cover opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 size={32} className="text-white animate-spin" />
                    </div>
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {uploadStep === 'thumb' && t('reviewNew.creatingThumbnail')}
                      {uploadStep === 'video' && t('reviewNew.uploadingVideo')}
                      {uploadStep === 'ai'    && t('reviewNew.analyzingContent')}
                    </span>
                    {uploadStep === 'video' && (
                      <span className="text-sm font-bold text-[#fe2c55]">{uploadProgress}%</span>
                    )}
                  </div>
                  {uploadStep === 'video' && (
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#fe2c55] rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                  {(uploadStep === 'thumb' || uploadStep === 'video') && (
                    <button onClick={cancelUpload}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors">
                      <XCircle size={16} /> {t('reviewNew.cancel')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Done */}
            {uploadStep === 'done' && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="relative w-full aspect-video bg-black">
                  {thumbPreview && <img src={thumbPreview} alt="" className="w-full h-full object-cover" />}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <Video size={24} className="text-white" />
                    </div>
                  </div>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-gray-500">{t('reviewNew.videoUploaded')}</span>
                  <button onClick={resetVideoState} className="text-xs text-red-400 hover:text-red-600">{t('reviewNew.remove')}</button>
                </div>
              </div>
            )}

            <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleVideoSelect} />
          </div>
        )}

        {/* ── URL tab ── */}
        {mediaMode === 'url' && (
          <div className="space-y-3">
            {/* Source selector */}
            <div className="flex gap-2">
              {(['youtube', 'tiktok', 'facebook'] as const).map(src => (
                <button key={src}
                  onClick={() => { setSource_type(src); setSource_url(''); setUrlMeta(null) }}
                  className={`flex-1 text-xs py-2 rounded-xl font-semibold transition-colors border ${
                    source_type === src
                      ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                      : 'bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                  }`}>
                  {src === 'youtube' ? '▶ YouTube' : src === 'tiktok' ? '♪ TikTok' : '📘 Facebook'}
                </button>
              ))}
            </div>

            {/* URL input */}
            <input
              type="url"
              value={source_url}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder={
                source_type === 'youtube' ? t('reviewNew.pasteYoutube')
                : source_type === 'tiktok' ? t('reviewNew.pasteTiktok')
                : t('reviewNew.pasteFacebook')
              }
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/40"
            />

            {fetchingMeta && (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={16} className="animate-spin" /> {t('reviewNew.loadingMeta')}
              </div>
            )}

            {urlMeta?.thumbnail_url && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="relative w-full aspect-video bg-black">
                  <img src={urlMeta.thumbnail_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                    <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <span className="text-2xl">{source_type === 'youtube' ? '▶' : source_type === 'tiktok' ? '♪' : '📘'}</span>
                    </div>
                  </div>
                </div>
                {urlMeta.title && (
                  <p className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-1">{urlMeta.title}</p>
                )}
              </div>
            )}

            {source_type === 'facebook' && source_url && (
              <p className="text-xs text-gray-400">{t('reviewNew.facebookNote')}</p>
            )}
          </div>
        )}

        {/* AI hashtag chips */}
        {aiHashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {aiHashtags.map(tag => (
              <span key={tag} className="text-xs px-3 py-1 bg-[#fe2c55]/10 text-[#fe2c55] rounded-full font-medium">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Body */}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={t('reviewNew.bodyPlaceholder')}
          rows={4}
          maxLength={1000}
          className="w-full px-0 py-2 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 bg-transparent border-none outline-none resize-none text-base leading-relaxed"
        />
        {body.length > 0 && <p className="text-right text-xs text-gray-400">{body.length}/1000</p>}

        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Place */}
        <div>
          <button type="button" onClick={() => setShowPlaceInput(v => !v)}
            className="flex items-center gap-2 text-sm text-[#fe2c55] font-medium hover:text-[#ef2950] transition-colors">
            <MapPin size={16} />
            {placeName || t('reviewNew.addPlace')}
            {placeName && (
              <X size={14} className="text-gray-400"
                onClick={e => { e.stopPropagation(); setPlaceName(''); setShowPlaceInput(false) }} />
            )}
          </button>
          {showPlaceInput && (
            <input type="text" value={placeName} onChange={e => setPlaceName(e.target.value)}
              placeholder={t('reviewNew.placePlaceholder')} autoFocus maxLength={100}
              className="mt-2 w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/40" />
          )}
        </div>

        {/* Rating */}
        <div>
          <button type="button" onClick={() => { setShowRating(v => !v); if (showRating) setRating(0) }}
            className="flex items-center gap-2 text-sm text-[#fe2c55] font-medium hover:text-[#ef2950] transition-colors">
            <Star size={16} />
            {rating > 0 ? t('reviewNew.ratingLabel', { n: String(rating), label: ratingLabels[rating] }) : t('reviewNew.addRating')}
            {rating > 0 && (
              <X size={14} className="text-gray-400" onClick={e => { e.stopPropagation(); setRating(0) }} />
            )}
          </button>
          {showRating && (
            <div className="flex items-center gap-1 mt-2">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} type="button"
                  onMouseEnter={() => setHoverRating(i)} onMouseLeave={() => setHoverRating(0)}
                  onClick={() => { setRating(i); setShowRating(false) }}
                  className="p-0.5 transition-transform hover:scale-110">
                  <Star size={30} className={`transition-colors ${i <= displayRating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700'}`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Music */}
        <div>
          {!music ? (
            <button type="button" onClick={openMusicPicker} aria-haspopup="dialog"
              className="flex items-center gap-2 text-sm text-[#fe2c55] font-medium hover:text-[#ef2950] transition-colors">
              <Music size={16} />
              {t('reviewNew.addMusic')}
            </button>
          ) : (
            <SelectedMusicCard trackId={music.trackId} onReplace={openMusicPicker} onRemove={() => setMusic(null)} />
          )}
          {hasOpenedMusicPicker && (
            <MusicPickerSheet
              open={musicPickerOpen}
              onClose={() => setMusicPickerOpen(false)}
              onSelect={selection => setMusic(selection)}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
