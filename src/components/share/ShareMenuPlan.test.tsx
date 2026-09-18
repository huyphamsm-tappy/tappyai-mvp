// @vitest-environment jsdom
// Sharing a Tappy Plan: the mini brochure, the minted link, and what leaves.
//
// Opening the menu on a plan artifact publishes the plan through the real
// endpoint contract (`POST /api/plans/share`, mocked at fetch) and every target
// then carries the plan's own `/plan/<shareId>` — AS A LINK, because the page
// is the brochure — not the brand url and not the text itinerary. A guest,
// signed-out or failed sender keeps the text brochure, is told why there is no
// link, can retry, and cannot hand the brand root to a url-only platform.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { buildPlanArtifact, inboxBody, planLinkArtifact } from '@/lib/share/shareArtifact'
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

  it('🚨 planLinkArtifact: the published plan is a LINK — subject + canonical url, no itinerary text, no image', () => {
    const link = planLinkArtifact(artifact, PLAN_URL)
    expect(link.planLink).toBe(true)
    expect(link.url).toBe(PLAN_URL)
    expect(link.text).toBe(`Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n${PLAN_URL}`)
    expect(link.text).not.toContain('Bãi Kỳ Co')
    expect(link.text).not.toContain('Gợi ý bởi')
    expect(link.image).toBeUndefined()
    // The same shape Android (`planLinkArtifact`) and iOS build: "<subject>\n<url>".
    expect(link.text.split('\n')).toEqual([link.subject, PLAN_URL])
    // Nothing else is touched: the snapshot still drives the mini brochure.
    expect(link.plan).toEqual(artifact.plan)
    expect(planLinkArtifact({ ...artifact, kind: 'places' }, PLAN_URL).planLink).toBeUndefined()
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
    expect(preview.textContent).toContain('TappyAI')
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

  it('signed out (401) or a guest (403): the reason is shown, the text brochure stays for text channels, and the url-only tiles refuse the brand root', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Đăng nhập để tạo liên kết kế hoạch — hiện tại chia sẻ bằng văn bản')).toBeTruthy())
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-copy')) })
    expect(writeText).toHaveBeenCalledWith(artifact.text)
    expect(writeText.mock.calls[0][0]).toContain('Gợi ý bởi TappyAI · www.tappyai.com')
    expect(writeText.mock.calls[0][0]).not.toContain('/plan/')
    // 🚨 Facebook / Zalo / Messenger / TikTok never receive https://www.tappyai.com for a plan.
    for (const id of ['facebook', 'zalo', 'tiktok']) {
      const tile = screen.getByTestId(`share-target-${id}`) as HTMLButtonElement
      expect(tile.disabled).toBe(true)
      expect(tile.getAttribute('data-needs-link')).toBe('true')
      expect(tile.title).toBe('Cần có liên kết kế hoạch để chia sẻ lên đây')
    }
    expect(open).not.toHaveBeenCalled()
  })

  it('🚨 a failed publish is said plainly, offers Retry, and never pretends to be published', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'internal' }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Chưa tạo được liên kết kế hoạch — hiện tại chia sẻ bằng văn bản')).toBeTruthy())
    expect(screen.getByTestId('share-preview').querySelector('[data-plan-preview-link]')!.textContent).toBe('www.tappyai.com')
    expect((screen.getByTestId('share-target-facebook') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('share-target-zalo') as HTMLButtonElement).disabled).toBe(true)
    // The text channels still work, with the text brochure and no fabricated link.
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-whatsapp')) })
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).not.toContain('/plan/')
    // Retry publishes again; success turns every tile into the plan link.
    published()
    await act(async () => { fireEvent.click(screen.getByTestId('share-plan-retry')) })
    await waitFor(() => expect(screen.getByTestId('share-preview').querySelector('[data-plan-preview-link]')!.textContent).toBe(`www.tappyai.com/plan/${ID}`))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('share-plan-retry')).toBeNull()
    expect((screen.getByTestId('share-target-facebook') as HTMLButtonElement).disabled).toBe(false)
  })

  it('re-sharing the same plan asks the server for the same plan and shows whatever id it answers with — the client mints nothing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: ID, reused: true }) })
    const { unmount } = render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('share-preview').querySelector('[data-plan-preview-link]')!.textContent).toBe(`www.tappyai.com/plan/${ID}`))
    unmount()
    render(<ShareMenu artifact={buildPlanArtifact(plan, 'vi', env)} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('share-preview').querySelector('[data-plan-preview-link]')!.textContent).toBe(`www.tappyai.com/plan/${ID}`))
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)))
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

  it('a network failure is the failed state with Retry, not a crash and not a sign-in prompt', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/Đăng nhập/)).toBeNull()
    expect(screen.getByTestId('share-plan-retry')).toBeTruthy()
  })
})

