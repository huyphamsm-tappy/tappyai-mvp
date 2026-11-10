// Explore video text overlay, schema v1 (plan VID-02; owner decisions 05/11/2026).
//
// The overlay is STATIC text layers drawn over a clip (no animation). It is stored as versioned JSON next to the video and the original file is never touched:
//   - playback draws the layers from this JSON (OverlayLayer component), so editing the text never re-encodes anything;
//   - only the DOWNLOAD burns the layers (and the watermark) into an MP4, rendering each layer to a transparent PNG for the Transcoder (renderPng.ts).
//
// Geometry is NORMALISED so the same document means the same picture at any size: `x`,`y` are the CENTRE of the layer as a fraction of the frame, `width` is the
// wrap width as a fraction of the frame width, and `size` is the font size as a fraction of the frame WIDTH (see layout.ts for the one rule the preview, the playback
// layer and the PNG renderer all share). Times are whole milliseconds on the clip's own clock.
//
// The validator is strict on purpose: unknown fields are refused at every level, every number is finite and bounded, colours are `#rrggbb` only (nothing a CSS or
// SVG parser could read as something else), and the text carries no control or direction-changing characters. The result is a NEW normalised object, never the input.

export const OVERLAY_SCHEMA_VERSION = 1 as const
export const MAX_LAYERS = 10
export const MAX_TEXT_LENGTH = 200
export const MAX_TEXT_LINES = 6
/** A stored document is far below this; it is the cap the API refuses before parsing anything. */
export const MAX_OVERLAY_BYTES = 32 * 1024

/**
 * The fonts a layer may name. ONE family is bundled in the repository today (the renderer must work on serverless with no system fonts, see fonts.ts); a family is added
 * here only together with its font files.
 */
export const OVERLAY_FONTS = ['sans'] as const
export type OverlayFont = (typeof OVERLAY_FONTS)[number]
export const OVERLAY_WEIGHTS = ['normal', 'bold'] as const
export type OverlayWeight = (typeof OVERLAY_WEIGHTS)[number]
export const OVERLAY_ALIGNS = ['left', 'center', 'right'] as const
export type OverlayAlign = (typeof OVERLAY_ALIGNS)[number]

export interface OverlayBackground { color: string; opacity: number }
export interface OverlayOutline { color: string; /** As a fraction of the font size. */ width: number }

export interface OverlayLayer {
  id: string
  type: 'text'
  text: string
  /** Centre of the layer, 0..1 of the frame. */
  x: number
  y: number
  /** Wrap width, 0.1..1 of the frame width. */
  width: number
  /** Font size as a fraction of the frame width. */
  size: number
  /** Degrees, -180..180, clockwise, about the centre. */
  rotation: number
  align: OverlayAlign
  font: OverlayFont
  weight: OverlayWeight
  color: string
  background: OverlayBackground | null
  outline: OverlayOutline | null
  shadow: boolean
  start_ms: number
  end_ms: number
}

export interface OverlayDoc {
  schema_version: typeof OVERLAY_SCHEMA_VERSION
  layers: OverlayLayer[]
}

export type OverlayValidation = { ok: true; doc: OverlayDoc } | { ok: false; errors: string[] }

export const emptyOverlay = (): OverlayDoc => ({ schema_version: OVERLAY_SCHEMA_VERSION, layers: [] })

/** A fresh layer in the middle of the frame for the editor's "add text" button. Times are the caller's to set (they depend on the clip). */
export function defaultTextLayer(id: string, durationMs = 3000): OverlayLayer {
  return {
    id, type: 'text', text: 'Văn bản', x: 0.5, y: 0.5, width: 0.8, size: 0.07, rotation: 0, align: 'center', font: 'sans', weight: 'bold',
    color: '#ffffff', background: null, outline: { color: '#000000', width: 0.08 }, shadow: true, start_ms: 0, end_ms: Math.max(1, Math.round(durationMs)),
  }
}

const ID_RE = /^[A-Za-z0-9_-]{1,32}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
// Control characters (except the newline), and the characters that hide or reorder text: zero-width, direction marks and overrides. Built from escapes so no literal
// control byte appears in this source.
const FORBIDDEN_TEXT = new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]')

const DOC_KEYS = ['schema_version', 'layers']
const LAYER_KEYS = ['id', 'type', 'text', 'x', 'y', 'width', 'size', 'rotation', 'align', 'font', 'weight', 'color', 'background', 'outline', 'shadow', 'start_ms', 'end_ms']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

