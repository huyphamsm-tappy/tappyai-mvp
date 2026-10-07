// TikTok takes a FILE (image/video), never a link — owner requirement, UAT 2026-09-28.

import { describe, it, expect, vi } from 'vitest'
import {
  TIKTOK_CONTENT_POSTING_ENABLED, TIKTOK_UPLOAD_URL, canShareFiles, chooseTikTokPath, fetchVideoFile, runTikTokShare, tiktokCaption,
} from './tiktokShare'

const png = () => new File(['png'], 'tappyai-post-2026-09-28.png', { type: 'image/png' })

function deps(nav?: Partial<Navigator>) {
  return { nav, download: vi.fn(), open: vi.fn(), copy: vi.fn(async () => true) }
}

describe('chooseTikTokPath', () => {
  it('a phone that can share files → the OS sheet with the file', () => {
    expect(chooseTikTokPath({ file: png(), canShareFiles: true })).toBe('share-files')
  })
  it('desktop (or no file sharing) → download + open tiktok.com/upload', () => {
    expect(chooseTikTokPath({ file: png(), canShareFiles: false })).toBe('download-open')
  })
  it('no file at all → copy', () => {
    expect(chooseTikTokPath({ file: null, canShareFiles: true })).toBe('copy')
  })
})

describe('runTikTokShare', () => {
  it('mobile: navigator.share({ files, text: caption + link }) — nothing downloaded, nothing opened', async () => {
    const share = vi.fn(async () => {})
    const d = deps({ share, canShare: () => true } as Partial<Navigator>)
    const file = png()
    expect(await runTikTokShare(file, 'Phở Hòa\nhttps://www.tappyai.com/reviews/x', d)).toBe('shared')
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [file], text: 'Phở Hòa\nhttps://www.tappyai.com/reviews/x' }))
    expect(d.download).not.toHaveBeenCalled()
    expect(d.open).not.toHaveBeenCalled()
  })

  it('desktop: downloads the file and opens https://www.tiktok.com/upload', async () => {
    const d = deps({} as Partial<Navigator>)
    const file = png()
    expect(await runTikTokShare(file, 'x', d)).toBe('downloaded')
    expect(d.download).toHaveBeenCalledWith(file)
    expect(d.open).toHaveBeenCalledWith(TIKTOK_UPLOAD_URL)
    expect(TIKTOK_UPLOAD_URL).toBe('https://www.tiktok.com/upload')
  })

  it('a phone whose canShare refuses files → download + open', async () => {
    const share = vi.fn()
    const d = deps({ share, canShare: () => false } as unknown as Partial<Navigator>)
    expect(await runTikTokShare(png(), 'x', d)).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
  })

  it('the user closing the sheet is a cancel — no download, no tab', async () => {
    const share = vi.fn(async () => { throw new DOMException('cancel', 'AbortError') })
    const d = deps({ share, canShare: () => true } as Partial<Navigator>)
    expect(await runTikTokShare(png(), 'x', d)).toBe('cancelled')
    expect(d.download).not.toHaveBeenCalled()
  })

  it('a refused share (expired user activation) still delivers the file: download + open', async () => {
    const share = vi.fn(async () => { throw new DOMException('no activation', 'NotAllowedError') })
    const d = deps({ share, canShare: () => true } as Partial<Navigator>)
    expect(await runTikTokShare(png(), 'x', d)).toBe('downloaded')
    expect(d.open).toHaveBeenCalledWith(TIKTOK_UPLOAD_URL)
  })

  it('no file → the caption is copied', async () => {
    const d = deps({} as Partial<Navigator>)
    expect(await runTikTokShare(null, 'cap', d)).toBe('copied')
    expect(d.copy).toHaveBeenCalledWith('cap')
  })
})

describe('helpers', () => {
  it('caption = title line + link, deduplicated', () => {
    expect(tiktokCaption('Phở Hòa', 'https://www.tappyai.com/reviews/x')).toBe('Phở Hòa\nhttps://www.tappyai.com/reviews/x')
    expect(tiktokCaption('https://a', 'https://a')).toBe('https://a')
    expect(tiktokCaption('', 'https://a')).toBe('https://a')
  })

  it('canShareFiles never throws and needs both share and canShare', () => {
    expect(canShareFiles(undefined, png())).toBe(false)
    expect(canShareFiles({ share: vi.fn() } as unknown as Partial<Navigator>, png())).toBe(false)
    expect(canShareFiles({ share: vi.fn(), canShare: () => { throw new Error('x') } } as unknown as Partial<Navigator>, png())).toBe(false)
  })

  it('the Content Posting API seam is OFF by default', () => {
    expect(TIKTOK_CONTENT_POSTING_ENABLED).toBe(false)
  })
})

describe('fetchVideoFile — an uploaded clip as a File', () => {
  const res = (body: Blob, headers: Record<string, string>, ok = true) =>
    ({ ok, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null }, blob: async () => body }) as unknown as Response

  it('returns a video File named after the type', async () => {
    const f = await fetchVideoFile('https://storage.googleapis.com/b/v.mp4', 'tappyai-clip',
      vi.fn(async () => res(new Blob(['vid'], { type: 'video/mp4' }), { 'content-type': 'video/mp4' })) as unknown as typeof fetch)
    expect(f?.type).toBe('video/mp4')
    expect(f?.name).toBe('tappyai-clip.mp4')
  })

  it('null on a failed fetch, a non-2xx, an empty body or an oversized declared length', async () => {
    const boom = vi.fn(async () => { throw new TypeError('CORS') }) as unknown as typeof fetch
    expect(await fetchVideoFile('https://x/v.mp4', 'c', boom)).toBeNull()
    expect(await fetchVideoFile('https://x/v.mp4', 'c', vi.fn(async () => res(new Blob(['v']), {}, false)) as unknown as typeof fetch)).toBeNull()
    expect(await fetchVideoFile('https://x/v.mp4', 'c', vi.fn(async () => res(new Blob([]), {})) as unknown as typeof fetch)).toBeNull()
    expect(await fetchVideoFile('https://x/v.mp4', 'c', vi.fn(async () => res(new Blob(['v']), { 'content-length': String(500 * 1024 * 1024) })) as unknown as typeof fetch)).toBeNull()
  })
})
