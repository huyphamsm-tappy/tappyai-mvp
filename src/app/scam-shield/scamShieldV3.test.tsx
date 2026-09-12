// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/scam-shield',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
// The mascot composition is Home's; here it is a marker so the test can prove the pose.
vi.mock('@/components/v3/TappyPresence', () => ({
  __esModule: true,
  default: ({ pose }: { pose?: string }) => <span data-testid="tappy" data-pose={pose} />,
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import ScamShieldView from './ScamShieldView'
import { HISTORY_STORAGE_KEY } from '@/lib/scam-shield/history'

// ── Scam Shield — the V3 security destination skin over the SAME engine ─────
//
// The reskin (2026-09-12) changed composition: header with a history anchor, a
// hero with Tappy's shield pose, pill tabs, a wide input. It changed nothing
// about what is sent, what comes back, or how the six verdict levels read.
// These tests pin both halves: the surface, and the boundary it did not cross.

/** The engine's real envelope (`CheckResult`), with the level under `risk` where the card reads it. */
const RESULT = (level: string, extra: Record<string, unknown> = {}) => ({
  inputType: 'url', url: 'https://vietcombank.com.vn/',
  risk: { score: 5, confidence: 90, level },
  evidence: { items: [], summary: { criticalCount: 0, warningCount: 0, safeCount: 1, totalSources: 4, respondedSources: 4 } },
  officialMatch: null, actions: [], checkedAt: Date.now(), cached: false, ...extra,
})

let fetchMock: ReturnType<typeof vi.fn>
const okFetch = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))

beforeEach(() => {
  localStorage.clear()
  fetchMock = okFetch(RESULT('SAFE'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

// Scoped to the tool card: the V3 shell carries its own search textbox in the top bar.
const tool = () => document.querySelector('[data-scam-tool]') as HTMLElement
const input = () => within(tool()).getByRole('textbox') as HTMLInputElement
const checkButton = () => within(tool()).getByRole('button', { name: /check now|kiểm tra ngay/i })

describe('header', () => {
  it('names the feature, keeps the tagline and offers the history as an in-page anchor', () => {
    render(<ScamShieldView />)
    const header = document.querySelector('[data-scam-header]') as HTMLElement
    expect(within(header).getByRole('heading', { level: 1 }).textContent).toMatch(/scam shield/i)
    const link = header.querySelector('[data-scam-history-link]') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#scam-shield-history')
    // The anchor target is the existing device-local history section on this page — no new route.
    expect(document.getElementById('scam-shield-history')).toBeTruthy()
  })
})

describe('hero', () => {
  it('uses the owner’s shield pose and paints the scene without image assets or verdict words', () => {
    render(<ScamShieldView />)
    const hero = document.querySelector('[data-scam-hero]') as HTMLElement
    expect(within(hero).getByTestId('tappy').getAttribute('data-pose')).toBe('recommendation')
    expect(hero.querySelector('img, video, picture')).toBeNull()
    const scene = hero.querySelector('[data-scam-scene]') as HTMLElement
    expect(scene.getAttribute('aria-hidden')).toBe('true')
    // 🚨 The floating chips carry NO verdict text — nothing has been checked.
    expect(scene.textContent?.trim()).toBe('https://')
    for (const word of ['An toàn', 'Nguy cơ', 'Safe', 'Risk', 'Danger']) expect(scene.textContent ?? '').not.toContain(word)
  })

  it('lists four capability tiles that name real providers, and not the reference’s data-protection claim', () => {
    render(<ScamShieldView />)
    const tiles = [...document.querySelectorAll('[data-scam-features] li')].map(li => li.textContent ?? '')
    expect(tiles).toHaveLength(4)
    expect(tiles.join(' ')).not.toMatch(/bảo vệ dữ liệu|protect your data|duyệt web tự tin/i)
    expect(tiles.join(' ')).toMatch(/web risk/i)
    expect(tiles.join(' ')).toMatch(/https/i)
  })
})

describe('the check is the same request it always was', () => {
  it('POSTs the trimmed URL to /api/scam-shield/check and renders the engine’s verdict', async () => {
    render(<ScamShieldView />)
    fireEvent.change(input(), { target: { value: '  https://vietcombank.com.vn/ ' } })
    fireEvent.click(checkButton())
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scam-shield/check')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ url: 'https://vietcombank.com.vn/' })
    await waitFor(() => expect(screen.getAllByText(/^(an toàn|safe)$/i).length).toBeGreaterThan(0))
  })

  it('Enter submits; an empty input does not', async () => {
    render(<ScamShieldView />)
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect((checkButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input(), { target: { value: 'https://example.com' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('shows the existing loading copy while the request is in flight', async () => {
    let resolve!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r })))
    render(<ScamShieldView />)
    fireEvent.change(input(), { target: { value: 'https://example.com' } })
    fireEvent.click(checkButton())
    await waitFor(() => expect(screen.getByText(/checking|đang kiểm tra/i)).toBeTruthy())
    expect(input().disabled).toBe(true)
    resolve({ ok: true, json: async () => RESULT('LOW') })
    await waitFor(() => expect(screen.queryByText(/checking\.\.\.|đang kiểm tra\.\.\./i)).toBeNull())
  })

  it.each([
    ['SAFE', /^(an toàn|safe)$/i],
    ['MEDIUM', /use caution|cần cẩn thận/i],
    ['CRITICAL', /very dangerous|rất nguy hiểm/i],
    ['INCONCLUSIVE', /could not be checked|chưa kết luận được/i],
  ])('renders the engine level %s with its own wording — six levels, not three', async (level, re) => {
    vi.stubGlobal('fetch', okFetch(RESULT(level)))
    render(<ScamShieldView />)
    fireEvent.change(input(), { target: { value: 'https://example.com' } })
    fireEvent.click(checkButton())
    await waitFor(() => expect(screen.getAllByText(re).length).toBeGreaterThan(0))
  })

  it('maps the existing error codes to the existing messages, as a live alert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: 'rate_limit' }) })))
    render(<ScamShieldView />)
    fireEvent.change(input(), { target: { value: 'https://example.com' } })
    fireEvent.click(checkButton())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/too many checks|quá nhiều lần/i)
    // No verdict was rendered for a failed request.
    expect(document.querySelectorAll('[data-scam-history] li')).toHaveLength(0)
  })

  it('a successful check is remembered in the device store and listed in the history section', async () => {
    render(<ScamShieldView />)
    fireEvent.change(input(), { target: { value: 'https://vietcombank.com.vn/' } })
    fireEvent.click(checkButton())
    await waitFor(() => expect(document.querySelectorAll('[data-scam-history] li')).toHaveLength(1))
    expect(JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)!)).toHaveLength(1)
    expect(document.querySelector('[data-scam-history]')!.textContent).toContain('vietcombank.com.vn')
  })
})

describe('the QR tab is the same upload it always was', () => {
  it('switches tabs, exposes the hidden image input with camera capture, and posts to /api/scam-shield/qr', async () => {
    render(<ScamShieldView />)
    fireEvent.click(screen.getByRole('tab', { name: /scan qr|quét mã qr/i }))
    expect(screen.getByRole('tab', { name: /scan qr|quét mã qr/i }).getAttribute('aria-selected')).toBe('true')
    const file = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(file.getAttribute('accept')).toBe('image/*')
    expect(file.getAttribute('capture')).toBe('environment')
    fireEvent.change(file, { target: { files: [new File(['x'], 'qr.png', { type: 'image/png' })] } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/scam-shield/qr')
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData)
  })

  it('surfaces a QR decode failure with the existing message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422, json: async () => ({ error: 'qr_no_url' }) })))
    render(<ScamShieldView />)
    fireEvent.click(screen.getByRole('tab', { name: /scan qr|quét mã qr/i }))
    const file = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(file, { target: { files: [new File(['x'], 'qr.png', { type: 'image/png' })] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/qr|url|liên kết/i)
  })

  it('offers exactly two tabs — URL and QR — and nothing the engine does not do', () => {
    render(<ScamShieldView />)
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })
})

describe('history section', () => {
  const entry = (over: Record<string, unknown> = {}) => ({ url: 'https://vietcombank.com.vn/', level: 'SAFE', checkedAt: Date.now(), ...over })

  it('renders real entries with the engine’s wording, re-checks through the engine, and clears the real store', async () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([entry({ level: 'HIGH', url: 'https://vcb-secure-login.net/' })]))
    render(<ScamShieldView />)
    await waitFor(() => expect(document.querySelectorAll('[data-scam-history] li')).toHaveLength(1))
    expect(screen.getByText('vcb-secure-login.net')).toBeTruthy()
    expect(screen.getByText(/high|nguy cơ cao|cao/i)).toBeTruthy()
    // A row is a shortcut back to the engine, never a cached answer.
    fireEvent.click(screen.getByText('vcb-secure-login.net').closest('button')!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/scam-shield/check', expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: /clear history|xóa lịch sử/i }))
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBeNull()
    expect(screen.getByText(/no checks yet|chưa có lượt kiểm tra/i)).toBeTruthy()
  })

  it('says the list is device-local', () => {
    render(<ScamShieldView />)
    expect(screen.getByText(/stored on this device only|chỉ được lưu trên thiết bị này/i)).toBeTruthy()
  })
})

describe('boundaries the skin did not cross', () => {
  const src = readFileSync('src/app/scam-shield/ScamShieldView.tsx', 'utf8')

  it('still talks only to the two existing endpoints', () => {
    const endpoints = [...src.matchAll(/fetch\('([^']+)'/g)].map(m => m[1]).sort()
    expect(endpoints).toEqual(['/api/scam-shield/check', '/api/scam-shield/qr'])
  })

  it('imports nothing from the engine but its types and the history store', () => {
    const imports = [...src.matchAll(/from '@\/lib\/scam-shield\/([^']+)'/g)].map(m => m[1]).sort()
    expect(imports).toEqual(['history', 'types'])
  })

  it('holds no hardcoded Vietnamese UI text', () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code.split('\n').filter(l => /[À-ỹ]/.test(l))).toEqual([])
  })
})
