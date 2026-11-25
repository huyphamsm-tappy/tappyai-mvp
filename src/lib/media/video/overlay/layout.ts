// ONE geometry rule for text overlays, shared by the editor preview, the playback layer (OverlayLayer) and the server PNG renderer, so what the author sees while editing is
// what viewers see and what the download burns in. Everything is derived from the layer's normalised numbers and the frame WIDTH in pixels.

import type { OverlayLayer } from './schema'

/** Font size in pixels: `size` is a fraction of the frame width. */
export const fontPx = (layer: Pick<OverlayLayer, 'size'>, frameWidth: number): number => Math.max(6, Math.round(layer.size * frameWidth))

/** The layer's box width in pixels (`width` is a fraction of the frame width). */
export const boxWidthPx = (layer: Pick<OverlayLayer, 'width'>, frameWidth: number): number => Math.max(8, Math.round(layer.width * frameWidth))

/** Horizontal and vertical padding inside the box, in em. Always reserved (a layer without a background keeps the same wrapping as one with it). */
export const PADDING_X_EM = 0.4
export const PADDING_Y_EM = 0.2

/** The fixed look of `shadow: true`, in em of the font size. */
export const SHADOW = { dx: 0.04, dy: 0.06, blur: 0.08, opacity: 0.6 } as const

/** A layer is on screen from its start (inclusive) to its end (exclusive). */
export const isLayerVisible = (layer: Pick<OverlayLayer, 'start_ms' | 'end_ms'>, timeMs: number): boolean => timeMs >= layer.start_ms && timeMs < layer.end_ms

/** Pixel offsets of the text area inside the box. */
export function paddingPx(fontSize: number): { x: number; y: number } {
  return { x: Math.round(fontSize * PADDING_X_EM), y: Math.round(fontSize * PADDING_Y_EM) }
}
