'use client'

// F-024 — music reuse removed. This page was part of the "use this sound" reuse path (sound
// detail / music library / sound upload), which is withdrawn. It now shows a short notice. A clip
// still plays its own audio in the feed — that never lived here.
import { useRouter } from 'next/navigation'
import { ChevronLeft, Music2 } from 'lucide-react'

export default function MusicFeatureRemoved() {
  const router = useRouter()
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-8 text-center">
      <Music2 size={40} style={{ color: 'var(--v3-fg-muted)' }} aria-hidden="true" />
      <p className="text-base font-semibold" style={{ color: 'var(--v3-fg)' }}>
        Tính năng âm thanh không còn khả dụng
      </p>
      <p className="max-w-sm text-sm" style={{ color: 'var(--v3-fg-muted)' }}>
        Tappy đã gỡ bỏ tính năng &ldquo;Dùng âm thanh này&rdquo;. Các video vẫn phát âm thanh của chính chúng.
      </p>
      <button
        type="button"
        onClick={() => router.back()}
        className="mt-2 inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm font-medium"
        style={{ borderColor: 'var(--v3-border)', color: 'var(--v3-fg)' }}
      >
        <ChevronLeft size={16} /> Quay lại
      </button>
    </div>
  )
}
