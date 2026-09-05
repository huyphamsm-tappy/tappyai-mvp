'use client'

import Image from 'next/image'
import { Music2 } from 'lucide-react'
import { useState } from 'react'

interface MusicThumbnailProps {
  coverUrl: string | null
  title: string
  size?: number
}

/**
 * A track's cover art, or a deliberate stand-in.
 *
 * 🚨 THE FALLBACK IS NEVER THE BROWSER'S BROKEN-IMAGE BOX. It used to be: with
 * no `onError`, a cover that failed to load rendered as the alt text, so the
 * Music Library showed the words "Âm thanh gốc" in a torn-paper icon where the
 * artwork should be. The alt text is for screen readers, not for a visual
 * fallback, and a broken `<img>` reads as a bug rather than as a track without a
 * picture.
 *
 * The dead URLs behind that bug are filtered at the source — see the note in
 * `musicRepository.mapTrackRow`. This is the second half: any OTHER cover that
 * fails (an expired CDN link, a host that is briefly unreachable, a file
 * deleted after the row was written) lands on the same disc icon instead of the
 * browser's default. The same pattern the Explore feed already uses for avatars.
 */
export function MusicThumbnail({ coverUrl, title, size = 40 }: MusicThumbnailProps) {
  const [broken, setBroken] = useState(false)

  if (!coverUrl || broken) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-800 flex-shrink-0"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Music2 size={size * 0.5} className="text-gray-400" />
      </div>
    )
  }

  return (
    <Image
      src={coverUrl}
      alt={title}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="rounded-md object-cover flex-shrink-0"
    />
  )
}
