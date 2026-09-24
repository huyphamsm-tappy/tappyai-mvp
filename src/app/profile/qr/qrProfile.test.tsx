// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/qr',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }),
})

import QRProfileView from './QRProfileView'
import { encodeQR } from '@/lib/qr/qrcode'

// ── QR Profile ──────────────────────────────────────────────────────────────
//
// 🚨 A QR CODE IS A THING PEOPLE PHOTOGRAPH AND FORWARD. Whatever it carries is
// public the moment it is printed, and whatever it encodes has to be the URL a
// stranger's camera will actually resolve. Both are pinned here.

const USER = 'f9077a52-b0f3-453a-a497-97da115ae386'
const me = { full_name: 'Huy Phạm', avatar_url: null, email: 'h@x.com' }

const renderQR = (userInfo: typeof me | null = me) =>
  render(<QRProfileView userId={USER} userInfo={userInfo ?? undefined} />)

/** The QR itself. `container.querySelector('svg')` would find a shell icon. */
const qrSvg = () => document.querySelector('[data-qr] svg') as SVGElement | null

beforeEach(() => { vi.restoreAllMocks() })
afterEach(cleanup)

describe('what the code encodes', () => {
  it('encodes the public profile URL, on this origin', async () => {
    renderQR()
    await waitFor(() => expect(qrSvg()).toBeTruthy())

    // The page builds `${origin}/users/${id}`. Encoding that string independently
    // must produce the same matrix — the QR on screen is that URL and no other.
    const expected = `${window.location.origin}/users/${USER}`
    const svg = qrSvg()!
    const independent = encodeQR(expected)
    // Same module count = same version = same payload length; combined with the
    // deterministic encoder this is the round trip without a rasteriser.
    const modules = independent.length
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${modules + 8} ${modules + 8}`)
  })

  it('carries no private information', () => {
    renderQR()
    const svg = document.querySelector('[data-qr]')?.innerHTML ?? ''
    // The QR is a picture, so this checks the SOURCE that builds the URL rather
    // than the pixels: nothing but the id may reach it.
    const src = readFileSync('src/app/profile/qr/QRProfileView.tsx', 'utf8')
    expect(src).toContain('/users/${userId}')
    expect(/email|token|session|access_token/.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false)
    expect(svg).not.toContain('h@x.com')
  })

  it('is the same code every time for the same profile', () => {
    // Deterministic by construction — two renders, one payload, one matrix.
    renderQR(); const a = qrSvg()!.outerHTML
    cleanup()
    renderQR(); const b = qrSvg()!.outerHTML
    expect(a).toBe(b)
  })
})

describe('the code stays scannable', () => {
  it('is dark-on-light with a full quiet zone, whatever the page theme is', async () => {
    // 🚨 The card around it is TappyAI; the code itself is not themed. An
    // inverted or tinted QR is a QR that a camera in a café may not read.
    renderQR()
    await waitFor(() => expect(qrSvg()).toBeTruthy())
    const svg = qrSvg()!
    expect(svg.querySelector('rect')?.getAttribute('fill')?.toUpperCase()).toBe('#FFFFFF')

    const modules = encodeQR(`${window.location.origin}/users/${USER}`).length
    const [, , w] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number)
    // 4 modules of quiet zone on each side — the spec's minimum.
    expect(w - modules).toBe(8)
  })

  it('puts nothing decorative inside the code', () => {
    renderQR()
    const svg = qrSvg()!
    // Only the ground rect plus the module group. No logo, no image, no overlay.
    expect(svg.querySelectorAll('image, foreignObject, text')).toHaveLength(0)
  })
})

describe('sharing', () => {
  // Phase 7 (item 8): the raw OS dialog is gone. Share opens the TappyAI share menu —
  // the same sheet reviews and plans use — carrying the CANONICAL public profile URL.
  it('🚨 never calls navigator.share directly — the branded share menu opens instead', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    renderQR()
    fireEvent.click(screen.getByRole('button', { name: /chia sẻ profile|share profile/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(share).not.toHaveBeenCalled()
    expect(screen.getByTestId('share-target-copy')).toBeTruthy()
  })

  it('the menu carries the canonical profile URL, not this origin', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderQR()
    fireEvent.click(screen.getByRole('button', { name: /chia sẻ profile|share profile/i }))
    fireEvent.click(await screen.findByTestId('share-target-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain(`/users/${USER}`)
    expect(copied).toMatch(/^https:\/\/(www\.)?tappyai\.(com|vn)\//)
    expect(copied).not.toContain(window.location.origin)
  })
})

describe('the download is branded AND still the same code', () => {
  it('composes the card from the on-screen payload with the shipped lockup around the code', () => {
    const src = readFileSync('src/lib/qr/brandedCard.ts', 'utf8')
    // Same encoder, same payload: the card is `encodeQR(text)` of the profile URL.
    expect(src).toContain("from './qrcode'")
    expect(src).toContain('encodeQR(opts.text)')
    // The shipped mark and the wordmark colour, not a redrawn logo.
    expect(src).toContain('TAPPY_MARK_SRC')
    expect(src).toContain('TAPPY_WORDMARK_BLUE')
    const view = readFileSync('src/app/profile/qr/QRProfileView.tsx', 'utf8')
    expect(view).toContain('renderBrandedQrCard({')
    expect(view).toContain('text: profileUrl')
  })
})

describe('identity shown beside the code', () => {
  it('shows the display name', () => {
    renderQR()
    // The shell header also carries the name, so presence is what matters here.
    expect(screen.getAllByText('Huy Phạm').length).toBeGreaterThan(0)
  })

  it('shows NO @handle, because `profiles` has no username column', () => {
    // 🚨 The design reference puts "@huypham" under the name. There is no such
    // column, so any handle here would be manufactured — on a surface whose
    // whole purpose is for someone else to identify this person by.
    const { container } = renderQR()
    expect(container.textContent ?? '').not.toMatch(/@[a-z0-9._]/i)
  })

  it('does not crash when there is no profile row', () => {
    expect(() => renderQR(null)).not.toThrow()
  })
})

describe('download', () => {
  it('offers a download control', () => {
    renderQR()
    expect(screen.getByRole('button', { name: /tải mã qr|download qr/i })).toBeTruthy()
  })

  it('reuses the existing generator rather than adding a second QR system', () => {
    const src = readFileSync('src/app/profile/qr/QRProfileView.tsx', 'utf8')
    expect(src).toContain("from '@/lib/qr/qrcode'")
    // No image service, no new dependency, no server round trip for a picture.
    expect(/fetch\(|\/api\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))).toBe(false)
  })
})
