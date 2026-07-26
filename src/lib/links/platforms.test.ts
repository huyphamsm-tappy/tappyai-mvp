import { describe, it, expect } from 'vitest'
import {
  detectSource,
  extractYouTubeId,
  youTubeThumbnail,
  placeholderFor,
  posterFor,
  POSTER_PLACEHOLDER,
  SUPPORTED_LINK_SOURCES,
} from './platforms'

describe('detectSource — V1 supports YouTube only', () => {
  it('detects youtube.com and youtu.be', () => {
    expect(detectSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube')
    expect(detectSource('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(detectSource('https://youtube.com/shorts/abc12345678')).toBe('youtube')
  })
  it('REJECTS TikTok (removed in V1)', () => {
    expect(detectSource('https://www.tiktok.com/@user/video/7222222222222222222')).toBeNull()
    expect(detectSource('https://vm.tiktok.com/ZABC/')).toBeNull()
  })
  it('REJECTS Facebook and Instagram', () => {
    expect(detectSource('https://www.facebook.com/watch?v=123')).toBeNull()
    expect(detectSource('https://www.instagram.com/reel/abc/')).toBeNull()
  })
  it('rejects unknown / empty', () => {
    expect(detectSource('https://example.com/x')).toBeNull()
    expect(detectSource('')).toBeNull()
  })
  it('SUPPORTED_LINK_SOURCES is exactly [youtube]', () => {
    expect([...SUPPORTED_LINK_SOURCES]).toEqual(['youtube'])
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

describe('posterFor — never empty (the render-side never-blank guarantee)', () => {
  it('prefers a real photo', () => {
    expect(posterFor({ photos: ['https://cdn/x.jpg'], content_type: 'photo' })).toBe('https://cdn/x.jpg')
  })
  it('falls back to the stored thumbnail for a video', () => {
    expect(posterFor({ photos: [], thumbnail: 'https://i.ytimg.com/vi/a/hqdefault.jpg', content_type: 'video', source_type: 'youtube' }))
      .toBe('https://i.ytimg.com/vi/a/hqdefault.jpg')
  })
  it('YouTube post with NO thumbnail → youtube placeholder', () => {
    expect(posterFor({ photos: [], thumbnail: '', content_type: 'video', source_type: 'youtube' })).toBe(POSTER_PLACEHOLDER.youtube)
  })
  it('legacy TikTok row with no thumbnail → generic video placeholder (never blank)', () => {
    expect(posterFor({ thumbnail: null, content_type: 'video', source_type: 'tiktok' })).toBe(POSTER_PLACEHOLDER.video)
  })
  it('legacy TikTok row still renders its stored thumbnail when present', () => {
    expect(posterFor({ thumbnail: 'https://p16.tiktokcdn.com/x.jpg', content_type: 'video', source_type: 'tiktok' }))
      .toBe('https://p16.tiktokcdn.com/x.jpg')
  })
  it('upload with failed thumbnail → generic video placeholder', () => {
    expect(posterFor({ thumbnail: '', content_type: 'video', source_type: 'upload' })).toBe(POSTER_PLACEHOLDER.video)
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
  it('youtube → youtube placeholder; everything else → generic video', () => {
    expect(placeholderFor('youtube')).toBe(POSTER_PLACEHOLDER.youtube)
    expect(placeholderFor('tiktok')).toBe(POSTER_PLACEHOLDER.video)   // removed provider
    expect(placeholderFor('facebook')).toBe(POSTER_PLACEHOLDER.video)
    expect(placeholderFor('upload')).toBe(POSTER_PLACEHOLDER.video)
    expect(placeholderFor(null)).toBe(POSTER_PLACEHOLDER.video)
  })
  it('there is no TikTok placeholder', () => {
    expect((POSTER_PLACEHOLDER as Record<string, string>).tiktok).toBeUndefined()
  })
})
