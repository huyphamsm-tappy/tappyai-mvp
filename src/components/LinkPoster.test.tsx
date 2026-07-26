// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import LinkPoster from './LinkPoster'
import { POSTER_PLACEHOLDER } from '@/lib/links/platforms'

describe('LinkPoster — always renders a non-empty poster', () => {
  it('renders the photo when present', () => {
    const { container } = render(<LinkPoster review={{ photos: ['https://cdn/x.jpg'], content_type: 'photo' }} />)
    const img = container.querySelector('img')!
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('https://cdn/x.jpg')
  })

  it('renders the stored thumbnail for a video', () => {
    const { container } = render(<LinkPoster review={{ thumbnail: 'https://i.ytimg.com/vi/a/hqdefault.jpg', content_type: 'video', source_type: 'youtube' }} />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://i.ytimg.com/vi/a/hqdefault.jpg')
  })

  it('renders the platform placeholder — never an empty src — for a video with no thumbnail', () => {
    const { container } = render(<LinkPoster review={{ thumbnail: '', content_type: 'video', source_type: 'youtube' }} />)
    const src = container.querySelector('img')!.getAttribute('src')
    expect(src).toBe(POSTER_PLACEHOLDER.youtube)
    expect(src).not.toBe('')
  })

  it('legacy TikTok row with no thumbnail → generic video placeholder (graceful, never blank)', () => {
    const { container } = render(<LinkPoster review={{ thumbnail: '', content_type: 'video', source_type: 'tiktok' }} />)
    expect(container.querySelector('img')!.getAttribute('src')).toBe(POSTER_PLACEHOLDER.video)
  })

  it('always renders exactly one <img> with a non-empty src, whatever the input', () => {
    for (const review of [{}, { photos: [] }, { thumbnail: null, source_type: 'youtube' }, { source_type: 'upload' }]) {
      const { container } = render(<LinkPoster review={review} />)
      const imgs = container.querySelectorAll('img')
      expect(imgs.length).toBe(1)
      expect((imgs[0].getAttribute('src') || '').length).toBeGreaterThan(0)
    }
  })
})
