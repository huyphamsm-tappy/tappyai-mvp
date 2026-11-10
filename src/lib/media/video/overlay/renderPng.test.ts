import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { OverlayGlyphError, renderTextLayerPng, renderWatermarkPng, watermarkHandle } from './renderPng'
import { resolveFont, unsupportedChars } from './fonts'
import { defaultTextLayer, type OverlayLayer } from './schema'

const FRAME = { width: 360, height: 640 }
const layer = (over: Partial<OverlayLayer> = {}): OverlayLayer => ({ ...defaultTextLayer('a1'), text: 'Xin chào Đà Nẵng!', outline: null, shadow: false, ...over })

async function raw(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}
/** Number of pixels with any alpha, and their bounding box. */
async function ink(png: Buffer) {
  const { data, w, h } = await raw(png)
  let n = 0, full = 0, minX = w, maxX = -1, minY = h, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * 4 + 3]
    if (a === 255) full++
    if (a > 8) { n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  return { n, full, minX, maxX, minY, maxY, w, h }
}

describe('renderTextLayerPng', () => {
  it('draws Vietnamese text with diacritics: a PNG exactly the frame size with real glyph pixels', async () => {
    const png = await renderTextLayerPng(layer(), FRAME)
    const meta = await sharp(png).metadata()
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['png', 360, 640, true])
    const i = await ink(png)
    expect(i.n).toBeGreaterThan(500)
    // The corners are transparent: only the layer is drawn.
    const { data, w } = await raw(png)
    expect(data[3]).toBe(0)
    expect(data[((FRAME.height - 1) * w + (FRAME.width - 1)) * 4 + 3]).toBe(0)
  })

  it('the diacritics are really drawn: the same letters without accents leave fewer pixels', async () => {
    const accented = await ink(await renderTextLayerPng(layer({ text: 'Đà Nẵng ầ ệ' }), FRAME))
    const plain = await ink(await renderTextLayerPng(layer({ text: 'Da Nang a e' }), FRAME))
    expect(accented.n).not.toBe(plain.n)
    expect(accented.minY).toBeLessThan(plain.minY) // accents rise above the letters
  })

  it('places the layer by its normalised centre', async () => {
    const top = await ink(await renderTextLayerPng(layer({ y: 0.2 }), FRAME))
    const bottom = await ink(await renderTextLayerPng(layer({ y: 0.8 }), FRAME))
    expect((top.minY + top.maxY) / 2).toBeCloseTo(0.2 * 640, -1)
    expect((bottom.minY + bottom.maxY) / 2).toBeCloseTo(0.8 * 640, -1)
    const left = await ink(await renderTextLayerPng(layer({ x: 0.3, width: 0.5, align: 'center' }), FRAME))
    expect((left.minX + left.maxX) / 2).toBeCloseTo(0.3 * 360, -1)
  })

  it('uses the layer colour for the glyphs', async () => {
    const { data, w, h } = await raw(await renderTextLayerPng(layer({ color: '#ff0000', size: 0.14, text: 'III' }), FRAME))
    let seen = false
    for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] === 255) { seen = true; expect([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]).toEqual([255, 0, 0]) }
    expect(seen).toBe(true)
  })

  it('size is a fraction of the frame width: the same layer on a frame twice as wide is twice as large', async () => {
    const small = await ink(await renderTextLayerPng(layer({ align: 'center' }), { width: 360, height: 640 }))
    const big = await ink(await renderTextLayerPng(layer({ align: 'center' }), { width: 720, height: 1280 }))
    const ratio = (big.maxX - big.minX) / (small.maxX - small.minX)
    expect(ratio).toBeGreaterThan(1.85)
    expect(ratio).toBeLessThan(2.15)
  })

  it('background, outline and shadow each add pixels; rotation changes the picture; same input gives the same bytes', async () => {
    const base = await ink(await renderTextLayerPng(layer(), FRAME))
    const withBg = await ink(await renderTextLayerPng(layer({ background: { color: '#000000', opacity: 0.6 } }), FRAME))
    const withOutline = await ink(await renderTextLayerPng(layer({ outline: { color: '#000000', width: 0.1 } }), FRAME))
    const withShadow = await ink(await renderTextLayerPng(layer({ shadow: true }), FRAME))
    expect(withBg.n).toBeGreaterThan(base.n * 2)
    expect(withOutline.n).toBeGreaterThan(base.n)
    expect(withShadow.n).toBeGreaterThan(base.n)
    const a = await renderTextLayerPng(layer({ rotation: 30 }), FRAME)
    const b = await renderTextLayerPng(layer({ rotation: 30 }), FRAME)
    const c = await renderTextLayerPng(layer({ rotation: 0 }), FRAME)
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
    expect((await ink(a)).maxY - (await ink(a)).minY).toBeGreaterThan(base.maxY - base.minY)
  })

  it('a layer partly or wholly outside the frame is clipped, never an error', async () => {
    const edge = await ink(await renderTextLayerPng(layer({ x: 1, y: 1 }), FRAME))
    expect(edge.n).toBeGreaterThan(0)
    expect(edge.maxX).toBeLessThan(360)
    const corner = await renderTextLayerPng(layer({ x: 0, y: 0, width: 0.1, size: 0.02, rotation: 90 }), FRAME)
    expect((await sharp(corner).metadata()).width).toBe(360)
  })

  it('wraps long text inside the box and honours the line limit of the box width', async () => {
    const wrapped = await ink(await renderTextLayerPng(layer({ text: 'một hai ba bốn năm sáu bảy tám chín mười mười một mười hai', width: 0.5, align: 'left', x: 0.5 }), FRAME))
    expect(wrapped.maxX - wrapped.minX).toBeLessThanOrEqual(0.5 * 360 + 2)
    expect(wrapped.maxY - wrapped.minY).toBeGreaterThan(60)
  })

  it('markup in the text is drawn as text, never interpreted', async () => {
    const png = await renderTextLayerPng(layer({ text: '<b>&amp; <span foreground="red">x</span>' }), FRAME)
    expect((await ink(png)).n).toBeGreaterThan(100)
  })

  it('🚨 refuses characters the font cannot draw instead of drawing a fallback or a box', async () => {
    await expect(renderTextLayerPng(layer({ text: 'xin 日本 chào' }), FRAME)).rejects.toBeInstanceOf(OverlayGlyphError)
    try { await renderTextLayerPng(layer({ text: '日' }), FRAME) } catch (e) { expect((e as OverlayGlyphError).chars).toEqual(['日']) }
  })

  it('refuses a bad frame size', async () => {
    await expect(renderTextLayerPng(layer(), { width: 0, height: 100 })).rejects.toThrow(RangeError)
    await expect(renderTextLayerPng(layer(), { width: 100.5, height: 100 })).rejects.toThrow(RangeError)
    await expect(renderTextLayerPng(layer(), { width: 100000, height: 100 })).rejects.toThrow(RangeError)
  })
})

