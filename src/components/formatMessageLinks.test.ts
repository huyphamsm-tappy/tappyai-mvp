// UAT 2026-09-28 (owner P1c/P1d): raw URLs, glued links, a broken photo link and big blank gaps.
import { describe, expect, it } from 'vitest'
import { formatMessage, linkLabelFor, isImageUrl } from './ChatInterface'

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('formatMessage — links are chips, photos are images, no raw URL, no blank gaps', () => {
  it('a bare URL is never printed as text', () => {
    const html = formatMessage('Xem thêm https://www.facebook.com/PHOBOPHODEQUAN1?locale=vi_VN nhé')
    expect(text(html)).not.toContain('https://')
    expect(text(html)).toContain('Facebook')
    expect(html).toContain('href="https://www.facebook.com/PHOBOPHODEQUAN1?locale=vi_VN"')
  })
  it('adjacent links are separate chips ("Official WebsiteGoogle Maps")', () => {
    const html = formatMessage('[Official Website](https://phonhatvi.vn/)[Google Maps](https://maps.google.com/?cid=1)')
    const anchors = html.match(/<a [^>]*>[^<]*<\/a>/g) ?? []
    expect(anchors).toHaveLength(2)
    expect(anchors.every(a => /rounded-full/.test(a) && /mx-0\.5/.test(a))).toBe(true)
  })
  it('a photo written as a link renders as the photo', () => {
    const html = formatMessage('[Ảnh địa điểm](https://lh3.googleusercontent.com/p/AF1QipN-abc=w408-h306)')
    expect(html).toContain('<img src="https://lh3.googleusercontent.com/p/AF1QipN-abc=w408-h306"')
    expect(text(html)).not.toContain('Ảnh địa điểm')
  })
  it('a bare photo URL renders as the photo', () => {
    const html = formatMessage('https://encrypted-tbn0.gstatic.com/images?q=tbn:abc')
    expect(html).toContain('<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:abc"')
  })
  it('a link whose label is itself a URL gets a readable label', () => {
    expect(text(formatMessage('[https://www.google.com/maps/place/x](https://www.google.com/maps/place/x)'))).toBe('Google Maps')
  })
  it('blank-line runs left by a cut collapse to one paragraph break', () => {
    expect(formatMessage('Danh sách.\n\n\n\n\n\nBạn đi mấy người?')).toBe('Danh sách.\n\nBạn đi mấy người?')
    expect(formatMessage('A.\n   \n \n\nB?')).toBe('A.\n\nB?')
  })
  it('labels and image detection', () => {
    expect(linkLabelFor('https://food.grab.com/vn/vi/restaurant/x')).toBe('GrabFood')
    expect(linkLabelFor('https://maps.app.goo.gl/abc')).toBe('Google Maps')
    expect(isImageUrl('https://maps.google.com/?cid=1')).toBe(false)
    expect(isImageUrl('https://example.com/a.jpg')).toBe(true)
  })
})
