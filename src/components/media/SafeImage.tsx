'use client'

import NextImage, { type ImageProps } from 'next/image'
import { useState } from 'react'
import { isOptimizableImageSrc } from '@/lib/media/imageHosts'

/**
 * `next/image` for URLs we did not mint (F-057). Drop-in: same props, same default export shape.
 *
 * One bad image must never take down the page or the feed. A stored URL on a host next/image may
 * not optimise, an empty URL, or an image that fails to load renders a neutral placeholder in the
 * SAME box instead of throwing (dev) or showing a broken image (prod).
 *
 * Deliberately a placeholder, not a plain `<img src=…>`: loading an arbitrary third-party host in
 * the viewer's browser would let whoever posted the image log every viewer's IP.
 */
export default function SafeImage(props: ImageProps) {
  const { src, alt, onError, className, style, fill, width, height } = props
  const [failed, setFailed] = useState(false)

  // A static import (object) is a bundled asset — always renderable.
  const renderable = typeof src !== 'string' || isOptimizableImageSrc(src)

  if (failed || !renderable) {
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-image-fallback=""
        className={className}
        style={{
          display: 'block',
          backgroundColor: 'rgba(148, 163, 184, 0.18)',
          ...(fill
            ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
            : { width: width ?? undefined, height: height ?? undefined, maxWidth: '100%' }),
          ...style,
        }}
      />
    )
  }

  return (
    <NextImage
      {...props}
      onError={(e) => {
        setFailed(true)
        onError?.(e)
      }}
    />
  )
}
