// Server-side drawing of overlay text (and the download watermark) to FULL-FRAME transparent PNGs for the Transcoder (Explore video VID-02 / VID-04).
//
// Each layer becomes ONE PNG the size of the output frame, with the text already placed, rotated and clipped at its normalised position. The Transcoder then only has to
// lay that picture over the whole frame (position 0,0, size 1x1) for the layer's time window: no coordinate or rotation maths is left to the job, and a rotated or
// partly off-frame layer cannot be refused for its bounding box. Static PNGs compress to a few KB.
//
// HOW THE TEXT IS DRAWN: sharp's text input (Pango + FreeType, built into sharp) from a font FILE shipped in the repository (see fonts.ts for why), not a system font.
// Outline and shadow are built from the glyph mask (grow / blur) and composited under the text; the background is a plain rectangle. All pure: input in, bytes out.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { OVERLAY_ASSET_DIR, resolveFont, unsupportedChars, type ResolvedFont } from './fonts'
import { SHADOW, boxWidthPx, fontPx, paddingPx } from './layout'
import type { OverlayLayer } from './schema'

export class OverlayGlyphError extends Error {
  readonly chars: string[]
  constructor(chars: string[]) {
    super('overlay text uses characters the bundled font cannot draw')
    this.name = 'OverlayGlyphError'
    this.chars = chars
  }
}
export class OverlayFontMissingError extends Error {
  constructor() { super('no overlay font is installed'); this.name = 'OverlayFontMissingError' }
}

export interface FrameSize { width: number; height: number }

const hex = (c: string) => ({ r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) })
const escapeMarkup = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function assertFrame(f: FrameSize) {
  if (![f.width, f.height].every(n => Number.isInteger(n) && n >= 16 && n <= 4096)) throw new RangeError('overlay: bad frame size')
}

interface Mask { data: Uint8Array; w: number; h: number }