function unknownKeys(obj: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${path}.${k}`)
}

function checkColor(v: unknown, path: string, errors: string[]): string {
  if (typeof v !== 'string' || !COLOR_RE.test(v)) { errors.push(path); return '#000000' }
  return v.toLowerCase()
}

/** `durationMs`: the clip's own length when known; a layer may not end after it. */
export function validateOverlayDoc(input: unknown, opts: { durationMs?: number } = {}): OverlayValidation {
  if (!isRecord(input)) return { ok: false, errors: ['doc'] }
  const errors: string[] = []
  unknownKeys(input, DOC_KEYS, 'doc', errors)
  if (input.schema_version !== OVERLAY_SCHEMA_VERSION) errors.push('schema_version')
  const rawLayers = input.layers
  const layers: OverlayLayer[] = []

  if (!Array.isArray(rawLayers) || rawLayers.length > MAX_LAYERS) {
    errors.push('layers')
  } else {
    const seen = new Set<string>()
    rawLayers.forEach((raw, i) => {
      const p = `layers.${i}`
      if (!isRecord(raw)) { errors.push(p); return }
      unknownKeys(raw, LAYER_KEYS, p, errors)

      if (typeof raw.id !== 'string' || !ID_RE.test(raw.id) || seen.has(raw.id)) errors.push(`${p}.id`)
      else seen.add(raw.id)
      if (raw.type !== 'text') errors.push(`${p}.type`)

      const text = raw.text
      if (typeof text !== 'string' || text.trim().length === 0 || [...text].length > MAX_TEXT_LENGTH || FORBIDDEN_TEXT.test(text) || text.split('\n').length > MAX_TEXT_LINES) errors.push(`${p}.text`)

      if (!num(raw.x, 0, 1)) errors.push(`${p}.x`)
      if (!num(raw.y, 0, 1)) errors.push(`${p}.y`)
      if (!num(raw.width, 0.1, 1)) errors.push(`${p}.width`)
      if (!num(raw.size, 0.02, 0.2)) errors.push(`${p}.size`)
      if (!num(raw.rotation, -180, 180)) errors.push(`${p}.rotation`)
      if (!(OVERLAY_ALIGNS as readonly unknown[]).includes(raw.align)) errors.push(`${p}.align`)
      if (!(OVERLAY_FONTS as readonly unknown[]).includes(raw.font)) errors.push(`${p}.font`)
      if (!(OVERLAY_WEIGHTS as readonly unknown[]).includes(raw.weight)) errors.push(`${p}.weight`)
      const color = checkColor(raw.color, `${p}.color`, errors)

      let background: OverlayBackground | null = null
      if (raw.background !== null) {
        if (!isRecord(raw.background)) errors.push(`${p}.background`)
        else {
          unknownKeys(raw.background, ['color', 'opacity'], `${p}.background`, errors)
          const bc = checkColor(raw.background.color, `${p}.background.color`, errors)
          if (!num(raw.background.opacity, 0, 1)) errors.push(`${p}.background.opacity`)
          else background = { color: bc, opacity: raw.background.opacity }
        }
      }
      let outline: OverlayOutline | null = null
      if (raw.outline !== null) {
        if (!isRecord(raw.outline)) errors.push(`${p}.outline`)
        else {
          unknownKeys(raw.outline, ['color', 'width'], `${p}.outline`, errors)
          const oc = checkColor(raw.outline.color, `${p}.outline.color`, errors)
          if (!num(raw.outline.width, 0, 0.2)) errors.push(`${p}.outline.width`)
          else outline = { color: oc, width: raw.outline.width }
        }
      }
      if (typeof raw.shadow !== 'boolean') errors.push(`${p}.shadow`)

      const maxEnd = opts.durationMs !== undefined && Number.isFinite(opts.durationMs) ? opts.durationMs : Number.MAX_SAFE_INTEGER
      const startOk = typeof raw.start_ms === 'number' && Number.isInteger(raw.start_ms) && raw.start_ms >= 0 && raw.start_ms <= maxEnd
      if (!startOk) errors.push(`${p}.start_ms`)
      const endOk = typeof raw.end_ms === 'number' && Number.isInteger(raw.end_ms) && raw.end_ms > 0 && raw.end_ms <= maxEnd && (!startOk || raw.end_ms > (raw.start_ms as number))
      if (!endOk) errors.push(`${p}.end_ms`)

      layers.push({
        id: raw.id as string, type: 'text', text: text as string, x: raw.x as number, y: raw.y as number, width: raw.width as number, size: raw.size as number,
        rotation: raw.rotation as number, align: raw.align as OverlayAlign, font: raw.font as OverlayFont, weight: raw.weight as OverlayWeight, color, background, outline,
        shadow: raw.shadow as boolean, start_ms: raw.start_ms as number, end_ms: raw.end_ms as number,
      })
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, doc: { schema_version: OVERLAY_SCHEMA_VERSION, layers } }
}

/** One canonical text for a valid document: fixed key order, so equal documents are equal strings (the cache key and the stored value rely on it). */
export function serializeOverlay(doc: OverlayDoc): string {
  return JSON.stringify({
    schema_version: doc.schema_version,
    layers: doc.layers.map(l => ({
      id: l.id, type: l.type, text: l.text, x: l.x, y: l.y, width: l.width, size: l.size, rotation: l.rotation, align: l.align, font: l.font, weight: l.weight, color: l.color,
      background: l.background ? { color: l.background.color, opacity: l.background.opacity } : null,
      outline: l.outline ? { color: l.outline.color, width: l.outline.width } : null,
      shadow: l.shadow, start_ms: l.start_ms, end_ms: l.end_ms,
    })),
  })
}

export function parseOverlay(text: string, opts: { durationMs?: number } = {}): OverlayValidation {
  if (typeof text !== 'string' || text.length > MAX_OVERLAY_BYTES) return { ok: false, errors: ['doc'] }
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return { ok: false, errors: ['doc'] } }
  return validateOverlayDoc(parsed, opts)
}

/**
 * EVERY piece of text the overlay shows, in layer order. The moderation step reads the overlay only through this function, so it also works on a stored document that
 * no longer validates (an older version, a corrupted row): it takes whatever string a layer holds rather than refusing, because text that cannot be read cannot be checked.
 * Never throws.
 */
export function overlayTextOf(doc: unknown): string[] {
  if (!isRecord(doc) || !Array.isArray(doc.layers)) return []
  const out: string[] = []
  for (const layer of doc.layers) if (isRecord(layer) && typeof layer.text === 'string') out.push(layer.text)
  return out
}

/** A layer id the validator accepts, unique in practice (random, not a counter, so two editors of the same draft cannot collide). */
export function newLayerId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return `t${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}
