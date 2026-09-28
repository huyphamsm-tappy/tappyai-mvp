// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/viet-content',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('posthog-js', () => ({ __esModule: true, default: { capture: vi.fn() } }))
vi.mock('@/components/Header', () => ({
  __esModule: true,
  default: ({ title, backFallbackHref }: { title?: string; backFallbackHref?: string }) => (
    <header data-testid="header" data-back-fallback={backFallbackHref ?? ''}>{title}</header>
  ),
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))

import VietContentView from './VietContentView'
import { vi as viCopy } from '@/lib/i18n/w3/vietContent'

// ── "Viết content" — the approved 2026-09-28 design over the SAME generator ──
// Hero, four cards (topic / platform / tone / length) and a gradient CTA. The
// request body sent to /api/viet-content is unchanged; only the UI moved.

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  setLocale('vi')
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ caption: 'Cap', hashtags: '#a' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const q = (sel: string) => document.querySelector(sel) as HTMLElement
const textarea = () => document.getElementById('vc-topic') as HTMLTextAreaElement

describe('hero', () => {
  it('shows the kicker, the title with only "vài giây" in the gradient, and the subtitle', () => {
    render(<VietContentView user={undefined} />)
    const hero = q('[data-vc-hero]')
    expect(hero.textContent).toContain(viCopy['vietContent.heroKicker'])
    const h1 = within(hero).getByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('Caption hấp dẫn')
    expect(h1.textContent).toContain('trong vài giây')
    expect(q('[data-vc-accent]').textContent).toBe('vài giây')
    expect(q('[data-vc-accent]').className).toContain('bg-clip-text')
    expect(hero.textContent).toContain(viCopy['vietContent.heroSubtitle'])
  })

  it('carries the mascot and the three platform marks from local assets only', () => {
    render(<VietContentView user={undefined} />)
    const hero = q('[data-vc-hero]')
    const srcs = [...hero.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(expect.arrayContaining(['/tappy/reading.png', '/brands/share/facebook.svg', '/brands/share/tiktok.svg']))
    expect(hero.querySelector('[data-brand="instagram"]')).not.toBeNull()
    expect(srcs.every((s) => s?.startsWith('/'))).toBe(true)
  })
})

describe('topic card', () => {
  it('has the required label, the design placeholder and a 0/500 counter', () => {
    render(<VietContentView user={undefined} />)
    const card = q('[data-vc-section="topic"]')
    expect(card.textContent).toContain('Chủ đề / Mô tả nội dung')
    expect(card.textContent).toContain('*')
    expect(textarea().placeholder).toBe(viCopy['vietContent.topicPlaceholder'])
    expect(textarea().maxLength).toBe(500)
    expect(q('[data-vc-counter]').textContent).toBe('0/500')
  })

  it('"Thử gợi ý" fills the textarea from the client-side list and cycles', () => {
    render(<VietContentView user={undefined} />)
    const btn = q('[data-vc-try-example]')
    expect(btn.textContent).toContain('Thử gợi ý')
    fireEvent.click(btn)
    expect(textarea().value).toBe(viCopy['vietContent.example1'])
    expect(q('[data-vc-counter]').textContent).toBe(`${viCopy['vietContent.example1'].length}/500`)
    fireEvent.click(btn)
    expect(textarea().value).toBe(viCopy['vietContent.example2'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('platform tiles', () => {
  it('renders Facebook / TikTok / Instagram with brand logos, Facebook selected with a check', () => {
    render(<VietContentView user={undefined} />)
    const card = q('[data-vc-section="platform"]')
    expect(card.textContent).toContain(viCopy['vietContent.platformHint'])
    const tiles = [...card.querySelectorAll('[data-vc-platform]')] as HTMLElement[]
    expect(tiles.map((t) => t.textContent)).toEqual(['Facebook', 'TikTok', 'Instagram'])
    expect(tiles.map((t) => t.querySelector('[data-brand]')?.getAttribute('data-brand'))).toEqual(['facebook', 'tiktok', 'instagram'])
    expect(tiles.map((t) => t.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    expect(tiles[0].querySelector('[data-vc-check]')).not.toBeNull()
    expect(tiles[0].className).toContain('border-primary-500')
  })

  it('moves the selection and the check on click', () => {
    render(<VietContentView user={undefined} />)
    fireEvent.click(q('[data-vc-platform="tiktok"]'))
    expect(q('[data-vc-platform="tiktok"]').getAttribute('aria-pressed')).toBe('true')
    expect(q('[data-vc-platform="facebook"]').getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelectorAll('[data-vc-section="platform"] [data-vc-check]')).toHaveLength(1)
  })
})

describe('tone chips', () => {
  it('has five icon chips in design order, "Trẻ trung" selected with the amber border', () => {
    render(<VietContentView user={undefined} />)
    const card = q('[data-vc-section="tone"]')
    expect(card.textContent).toContain(viCopy['vietContent.toneHint'])
    const chips = [...card.querySelectorAll('[data-vc-tone]')] as HTMLElement[]
    expect(chips.map((c) => c.textContent)).toEqual(['Hài hước', 'Cảm xúc', 'Trẻ trung', 'Truyền cảm hứng', 'Chuyên nghiệp'])
    chips.forEach((c) => expect(c.querySelector('svg')).not.toBeNull())
    const youthful = q('[data-vc-tone="youthful"]')
    expect(youthful.getAttribute('aria-pressed')).toBe('true')
    expect(youthful.className).toContain('border-accent-500')
    fireEvent.click(q('[data-vc-tone="funny"]'))
    expect(q('[data-vc-tone="funny"]').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('length options', () => {
  it('shows Ngắn / Trung bình / Dài with descriptions and a check on the selected one', () => {
    render(<VietContentView user={undefined} />)
    const card = q('[data-vc-section="length"]')
    expect(card.textContent).toContain(viCopy['vietContent.lengthHint'])
    const opts = [...card.querySelectorAll('[data-vc-length]')] as HTMLElement[]
    expect(opts.map((o) => o.getAttribute('data-vc-length'))).toEqual(['short', 'medium', 'long'])
    expect(opts[0].textContent).toContain('Ngắn')
    expect(opts[1].textContent).toContain('Trung bình')
    expect(opts[2].textContent).toContain('Dài')
    // Descriptions state what the API asks the model for (LENGTH_GUIDE), not invented char counts.
    expect(opts[0].textContent).toContain(viCopy['vietContent.lengthShortHint'])
    const selected = opts.filter((o) => o.getAttribute('aria-pressed') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].querySelector('[data-vc-check]')).not.toBeNull()
    fireEvent.click(opts[0])
    expect(opts[0].getAttribute('aria-pressed')).toBe('true')
  })
})

describe('CTA', () => {
  it('is the full-width gradient "Tạo caption ngay", disabled until there is a topic', () => {
    render(<VietContentView user={undefined} />)
    const cta = q('[data-vc-submit]') as HTMLButtonElement
    expect(cta.textContent).toContain('Tạo caption ngay')
    expect(cta.className).toContain('w-full')
    expect(cta.className).toContain('bg-gradient-to-r')
    expect(cta.disabled).toBe(true)
    fireEvent.click(q('[data-vc-try-example]'))
    expect(cta.disabled).toBe(false)
  })

  it('posts the same body as before to /api/viet-content and shows the result', async () => {
    render(<VietContentView user={undefined} />)
    fireEvent.change(textarea(), { target: { value: 'Quán phở mới' } })
    fireEvent.click(q('[data-vc-platform="instagram"]'))
    fireEvent.click(q('[data-vc-tone="funny"]'))
    fireEvent.click(q('[data-vc-length="long"]'))
    fireEvent.click(q('[data-vc-submit]'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/viet-content')
    expect(JSON.parse(init.body)).toEqual({ topic: 'Quán phở mới', platform: 'instagram', tone: 'funny', length: 'long' })
    await screen.findByText('Cap')
  })
})
