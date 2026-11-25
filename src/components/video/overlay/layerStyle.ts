// How one text layer is styled in the browser. It applies the SAME rule the server renderer applies to the download (src/lib/media/video/overlay/layout.ts): the position is the
// layer's centre as a fraction of the frame, the box width a fraction of the frame width, the font size a fraction of the frame WIDTH in pixels, padding reserved in em.
// So the editor preview, the playback layer and the burned-in download agree on geometry; only glyph rasterisation differs by a pixel or so.

import type { CSSProperties } from 'react'
import { PADDING_X_EM, PADDING_Y_EM, SHADOW, fontPx } from '@/lib/media/video/overlay/layout'
import type { OverlayLayer } from '@/lib/media/video/overlay/schema'

/** The font the preview draws with (the download uses the bundled file; same family when installed). */
export const OVERLAY_FONT_STACK = '"Be Vietnam Pro", "Noto Sans", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export function hexToRgba(hex: string, alpha: number): string {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${alpha})`
}

/** The positioned, rotated box of the layer (a child of the frame). */
export function layerBoxStyle(layer: OverlayLayer): CSSProperties {
  return {
    position: 'absolute',
    left: `${layer.x * 100}%`,
    top: `${layer.y * 100}%`,
    width: `${layer.width * 100}%`,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
    transformOrigin: 'center',
    textAlign: layer.align,
    boxSizing: 'border-box',
  }
}

/** The text run inside the box. `frameWidth` is the frame's width in CSS pixels. */
export function layerTextStyle(layer: OverlayLayer, frameWidth: number): CSSProperties {
  const px = fontPx(layer, frameWidth)
  const style: CSSProperties = {
    display: 'inline-block',
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: `${PADDING_Y_EM}em ${PADDING_X_EM}em`,
    fontFamily: OVERLAY_FONT_STACK,
    fontSize: `${px}px`,
    fontWeight: layer.weight === 'bold' ? 700 : 400,
    lineHeight: 'normal',
    color: layer.color,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
    userSelect: 'none',
  }
  if (layer.background && layer.background.opacity > 0) style.backgroundColor = hexToRgba(layer.background.color, layer.background.opacity)
  if (layer.outline && layer.outline.width > 0) {
    // The renderer grows the glyph by `width * fontSize` on every side; a CSS stroke is centred on the edge, so it is twice that.
    Object.assign(style, { WebkitTextStroke: `${(2 * layer.outline.width * px).toFixed(2)}px ${layer.outline.color}`, paintOrder: 'stroke fill' })
  }
  if (layer.shadow) style.textShadow = `${SHADOW.dx}em ${SHADOW.dy}em ${SHADOW.blur}em ${hexToRgba('#000000', SHADOW.opacity)}`
  return style
}
