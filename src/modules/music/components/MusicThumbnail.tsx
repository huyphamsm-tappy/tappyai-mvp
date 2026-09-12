'use client'

import Image from 'next/image'
import { Music2 } from 'lucide-react'
import { useState } from 'react'

interface MusicThumbnailProps {
  coverUrl: string | null
  title: string
  size?: number
  /**
   * Fill the parent instead of rendering at `size` px.
   *
   * The Music Library's card grid needs artwork that is as wide as its column — a width that is
   * only known at layout time — so the card supplies a square container (`position: relative`,
   * `aspect-ratio: 1`) and the thumbnail fills it. The fallback fills the same box, so a track
   * without a picture keeps exactly the card footprint of one with a picture. Every other caller
   * (the picker rows) keeps the fixed-size default.
   */
  fill?: boolean
  /** Extra classes on the rendered image / fallback; `rounded-*` is the usual reason. */
  className?: string
  /** `sizes` hint for the responsive image in `fill` mode; ignored otherwise. */
  sizes?: string
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
export function MusicThumbnail({ coverUrl, title, size = 40, fill = false, className = '', sizes }: MusicThumbnailProps) {
  const [broken, setBroken] = useState(false)

  if (!coverUrl || broken) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-800 flex-shrink-0 ${fill ? 'absolute inset-0 h-full w-full' : ''} ${className}`.trim()}
        style={fill ? undefined : { width: size, height: size }}
        aria-hidden="true"
      >
        <Music2 size={fill ? 40 : size * 0.5} className="text-gray-400" />
      </div>
    )
  }

  if (fill) {
    return (
      <Image
        src={coverUrl}
        alt={title}
        fill
        sizes={sizes ?? '(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw'}
        onError={() => setBroken(true)}
        className={`object-cover ${className}`.trim()}
      />
    )
  }

  return (
    <Image
      src={coverUrl}
      alt={title}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className={`rounded-md object-cover flex-shrink-0 ${className}`.trim()}
    />
  )
}
