'use client'

import Link from 'next/link'
import { Music2 } from 'lucide-react'

// Compact "Âm thanh gốc – @creator" pill for a clip that plays its OWN audio
// (an original sound). Purely a discovery/attribution affordance: tapping it
// opens the sound page ("use this sound" loop). It deliberately has NO play
// control — the clip's video audio IS the sound, so a separate player would
// just echo it. Clips that BORROWED a sound use ReviewMusicCard instead.
export default function ReviewOriginalSoundBar({ trackId, handle }: { trackId: string; handle: string }) {
  return (
    <Link
      href={`/sound/${trackId}`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-3 py-1.5 active:opacity-80"
    >
      <Music2 size={13} className="flex-shrink-0 text-white" />
      <span className="truncate text-xs font-medium text-white">Âm thanh gốc – {handle}</span>
    </Link>
  )
}
