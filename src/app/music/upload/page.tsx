'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upload } from '@vercel/blob/client'
import Header from '@/components/Header'
import { Loader2, Music, UploadCloud, CheckCircle2 } from 'lucide-react'

// Read an audio file's duration (seconds) in the browser before upload.
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('audio')
    el.preload = 'metadata'
    el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); resolve(Math.round(el.duration || 0)) }
    el.onerror = () => resolve(0)
    el.src = URL.createObjectURL(file)
  })
}

export default function MusicUploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [rights, setRights] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const canSubmit = !!file && !!title.trim() && rights && !busy

  const onPick = (f: File | null) => {
    setError('')
    if (!f) return
    if (!f.type.startsWith('audio/')) { setError('Vui lòng chọn file âm thanh (mp3, m4a, wav…)'); return }
    if (f.size > 20 * 1024 * 1024) { setError('File tối đa 20MB'); return }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 120))
  }

  const submit = async () => {
    if (!file || !canSubmit) return
    setBusy(true); setError('')
    try {
      const durationSec = await readDuration(file)
      if (!durationSec || durationSec > 600) { setError('Nhạc phải dài 1 giây–10 phút'); setBusy(false); return }
      // 1) Upload the audio straight to Blob.
      const ext = file.name.split('.').pop() || 'mp3'
      const blob = await upload(`music/${Date.now()}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/audio',
      })
      // 2) Register the Original Sound (rights confirmation is mandatory).
      const res = await fetch('/api/music/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim() || undefined,
          audioUrl: blob.url,
          durationSec,
          rightsConfirmed: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Đăng nhạc thất bại'); setBusy(false); return }
      router.replace(`/sound/${data.id}`)
    } catch (e) {
      console.error(e)
      setError('Có lỗi khi tải nhạc lên. Vui lòng thử lại.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950 pb-24">
      <Header showBack backHref="/music" title="Đăng nhạc gốc" />
      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Music size={16} /> Original Sound — nhạc do chính bạn tạo/sở hữu
        </div>

        {/* File picker */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-6 flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400 hover:border-primary-400 transition-colors"
        >
          {file ? <CheckCircle2 size={28} className="text-green-500" /> : <UploadCloud size={28} />}
          <span className="text-sm font-medium">{file ? file.name : 'Chọn file nhạc (mp3, m4a, wav… tối đa 20MB)'}</span>
        </button>
        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />

        <div className="space-y-3">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Tên bài hát *"
            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm focus:outline-none focus:border-primary-400"
          />
          <input
            value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={120} placeholder="Nghệ sĩ (tùy chọn)"
            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm focus:outline-none focus:border-primary-400"
          />
        </div>

        {/* Rights consent — mandatory */}
        <label className="flex gap-3 items-start rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-4 cursor-pointer">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 w-4 h-4 flex-shrink-0" />
          <span className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            Tôi xác nhận <strong>tôi sở hữu hoặc có đầy đủ quyền</strong> với bản nhạc này, và cho phép TappyAI cùng người dùng khác sử dụng nó trong video của họ. Tôi hiểu việc đăng nhạc vi phạm bản quyền có thể bị gỡ và chịu trách nhiệm pháp lý. Xem{' '}
            <Link href="/copyright" className="underline font-medium">Chính sách bản quyền</Link>.
          </span>
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={submit} disabled={!canSubmit}
          className="w-full py-3 rounded-2xl bg-primary-500 text-white font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 size={16} className="animate-spin" /> Đang đăng…</> : 'Đăng Original Sound'}
        </button>
      </main>
    </div>
  )
}
