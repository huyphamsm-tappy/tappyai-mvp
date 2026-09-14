// @vitest-environment jsdom
// Sharing a Tappy Plan: the mini brochure, the minted link, and what leaves.
//
// Opening the menu on a plan artifact publishes the plan through the real
// endpoint contract (`POST /api/plans/share`, mocked at fetch) and every target
// then carries the plan's own `/plan/<shareId>` — not the brand url. A guest or
// signed-out sender keeps the text brochure and is told why there is no link.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { buildPlanArtifact, inboxBody, withPlanShareUrl } from '@/lib/share/shareArtifact'
import { toPlanShareSnapshot } from '@/lib/plans/share/planShare'
import type { TappyPlan } from '@/components/TripPlanCard'
import ShareMenu from './ShareMenu'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'vi',
  }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({
  default: ({ onStarted }: { onStarted: (id: string) => void }) => <button data-testid="stub-start" onClick={() => onStarted('thread-1')}>start</button>,
}))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

const PHOTO = 'https://lh3.googleusercontent.com/p/AF1QipM-a=s1360'
const ID = 'AbCdEfGhIjK1'
const PLAN_URL = `https://www.tappyai.com/plan/${ID}`

const plan: TappyPlan = {
  type: 'trip', title: 'Quy Nhơn 3 ngày 2 đêm', people: 2, budget_total: '5.000.000đ', share_text: 'Biển xanh, ẩm thực ngon.',
  days: [
    { label: 'Ngày 1', items: [
      { time: '09:00', emoji: '🏖️', category: 'entertainment', name: 'Bãi Kỳ Co', address: 'Xã Nhơn Lý', photo_url: PHOTO, place_id: 'ChIJsecret' },
      { time: '12:30', emoji: '🦐', category: 'food', name: 'Hải sản Nhơn Lý' },
      { time: '15:00', emoji: '🌅', category: 'entertainment', name: 'Eo Gió' },
      { time: '18:30', emoji: '🌆', category: 'entertainment', name: 'Quảng trường Quy Nhơn' },
    ] },
    { label: 'Ngày 2', items: [{ time: '08:00', emoji: '🏛️', category: 'entertainment', name: 'Tháp Đôi' }] },
  ],
}
const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const artifact = buildPlanArtifact(plan, 'vi', env)

let writeText: ReturnType<typeof vi.fn>
let open: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>
const status = () => screen.queryByRole('status')?.textContent ?? ''
const published = () => fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: ID, path: `/plan/${ID}`, url: PLAN_URL, reused: false }) })

beforeEach(() => {
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  open = vi.fn(() => ({}) as Window)
  vi.stubGlobal('open', open)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('the plan artifact', () => {
  it('carries the whitelisted snapshot and its language; the place id does not survive', () => {
    expect(artifact.kind).toBe('plan')
    expect(artifact.plan).toEqual(toPlanShareSnapshot(plan))
    expect(artifact.lang).toBe('vi')
    expect(JSON.stringify(artifact.plan)).not.toContain('ChIJsecret')
    expect(artifact.url).toBe('https://www.tappyai.com')
  })

  it('withPlanShareUrl moves the url AND the brochure footer, and nothing else in the text', () => {
    const moved = withPlanShareUrl(artifact, PLAN_URL)
    expect(moved.url).toBe(PLAN_URL)
    const before = artifact.text.split('\n'), after = moved.text.split('\n')
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1))
    expect(after[after.length - 1]).toBe(`Gợi ý bởi TappyAI · www.tappyai.com/plan/${ID}`)
  })
})

