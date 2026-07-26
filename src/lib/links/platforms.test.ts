import { describe, it, expect } from 'vitest'
import {
  detectSource,
  extractYouTubeId,
  extractTikTokId,
  youTubeThumbnail,
  placeholderFor,
  posterFor,
  POSTER_PLACEHOLDER,
  SUPPORTED_LINK_SOURCES,
} from './platforms'

describe('detectSource — V1 supports YouTube + TikTok only', () => {
  it('detects youtube.com and youtu.be', () => {
    expect(detectSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube')
    expect(detectSource('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(detectSource('https://youtube.com/shorts/abc12345678')).toBe('youtube')
  })
  it('detects tiktok', () => {
    expect(detectSource('https://www.tiktok.com/@user/video/7222222222222222222')).toBe('tiktok')
  })
  it('REJECTS facebook and instagram (dropped in V1)', () => {
    expect(detectSource('https://www.facebook.com/watch?v=123')).toBeNull()
    expect(detectSource('https://fb.watch/abc')).toBeNull()
    expect(detectSource('https://www.instagram.com/reel/abc/')).toBeNull()
  })
  it('rejects unknown / empty', () => {
    expect(detectSource('https://example.com/x')).toBeNull()
    expect(detectSource('')).toBeNull()
  })
  it('SUPPORTED_LINK_SOURCES is exactly youtube+tiktok', () => {
    expect([...SUPPORTED_LINK_SOURCES].sort()).toEqual(['tiktok', 'youtube'])
  })
})

describe('extractYouTubeId', () => {
  it('parses all URL shapes', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('returns null for non-video URLs', () => {
    expect(extractYouTubeId('https://www.youtube.com/@channel')).toBeNull()
  })
})

describe('youTubeThumbnail — deterministic, always hqdefault', () => {
  it('builds the hqdefault url (never maxres, which 404s)', () => {
    expect(youTubeThumbnail('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })
})

describe('extractTikTokId', () => {
  it('parses canonical and embed URLs', () => {
    expect(extractTikTokId('https://www.tiktok.com/@user/video/7222222222222222222')).toBe('7222222222222222222')
    expect(extractTikTokId('https://www.tiktok.com/embed/v2/7222222222222222222')).toBe('7222222222222222222')
  })
})

describe('posterFor — never empty (the render-side never-blank guarantee)', () => {
  it('prefers a real photo', () => {
    expect(posterFor({ photos: ['https://cdn/x.jpg'], content_type: 'photo' })).toBe('https://cdn/x.jpg')
  })
  it('falls back to the stored thumbnail for a video', () => {
    expect(posterFor({ photos: [], thumbnail: 'https://i.ytimg.com/vi/a/hqdefault.jpg', content_type: 'video', source_type: 'youtube' }))
      .toBe('https://i.ytimg.com/vi/a/hqdefault.jpg')
  })
  it('YouTube post with NO thumbnail → youtube placeholder (never empty)', () => {
    expect(posterFor({ photos: [], thumbnail: '', content_type: 'video', source_type: 'youtube' })).toBe(POSTER_PLACEHOLDER.youtube)
  })
  it('TikTok post with NO thumbnail → tiktok placeholder', () => {
    expect(posterFor({ thumbnail: null, content_type: 'video', source_type: 'tiktok' })).toBe(POSTER_PLACEHOLDER.tiktok)
  })
  it('upload with failed thumbnail → generic video placeholder', () => {
    expect(posterFor({ thumbnail: '', content_type: 'video', source_type: 'upload' })).toBe(POSTER_PLACEHOLDER.video)
  })
  it('legacy facebook row → generic placeholder (never blank)', () => {
    expect(posterFor({ thumbnail: '', content_type: 'video', source_type: 'facebook' })).toBe(POSTER_PLACEHOLDER.video)
  })
  it('NEVER returns an empty string, whatever the input', () => {
    const cases = [
      {}, { photos: [] }, { photos: [''] }, { thumbnail: '   ' },
      { source_type: 'youtube' }, { source_type: 'tiktok' }, { source_type: 'upload' },
    ]
    for (const c of cases) expect(posterFor(c).length).toBeGreaterThan(0)
  })
})

describe('placeholderFor', () => {
  it('maps every source_type to a non-empty path', () => {
    expect(placeholderFor('youtube')).toBe(POSTER_PLACEHOLDER.youtube)
    expect(placeholderFor('tiktok')).toBe(POSTER_PLACEHOLDER.tiktok)
    expect(placeholderFor('upload')).toBe(POSTER_PLACEHOLDER.video)
    expect(placeholderFor(null)).toBe(POSTER_PLACEHOLDER.video)
  })
})
