'use client'

import Link from 'next/link'
import { Music } from 'lucide-react'

// The clip's sound, shown in the action rail. Tapping opens the sound page —
// the "use this sound" reuse entry point (browse a clip → open its sound →
// "Sử dụng âm thanh này" → compose). Only rendered when the clip has a
// registered sound (the parent guards on r.music.origin), so it never appears
// for legacy clips whose attached track was removed. Uses a single-note icon
// (not the beamed note, which read too close to the TikTok logo).
export default function ReviewMusicDisc({ trackId }: { trackId: string }) {
  return (
    <Link
      href={`/sound/${trackId}`}
      aria-label="Xem âm thanh của clip"
      className="w-10 h-10 rounded-full border-2 border-white/30 bg-black/50 flex items-center justify-center active:scale-90 transition"
    >
      <Music size={16} className="text-white" />
    </Link>
  )
}