/** Draws text (white) with Pango and returns its alpha as a one-channel mask, tight to the ink/line box. */
async function textMask(text: string, font: ResolvedFont, px: number, wrapWidth: number, align: OverlayLayer['align']): Promise<Mask> {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="#ffffff">${escapeMarkup(text)}</span>`,
      font: `${font.family} ${font.weight === 'bold' && !font.syntheticBold ? 'Bold ' : ''}${px}`,
      fontfile: font.file,
      width: Math.max(8, wrapWidth),
      align: align === 'center' ? 'centre' : align,
      rgba: true,
      dpi: 72,
      wrap: 'word-char',
    },
  }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const out = new Uint8Array(info.width * info.height)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3]
  const mask: Mask = { data: out, w: info.width, h: info.height }
  if (!font.syntheticBold) return mask
  // A regular face asked for bold: thicken the glyphs by about 3% of the font size (with room around them so the edge is not cut).
  const r = Math.max(1, Math.round(px * 0.03))
  return grow(place(mask, mask.w + 2 * r, mask.h + 2 * r, r, r), r)
}

/** Puts a mask on a bigger empty canvas at (ox, oy). */
function place(mask: Mask, w: number, h: number, ox: number, oy: number): Mask {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < mask.h; y++) {
    const ty = y + oy
    if (ty < 0 || ty >= h) continue
    for (let x = 0; x < mask.w; x++) {
      const tx = x + ox
      if (tx >= 0 && tx < w) out[ty * w + tx] = mask.data[y * mask.w + x]
    }
  }
  return { data: out, w, h }
}

/** blur then gain: with a gain above 1 the blurred edge saturates, which grows the shape by about `radius` pixels. */
async function grow(mask: Mask, radius: number): Promise<Mask> {
  const sigma = Math.max(0.3, radius / 2)
  const data = await sharp(Buffer.from(mask.data), { raw: { width: mask.w, height: mask.h, channels: 1 } }).blur(sigma).linear(4, 0).extractChannel(0).raw().toBuffer()
  return { data: new Uint8Array(data), w: mask.w, h: mask.h }
}
async function blurred(mask: Mask, sigma: number, opacity: number): Promise<Mask> {
  const data = await sharp(Buffer.from(mask.data), { raw: { width: mask.w, height: mask.h, channels: 1 } }).blur(Math.max(0.3, sigma)).linear(opacity, 0).extractChannel(0).raw().toBuffer()
  return { data: new Uint8Array(data), w: mask.w, h: mask.h }
}

/** A solid colour whose alpha is the mask. */
async function colorize(mask: Mask, color: string): Promise<Buffer> {
  const { r, g, b } = hex(color)
  const rgba = Buffer.alloc(mask.w * mask.h * 4)
  for (let i = 0; i < mask.data.length; i++) { rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = mask.data[i] }
  return sharp(rgba, { raw: { width: mask.w, height: mask.h, channels: 4 } }).png().toBuffer()
}

/** Cuts the part of `block` that falls inside the frame and places it; everything else of the frame stays transparent. */
async function putOnFrame(block: Buffer, bw: number, bh: number, centerX: number, centerY: number, frame: FrameSize): Promise<Buffer> {
  const left = Math.round(centerX - bw / 2)
  const top = Math.round(centerY - bh / 2)
  const x0 = Math.max(0, left), y0 = Math.max(0, top)
  const x1 = Math.min(frame.width, left + bw), y1 = Math.min(frame.height, top + bh)
  const canvas = sharp({ create: { width: frame.width, height: frame.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  if (x1 <= x0 || y1 <= y0) return canvas.png({ compressionLevel: 9 }).toBuffer()
  const part = await sharp(block).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).toBuffer()
  return canvas.composite([{ input: part, left: x0, top: y0 }]).png({ compressionLevel: 9 }).toBuffer()
}

/** One text layer as a transparent PNG exactly `frame` pixels in size. Throws OverlayGlyphError when the font cannot draw the text. */
export async function renderTextLayerPng(layer: OverlayLayer, frame: FrameSize, opts: { fontDir?: string } = {}): Promise<Buffer> {
  assertFrame(frame)
  const font = resolveFont(layer.weight, opts.fontDir)
  if (!font) throw new OverlayFontMissingError()
  const missing = unsupportedChars(layer.text, font)
  if (missing.length > 0) throw new OverlayGlyphError(missing)

  const px = fontPx(layer, frame.width)
  const boxW = boxWidthPx(layer, frame.width)
  const pad = paddingPx(px)
  const text = await textMask(layer.text, font, px, boxW - 2 * pad.x, layer.align)

  // The block: the layer's box plus a margin for the outline, the shadow and its blur, so none of them is cut off before the rotation.
  const outlineR = layer.outline ? Math.ceil(layer.outline.width * px) : 0
  const margin = Math.ceil(px * 0.2) + outlineR + Math.ceil(px * (SHADOW.dy + SHADOW.blur * 3))
  const innerW = Math.max(boxW, text.w + 2 * pad.x)
  const innerH = text.h + 2 * pad.y
  const bw = innerW + 2 * margin
  const bh = innerH + 2 * margin
  // The text sits inside the box according to its alignment.
  const textLeft = layer.align === 'left' ? pad.x : layer.align === 'right' ? innerW - pad.x - text.w : Math.round((innerW - text.w) / 2)
  const tx = margin + textLeft
  const ty = margin + pad.y
  const mask = place(text, bw, bh, tx, ty)

  const parts: OverlayOptions[] = []
  if (layer.shadow) {
    // The blurred glyph mask, shifted right/down (sharp cannot take negative offsets, and the shadow never moves left/up), under everything else.
    const m = await blurred(mask, px * SHADOW.blur, SHADOW.opacity)
    parts.push({ input: await colorize(place(m, bw, bh, Math.round(px * SHADOW.dx), Math.round(px * SHADOW.dy)), '#000000'), left: 0, top: 0 })
  }
  if (layer.background && layer.background.opacity > 0) {
    const w = Math.min(innerW, text.w + 2 * pad.x)
    const bgLeft = layer.align === 'left' ? 0 : layer.align === 'right' ? innerW - w : Math.round((innerW - w) / 2)
    const { r, g, b } = hex(layer.background.color)
    parts.push({
      input: await sharp({ create: { width: w, height: innerH, channels: 4, background: { r, g, b, alpha: layer.background.opacity } } }).png().toBuffer(),
      left: margin + bgLeft, top: margin,
    })
  }
  if (layer.outline && outlineR > 0) parts.push({ input: await colorize(await grow(mask, outlineR), layer.outline.color), left: 0, top: 0 })
  parts.push({ input: await colorize(mask, layer.color), left: 0, top: 0 })

  let block = await sharp({ create: { width: bw, height: bh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(parts).png().toBuffer()
  if (layer.rotation % 360 !== 0) block = await sharp(block).rotate(layer.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const meta = await sharp(block).metadata()
  return putOnFrame(block, meta.width as number, meta.height as number, layer.x * frame.width, layer.y * frame.height, frame)
}

// ---- watermark ------------------------------------------------------------

const WATERMARK_TAGLINE = 'Explore on TappyAI'
const HANDLE_RE = /^[a-z0-9._]{1,24}$/

/** Turns a display name into the ASCII handle shown in the watermark: no diacritics (any font draws it), lower case, letters, digits, dot and underscore only. */
export function watermarkHandle(displayName: string | null | undefined): string {
  const base = String(displayName ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const handle = base.slice(0, 24)
  return HANDLE_RE.test(handle) ? handle : 'tappyai'
}

let logoCache: Buffer | null = null
function logo(): Buffer {
  if (!logoCache) logoCache = readFileSync(path.join(OVERLAY_ASSET_DIR, 'assets', 'tappy-mark.png'))
  return logoCache
}

/**
 * The download watermark: TappyAI mark, "@handle" and "Explore on TappyAI" in a dark rounded plate near the bottom, centred, readable on any picture. Never drawn on normal
 * playback; only the download job uses it.
 */
export async function renderWatermarkPng(frame: FrameSize, handle: string, opts: { fontDir?: string } = {}): Promise<Buffer> {
  assertFrame(frame)
  const safe = HANDLE_RE.test(handle) ? handle : 'tappyai'
  const bold = resolveFont('bold', opts.fontDir)
  const regular = resolveFont('normal', opts.fontDir)
  if (!bold || !regular) throw new OverlayFontMissingError()

  const px = Math.max(12, Math.round(frame.width * 0.036))
  const [name, tag] = await Promise.all([
    textMask(`@${safe}`, bold, px, frame.width, 'left'),
    textMask(WATERMARK_TAGLINE, regular, Math.round(px * 0.8), frame.width, 'left'),
  ])
  const markSize = Math.round(px * 2.2)
  const gap = Math.round(px * 0.5)
  const padX = Math.round(px * 0.7)
  const padY = Math.round(px * 0.5)
  const textW = Math.max(name.w, tag.w)
  const textH = name.h + tag.h
  const plateW = padX + markSize + gap + textW + padX
  const plateH = Math.max(markSize, textH) + 2 * padY

  // A rounded dark plate, 55% opaque, so the white text reads on a bright or busy picture.
  const rounded = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}"><rect width="${plateW}" height="${plateH}" rx="${Math.round(plateH * 0.3)}" fill="#000"/></svg>`)).ensureAlpha().raw().toBuffer()
  const plate = Buffer.alloc(plateW * plateH * 4)
  for (let i = 0; i < plateW * plateH; i++) plate[i * 4 + 3] = Math.round(rounded[i * 4 + 3] * 0.55)

  const textTop = padY + Math.round((Math.max(markSize, textH) - textH) / 2)
  const block = await sharp(plate, { raw: { width: plateW, height: plateH, channels: 4 } })
    .composite([
      { input: await sharp(logo()).resize(markSize, markSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: padX, top: Math.round((plateH - markSize) / 2) },
      { input: await colorize(name, '#ffffff'), left: padX + markSize + gap, top: textTop },
      { input: await colorize(tag, '#e6eefc'), left: padX + markSize + gap, top: textTop + name.h },
    ])
    .png().toBuffer()

  // Centred, with its bottom edge 9% of the frame height above the bottom (clear of the usual player controls and safe-area).
  const centerY = frame.height - Math.round(frame.height * 0.09) - plateH / 2
  return putOnFrame(block, plateW, plateH, frame.width / 2, centerY, frame)
}
