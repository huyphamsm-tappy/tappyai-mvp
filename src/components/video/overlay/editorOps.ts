// The pure edits the overlay editor makes on a document. Each returns a NEW document that still satisfies the schema's bounds (clamped, never rejected), so the editor can
// never put itself in a state the server would refuse for a reason the user cannot see.

import { MAX_LAYERS, MAX_TEXT_LENGTH, defaultTextLayer, newLayerId, type OverlayDoc, type OverlayLayer } from '@/lib/media/video/overlay/schema'

export const MIN_LAYER_MS = 200
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Adds a layer in the middle of the frame that is visible from `atMs` for three seconds (or to the end of the clip). No-op at the layer limit. */
export function addLayer(doc: OverlayDoc, durationMs: number, atMs = 0, id: string = newLayerId()): { doc: OverlayDoc; id: string | null } {
  if (doc.layers.length >= MAX_LAYERS) return { doc, id: null }
  const start = clamp(Math.round(atMs), 0, Math.max(0, durationMs - MIN_LAYER_MS))
  const end = Math.min(durationMs, start + 3000)
  const layer: OverlayLayer = { ...defaultTextLayer(id), start_ms: start, end_ms: Math.max(end, start + 1) }
  return { doc: { ...doc, layers: [...doc.layers, layer] }, id }
}

export const removeLayer = (doc: OverlayDoc, id: string): OverlayDoc => ({ ...doc, layers: doc.layers.filter(l => l.id !== id) })

/** Moves a layer one step in the stacking order (later = on top). */
export function moveLayer(doc: OverlayDoc, id: string, direction: -1 | 1): OverlayDoc {
  const i = doc.layers.findIndex(l => l.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= doc.layers.length) return doc
  const layers = [...doc.layers]
  ;[layers[i], layers[j]] = [layers[j], layers[i]]
  return { ...doc, layers }
}

/** Applies a partial change to one layer and clamps every field into the schema's range (times inside the clip, at least MIN_LAYER_MS long). */
export function updateLayer(doc: OverlayDoc, id: string, patch: Partial<OverlayLayer>, durationMs: number): OverlayDoc {
  return {
    ...doc,
    layers: doc.layers.map(l => {
      if (l.id !== id) return l
      const n = { ...l, ...patch }
      n.text = [...n.text].slice(0, MAX_TEXT_LENGTH).join('')
      n.x = clamp(n.x, 0, 1)
      n.y = clamp(n.y, 0, 1)
      n.width = clamp(n.width, 0.1, 1)
      n.size = clamp(n.size, 0.02, 0.2)
      n.rotation = clamp(Math.round(n.rotation * 10) / 10, -180, 180)
      if (n.outline) n.outline = { ...n.outline, width: clamp(n.outline.width, 0, 0.2) }
      if (n.background) n.background = { ...n.background, opacity: clamp(n.background.opacity, 0, 1) }
      // Times: whole milliseconds inside the clip; the end is always after the start.
      const maxMs = Math.max(MIN_LAYER_MS, Math.round(durationMs))
      let start = clamp(Math.round(n.start_ms), 0, maxMs - MIN_LAYER_MS)
      let end = clamp(Math.round(n.end_ms), MIN_LAYER_MS, maxMs)
      if (end - start < MIN_LAYER_MS) {
        // Whichever handle moved gives way to the other.
        if (patch.start_ms !== undefined && patch.end_ms === undefined) start = end - MIN_LAYER_MS
        else end = start + MIN_LAYER_MS
      }
      n.start_ms = start
      n.end_ms = end
      return n
    }),
  }
}

/** Nudges a layer by a fraction of the frame, staying inside it. */
export const nudgeLayer = (doc: OverlayDoc, id: string, dx: number, dy: number, durationMs: number): OverlayDoc => {
  const l = doc.layers.find(x => x.id === id)
  return l ? updateLayer(doc, id, { x: l.x + dx, y: l.y + dy }, durationMs) : doc
}

// ---- pointer geometry (pure, so it is tested without a browser) -------------

export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }

/** Dragging the layer's body: the pointer moved from `from` to `to` (client pixels) inside the frame `rect`. */
export function movedPosition(start: Pick<OverlayLayer, 'x' | 'y'>, from: Point, to: Point, rect: Rect): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: start.x, y: start.y }
  return { x: clamp(start.x + (to.x - from.x) / rect.width, 0, 1), y: clamp(start.y + (to.y - from.y) / rect.height, 0, 1) }
}

const centreOf = (l: Pick<OverlayLayer, 'x' | 'y'>, rect: Rect): Point => ({ x: rect.left + l.x * rect.width, y: rect.top + l.y * rect.height })

/** Dragging the corner handle: the font size scales with the pointer's distance from the layer's centre. */
export function scaledSize(start: Pick<OverlayLayer, 'x' | 'y' | 'size'>, from: Point, to: Point, rect: Rect): number {
  const c = centreOf(start, rect)
  const d0 = Math.hypot(from.x - c.x, from.y - c.y)
  if (d0 < 1) return start.size
  return clamp(start.size * (Math.hypot(to.x - c.x, to.y - c.y) / d0), 0.02, 0.2)
}

/** Dragging the rotate handle (which sits above the box): the angle of the pointer around the centre, snapped to 0 / 90 / 180 within 3 degrees. */
export function rotationAt(layer: Pick<OverlayLayer, 'x' | 'y'>, to: Point, rect: Rect): number {
  const c = centreOf(layer, rect)
  let deg = (Math.atan2(to.y - c.y, to.x - c.x) * 180) / Math.PI + 90
  deg = ((((deg + 180) % 360) + 360) % 360) - 180
  for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(deg - snap) <= 3) return snap
  return Math.round(deg * 10) / 10
}

export const formatSeconds =(ms: number): string => `${(ms / 1000).toFixed(1)} s`
