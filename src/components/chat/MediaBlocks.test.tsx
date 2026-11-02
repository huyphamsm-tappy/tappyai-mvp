// @vitest-environment jsdom
// CONSULT_V3 layouts: the media blocks as rendered, and the grouped source chip of the chat renderer (build flag on).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NewsMediaGrid, EntityCard, EntityPanel } from './MediaBlocks'

afterEach(() => cleanup())
const ENTITY = { name: 'Elon Musk', summary: 'Elon Reeve Musk là doanh nhân.', image: 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Elon.jpg', href: 'https://vi.wikipedia.org/wiki/Elon_Musk', source: 'Wikipedia' as const }

describe('NewsMediaGrid', () => {
  it('shows up to 3 allowed pictures, each linking to its own article, with "+N" for the rest; a disallowed one is never rendered', () => {
    const it4 = (n: number, host = 'i1-vnexpress.vnecdn.net') => ({ src: `https://${host}/${n}.jpg`, href: `https://vnexpress.net/${n}.html`, label: 'VnExpress', title: `Bài ${n}` })
    const { container } = render(<NewsMediaGrid items={[it4(1), it4(2), it4(3), it4(4), it4(5, 'evil.example')]} />)
    const imgs = [...container.querySelectorAll('img')].map(i => i.getAttribute('src'))
    expect(imgs).toEqual(['https://i1-vnexpress.vnecdn.net/1.jpg', 'https://i1-vnexpress.vnecdn.net/2.jpg', 'https://i1-vnexpress.vnecdn.net/3.jpg'])
    expect([...container.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['https://vnexpress.net/1.html', 'https://vnexpress.net/2.html', 'https://vnexpress.net/3.html'])
    expect(screen.getByText('+1')).toBeTruthy()
    expect(container.innerHTML).not.toContain('evil.example')
  })
})

describe('EntityCard / EntityPanel', () => {
  it('the card shows picture, name and summary; tapping the name opens the panel', () => {
    const onOpen = vi.fn()
    render(<EntityCard entity={ENTITY} onOpen={onOpen} />)
    expect(screen.getByText('Elon Reeve Musk là doanh nhân.')).toBeTruthy()
    fireEvent.click(screen.getByText('Elon Musk'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
  it('the panel reads in place, links out to the article only, and closes on Escape', () => {
    const onClose = vi.fn()
    const { container } = render(<EntityPanel entity={ENTITY} onClose={onClose} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect([...container.querySelectorAll('a')].map(a => a.getAttribute('href'))).toEqual(['https://vi.wikipedia.org/wiki/Elon_Musk'])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
  // owner 02/11: with Nikola Tesla open, tapping Elon took two taps - the panel's full-screen backdrop caught the first one
  it('with the panel open, a tap outside it reaches what is under it (one tap switches subject) and closes the panel', () => {
    const onClose = vi.fn()
    const behind = vi.fn()
    const { container } = render(<div><button type="button" onClick={behind}>Elon card</button><EntityPanel entity={ENTITY} onClose={onClose} /></div>)
    const card = screen.getByText('Elon card')
    // nothing of the panel covers the page: no full-screen element takes the tap
    expect(container.querySelector('[data-media="entity-panel"]')?.className).toContain('pointer-events-none')
    fireEvent.pointerDown(card)
    fireEvent.click(card)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(behind).toHaveBeenCalledTimes(1)
  })
  it('a tap inside the panel keeps it open', () => {
    const onClose = vi.fn()
    render(<EntityPanel entity={ENTITY} onClose={onClose} />)
    fireEvent.pointerDown(screen.getByText('Elon Reeve Musk là doanh nhân.'))
    expect(onClose).not.toHaveBeenCalled()
  })
  it('an entity whose link is not an allowed article page renders nothing', () => {
    const { container } = render(<EntityCard entity={{ ...ENTITY, href: 'https://evil.example/wiki/x' }} onOpen={() => {}} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('grouped source chip (NEXT_PUBLIC_CONSULT_V3=1)', () => {
  it('" ([a](u1), [b](u2))" becomes one chip "VnExpress +1" titled with both outlets; a single cited source loses its brackets', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_CONSULT_V3', '1')
    const { formatMessage } = await import('@/components/ChatInterface')
    const html = formatMessage('Tin mới ([vnexpress.net](https://vnexpress.net/a.html), [tuoitre.vn](https://tuoitre.vn/b.htm)). Còn đây ([vnexpress.net](https://vnexpress.net/c.html)).')
    expect(html).toContain('>VnExpress +1</a>')
    expect(html).toContain('title="VnExpress, Tuổi Trẻ"')
    expect(html).toContain('href="https://vnexpress.net/a.html"')
    expect(html).not.toMatch(/\(\s*<a/)
    expect(html).toContain('>VnExpress</a>')
    vi.unstubAllEnvs()
  })
  it('flag off: the chips stay as before (one per source, in brackets)', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_CONSULT_V3', '')
    const { formatMessage } = await import('@/components/ChatInterface')
    const html = formatMessage('Tin mới ([vnexpress.net](https://vnexpress.net/a.html), [tuoitre.vn](https://tuoitre.vn/b.htm)).')
    expect(html).not.toContain('+1')
    expect((html.match(/<a /g) ?? []).length).toBe(2)
    vi.unstubAllEnvs()
  })
})