describe('the mini brochure preview', () => {
  it('shows the hero photo, the eyebrow, the title, real counts, the first days as time · name lines, and the attribution — not the text blob', () => {
    published()
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    const preview = screen.getByTestId('share-preview')
    expect(preview.hasAttribute('data-plan-preview')).toBe(true)
    expect(preview.querySelector('[data-plan-preview-hero]')!.getAttribute('data-has-photo')).toBe('true')
    expect(preview.querySelector('[data-plan-preview-hero] img[src="' + PHOTO + '"]')).toBeTruthy()
    expect(preview.textContent).toContain('Tappy Plan')
    expect(preview.querySelector('[data-plan-preview-title]')!.textContent).toBe('Quy Nhơn 3 ngày 2 đêm')
    const meta = preview.querySelector('[data-plan-preview-meta]')!.textContent
    expect(meta).toContain('2 ngày'); expect(meta).toContain('5 điểm dừng'); expect(meta).toContain('2 người'); expect(meta).toContain('5.000.000đ')
    const days = Array.from(preview.querySelectorAll('[data-plan-preview-day]')).map(d => d.textContent)
    expect(days[0]).toContain('Ngày 1')
    expect(days[0]).toContain('09:00 Bãi Kỳ Co · 12:30 Hải sản Nhơn Lý · 15:00 Eo Gió · +1')
    expect(days[1]).toContain('08:00 Tháp Đôi')
    expect(preview.textContent).toContain('Được tạo bởi')
    expect(preview.textContent).toContain('TAPPY')
    expect(screen.queryByTestId('share-preview-text')).toBeNull()
    expect(preview.textContent).not.toContain('Kế hoạch từ TappyAI:')
  })

  it('🚨 IMAGE RULE: no canonical photo → text header, no image frame, no placeholder icon, nothing borrowed', () => {
    published()
    const bare: TappyPlan = { ...plan, days: [{ label: 'Tối nay', items: [{ time: '19:00', emoji: '🍜', category: 'food', name: 'Phở Lệ' }] }] }
    render(<ShareMenu artifact={buildPlanArtifact(bare, 'vi', env)} open onClose={() => {}} />)
    const hero = screen.getByTestId('share-preview').querySelector('[data-plan-preview-hero]')!
    expect(hero.getAttribute('data-has-photo')).toBe('false')
    expect(hero.querySelector('img[src^="https://"]')).toBeNull()
    // No frame: no absolutely-positioned image layer, no lucide placeholder — only the brand mark and the copy.
    expect(hero.querySelector('svg')).toBeNull()
    expect(hero.querySelector('.absolute')).toBeNull()
    expect(hero.querySelector('[data-plan-preview-title]')!.textContent).toBe('Quy Nhơn 3 ngày 2 đêm')
    expect(hero.textContent).toContain('Tappy Plan')
  })

  it('🚨 IMAGE RULE: a clip/review thumbnail on photo_url is never the hero', () => {
    published()
    const clipThumb = 'https://storage.googleapis.com/tappyai-media-prod/thumbnails/f9077a52/clip.jpg'
    const withClip: TappyPlan = { ...plan, days: [{ label: 'Ngày 1', items: [{ time: '09:00', emoji: '🏖️', category: 'entertainment', name: 'Bãi Kỳ Co', photo_url: clipThumb }] }] }
    render(<ShareMenu artifact={buildPlanArtifact(withClip, 'vi', env)} open onClose={() => {}} />)
    const preview = screen.getByTestId('share-preview')
    const hero = preview.querySelector('[data-plan-preview-hero]')!
    expect(hero.getAttribute('data-has-photo')).toBe('false')
    expect(preview.querySelector('img[src^="https://"]')).toBeNull()
    expect(preview.innerHTML).not.toContain('storage.googleapis.com')
  })

  it('the link line shows the plan url once it is minted', async () => {
    published()
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('share-preview').querySelector('[data-plan-preview-link]')!.textContent).toBe(`www.tappyai.com/plan/${ID}`))
  })
})

