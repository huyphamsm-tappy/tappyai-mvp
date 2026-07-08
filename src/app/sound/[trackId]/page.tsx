'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Play, Pause, Loader2, Music2, Heart, Bell, Plus, TrendingUp, Flag, X } from 'lucide-react'
import { MusicThumbnail, MusicDuration } from '@/modules/music'

interface SoundVideo {
  id: string
  placeName: string
  body: string
  thumbnail: string | null
  contentType: string
  likeCount: number
}
interface SoundData {
  track: {
    id: string
    title: string
    artist: string | null
    durationSec: number
    coverUrl: string | null
    previewUrl: string | null
    audioUrl: string
    musicType: string
    playCount: number
  }
  usageCount: number
  savedCount: number
  savedByMe: boolean
  followCount: number
  followedByMe: boolean
  trendingRank: number | null
  videos: SoundVideo[]
}

const TYPE_LABEL: Record<string, string> = {
  royalty_free: 'Miễn phí bản quyền',
  licensed: 'Có bản quyền',
  original_sound: 'Âm thanh gốc',
  ai_generated: 'AI tạo nhạc',
  external: 'Liên kết ngoài',
}

const fmt = (n: number) => n.toLocaleString('vi-VN')

export default function SoundPage() {
  const router = useRouter()
  const params = useParams<{ trackId: string }>()
  const trackId = params?.trackId

  const [data, setData] = useState<SoundData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local, optimistic interaction state (seeded from the fetched data).
  const [playing, setPlaying] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [followed, setFollowed] = useState(false)
  const [playCount, setPlayCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const countedPlay = useRef(false)

  // Copyright / abuse report (notice-and-takedown entry point).
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('copyright')
  const [reportDetails, setReportDetails] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  const submitReport = async () => {
    if (reportBusy || !trackId) return
    setReportBusy(true)
    try {
      const res = await fetch(`/api/music/tracks/${trackId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() || undefined }),
      })
      if (res.status === 401) { router.push(`/login?returnTo=/sound/${trackId}`); return }
      if (res.ok) { setReportSent(true); setTimeout(() => { setReportOpen(false); setReportSent(false); setReportDetails('') }, 1800) }
    } finally {
      setReportBusy(false)
    }
  }

  useEffect(() => {
    if (!trackId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/sound/${trackId}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error('notfound')
        if (!r.ok) throw new Error('load')
        return r.json()
      })
      .then((d: SoundData) => {
        if (cancelled) return
        setData(d)
        setSaved(d.savedByMe)
        setSavedCount(d.savedCount)
        setFollowed(d.followedByMe)
        setPlayCount(d.track.playCount)
      })
      .catch((e) => { if (!cancelled) setError(e.message === 'notfound' ? 'Bài nhạc không tồn tại.' : 'Không tải được, thử lại nhé.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trackId])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !data) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    audio.src = data.track.previewUrl ?? data.track.audioUrl
    audio.play().catch(() => {})
    setPlaying(true)
    // Count the first play of this page view only (fire-and-forget).
    if (!countedPlay.current) {
      countedPlay.current = true
      setPlayCount((n) => n + 1)
      fetch(`/api/sound/${trackId}/play`, { method: 'POST' }).catch(() => {})
    }
  }

  // Save / follow toggles share the same optimistic + 401→login pattern.
  const toggle = useCallback(async (
    kind: 'save' | 'follow',
    on: boolean,
    setOn: (v: boolean) => void,
  ) => {
    if (busy || !trackId) return
    setBusy(true)
    const next = !on
    setOn(next) // optimistic
    if (kind === 'save') setSavedCount((c) => c + (next ? 1 : -1))
    try {
      const res = await fetch(`/api/sound/${trackId}/${kind}`, { method: next ? 'POST' : 'DELETE' })
      if (res.status === 401) {
        router.push(`/login?returnTo=/sound/${trackId}`)
        return
      }
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error('fail')
      if (kind === 'save' && typeof body?.savedCount === 'number') setSavedCount(body.savedCount)
    } catch {
      // revert on failure
      setOn(on)
      if (kind === 'save') setSavedCount((c) => c + (next ? -1 : 1))
    } finally {
      setBusy(false)
    }
  }, [busy, trackId, router])

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
        <div className="max-w-lg mx-auto flex items-center px-4 h-14">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-medium text-primary-500">
            <ChevronLeft size={18} /> Quay lại
          </button>
          <h1 className="flex-1 text-center font-semibold text-gray-900 dark:text-white pr-16">Âm thanh</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5">
        {loading && (
          <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            {/* Hero */}
            <div className="flex flex-col items-center text-center gap-2">
              <div className="relative">
                <MusicThumbnail coverUrl={data.track.coverUrl} title={data.track.title} size={132} />
                <button
                  onClick={togglePlay}
                  aria-label={playing ? 'Tạm dừng' : 'Phát'}
                  className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95 transition"
                >
                  {playing ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
                </button>
              </div>

              <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Music2 size={17} className="text-primary-500" /> {data.track.title}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{data.track.artist ?? 'Không rõ nghệ sĩ'}</p>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <MusicDuration seconds={data.track.durationSec} />
                <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5">🏷️ {TYPE_LABEL[data.track.musicType] ?? data.track.musicType}</span>
              </div>

              {data.trendingRank != null && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-orange-50 dark:bg-orange-950/40 px-3 py-1 text-xs font-semibold text-orange-600 dark:text-orange-300">
                  <TrendingUp size={13} /> Trending tuần này (#{data.trendingRank})
                </div>
              )}

              {/* Stats */}
              <div className="mt-2 flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-gray-700 dark:text-gray-200">
                  🎬 <span className="font-semibold">{fmt(data.usageCount)}</span> video
                </span>
                <span className="flex items-center gap-1 text-gray-700 dark:text-gray-200">
                  <Heart size={14} className="text-rose-500" /> <span className="font-semibold">{fmt(savedCount)}</span> lưu
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Đã phát {fmt(playCount)} lần</p>
            </div>

            {/* Actions */}
            <div className="mt-5 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => toggle('save', saved, setSaved)}
                  disabled={busy}
                  className={`flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                    saved
                      ? 'bg-rose-500 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <Heart size={16} className={saved ? 'fill-white' : ''} /> {saved ? 'Đã lưu' : 'Lưu'}
                </button>
                <button
                  onClick={() => toggle('follow', followed, setFollowed)}
                  disabled={busy}
                  className={`flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                    followed
                      ? 'bg-primary-500 text-white'
                      : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <Bell size={16} className={followed ? 'fill-white' : ''} /> {followed ? 'Đang theo dõi' : 'Theo dõi'}
                </button>
              </div>
              <button
                onClick={() => router.push(`/reviews/new?sound=${data.track.id}`)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 py-3 text-sm font-semibold text-white active:scale-95 transition"
              >
                <Plus size={16} /> Sử dụng âm thanh này
              </button>
              <button
                onClick={() => setReportOpen(true)}
                className="mx-auto mt-1 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
              >
                <Flag size={12} /> Báo cáo bản quyền
              </button>
            </div>

            {/* Videos grid */}
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Video sử dụng bài nhạc này</h2>
              {data.videos.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  Chưa có video nào dùng bài nhạc này. Hãy là người đầu tiên!
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {data.videos.map((v) => (
                    <Link
                      key={v.id}
                      href={`/reviews/${v.id}`}
                      className="relative aspect-[9/16] overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800"
                    >
                      {v.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element -- external blob/gstatic thumbnails, various hosts
                        <img src={v.thumbnail} alt={v.placeName || 'video'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <Music2 size={20} />
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[11px] text-white drop-shadow">
                        <Heart size={11} className="fill-white/90 text-white/90" /> {v.likeCount}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Report modal — notice-and-takedown entry point */}
      {reportOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !reportBusy && setReportOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:w-[440px] z-50 bg-white dark:bg-gray-900 rounded-t-3xl p-5 pb-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><Flag size={16} className="text-red-500" /> Báo cáo bài nhạc</h3>
              <button onClick={() => setReportOpen(false)} aria-label="Đóng"><X size={20} className="text-gray-400" /></button>
            </div>
            {reportSent ? (
              <p className="text-sm text-green-600 dark:text-green-400 py-4 text-center">Đã gửi báo cáo. Chúng tôi sẽ xử lý trong 24–48h. Cảm ơn bạn!</p>
            ) : (
              <>
                <div className="space-y-2">
                  {[
                    { v: 'copyright', l: 'Vi phạm bản quyền (nhạc của tôi/người khác)' },
                    { v: 'inappropriate', l: 'Nội dung không phù hợp' },
                    { v: 'spam', l: 'Spam / giả mạo' },
                    { v: 'other', l: 'Khác' },
                  ].map((o) => (
                    <label key={o.v} className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                      <input type="radio" name="reason" checked={reportReason === o.v} onChange={() => setReportReason(o.v)} className="w-4 h-4" />
                      {o.l}
                    </label>
                  ))}
                </div>
                <textarea
                  value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} maxLength={1000}
                  placeholder="Mô tả thêm (tùy chọn) — nếu là chủ sở hữu, ghi bằng chứng quyền + liên hệ"
                  className="w-full h-20 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none resize-none"
                />
                <button onClick={submitReport} disabled={reportBusy} className="w-full py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {reportBusy ? <Loader2 size={15} className="animate-spin" /> : 'Gửi báo cáo'}
                </button>
                <p className="text-[11px] text-gray-400 text-center">Xem <Link href="/copyright" className="underline">Chính sách bản quyền</Link></p>
              </>
            )}
          </div>
        </>
      )}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- instrumental preview clip */}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  )
}
