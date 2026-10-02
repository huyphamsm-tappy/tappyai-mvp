// Owner UAT 2026-09-28: a shared Explore clip previewed as a bare "TappyAI" card. The preview must
// carry the post's real title, a description, and its own picture as an absolute URL.

import { describe, it, expect } from 'vitest'
import { buildReviewMetadata } from './reviewMetadata'
import { buildSharedResultMetadata } from './sharedResultMetadata'
import { OG_IMAGE_PATH } from './openGraph'
import { reviewShareVideoUrl } from './reviewShareMedia'

const SITE = 'https://www.tappyai.com'
const env = { NEXT_PUBLIC_SITE_URL: SITE } as unknown as NodeJS.ProcessEnv
const GCS_VIDEO = 'https://storage.googleapis.com/tappyai-media-prod/videos/u/clip.mp4'
const GCS_THUMB = 'https://storage.googleapis.com/tappyai-media-prod/thumbs/u/clip.jpg'

type Loose = Record<string, any> // metadata unions are narrower than these assertions need
const og = (m: unknown) => (m as Loose).openGraph
const tw = (m: unknown) => (m as Loose).twitter

describe('/reviews/<id> — an uploaded Explore clip', () => {
  const clip = {
    place_name: 'Chia sẻ', rating: 0, body: 'Bánh mì Huỳnh Hoa giòn rụm\nxếp hàng 20 phút',
    photos: null, thumbnail: GCS_THUMB, content_type: 'video', media_url: GCS_VIDEO, source_type: 'upload',
  }
  const m = buildReviewMetadata('c1', clip, env)

  it('is titled by its caption — never the sentinel, never "0/5 sao", never just "TappyAI"', () => {
    expect(og(m).title).toBe('Bánh mì Huỳnh Hoa giòn rụm')
    expect(String(m.title)).toContain('Bánh mì Huỳnh Hoa')
    expect(JSON.stringify(m)).not.toMatch(/Chia sẻ —|0\/5 sao/)
  })

  it('describes it with the caption', () => {
    expect(m.description).toContain('xếp hàng 20 phút')
    expect(og(m).description).toBe(m.description)
  })

  it('shows its own thumbnail, absolute, and advertises the video file', () => {
    expect(og(m).images[0].url).toBe(GCS_THUMB)
    expect(tw(m).images[0]).toBe(GCS_THUMB)
    expect(og(m).videos[0].url).toBe(GCS_VIDEO)
    expect(og(m).type).toBe('video.other')
  })

  it('carries the canonical url, the site name and a large twitter card', () => {
    expect(og(m).url).toBe(`${SITE}/reviews/c1`)
    expect(og(m).siteName).toBe('TappyAI')
    expect(tw(m).card).toBe('summary_large_image')
  })
})

describe('/reviews/<id> — a YouTube clip and a rated place', () => {
  it('a YouTube clip shows its thumbnail but advertises no file of ours', () => {
    const m = buildReviewMetadata('y1', {
      place_name: 'Phở Hòa', rating: 4, body: '', thumbnail: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
      content_type: 'video', media_url: null, source_type: 'youtube', place_address: '260C Pasteur, Q3',
    }, env)
    expect(og(m).title).toBe('Phở Hòa — 4/5 sao')
    expect(og(m).images[0].url).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg')
    expect(og(m).videos).toBeUndefined()
    expect(og(m).type).toBe('article')
    // No caption: the place and its address describe it.
    expect(m.description).toBe('Phở Hòa — 260C Pasteur, Q3')
  })

  it('a suspended Blob photo falls back to the ABSOLUTE branded card; empty everything → the tagline', () => {
    const m = buildReviewMetadata('b1', {
      place_name: 'Chia sẻ', rating: 0, body: '', photos: ['https://abc.public.blob.vercel-storage.com/x.jpg'],
    }, env)
    expect(og(m).images[0].url).toBe(`${SITE}${OG_IMAGE_PATH}`)
    expect(og(m).title).toBe('TappyAI')
    expect(String(m.description).length).toBeGreaterThan(10)
  })
})

describe('/r/<slug> — a public result', () => {
  it('carries its own title, a body snippet and its per-share OG image on the site origin', () => {
    const m = buildSharedResultMetadata({
      slug: 'pho-ngon-q3-abc123', og_version: 2, created_at: '2026-09-28T00:00:00Z',
      payload: { title: 'Phở ngon Quận 3', body: 'Phở Hòa Pasteur là lựa chọn quen thuộc với nước dùng đậm.', query: 'phở ngon q3', locale: 'vi', images: [], buttons: [] },
    } as never, env)
    expect(og(m).title).toContain('Phở ngon Quận 3')
    expect(og(m).description).toContain('Phở Hòa Pasteur')
    expect(og(m).images[0].url).toBe(`${SITE}/r/pho-ngon-q3-abc123/og.png?v=2`)
    expect(og(m).type).toBe('article')
    expect(tw(m).card).toBe('summary_large_image')
  })
})

describe('reviewShareVideoUrl — which posts have a file for TikTok', () => {
  it('an uploaded clip on https storage: its video', () => {
    expect(reviewShareVideoUrl({ content_type: 'video', media_url: GCS_VIDEO, source_type: 'upload' })).toBe(GCS_VIDEO)
    expect(reviewShareVideoUrl({ content_type: 'video', media_url: GCS_VIDEO, source_type: null })).toBe(GCS_VIDEO)
  })
  it('a YouTube clip, a photo post, a Blob or relative url: none', () => {
    expect(reviewShareVideoUrl({ content_type: 'video', media_url: GCS_VIDEO, source_type: 'youtube' })).toBeUndefined()
    expect(reviewShareVideoUrl({ content_type: 'image', media_url: GCS_VIDEO })).toBeUndefined()
    expect(reviewShareVideoUrl({ content_type: 'video', media_url: 'https://a.public.blob.vercel-storage.com/v.mp4' })).toBeUndefined()
    expect(reviewShareVideoUrl({ content_type: 'video', media_url: '/v.mp4' })).toBeUndefined()
  })
})