describe('font coverage', () => {
  it('knows what the installed font can draw', () => {
    const font = resolveFont('bold')
    expect(font).not.toBeNull()
    if (!font) return
    expect(unsupportedChars('Xin chào Đà Nẵng! 123 ,.?', font)).toEqual([])
    expect(unsupportedChars('日本', font)).toEqual(['日', '本'])
    // Every Vietnamese letter, upper and lower case, with every tone.
    const all = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵđ'
    expect(unsupportedChars(all + all.toUpperCase(), font)).toEqual([])
  })

  it('a regular face asked for bold is thickened: more ink than the regular weight', async () => {
    const regular = await ink(await renderTextLayerPng(layer({ weight: 'normal', align: 'center' }), FRAME))
    const bold = await ink(await renderTextLayerPng(layer({ weight: 'bold', align: 'center' }), FRAME))
    expect(bold.full).toBeGreaterThan(regular.full * 1.3)
  })
})

describe('renderWatermarkPng', () => {
  it('draws the plate in the lower part of the frame only, and is deterministic', async () => {
    const png = await renderWatermarkPng(FRAME, 'huy.pham')
    const i = await ink(png)
    expect([i.w, i.h]).toEqual([360, 640])
    expect(i.n).toBeGreaterThan(2000)
    expect(i.minY).toBeGreaterThan(640 * 0.6)
    expect(i.maxY).toBeLessThan(640 * 0.95)
    expect(i.minX).toBeGreaterThan(0)
    expect(i.maxX).toBeLessThan(359)
    expect((await renderWatermarkPng(FRAME, 'huy.pham')).equals(png)).toBe(true)
    expect((await renderWatermarkPng(FRAME, 'other')).equals(png)).toBe(false)
  })

  it('contains light pixels (white text) on a dark plate', async () => {
    const { data, w, h } = await raw(await renderWatermarkPng(FRAME, 'huy'))
    let light = 0, dark = 0
    for (let i = 0; i < w * h; i++) {
      if (data[i * 4 + 3] > 200 && data[i * 4] > 230) light++
      if (data[i * 4 + 3] > 80 && data[i * 4 + 3] < 200 && data[i * 4] < 20) dark++
    }
    expect(light).toBeGreaterThan(100)
    expect(dark).toBeGreaterThan(1000)
  })

  it('scales with the frame', async () => {
    const a = await ink(await renderWatermarkPng({ width: 360, height: 640 }, 'huy'))
    const b = await ink(await renderWatermarkPng({ width: 720, height: 1280 }, 'huy'))
    expect((b.maxX - b.minX) / (a.maxX - a.minX)).toBeGreaterThan(1.85)
  })
})

describe('watermarkHandle', () => {
  it('makes a plain ASCII handle from a display name', () => {
    expect(watermarkHandle('Phạm Quốc Huy')).toBe('phamquochuy')
    expect(watermarkHandle('Đặng Văn A')).toBe('dangvana')
    expect(watermarkHandle('a'.repeat(60))).toBe('a'.repeat(24))
    expect(watermarkHandle('')).toBe('tappyai')
    expect(watermarkHandle(null)).toBe('tappyai')
    expect(watermarkHandle('日本')).toBe('tappyai')
    expect(watermarkHandle('<b>x</b>')).toBe('bxb')
  })
})
