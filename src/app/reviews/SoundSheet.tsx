'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Play, Pause, Loader2, Music2, Heart, Plus } from 'lucide-react'
import { MusicThumbnail, MusicDuration } from '@/modules/music'

interface SoundTrack {
  id: string; title: string; artist: string | null; durationSec: number
  coverUrl: string | null; previewUrl: string | null; audioUrl: string
  musicType: string; playCount: number
}
interface SoundVideo { id: string; thumbnail: string | null; likeCount: number }
interface SoundData {
  track: SoundTrack; usageCount: number; savedCount: number
  savedByMe: boolean; videos: SoundVideo[]
}

const TYPE_LABEL: Record<string, string> = {
  royalty_free: 'Miễn phí bản quyền', licensed: 'Có bản quyền',
  original_sound: 'Âm thanh gốc', ai_generated: 'AI tạo nhạc', external: 'Liên kết ngoài',
}

export default function SoundSheet({ trackId, onClose }: { trackId: string; onClose: () => void }) {
  const router = useRouter()
  const [data, setData] = useState<SoundData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const countedPlay = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/sound/${trackId}`)
      .then(async r => {
        if (r.status === 404) throw new Error('notfound')
        if (!r.ok) throw new Error('load')
        return r.json()
      })
      .then((d: SoundData) => {
        if (cancelled) return
        setData(d)
        setSaved(d.savedByMe)
        setSavedCount(d.savedCount)
      })
      .catch(e => { if (!cancelled) setError(e.message === 'notfound' ? 'Bài nhạc không tồn tại.' : 'Không tải được, thử lại nhé.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trackId])

  // Close on browser back
  useEffect(() => {
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onClose])

  // Stop audio on unmount
  useEffect(() => () => { audioRef.current?.pause() }, [])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !data) return
    if (playing) { audio.pause(); setPlaying(false); return }
    audio.src = data.track.previewUrl ?? data.track.audioUrl
    audio.play().catch(() => {})
    setPlaying(true)
    if (!countedPlay.current) {
      countedPlay.current = true
      fetch(`/api/sound/${trackId}/play`, { method: 'POST' }).catch(() => {})
    }
  }

  async function toggleSave() {
    if (busy || !data) return
    setBusy(true)
    const next = !saved
    setSaved(next)
    setSavedCount(c => c + (next ? 1 : -1))
    try {
      const res = await fetch(`/api/sound/${trackId}/save`, { method: next ? 'POST' : 'DELETE' })
      if (res.status === 401) { router.push(`/login?returnTo=/reviews`); return }
      if (!res.ok) throw new Error()
    } catch {
      setSaved(!next)
      setSavedCount(c => c + (next ? -1 : 1))
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose} />
      <div className="fixed z-[60] bg-white dark:bg-gray-900 overflow-y-auto
        bottom-0 left-0 right-0 rounded-t-3xl max-h-[75dvh]
        md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:max-h-[80vh] md:rounded-2xl md:shadow-2xl">
        {/* Handle (mobile) + close */}
        <div className="sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur z-10 px-5 pt-3 pb-2 flex items-center justify-between">
          <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto md:hidden" />
          <button onClick={onClose} className="absolute right-4 top-3 p-1" aria-label="Đóng">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-8">
          {loading && (
            <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
          )}

          {!loading && error && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-4 py-3 text-sm text-red-700 dark:text-red-300 my-4">{error}</div>
          )}

          {!loading && !error && data && (
            <>
              {/* Track info */}
              <div className="flex items-center gap-4 mt-2">
                <div className="relative shrink-0">
                  <MusicThumbnail coverUrl={data.track.coverUrl} title={data.track.title} size={72} />
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 m-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:scale-95 transition"
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                  </button>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                    <Music2 size={15} className="text-primary-500 shrink-0" /> {data.track.title}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{data.track.artist ?? 'Không rõ nghệ sĩ'}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <MusicDuration seconds={data.track.durationSec} />
                    <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5">{TYPE_LABEL[data.track.musicType] ?? data.track.musicType}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm mt-3">
                <span className="text-gray-600 dark:text-gray-300">🎬 <b>{data.usageCount}</b> video</span>
                <span className="text-gray-600 dark:text-gray-300"><Heart size={13} className="inline text-rose-500" /> <b>{savedCount}</b> lưu</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={toggleSave} disabled={busy}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60 ${
                    saved ? 'bg-rose-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                  }`}
                >
                  <Heart size={16} className={saved ? 'fill-white' : ''} /> {saved ? 'Đã lưu' : 'Lưu'}
                </button>
                <button
                  onClick={() => router.push(`/reviews/new?sound=${data.track.id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 py-2.5 text-sm font-semibold text-white active:scale-95 transition"
                >
                  <Plus size={16} /> Sử dụng âm thanh này
                </button>
              </div>

              {/* See full page link */}
              <Link
                href={`/sound/${trackId}`}
                className="block text-center text-xs text-primary-500 mt-3 hover:underline"
              >
                Xem trang âm thanh đầy đủ →
              </Link>

              {/* Video grid */}
              {data.videos.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Video sử dụng</h3>
                  <div className="grid grid-cols-4 gap-1.5">
                    {data.videos.slice(0, 8).map(v => (
                      <Link key={v.id} href={`/reviews/${v.id}`} className="relative aspect-[9/16] overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
                        {v.thumbnail ? (
                          <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-400"><Music2 size={16} /></div>
                        )}
                        <div className="absolute bottom-0.5 left-0.5 text-[10px] text-white drop-shadow flex items-center gap-0.5">
                          <Heart size={9} className="fill-white/90" /> {v.likeCount}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={audioRef} onEnded={() => setPlaying(false)} className="hidden" />
      </div>
    </>
  )
}
