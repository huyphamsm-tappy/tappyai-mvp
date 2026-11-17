// @vitest-environment jsdom
// 16/11 (owner's mockup, tab 2): the mosaic under the opening - three pictures (one large, two stacked), two side by side, fewer than two nothing.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import GalleryBlock from './GalleryBlock'
import PresentationBlocks from './PresentationBlocks'
import { subjectKey } from '@/lib/answerDoc/subjectImages'

afterEach(cleanup)
const s = (caption: string, src?: string) => ({ caption, src })

describe('GalleryBlock', () => {
  it('three pictures: the mosaic, each with its caption chip', () => {
    const { container } = render(<GalleryBlock shots={[s('Model S', 'https://img.example.com/a.jpg'), s('Model 3', 'https://img.example.com/b.jpg'), s('Cybertruck', 'https://img.example.com/c.jpg')]} />)
    expect(container.querySelectorAll('img')).toHaveLength(3)
    expect([...container.querySelectorAll('[data-gallery-caption]')].map(e => e.textContent)).toEqual(['Model S', 'Model 3', 'Cybertruck'])
    expect(container.querySelector('[data-block="gallery"]')?.className).toContain('grid-cols-3')
  })

  it('two pictures side by side, one picture a wide banner; none or only unsafe addresses draw nothing', () => {
    const two = render(<GalleryBlock shots={[s('A', 'https://img.example.com/a.jpg'), s('B', 'https://img.example.com/b.jpg'), s('C')]} />)
    expect(two.container.querySelectorAll('img')).toHaveLength(2)
    expect(two.container.querySelector('[data-block="gallery"]')?.className).toContain('grid-cols-2')
    cleanup()
    const one = render(<GalleryBlock shots={[s('A', 'https://img.example.com/a.jpg'), s('B')]} />)
    expect(one.container.querySelectorAll('img')).toHaveLength(1)
    expect(one.container.querySelector('[data-block="gallery"]')?.className).not.toContain('grid')
    cleanup()
    expect(render(<GalleryBlock shots={[s('A'), s('B')]} />).container.innerHTML).toBe('')
    cleanup()
    expect(render(<GalleryBlock shots={[s('A', 'http://img.example.com/a.jpg'), s('B', 'javascript:alert(1)')]} />).container.innerHTML).toBe('')
  })

  it('a declared gallery takes its pictures from the server\'s map by caption', () => {
    const frame = { presentation: { v: 1 as const, blocks: [{ id: 'g', type: 'gallery' as const, items: [{ caption: 'Model S', query: 'q1' }, { caption: 'Model 3', query: 'q2' }] }] }, links: {} }
    const map = new Map([[subjectKey('model s'), 'https://img.example.com/a.jpg'], [subjectKey('Model 3'), 'https://img.example.com/b.jpg']])
    const { container } = render(<PresentationBlocks frame={frame} onSend={() => {}} galleryImages={map} />)
    expect(container.querySelectorAll('img')).toHaveLength(2)
    cleanup()
    expect(render(<PresentationBlocks frame={frame} onSend={() => {}} />).container.querySelector('[data-block="gallery"]')).toBeNull()
  })
})
