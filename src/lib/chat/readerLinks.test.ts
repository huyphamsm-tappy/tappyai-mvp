// 15/11 (owner): which links of an answer open the reader beside the chat. One rule for every answer; the exceptions are the links that are not a page to read or that must land on a partner.
import { describe, it, expect } from 'vitest'
import { readerLinkTarget, isPlainClick, READER_SCOPE, type AnchorLike } from './readerLinks'

const ORIGIN = 'https://tappy.test'
const a = (href: string, over: Partial<AnchorLike> & { attrs?: Record<string, string>; text?: string } = {}): AnchorLike => ({
  href, target: '_blank', textContent: over.text ?? 'Bài báo', getAttribute: (n: string) => over.attrs?.[n] ?? null, ...(over.download !== undefined ? { download: over.download } : {}),
})

describe('readerLinkTarget', () => {
  it('an ordinary https link to another site opens in the reader, with its words as the title', () => {
    expect(readerLinkTarget(a('https://vnexpress.net/gia-vang-123.html', { text: 'Giá vàng giảm mạnh' }), ORIGIN)).toEqual({ url: 'https://vnexpress.net/gia-vang-123.html', title: 'Giá vàng giảm mạnh' })
    expect(readerLinkTarget(a('https://www.reuters.com/world/x', { text: 'https://www.reuters.com/world/x' }), ORIGIN)?.title).toBe('') // a bare address is no title
  })
  it('a link of this site, a link with credentials, http, and other schemes keep their usual behaviour', () => {
    for (const h of ['https://tappy.test/chat/1', 'https://user:pw@vnexpress.net/a', 'http://vnexpress.net/a', 'mailto:x@y.z', 'tel:+8412345', 'javascript:void(0)', '']) {
      expect(readerLinkTarget(a(h), ORIGIN), h).toBeNull()
    }
  })
  it('maps, video, social networks and messengers keep opening where they belong', () => {
    for (const h of ['https://www.google.com/maps/place/Hoan+Kiem', 'https://maps.google.com/?q=x', 'https://maps.app.goo.gl/abc', 'https://www.youtube.com/watch?v=1', 'https://youtu.be/1', 'https://www.facebook.com/x', 'https://www.tiktok.com/@a', 'https://zalo.me/123', 'https://x.com/a/status/1']) {
      expect(readerLinkTarget(a(h), ORIGIN), h).toBeNull()
    }
    expect(readerLinkTarget(a('https://www.google.com/search?q=x'), ORIGIN)).not.toBeNull() // a google.com page that is not the map is a page like any other
  })
  it('a partner / affiliate link goes to the partner, a download downloads, a link that opts out stays out', () => {
    expect(readerLinkTarget(a('https://go.isclix.com/deep_link/abc?url=https%3A%2F%2Fshopee.vn%2Fp'), ORIGIN)).toBeNull()
    expect(readerLinkTarget(a('https://vnexpress.net/a.pdf', { download: true }), ORIGIN)).toBeNull()
    expect(readerLinkTarget(a('https://vnexpress.net/a', { attrs: { 'data-reader': 'off' } }), ORIGIN)).toBeNull()
  })
})

describe('isPlainClick', () => {
  const ev = (o: Partial<Record<string, unknown>> = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...o }) as never
  it('only a plain left click; a modifier key, a middle click or an already handled click is the person asking for something else', () => {
    expect(isPlainClick(ev())).toBe(true)
    for (const o of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) expect(isPlainClick(ev(o))).toBe(false)
  })
})

describe('READER_SCOPE', () => {
  it('names the answer text, the sources list, the media cards and the opened report - not place cards or booking buttons', () => {
    for (const s of ['.message-content', '[data-doc-sources]', '[data-media]', 'research-canvas']) expect(READER_SCOPE).toContain(s)
    for (const s of ['data-place', 'data-block', 'booking', 'composer']) expect(READER_SCOPE).not.toContain(s)
  })
})
