'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

// ── One avatar, one fallback ────────────────────────────────────────────────
//
// A remote avatar can fail for reasons the app does not control: the host is not an allowed
// image source, the file 404s, the CDN expires it, or the network is hostile. Before this, every
// surface wrote `avatar_url ? <Image/> : <initial/>`, which asks the wrong question — it checks
// whether a URL EXISTS, never whether it LOADS. A Zalo user whose avatar URL was present but
// unloadable got a broken-image icon on every screen (the P0 that prompted this: *.zadn.vn was
// missing from `images.remotePatterns`, so the optimizer answered 400).
//
// Allowlisting the host fixes today's URL. This fixes the class: if the image does not load, the
// clean initial-letter state the app already uses for "no avatar" takes over. Identical markup to
// what each caller rendered before, so nothing about the design changes.
export default function UserAvatar({
  src, name, size, className = '', rounded = 'rounded-2xl', priority,
}: {
  src?: string | null
  /** Used for the alt text and for the fallback letter. */
  name?: string | null
  size: number
  className?: string
  rounded?: string
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)

  // A new avatar must clear a previous failure — otherwise the moment the user replaces a broken
  // Zalo avatar with their own upload, the component would keep showing the letter.
  useEffect(() => { setFailed(false) }, [src])

  const letter = (name || '').trim()[0]?.toUpperCase() || 'T'

  if (!src || failed) {
    return (
      <div
        className={`${rounded} bg-gradient-to-br from-primary-400 to-accent-400 flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-white font-bold" style={{ fontSize: Math.round(size * 0.45) }}>{letter}</span>
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={name || 'Avatar'}
      width={size}
      height={size}
      priority={priority}
      onError={() => setFailed(true)}
      className={`${rounded} object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