describe('minting the link', () => {
  it('publishes exactly once on open, with the snapshot in the plan’s own field names, and never the place id', async () => {
    published()
    const { rerender } = render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/plans/share')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as { plan: Record<string, unknown> }
    expect(body.plan.title).toBe('Quy Nhơn 3 ngày 2 đêm')
    expect(body.plan.share_text).toBe('Biển xanh, ẩm thực ngon.')
    expect(String(init.body)).not.toContain('ChIJsecret')
    // A re-render with a freshly built (identical) artifact does not publish again.
    rerender(<ShareMenu artifact={buildPlanArtifact(plan, 'vi', env)} open onClose={() => {}} />)
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('while the link is pending, the targets wait and the menu says so', async () => {
    let resolve!: (v: unknown) => void
    fetchMock.mockReturnValue(new Promise(r => { resolve = r }))
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    expect(screen.getByText('Đang tạo liên kết kế hoạch…')).toBeTruthy()
    expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { resolve({ ok: true, status: 200, json: async () => ({ url: PLAN_URL }) }) })
    await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText('Đang tạo liên kết kế hoạch…')).toBeNull()
  })

  it('signed out (401) or a guest (403): text brochure still shares on the brand url, and the reason is shown', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Đăng nhập để tạo liên kết kế hoạch — hiện tại chia sẻ bằng văn bản')).toBeTruthy())
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-copy')) })
    expect(writeText).toHaveBeenCalledWith(artifact.text)
    expect(writeText.mock.calls[0][0]).toContain('Gợi ý bởi TappyAI · www.tappyai.com')
    expect(writeText.mock.calls[0][0]).not.toContain('/plan/')
  })

  it('a 200 whose body carries no valid id is treated as no link — never a fabricated url', async () => {
    for (const body of [{ ok: true }, { id: 'short' }, { id: 'AbCdEfGhIjK!' }, { url: PLAN_URL }]) {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body })
      const { unmount } = render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
      await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
      await act(async () => { fireEvent.click(screen.getByTestId('share-target-copy')) })
      expect(writeText.mock.calls[writeText.mock.calls.length - 1][0]).not.toContain('/plan/')
      unmount()
    }
  })

  it('the url is built from the id on the canonical origin — the server’s own url field is not trusted', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: ID, url: 'http://evil.example/plan/x' }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('share-preview').querySelector('[data-plan-preview-link]')!.textContent).toBe(`www.tappyai.com/plan/${ID}`))
  })

  it('a network failure is the same fallback, not a crash', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/Đăng nhập/)).toBeNull()
  })
})

describe('what leaves, once the plan has its link', () => {
  beforeEach(async () => {
    published()
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
  })

  it('Copy: the brochure, with the plan url in its footer', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-copy')) })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm')
    expect(writeText.mock.calls[0][0].endsWith(`Gợi ý bởi TappyAI · www.tappyai.com/plan/${ID}`)).toBe(true)
  })

  it('Facebook: copies the brochure and opens the sharer with the PLAN url', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-facebook')) })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(PLAN_URL)}`, '_blank', 'noopener,noreferrer')
    expect(status()).toBe('share.copiedAndOpened:{"app":"share.facebook"}')
  })

  it('Zalo: the plan url in the share plugin', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-zalo')) })
    expect(open.mock.calls[0][0]).toBe(`https://sp.zalo.me/plugins/share?url=${encodeURIComponent(PLAN_URL)}`)
  })

  it('Telegram: the plan url as the link, the brochure as the text', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-telegram')) })
    const href = String(open.mock.calls[0][0])
    expect(href.startsWith(`https://t.me/share/url?url=${encodeURIComponent(PLAN_URL)}&text=`)).toBe(true)
    expect(decodeURIComponent(href)).toContain('Bãi Kỳ Co')
  })

  it('WhatsApp and LINE: the brochure text, whose footer is the plan url', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-whatsapp')) })
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain(`Gợi ý bởi TappyAI · www.tappyai.com/plan/${ID}`)
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-line')) })
    expect(decodeURIComponent(String(open.mock.calls[1][0]))).toContain(`Gợi ý bởi TappyAI · www.tappyai.com/plan/${ID}`)
  })

  it('Tappy Inbox: the ≤4000 body ends with the plan url', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { id: 'm1' } }) })
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    await act(async () => { fireEvent.click(screen.getByTestId('stub-start')) })
    await waitFor(() => expect(status()).toBe('share.inboxSent'))
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
    expect(url).toBe('/api/messaging/threads/thread-1/messages')
    const body = JSON.parse(String(init.body)) as { body: string }
    expect(body.body).toBe(inboxBody(withPlanShareUrl(artifact, PLAN_URL)))
    expect(body.body.endsWith(`Gợi ý bởi TappyAI · www.tappyai.com/plan/${ID}`)).toBe(true)
  })
})
