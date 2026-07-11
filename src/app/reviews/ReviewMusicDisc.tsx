'use client'

import { Music } from 'lucide-react'

export default function ReviewMusicDisc({ trackId, onTap }: { trackId?: string | null; onTap?: (trackId: string) => void }) {
  if (trackId) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onTap?.(trackId) }}
        aria-label="Xem âm thanh của clip"
        className="w-10 h-10 rounded-full border-2 border-white/30 bg-black/50 flex items-center justify-center active:scale-90 transition"
      >
        <Music size={16} className="text-white" />
      </button>
    )
  }
  return (
    <div
      aria-label="Âm thanh gốc"
      className="w-10 h-10 rounded-full border-2 border-white/30 bg-black/50 flex items-center justify-center opacity-60"
    >
      <Music size={16} className="text-white" />
    </div>
  )
}
