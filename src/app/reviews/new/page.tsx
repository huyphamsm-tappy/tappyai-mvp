'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/media/client'
import {
  Star, X, ArrowLeft, Loader2, AlertTriangle,
  MapPin, Plus, Video, XCircle, Music, UploadCloud, Info,
  Image as ImageIcon, Youtube, Play, Sparkles, PenLine, Users, Globe,
} from 'lucide-react'
import TappyPresence from '@/components/v3/TappyPresence'
import { TappyMascot } from '@/components/TappyMascot'
import { getTappyPose } from '@/lib/TappyMascotState'
import {
  MusicPickerSheet, MusicThumbnail, MusicDuration, useMusicTrack,
  type MusicSelection,
} from '@/modules/music'
import { useTranslation } from '@/lib/i18n/useTranslation'
import { detectSource, placeholderFor, SUPPORTED_LINK_SOURCES, type LinkSource } from '@/lib/links/platforms'

// Display label per provider. Only entries in SUPPORTED_LINK_SOURCES are rendered.
const LINK_SOURCE_LABEL: Record<LinkSource, string> = { youtube: '▶ YouTube' }

// Upload limits come from the shared product config (single source; also served
// to native clients via GET /api/config) — do not redefine numbers here.
import {
  MAX_PHOTOS_PER_REVIEW as MAX_PHOTOS,
  MAX_VIDEO_DURATION_ACCEPT_SEC as MAX_VIDEO_DURATION_ACCEPT,
  isAcceptableVideoDuration,
  MAX_VIDEO_SIZE_MB,
  MAX_PHOTO_SIZE_MB,
  SHOW_MUSIC,
} from '@/lib/config/product'
import { apiFetch, isAgeGateMessage, redirectToAgeCheck } from '@/lib/account/ageGateClient'

const MAX_VIDEO_SIZE = MAX_VIDEO_SIZE_MB * 1024 * 1024

/**
 * Lets a DROPPED file reach the existing `handlePhotoSelect` / `handleVideoSelect` unchanged.
 *
 * 🔑 Both read `e.target.files` and nothing else, so drag-and-drop is a second way to hand them a
 * file — not a second upload path. Every format, size and duration check they already run is the
 * one that runs here too. Writing a separate drop handler would have meant a second copy of that
 * validation, and the copy is always the one that falls behind.
 */