describe('what leaves, once the plan has its link', () => {
  beforeEach(async () => {
    published()
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
  })

  it('Copy link: the EXACT canonical plan url, nothing around it', async () => {
    expect(screen.getByTestId('share-target-copy').textContent).toBe('share.copyLink')
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-copy')) })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toBe(PLAN_URL)
    expect(status()).toBe('share.copiedLink')
  })

  it('🚨 the published plan is never the plain-text itinerary: no text block to inspect, no Save, no image', () => {
    expect(screen.queryByText('share.previewHint')).toBeNull()
    expect(screen.queryByTestId('share-preview-text')).toBeNull()
    expect(screen.queryByTestId('share-target-save')).toBeNull()
  })

  it('Facebook: opens the sharer with the PLAN url — a link share, nothing copied, no "paste" instruction', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-facebook')) })
    expect(writeText).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledWith(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(PLAN_URL)}`, '_blank', 'noopener,noreferrer')
    expect(String(open.mock.calls[0][0])).not.toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://www.tappyai.com')}`)
    expect(status()).toBe('share.opened:{"app":"share.facebook"}')
    expect(screen.getByTestId('share-target-facebook').textContent).toBe('share.facebook')
  })

  it('🚨 Zalo never receives https://www.tappyai.com: on a phone it is Zalo’s own app handoff with the PLAN url; on a desktop the PLAN url is copied and the user is told to paste — the empty sp.zalo.me page is gone', async () => {
    const assign = vi.fn()
    const loc = window.location
    Object.defineProperty(window, 'location', { value: { ...loc, assign }, configurable: true, writable: true })
    try {
      // Desktop (jsdom's UA): no standalone Zalo web URL exists.
      await act(async () => { fireEvent.click(screen.getByTestId('share-target-zalo')) })
      expect(open).not.toHaveBeenCalled()
      expect(assign).not.toHaveBeenCalled()
      expect(writeText).toHaveBeenCalledWith(PLAN_URL)
      expect(status()).toBe('share.zaloHint')
      // Android browser: the SDK's SEND intent carrying the plan url.
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile Chrome/128')
      await act(async () => { fireEvent.click(screen.getByTestId('share-target-zalo')) })
      expect(assign).toHaveBeenLastCalledWith(`intent://zaloapp.com/#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.SUBJECT=;S.android.intent.extra.TEXT=${encodeURIComponent(PLAN_URL)};B.hidePostFeed=false;B.backToSource=true;end`)
      // iPhone browser: the share-extension scheme.
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')
      await act(async () => { fireEvent.click(screen.getByTestId('share-target-zalo')) })
      expect(assign).toHaveBeenLastCalledWith(`zaloshareext://shareext?url=${encodeURIComponent(PLAN_URL)}&type=8&version=1`)
      for (const c of assign.mock.calls) expect(String(c[0])).not.toContain(encodeURIComponent('https://www.tappyai.com') + ';')
    } finally {
      Object.defineProperty(window, 'location', { value: loc, configurable: true, writable: true })
      vi.restoreAllMocks()
    }
  })

  it('🚨 Zalo on a desktop is LABELLED as copy-link (no app, no working web widget) — it never claims to share; on a phone it is labelled Zalo', async () => {
    expect(screen.getByTestId('share-target-zalo').textContent).toBe('share.copyLink')
    expect(screen.getByTestId('share-target-zalo').title).toBe('share.copyLink')
    cleanup()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Mobile Chrome/128')
    try {
      render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
      await waitFor(() => expect((screen.getByTestId('share-target-copy') as HTMLButtonElement).disabled).toBe(false))
      expect(screen.getByTestId('share-target-zalo').textContent).toBe('share.zalo')
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('🚨 Facebook and Zalo can never receive the brand root, a chat url or /reviews for a published plan', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-facebook')) })
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-zalo')) })
    const carried = [...open.mock.calls.map(c => decodeURIComponent(String(c[0]))), ...writeText.mock.calls.map(c => String(c[0]))]
    expect(carried.length).toBeGreaterThan(0)
    for (const c of carried) {
      expect(c).toContain(PLAN_URL)
      expect(c).not.toMatch(/tappyai\.com\/?(\?|$|["'\s])/)
      expect(c).not.toContain('/chat/')
      expect(c).not.toContain('/reviews')
      expect(c).not.toContain('Bãi Kỳ Co')
    }
  })

  it('Telegram: the plan url as the link, the one-line subject as the text — not the itinerary', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-telegram')) })
    const href = String(open.mock.calls[0][0])
    expect(href.startsWith(`https://t.me/share/url?url=${encodeURIComponent(PLAN_URL)}&text=`)).toBe(true)
    expect(decodeURIComponent(href)).toContain('Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm')
    expect(decodeURIComponent(href)).not.toContain('Bãi Kỳ Co')
  })

  it('WhatsApp, LINE, Viber and Email: the subject line and the plan url, nothing else', async () => {
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-whatsapp')) })
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toBe(`https://wa.me/?text=Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n${PLAN_URL}`)
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-line')) })
    expect(decodeURIComponent(String(open.mock.calls[1][0]))).toBe(`https://line.me/R/share?text=Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n${PLAN_URL}`)
    await act(async () => { fireEvent.click(screen.getByTestId('share-target-viber')) })
    expect(decodeURIComponent(String(open.mock.calls[2][0]))).toBe(`viber://forward?text=Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n${PLAN_URL}`)
    const assign = vi.fn()
    const loc = window.location
    Object.defineProperty(window, 'location', { value: { ...loc, assign }, configurable: true, writable: true })
    try {
      await act(async () => { fireEvent.click(screen.getByTestId('share-target-email')) })
      expect(decodeURIComponent(String(assign.mock.calls[0][0]))).toContain(PLAN_URL)
      expect(decodeURIComponent(String(assign.mock.calls[0][0]))).not.toContain('Bãi Kỳ Co')
    } finally {
      Object.defineProperty(window, 'location', { value: loc, configurable: true, writable: true })
    }
    for (const c of open.mock.calls) expect(String(c[0])).not.toContain('Bãi Kỳ Co')
  })

  it('branding on the mini brochure: the shipped mark (otter-logo.png) with "Tappy" white and "AI" blue — never "TAPPY", never /logo.svg', () => {
    const preview = screen.getByTestId('share-preview')
    const lockup = preview.querySelector('[data-tappy-lockup]')!
    expect(lockup).toBeTruthy()
    expect(lockup.querySelector('img[data-tappy-mark]')!.getAttribute('src')).toBe('/branding/otter-logo.png')
    const wordmark = lockup.querySelector('[data-tappy-wordmark]') as HTMLElement
    expect(wordmark.textContent).toBe('TappyAI')
    expect(wordmark.style.color).toBe('rgb(255, 255, 255)')
    expect((wordmark.querySelector('[data-tappy-wordmark-ai]') as HTMLElement).style.color).toBe('rgb(51, 145, 255)')
    expect(preview.innerHTML).not.toContain('/logo.svg')
    expect(preview.textContent).not.toMatch(/\bTAPPY\b/)
  })

  it('Tappy Inbox: the body is the subject line and the plan url', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { id: 'm1' } }) })
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    await act(async () => { fireEvent.click(screen.getByTestId('stub-start')) })
    await waitFor(() => expect(status()).toBe('share.inboxSent'))
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
    expect(url).toBe('/api/messaging/threads/thread-1/messages')
    const body = JSON.parse(String(init.body)) as { body: string }
    expect(body.body).toBe(inboxBody(planLinkArtifact(artifact, PLAN_URL)))
    expect(body.body).toBe(`Kế hoạch từ TappyAI: Quy Nhơn 3 ngày 2 đêm\n${PLAN_URL}`)
  })
})
