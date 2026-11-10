'use client'
import { useRef } from 'react'
import { isLayerVisible } from '@/lib/media/video/overlay/layout'
import type { OverlayDoc } from '@/lib/media/video/overlay/schema'
import { TextLayerView } from './TextLayerView'
import { useElementWidth } from './hooks'
import { useTranslation } from '@/lib/i18n/useTranslation'

/**
 * The text overlay as a layer over a video, drawn from the saved JSON (Explore video VID-02): nothing is re-encoded when the text changes. Place it as a sibling of the
 * <video> inside a `position: relative` frame that has the video's own aspect ratio; it fills the frame, never takes a click (the player's own tap handling is untouched)
 * and shows each layer only between its start and end. The watermark is NOT drawn here: it belongs to the download only.
 *
 * `timeMs`: the playing position (see useVideoTimeMs). `frameWidth` overrides the measured width (tests, server rendering).
 */
export function OverlayLayer({ doc, timeMs, frameWidth }: { doc: OverlayDoc | null | undefined; timeMs: number; frameWidth?: number }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref, frameWidth)
  const visible = doc ? doc.layers.filter(l => isLayerVisible(l, timeMs)) : []
  return (
    <div ref={ref} data-testid="overlay-layer" role="group" aria-label={t('video.overlay.layerAria')} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {width > 0 && visible.map(layer => <TextLayerView key={layer.id} layer={layer} frameWidth={width} />)}
    </div>
  )
}