function fileChangeEvent(files: File[]): React.ChangeEvent<HTMLInputElement> {
  return { target: { files, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>
}
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/**
 * The media modes this composer actually has. One row per REAL capability - adding a mode is an
 * entry here plus its surface, and nothing else counts them.
 *
 * 🚨 Not on this list, deliberately: a "short clip" mode (no distinct backend - one `content_type`,
 * one duration rule, so it would be a second label for `video`) and "Livestream" (no
 * implementation anywhere in web, Android or iOS). A tile is a promise the product has to keep.
 */
const MODES = [
  { id: 'photo', icon: ImageIcon, tone: 'blue', labelKey: 'reviewNew.tabPhoto', hintKey: 'reviewNew.tabPhotoHint' },
  { id: 'video', icon: Video,     tone: 'ink',  labelKey: 'reviewNew.tabVideo', hintKey: 'reviewNew.tabVideoHint' },
  { id: 'url',   icon: Youtube,   tone: 'red',  labelKey: 'reviewNew.tabLink',  hintKey: 'reviewNew.tabLinkHint'  },
] as const
/** The body's existing ceiling - the same 1000 the textarea and its counter always used. */
const BODY_MAX = 1000

/* ─── helpers ─── */

// Source detection + YouTube URL/thumbnail generation live in the backend
// (@/lib/links). The composer only detects the source for the placeholder
// selector; the authoritative resolution happens server-side at paste time
// via POST /api/links/resolve. The frontend never generates a YouTube URL.

// Reading duration/thumbnail from a <video> can hang forever if the browser loads
// metadata but never fires `onseeked` (seen with some .mov/codec files, esp. on
// mobile Safari). A timeout guarantees these promises always settle so the upload
// UI can never freeze at "Đang tạo thumbnail…". Metadata reads only need the moov atom, so this
// budget tracks decode behaviour rather than file length — it is unchanged by the size limit.
const MEDIA_READ_TIMEOUT_MS = 20000
const THUMB_TIMEOUT_MS = 8000        // hard cap on thumbnail decode/seek — never freeze the UI
const THUMB_UPLOAD_TIMEOUT_MS = 15000 // hard cap on the (best-effort) thumbnail blob upload
/**
 * How long the link field waits after the last keystroke before resolving.
 *
 * Long enough to collapse ordinary typing into one attempt, short enough that a PASTE — which is
 * how most links arrive — still feels immediate. The cost this saves is real: see the note on
 * `urlDebounceRef`.
 */
const URL_RESOLVE_DEBOUNCE_MS = 600

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
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-colors"
      style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel)' }}
    >
      <MusicThumbnail coverUrl={track?.coverUrl ?? null} title={track?.title ?? ''} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--v3-fg)' }}>{track?.title ?? t('reviewNew.loading')}</p>
        {track?.artist && <p className="truncate text-xs" style={{ color: 'var(--v3-fg-muted)' }}>{track.artist}</p>}
      </div>
      {track && <span className="flex-shrink-0 text-xs" style={{ color: 'var(--v3-fg-muted)' }}><MusicDuration seconds={track.durationSec} /></span>}
      <button
        type="button"
        aria-label={t('reviewNew.removeMusic')}
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="flex-shrink-0 rounded-full p-1 transition-colors hover:text-red-500"
        style={{ color: 'var(--v3-fg-muted)' }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

/* ─── page ─── */

export default function NewReviewPage() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const uploadControllerRef = useRef<AbortController | null>(null)
  // ── Link-field cost guards (V2-UAT-013) ───────────────────────────────────
  //
  // The URL field is an `onChange` handler, so it runs on EVERY KEYSTROKE. Once enough of a
  // YouTube URL is present for `detectSource` to match — around character 20 of a ~43-character
  // link — every remaining keystroke fired `/api/links/resolve` AND `/api/explore/process`, and
  // the second of those is a real model call. Typing or editing a link cost ~20 AI calls to
  // produce one post. Pasting cost one, which is why this never showed up in a demo.
  //
  // Two guards, and both are needed. The timer collapses a burst of keystrokes into one attempt;
  // the last-resolved memo stops the SAME url being resolved twice when the user pastes, edits
  // and reverts, or when a re-render replays the value.
  const urlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastResolvedUrlRef = useRef<string>('')
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
  /** The server's authoritative outcome when a post was NOT published. */
  const [moderation, setModeration] = useState<{ title: string; detail: string } | null>(null)

  /* media mode */
  const [mediaMode, setMediaMode] = useState<'photo' | 'video' | 'url'>('photo')
  const [dragging, setDragging] = useState(false)

  /* photo */
  const [photos, setPhotos] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)

  /* video upload */
  const [media_url, setMedia_url] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  // Measured clip length (s) — sent on submit so the auto-registered original
  // sound gets an accurate duration_sec (see /api/reviews original-sound block).
  const [videoDuration, setVideoDuration] = useState(0)
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
  const [source_type, setSource_type] = useState<LinkSource>('youtube')
  const [urlMeta, setUrlMeta] = useState<{ thumbnail_url: string; title: string } | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [urlUnsupported, setUrlUnsupported] = useState(false)

  /* ai suggestions */
  const [aiHashtags, setAiHashtags] = useState<string[]>([])
  /**
   * The AREA the existing content processor read off the caption/poster ("khu vuc neu ro").
   *
   * 🔑 EVIDENCE, NOT IDENTITY. `POST /api/explore/process` has always returned `location`
   * alongside `hashtags`, and this composer kept the tags and threw the area away — so every
   * clip was stored with `place_address: ''` and the Ask-Tappy CTA had nothing to search
   * with. The suggestion now pre-fills an editable field the poster sees before publishing;
   * whatever they leave there is stored as `place_address`, exactly as if they had typed it.
   * Nothing here names a venue, mints a place id or marks anything verified — Places does
   * that later, on the reader's question.
   */
  const [placeArea, setPlaceArea] = useState('')
  const [areaFromAi, setAreaFromAi] = useState(false)
  const suggestArea = (ai: { location?: unknown }) => {
    if (typeof ai.location !== 'string') return
    const area = ai.location.replace(/\s+/g, ' ').trim().slice(0, 100)
    // Never overwrite something the poster typed themselves.
    if (area && !placeArea.trim()) { setPlaceArea(area); setAreaFromAi(true) }
  }

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
    setMedia_url(''); setThumbnail(''); setThumbPreview(''); setVideoDuration(0)
    setUploadStep(''); setUploadProgress(0); setAiHashtags([])
    if (areaFromAi) { setPlaceArea(''); setAreaFromAi(false) }
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
        // The upload route is age-gated too, so this can 403 exactly as the review
        // POST does. Same ONE shared handler; every other response is unchanged.
        const res = await apiFetch('/api/reviews/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || data.error || t('reviewNew.photoUploadError'))
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
    // One shared rule (product.ts), so web, the reviews API and iOS cannot drift apart. It rejects
    // on the 305s ceiling — and also rejects 0/NaN, which mean "the browser could not read this",
    // not "this clip is short".
    if (!isAcceptableVideoDuration(duration)) {
      vfail('validate-duration', tDur, new Error('too long'), { duration: +duration.toFixed(2), max: MAX_VIDEO_DURATION_ACCEPT })
      setError(t('reviewNew.videoTooLong')); return
    }

    resetVideoState()
    setVideoDuration(duration) // keep the measured length for the original-sound track

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
        const result = await uploadMedia({
          endpoint: '/api/upload/video',
          kind: 'videoThumbnail',
          file: thumbFile,
          signal: thumbAbort.signal,
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
      const result = await uploadMedia({
        endpoint: '/api/upload/video',
        kind: 'video',
        file,
        signal: controller.signal,
        onProgress: (percentage) => setUploadProgress(Math.round(percentage)),
      })
      setMedia_url(result.url)
      vok('video-upload', tVideo, { url: result.url })

      /* 3. AI processing (non-blocking — failure is OK) */
      setUploadStep('ai')
      const tAi = vstart('ai-process')
      try {
        const aiRes = await apiFetch('/api/explore/process', {
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
          suggestArea(ai)
          vok('ai-process', tAi, { hashtags: Array.isArray(ai.hashtags) ? ai.hashtags.length : 0, area: typeof ai.location === 'string' && !!ai.location })
        } else {
          vfail('ai-process', tAi, new Error(`HTTP ${aiRes.status}`), { note: 'non-blocking' })
        }
      } catch (e) { vfail('ai-process', tAi, e, { note: 'non-blocking' }) }

      setUploadStep('done')
    } catch (e) {
      // `/api/upload/video` is age-gated, and an age refusal surfaces HERE as a
      // `MediaUploadError` whose message is the server's machine code —
      // `uploadMedia` owns its own request (XMLHttpRequest, for the progress
      // bar) so it cannot go through `apiFetch`. Same situation as the chat
      // transport, and answered the same way: share the DETECTOR rather than
      // keep a second copy of the code list. Checked before the generic
      // branches, which would otherwise paint "video upload failed" over a
      // refusal the user can actually act on.
      if (isAgeGateMessage((e as Error)?.message)) {
        vfail('video-upload', tVideo, e, { note: 'age refusal' })
        resetVideoState()
        redirectToAgeCheck()
        return
      }
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
      const aiRes = await apiFetch('/api/explore/process', {
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
        suggestArea(ai)
      }
    } catch { /* non-blocking */ }
  }

  /**
   * Typing in the link field. Local state updates immediately; anything that costs money is
   * deferred until the typing stops.
   *
   * The split is the whole point — the input must stay responsive, so `setSource_url` and the
   * cleared metadata happen on every keystroke exactly as before, while the resolve-and-analyse
   * pair is deferred until the user stops typing. See the refs above for what this cost.
   */
  const handleUrlChange = (val: string) => {
    setSource_url(val); setUrlMeta(null); setAiHashtags([]); setUrlUnsupported(false)
    if (areaFromAi) { setPlaceArea(''); setAreaFromAi(false) }
    if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current)
    const trimmed = val.trim()
    if (!trimmed) { lastResolvedUrlRef.current = ''; return }
    urlDebounceRef.current = setTimeout(() => { void resolveUrl(trimmed) }, URL_RESOLVE_DEBOUNCE_MS)
  }

  const resolveUrl = async (trimmed: string) => {
    const detected = detectSource(trimmed)
    // Unsupported provider (TikTok/Facebook/Instagram/other) → show a hint and
    // do not resolve. canPost stays false, so the post can't be created.
    if (!detected) { setUrlUnsupported(true); return }
    // Already resolved this exact URL — the metadata and hashtags on screen are its own, so
    // re-running would spend a model call to arrive back where we are.
    if (lastResolvedUrlRef.current === trimmed) return
    lastResolvedUrlRef.current = trimmed
    setSource_type(detected)

    // Backend owns all URL resolution (source, metadata, thumbnail, fallback).
    // The response thumbnail is GUARANTEED non-empty (real or platform
    // placeholder), so a post can never be created with a broken poster.
    setFetchingMeta(true)
    try {
      const res = await fetch('/api/links/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      if (!res.ok) { setUrlMeta({ thumbnail_url: placeholderFor(detected), title: '' }); return }
      const { data } = await res.json()
      const thumb = data?.thumbnail || placeholderFor(detected)
      const title = data?.title || ''
      setUrlMeta({ thumbnail_url: thumb, title })
      triggerUrlAI(thumb, title)
    } catch {
      setUrlMeta({ thumbnail_url: placeholderFor(detected), title: '' })
    } finally {
      setFetchingMeta(false)
    }
  }

  /* ─── Submit ─── */
  const isUploading = uploadStep === 'thumb' || uploadStep === 'video' || uploadStep === 'ai'

  /** A drop is the same action as picking from the file dialog, routed by the ACTIVE mode. */
  const acceptDrop = (files: File[]) => {
    setDragging(false)
    if (isUploading || photoUploading || files.length === 0) return
    if (mediaMode === 'photo') {
      const images = files.filter(f => f.type.startsWith('image/'))
      if (images.length > 0) handlePhotoSelect(fileChangeEvent(images))
    } else if (mediaMode === 'video') {
      const video = files.find(f => f.type.startsWith('video/'))
      // A non-video dropped on the video zone still goes through `handleVideoSelect`, so the
      // user gets the composer's real "unsupported format" message rather than silence.
      handleVideoSelect(fileChangeEvent([video ?? files[0]]))
    }
  }

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
        // The area the poster left in the field — typed or accepted from the clip suggestion.
        // Stored as evidence for the reader's Ask-Tappy question; never a verified venue.
        placeAddress: placeArea.trim(),
        rating: rating || 0,
        body: body.trim(),
      }

      // The picker cannot open while `SHOW_MUSIC` is false, so `music` is always null there; the
      // guard is here as well so a stale draft can never post a track the UI no longer offers.
      if (SHOW_MUSIC && music) {
        payload.music = { version: 1, trackId: music.trackId, startSec: music.startSec, volume: music.volume }
      }

      if (mediaMode === 'photo') {
        payload.photos = photos
        payload.content_type = 'photo'
      } else if (mediaMode === 'video') {
        payload.content_type = 'video'
        payload.media_url = media_url
        // Never store an empty poster — a failed thumbnail decode falls back to
        // the generic video placeholder so the grid never shows a blank tile.
        payload.thumbnail = thumbnail || placeholderFor('upload')
        payload.source_type = 'upload'
        payload.duration = videoDuration // for the auto-registered original sound
        if (aiHashtags.length > 0) payload.hashtags = aiHashtags
      } else {
        payload.content_type = 'video'
        payload.media_url = source_url
        payload.source_type = source_type
        payload.source_url = source_url
        // Backend resolver guarantees a non-empty thumbnail; the fallback here is
        // pure defense so a link post can never be stored with an empty poster.
        payload.thumbnail = urlMeta?.thumbnail_url || placeholderFor(source_type)
        if (aiHashtags.length > 0) payload.hashtags = aiHashtags
      }

      const tSubmit = vstart('submit-review', { content_type: payload.content_type, hasMedia: !!payload.media_url })
      // `?lang=` so the server words the moderation notice in the language the
      // USER picked in-app, which is not necessarily their browser's.
      // Age refusals redirect to /age-check via the ONE shared handler; every other
      // response behaves exactly as before.
      const res = await apiFetch(`/api/reviews?lang=${encodeURIComponent(locale)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { vfail('submit-review', tSubmit, new Error(data.error || `HTTP ${res.status}`)); throw new Error(data.message || data.error || t('reviewNew.postError')) }
      vok('submit-review', tSubmit)

      // The server decides whether this was published. Saving the row is not the
      // same as publishing it, and reporting success for content the gate has
      // just refused is the one thing this screen must never do.
      //
      // 🔑 This renders the server's outcome; it does not compute one. There is
      // no second moderation engine in the client, and the wording comes from
      // the response rather than from a code-to-string map here — so nothing on
      // this page can disagree with the row that was stored.
      if (data.moderation?.state === 'RESTRICTED') {
        setModeration(data.moderation)
        return
      }

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

  /* ─── Not published ───
     Shown INSTEAD of the success screen, and it does not auto-redirect: the
     author has something to read, and being bounced away from it after 1.5s is
     how the previous behaviour managed to be technically informative and
     practically silent. Title and detail are the server's, already localized
     and already stripped of any policy identity, reason code or evidence. */
  if (moderation) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="max-w-md w-full px-6">
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={22} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">{moderation.title}</h2>
                <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-2">{moderation.detail}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <Link
              href="/reviews?tab=profile"
              className="flex-1 text-center bg-interactive text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              {t('reviewNew.moderationGoToProfile')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Success screen ─── */
  if (success) {
    return (
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center px-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl overflow-hidden select-none">
            <TappyMascot pose={getTappyPose({ isSuccess: true })} size={64} eager animated />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('reviewNew.successTitle')}</h2>
          <p className="text-gray-500">{t('reviewNew.successSubtitle')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="v3-theme v3-post-page flex min-h-dvh flex-col">

      {/* -- Top bar -- back . title . post. The submit handler and its disabled rule are the
          composer's own; only the chrome changed. */}
      <header className="v3-post-topbar sticky top-0 z-30">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/reviews" className="v3-post-iconbtn" aria-label={t('reviewNew.back')}>
            <ArrowLeft size={22} />
          </Link>
          <h1 className="min-w-0 truncate text-[17px] font-bold sm:text-[19px]" style={{ color: 'var(--v3-fg)' }}>
            {t('reviewNew.headerTitle')}
          </h1>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canPost || submitting || isUploading}
            className="v3-post-primary v3-post-submit"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : t('reviewNew.post')}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-1 sm:px-6 sm:pt-2" data-post-main>

        {/* -- Hero -- Tappy (the owner's `welcome` pose, unchanged) beside the title. The
            character steps down over the upload card via `.v3-post-mascot`. The place /
            rating / music controls live in ONE place, below the body - not here. */}
        <section className="v3-post-hero" aria-labelledby="post-hero-title" data-post-hero>
          <div className="flex flex-col items-center gap-0 px-2 pt-1 text-center sm:flex-row sm:items-end sm:gap-4 sm:px-3 sm:pt-2 sm:text-left md:gap-6">
            <div className="v3-post-mascot relative" data-post-mascot>
              <span className="v3-post-spark" aria-hidden="true" data-tone="blue" style={{ right: '-2px', top: '8%' }}><Sparkles size={24} /></span>
              <span className="v3-post-spark" aria-hidden="true" style={{ left: '-2px', top: '40%' }}><Sparkles size={16} /></span>
              <div className="v3-post-float">
                <TappyPresence
                  pose="welcome"
                  size={300}
                  aura="calm"
                  className="max-h-[184px] max-w-[184px] sm:max-h-[244px] sm:max-w-[244px] md:max-h-[276px] md:max-w-[276px]"
                />
              </div>
            </div>
            <div className="min-w-0 flex-1 pb-4 sm:pb-[68px]">
              <h2
                id="post-hero-title"
                className="text-[30px] font-extrabold uppercase leading-none tracking-[-0.01em] sm:text-[40px] md:text-[46px]"
                style={{ color: 'var(--v3-fg)' }}
              >
                {t('reviewNew.heroTitle1')}{' '}
                <span className="v3-post-hero-slash">/</span>{' '}
                <span className="v3-post-hero-accent">{t('reviewNew.heroTitle2')}</span>
              </h2>
              <p className="v3-post-hero-muted mt-2 text-[15px] sm:text-[17px]">
                {t('reviewNew.mediaSubtitle')}
              </p>
            </div>
          </div>
        </section>

        {/* -- Upload card -- one card, three surfaces. Each surface still calls the same
            `handlePhotoSelect` / `handleVideoSelect` / `handleUrlChange`, and the format,
            size and count lines are the server's own policy strings. */}
        <section className="v3-post-panel p-3 sm:p-4" data-post-upload>

          {/* -- Photo -- */}
          {mediaMode === 'photo' && (
            <div>
              {photos.length === 0 ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); acceptDrop(Array.from(e.dataTransfer.files)) }}
                  className="v3-post-drop relative overflow-hidden px-5 py-7 text-center sm:px-8 sm:py-8"
                  data-dragging={dragging ? 'true' : 'false'}
                >
                  <PostTiles />
                  <span className="v3-post-drop-icon mx-auto" aria-hidden="true">
                    {photoUploading ? <Loader2 size={32} className="animate-spin" /> : <UploadCloud size={34} />}
                  </span>
                  <p className="mt-4 text-[19px] font-extrabold sm:text-[21px]" style={{ color: 'var(--v3-fg)' }}>
                    {dragging ? t('reviewNew.dropActive') : t('reviewNew.dropTitle')}
                  </p>
                  <p className="mt-1 text-[14px] sm:text-[15px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                    {t('reviewNew.dropHint')}
                  </p>
                  <p className="v3-post-formats mt-2 text-[12.5px] sm:text-[13px]">
                    {t('reviewNew.photoHint', { n: String(MAX_PHOTO_SIZE_MB) })}
                    {'  |  '}
                    {t('reviewNew.maxPhotos', { n: String(MAX_PHOTOS) })}
                  </p>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading}
                    className="v3-post-primary v3-post-choose mx-auto mt-5"
                  >
                    <Plus size={20} />
                    {t('reviewNew.chooseFile')}
                  </button>
                </div>
              ) : (
                <div className={`grid gap-2 ${photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {photos.map((url, i) => (
                    <div key={i} className="relative aspect-square overflow-hidden rounded-2xl">
                      <Image src={url} alt="" fill className="object-cover" sizes="33vw" />
                      <button type="button" onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                        aria-label={t('reviewNew.remove')}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}
                      aria-label={t('reviewNew.chooseFile')}
                      className="v3-post-drop flex aspect-square items-center justify-center disabled:opacity-50"
                      style={{ color: 'var(--v3-accent)' }}>
                      {photoUploading ? <Loader2 size={22} className="animate-spin" /> : <Plus size={28} />}
                    </button>
                  )}
                </div>
              )}
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
            </div>
          )}

          {/* -- Video -- */}
          {mediaMode === 'video' && (
            <div>
              {uploadStep === '' && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); acceptDrop(Array.from(e.dataTransfer.files)) }}
                  className="v3-post-drop relative overflow-hidden px-5 py-7 text-center sm:px-8 sm:py-8"
                  data-dragging={dragging ? 'true' : 'false'}
                >
                  <PostTiles />
                  <span className="v3-post-drop-icon mx-auto" aria-hidden="true">
                    <UploadCloud size={34} />
                  </span>
                  <p className="mt-4 text-[19px] font-extrabold sm:text-[21px]" style={{ color: 'var(--v3-fg)' }}>
                    {dragging ? t('reviewNew.dropActive') : t('reviewNew.dropTitle')}
                  </p>
                  <p className="mt-1 text-[14px] sm:text-[15px]" style={{ color: 'var(--v3-fg-secondary)' }}>
                    {t('reviewNew.dropHint')}
                  </p>
                  {/* mp4 . mov . webm . 5 minutes . 150MB - the existing string, which already
                      matches `ALLOWED_VIDEO_TYPES` and the shared config. */}
                  <p className="v3-post-formats mt-2 text-[12.5px] sm:text-[13px]">
                    {t('reviewNew.videoHint')}
                  </p>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="v3-post-primary v3-post-choose mx-auto mt-5"
                  >
                    <Plus size={20} />
                    {t('reviewNew.chooseFile')}
                  </button>
                </div>
              )}

              {(uploadStep === 'thumb' || uploadStep === 'video' || uploadStep === 'ai') && (
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel-elevated)' }}>
                  {thumbPreview && (
                    <div className="relative aspect-video w-full bg-black">
                      <img src={thumbPreview} alt="" className="h-full w-full object-cover opacity-50" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-white" />
                      </div>
                    </div>
                  )}
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--v3-fg-secondary)' }}>
                        {uploadStep === 'thumb' && t('reviewNew.creatingThumbnail')}
                        {uploadStep === 'video' && t('reviewNew.uploadingVideo')}
                        {uploadStep === 'ai'    && t('reviewNew.analyzingContent')}
                      </span>
                      {uploadStep === 'video' && (
                        <span className="text-[13px] font-bold" style={{ color: 'var(--v3-accent)' }}>{uploadProgress}%</span>
                      )}
                    </div>
                    {/* Real bytes, reported by the direct-to-storage upload. Nothing simulated. */}
                    {uploadStep === 'video' && (
                      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--v3-border)' }}>
                        <div className="h-full rounded-full transition-all duration-200"
                          style={{ width: `${uploadProgress}%`, background: 'var(--v3-accent-fill)' }} />
                      </div>
                    )}
                    {(uploadStep === 'thumb' || uploadStep === 'video') && (
                      <button onClick={cancelUpload}
                        className="flex items-center gap-1.5 text-[13px] transition-colors hover:underline"
                        style={{ color: 'var(--v3-fg-muted)' }}>
                        <XCircle size={16} /> {t('reviewNew.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {uploadStep === 'done' && (
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel-elevated)' }}>
                  <div className="relative aspect-video w-full bg-black">
                    {thumbPreview && <img src={thumbPreview} alt="" className="h-full w-full object-cover" />}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                        <Video size={24} className="text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>{t('reviewNew.videoUploaded')}</span>
                    <button onClick={resetVideoState} className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--v3-rose)' }}>
                      {t('reviewNew.remove')}
                    </button>
                  </div>
                </div>
              )}

              <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleVideoSelect} />
            </div>
          )}

          {/* -- YouTube -- the existing link flow: provider list from the backend, URL input,
              metadata preview. Nothing new is integrated. */}
          {mediaMode === 'url' && (
            <div className="space-y-3 p-1 sm:p-2">
              {/* Rendered from the backend-owned provider list - the composer never hardcodes
                  which platforms are importable. */}
              <div className="flex gap-2">
                {SUPPORTED_LINK_SOURCES.map(src => (
                  <button key={src} type="button"
                    onClick={() => { setSource_type(src); setSource_url(''); setUrlMeta(null); setUrlUnsupported(false) }}
                    className="flex-1 rounded-xl border py-2.5 text-[13px] font-semibold transition-colors"
                    style={source_type === src
                      ? { background: 'var(--v3-accent-fill)', color: 'var(--v3-on-accent)', borderColor: 'transparent' }
                      : { background: 'var(--v3-panel-elevated)', color: 'var(--v3-fg-muted)', borderColor: 'var(--v3-border)' }}>
                    {LINK_SOURCE_LABEL[src]}
                  </button>
                ))}
              </div>

              <input
                type="url"
                value={source_url}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder={t('reviewNew.pasteYoutube')}
                className="v3-post-input"
              />

              {/* Only worth saying once there is a CHOICE - see SUPPORTED_LINK_SOURCES. */}
              {SUPPORTED_LINK_SOURCES.length > 1 && (
                <p className="text-[12px]" style={{ color: 'var(--v3-fg-muted)' }}>
                  {t('reviewNew.linkHint', { list: SUPPORTED_LINK_SOURCES.map(src => LINK_SOURCE_LABEL[src]).join(' · ') })}
                </p>
              )}

              {urlUnsupported && (
                <p className="text-[12.5px]" style={{ color: 'var(--v3-amber)' }}>{t('reviewNew.linkUnsupported')}</p>
              )}

              {fetchingMeta && (
                <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--v3-fg-muted)' }}>
                  <Loader2 size={16} className="animate-spin" /> {t('reviewNew.loadingMeta')}
                </div>
              )}

              {urlMeta?.thumbnail_url && (
                <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--v3-border)', background: 'var(--v3-panel-elevated)' }}>
                  <div className="relative aspect-video w-full bg-black">
                    <img src={urlMeta.thumbnail_url} alt="" className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                        <span className="text-2xl">▶</span>
                      </div>
                    </div>
                  </div>
                  {urlMeta.title && (
                    <p className="line-clamp-1 px-3 py-2 text-[12.5px]" style={{ color: 'var(--v3-fg-secondary)' }}>{urlMeta.title}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* -- Media tabs -- exactly the three real modes in MODES. */}
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3" data-post-tabs>
          {MODES.map(mode => {
            const active = mediaMode === mode.id
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                onClick={() => { if (!isUploading) { setMediaMode(mode.id); setDragging(false); setError('') } }}
                disabled={isUploading}
                className="v3-post-tab flex-col items-center text-center sm:flex-row sm:text-left"
              >
                <span className="v3-post-tab-icon" data-tone={mode.tone} aria-hidden="true">
                  <mode.icon size={22} />
                </span>
                <span className="min-w-0">
                  <span className="v3-post-tab-title block">{t(mode.labelKey)}</span>
                  <span className="v3-post-tab-hint hidden sm:block">{t(mode.hintKey)}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* -- Content -- the same textarea, same max length, counter always visible. */}
        <section className="v3-post-panel mt-4 px-4 pb-3 pt-4 sm:px-5" data-post-body>
          <div className="flex gap-3">
            <PenLine size={20} className="mt-1 flex-shrink-0" style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={t('reviewNew.bodyPlaceholder')}
              rows={4}
              maxLength={BODY_MAX}
              className="v3-post-body"
              aria-label={t('reviewNew.bodyPlaceholder')}
            />
          </div>
          <p className="v3-post-counter mt-1 text-right">{body.length}/{BODY_MAX}</p>
        </section>

        {/* AI hashtag chips */}
        {aiHashtags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {aiHashtags.map(tag => (
              <span key={tag} className="v3-post-tag">#{tag}</span>
            ))}
          </div>
        )}

        {/* -- Quick actions -- place . rating . music. The only place they appear. */}
        <div className="mt-4 flex flex-wrap gap-2.5 sm:gap-3" data-post-actions>
          <button type="button" onClick={() => setShowPlaceInput(v => !v)}
            className="v3-post-chip" data-tone="blue" data-active={placeName ? 'true' : 'false'} aria-expanded={showPlaceInput}>
            <span className="v3-post-chip-icon" aria-hidden="true"><MapPin size={16} /></span>
            <span className="max-w-[46vw] truncate sm:max-w-[28ch]">{placeName || t('reviewNew.addPlace')}</span>
            {placeName && (
              <X size={15} className="v3-post-chip-clear" aria-hidden="true"
                onClick={e => { e.stopPropagation(); setPlaceName(''); setShowPlaceInput(false) }} />
            )}
          </button>

          <button type="button" onClick={() => { setShowRating(v => !v); if (showRating) setRating(0) }}
            className="v3-post-chip" data-tone="amber" data-active={rating > 0 ? 'true' : 'false'} aria-expanded={showRating}>
            <span className="v3-post-chip-icon" aria-hidden="true"><Star size={16} /></span>
            {rating > 0 ? t('reviewNew.ratingLabel', { n: String(rating), label: ratingLabels[rating] }) : t('reviewNew.addRating')}
            {rating > 0 && (
              <X size={15} className="v3-post-chip-clear" aria-hidden="true" onClick={e => { e.stopPropagation(); setRating(0) }} />
            )}
          </button>

          {/* Music is gated off on every platform while its licensing is open (`SHOW_MUSIC`).
              The picker, the selected-track card and the payload below are all behind the same
              boolean, so a post created while it is off carries no track at all. */}
          {SHOW_MUSIC && !music && (
            <button type="button" onClick={openMusicPicker} aria-haspopup="dialog"
              className="v3-post-chip" data-tone="rose" data-active="false">
              <span className="v3-post-chip-icon" aria-hidden="true"><Music size={16} /></span>
              {t('reviewNew.addMusic')}
            </button>
          )}
        </div>

        {/* Place: the name and the area, exactly as before. */}
        {showPlaceInput && (
          <input type="text" value={placeName} onChange={e => setPlaceName(e.target.value)}
            placeholder={t('reviewNew.placePlaceholder')} autoFocus maxLength={100}
            className="v3-post-input mt-3" />
        )}
        {/* The area, shown whenever the place sheet is open or the clip suggested one - the
            poster sees exactly what will be stored and can edit or clear it. */}
        {(showPlaceInput || placeArea) && (
          <div className="mt-2">
            <input type="text" value={placeArea} data-testid="review-place-area"
              onChange={e => { setPlaceArea(e.target.value); setAreaFromAi(false) }}
              placeholder={t('reviewNew.areaPlaceholder')} maxLength={100}
              className="v3-post-input" />
            {areaFromAi && placeArea && (
              <p className="mt-1 text-[11.5px]" style={{ color: 'var(--v3-fg-muted)' }} data-testid="review-place-area-hint">{t('reviewNew.areaSuggested')}</p>
            )}
          </div>
        )}

        {/* Rating stars */}
        {showRating && (
          <div className="mt-3 flex items-center gap-1" data-post-stars>
            {[1, 2, 3, 4, 5].map(i => (
              <button key={i} type="button"
                aria-label={t('reviewNew.ratingLabel', { n: String(i), label: ratingLabels[i] })}
                onMouseEnter={() => setHoverRating(i)} onMouseLeave={() => setHoverRating(0)}
                onClick={() => { setRating(i); setShowRating(false) }}
                className="p-1 transition-transform hover:scale-110">
                <Star size={32} className={`transition-colors ${i <= displayRating ? 'fill-[#F5B301] text-[#F5B301]' : ''}`}
                  style={i <= displayRating ? undefined : { color: 'var(--v3-border-strong)' }} />
              </button>
            ))}
          </div>
        )}

        {/* Music */}
        {SHOW_MUSIC && music && (
          <div className="mt-3">
            <SelectedMusicCard trackId={music.trackId} onReplace={openMusicPicker} onRemove={() => setMusic(null)} />
          </div>
        )}
        {SHOW_MUSIC && hasOpenedMusicPicker && (
          <MusicPickerSheet
            open={musicPickerOpen}
            onClose={() => setMusicPickerOpen(false)}
            onSelect={selection => setMusic(selection)}
          />
        )}

        {/* -- Visibility -- every post is public today; there is no per-post audience
            setting in the data model, so this states the fact instead of drawing a
            control that would not do anything. The community note sits beside it. */}
        <section className="v3-post-panel mt-4 px-4 py-4 sm:px-5" data-post-visibility>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="v3-post-vis-icon" aria-hidden="true"><Users size={24} /></span>
              <div>
                <p className="v3-post-vis-label">{t('reviewNew.visibilityLabel')}</p>
                <p className="v3-post-vis-value flex items-center gap-1.5"><Globe size={16} aria-hidden="true" />{t('reviewNew.visibilityPublic')}</p>
              </div>
            </div>
            <p className="flex items-start gap-2 text-[12.5px] leading-snug sm:max-w-[38ch]" style={{ color: 'var(--v3-fg-muted)' }}>
              <Info size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              {t('reviewNew.communityNote')}
            </p>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="v3-post-error mt-4">{error}</div>
        )}
      </main>
    </div>
  )
}

/**
 * Three illustration tiles inside the drop zone - image, play, YouTube - pure CSS on the
 * card's right edge, hidden below `sm` so the copy keeps the full width on a phone.
 */
function PostTiles() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34%] sm:block" aria-hidden="true">
      <span className="v3-post-tile" data-tone="violet" style={{ width: 76, height: 76, right: '44%', top: '18%', transform: 'rotate(-10deg)' }}>
        <ImageIcon size={30} />
      </span>
      <span className="v3-post-tile" data-tone="blue" style={{ width: 66, height: 66, right: '16%', top: '10%', transform: 'rotate(8deg)' }}>
        <Play size={26} fill="currentColor" />
      </span>
      <span className="v3-post-tile" data-tone="red" style={{ width: 70, height: 70, right: '22%', top: '48%', transform: 'rotate(-6deg)' }}>
        <Youtube size={30} />
      </span>
    </div>
  )
}
