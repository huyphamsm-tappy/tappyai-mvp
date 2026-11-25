'use client'
import type { RefObject } from 'react'
import type { OverlayDoc } from '@/lib/media/video/overlay/schema'
import { OverlayLayer } from './OverlayLayer'
import { useVideoTimeMs } from './hooks'

/**
 * The text overlay of a post, drawn over ITS <video> in the feed (Explore video VID-02). A separate component on purpose: the playing-position hook re-renders about four times a
 * second, which must happen only for a post that HAS text, never for every video of the feed (the player mounts this only when an overlay document exists).
 */
export function OverlayOverVideo({ doc, videoRef }: { doc: OverlayDoc; videoRef: RefObject<HTMLVideoElement | null> }) {
  const timeMs = useVideoTimeMs(videoRef)
  return <OverlayLayer doc={doc} timeMs={timeMs} />
}
