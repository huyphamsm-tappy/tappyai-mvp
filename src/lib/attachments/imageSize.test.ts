import { describe, it, expect, afterEach, vi } from 'vitest'
import { imageDimensions, dataUrlImageSize } from './policy'
import { validateClientInput } from '@/lib/ai/security/clientInput'

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16 = (n: number) => [(n >>> 8) & 255, n & 255]
const png = (w: number, h: number) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32(13), 0x49, 0x48, 0x44, 0x52, ...u32(w), ...u32(h), 8, 6, 0, 0, 0])
const gif = (w: number, h: number) => Uint8Array.from([...new TextEncoder().encode('GIF89a'), w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0])
// JPEG: SOI, an APP0 segment to skip, then SOF0 (height then width)
const jpeg = (w: number, h: number) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...u16(16), ...new Array(14).fill(0), 0xff, 0xc0, ...u16(17), 8, ...u16(h), ...u16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])
const webpX = (w: number, h: number) => Uint8Array.from([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP'), ...new TextEncoder().encode('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255])
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')

describe('imageDimensions (from the header)', () => {
  it('reads PNG, GIF, JPEG (past an APP0 segment) and WebP VP8X', () => {
    expect(imageDimensions(png(1000, 20000))).toEqual({ width: 1000, height: 20000 })
    expect(imageDimensions(gif(320, 200))).toEqual({ width: 320, height: 200 })
    expect(imageDimensions(jpeg(4032, 3024))).toEqual({ width: 4032, height: 3024 })
    expect(imageDimensions(webpX(800, 600))).toEqual({ width: 800, height: 600 })
  })
  it('null for non-images, truncated headers and a JPEG with no frame header', () => {
    expect(imageDimensions(new TextEncoder().encode('hello'))).toBeNull()
    expect(imageDimensions(png(1, 1).subarray(0, 12))).toBeNull()
    expect(imageDimensions(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0, 0, 0, 0]))).toBeNull()
  })
  it('dataUrlImageSize reads a data URL and never throws on junk', () => {
    expect(dataUrlImageSize(`data:image/png;base64,${b64(png(640, 480))}`)).toEqual({ width: 640, height: 480 })
    expect(dataUrlImageSize('data:image/png;base64,@@@@')).toBeNull()
    expect(dataUrlImageSize('not a data url')).toBeNull()
  })
})

describe('validateClientInput image preflight (ATTACHMENT_BYTE_CHECK)', () => {
  afterEach(() => vi.unstubAllEnvs())
  const body = (b: Uint8Array) => ({ messages: [{ role: 'user', content: 'x', experimental_attachments: [{ url: `data:image/png;base64,${b64(b)}`, contentType: 'image/png', name: 'a' }] }] })
  it('off: a 1000x20000 image passes as before', () => {
    expect(validateClientInput(body(png(1000, 20000))).ok).toBe(true)
  })
  it('on: the 1000x20000 image is refused before Vision, an ordinary photo passes', () => {
    vi.stubEnv('ATTACHMENT_BYTE_CHECK', '1')
    const bad = validateClientInput(body(png(1000, 20000)))
    expect(bad.ok).toBe(false); expect(!bad.ok && bad.code).toBe('image_too_large')
    expect(validateClientInput(body(png(4032, 3024))).ok).toBe(true)
  })
})
