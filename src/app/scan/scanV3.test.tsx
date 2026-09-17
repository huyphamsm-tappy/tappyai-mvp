// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setLocale } from '@/lib/i18n/useTranslation'
import { render, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/scan',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))
vi.mock('@/components/Header', () => ({
  __esModule: true,
  default: ({ title, showBack }: { title?: string; showBack?: boolean }) => <header data-testid="header" data-back={showBack ? 'yes' : 'no'}>{title}</header>,
}))
vi.mock('@/components/BottomNav', () => ({ __esModule: true, default: () => <nav data-testid="bottom-nav" /> }))
vi.mock('@/components/v3/TappyPresence', () => ({
  __esModule: true,
  default: ({ pose }: { pose?: string }) => <span data-testid="tappy" data-pose={pose} />,
}))

import ScanPage from './page'
import { vi as viCopy, en as enCopy } from '@/lib/i18n/w3/scan'

// ── Scan — the V3 skin over the SAME request ────────────────────────────────
//
// The reskin (2026-09-13) changed composition: a hero with Tappy reading, capability chips,
// two large action cards, a preview card with the scan CTA, a result card with the four
// existing export actions, a formats strip and a tips card. It changed nothing about the two
// file inputs, `resizeImage`, the `/api/scan` request, the 20/day cap or the error strings.
// Both halves are pinned here.

const SRC = readFileSync('src/app/scan/page.tsx', 'utf8')
const API = readFileSync('src/app/api/scan/route.ts', 'utf8')

let fetchMock: ReturnType<typeof vi.fn>
// These assertions read the EN catalogue, so the locale is STATED rather than inherited: the
// product default is Vietnamese (ADR-027, merged with feat/affiliate-cross-platform) and a test
// that wants English must say so — the same rule the admin suites already follow.
beforeEach(() => setLocale('en'))
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'Hóa đơn số 42' }) }))
  vi.stubGlobal('fetch', fetchMock)
  // `resizeImage` decodes through an <img> and re-encodes on a canvas; jsdom has neither, so
  // the page gets a decoder that succeeds immediately and a canvas that returns a JPEG data URL.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
  class FakeImage {
    width = 100
    height = 80
    onload: null | (() => void) = null
    onerror: null | (() => void) = null
    set src(_v: string) { queueMicrotask(() => this.onload?.()) }
  }
  vi.stubGlobal('Image', FakeImage)
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,QUJD')
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const cameraInput = () => q<HTMLInputElement>('input[capture]')!
const galleryInput = () => document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement
const pickFile = (input: HTMLInputElement) => {
  const file = new File(['x'], 'hoa-don.jpg', { type: 'image/jpeg' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('what the page claims is what the code does', () => {
  it('renders the V3 hero with the official Tappy reading pose and the header back link', () => {
    render(<ScanPage />)
    expect(q('[data-testid="header"]')!.textContent).toBe(enCopy['scan.headerTitle'])
    expect(q('[data-testid="header"]')!.getAttribute('data-back')).toBe('yes')
    const hero = q('[data-scan-hero]')!
    expect(hero.textContent).toContain(enCopy['scan.heroEyebrow'])
    expect(hero.textContent).toContain(enCopy['scan.heroTitle1'])
    expect(hero.querySelector('.v3-scan-hero-accent')!.textContent).toBe(enCopy['scan.heroTitle2'])
    expect(hero.textContent).toContain(enCopy['scan.heroBody'])
    // The mascot is the owner's `reading` asset (otter with the open book), not a new drawing.
    expect(q('[data-testid="tappy"]')!.getAttribute('data-pose')).toBe('reading')
    expect(SRC).toContain('pose="reading"')
    expect(existsSync('public/tappy/reading.png')).toBe(true)
    expect(q('[data-scan-bubble]')!.textContent).toContain(enCopy['scan.bubble1'])
  })

  it('the three capability chips name real behaviour and make no speed or privacy promise', () => {
    render(<ScanPage />)
    const chips = Array.from(q('[data-scan-caps]')!.querySelectorAll('li')).map(li => li.textContent)
    expect(chips).toEqual([enCopy['scan.capCapture'], enCopy['scan.capLangs'], enCopy['scan.capExport']])
    for (const key of ['scan.capCapture', 'scan.capLangs', 'scan.capExport']) {
      expect(viCopy[key]).not.toMatch(/nhanh|an toàn|riêng tư|chỉ bạn/i)
      expect(enCopy[key]).not.toMatch(/fast|quick|secure|private|only you/i)
    }
    // The export chip is backed by the real actions on the result card.
    expect(SRC).toContain('downloadDocx(result')
    expect(SRC).toContain('downloadTxt(result')
  })

  it('lists only formats the page can decode — no PDF, no HEIC', () => {
    render(<ScanPage />)
    const labels = Array.from(q('[data-scan-formats]')!.querySelectorAll('li')).map(li => li.lastChild!.textContent)
    expect(labels).toEqual(['JPG', 'PNG', 'WEBP'])
    expect(q('[data-scan-formats]')!.textContent).not.toMatch(/PDF|HEIC/)
    expect(SRC).not.toMatch(/label: '(PDF|HEIC)'/)
    // Everything is re-encoded to JPEG client-side; the route's allowlist accepts it.
    expect(SRC).toContain("canvas.toDataURL('image/jpeg'")
    expect(API).toContain("'image/jpeg'")
  })

  it('the tips card carries four truthful tips and quotes the route’s DAILY_SCAN_LIMIT', () => {
    render(<ScanPage />)
    const tips = q('[data-scan-tips]')!
    expect(tips.querySelectorAll('li')).toHaveLength(4)
    expect(tips.textContent).not.toMatch(/%/)
    expect(API).toContain('const DAILY_SCAN_LIMIT = 20')
    expect(SRC).toContain('const DAILY_LIMIT = 20')
    expect(q('[data-scan-limit]')!.textContent).toBe(enCopy['scan.tipLimit'].replace('{n}', '20'))
  })

  it('offers no help control — the page has no help surface to open', () => {
    render(<ScanPage />)
    expect(document.body.textContent).not.toMatch(/Trợ giúp|Help/)
    expect(Object.values(viCopy).join(' ')).not.toMatch(/Trợ giúp/)
  })
})

describe('camera and gallery keep their real inputs', () => {
  it('both action cards fire their hidden file inputs; camera captures the environment, gallery does not', () => {
    render(<ScanPage />)
    const clicks: string[] = []
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      clicks.push(this.hasAttribute('capture') ? 'camera' : 'gallery')
    })
    expect(cameraInput().getAttribute('accept')).toBe('image/*')
    expect(cameraInput().getAttribute('capture')).toBe('environment')
    expect(galleryInput().getAttribute('accept')).toBe('image/*')
    expect(galleryInput().hasAttribute('capture')).toBe(false)

    fireEvent.click(q('[data-scan-camera]')!)
    fireEvent.click(q('[data-scan-gallery]')!)
    expect(clicks).toEqual(['camera', 'gallery'])
    // Each card is ONE button — the CTA pill inside is a span, never a nested control.
    expect(q('[data-scan-camera]')!.tagName).toBe('BUTTON')
    expect(q('[data-scan-camera]')!.querySelectorAll('button, a')).toHaveLength(0)
    expect(q('[data-scan-camera]')!.textContent).toContain(enCopy['scan.cameraCta'])
    expect(q('[data-scan-gallery]')!.textContent).toContain(enCopy['scan.galleryCta'])
  })

  it('picking a file swaps the cards for the preview, and clearing brings them back', () => {
    render(<ScanPage />)
    pickFile(galleryInput())
    expect(q('[data-scan-actions]')).toBeNull()
    expect(q('[data-scan-preview]')).toBeTruthy()
    expect(q<HTMLImageElement>('[data-scan-preview] img')!.getAttribute('src')).toBe('blob:preview')
    expect(q('[data-scan-submit]')!.textContent).toContain(enCopy['scan.scanButton'])
    fireEvent.click(q('[data-scan-clear]')!)
    expect(q('[data-scan-preview]')).toBeNull()
    expect(q('[data-scan-actions]')).toBeTruthy()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
})

describe('the OCR request, its states and its result are the same', () => {
  it('scan posts the resized JPEG to /api/scan, shows the loading label, then the result with four export actions', async () => {
    render(<ScanPage />)
    pickFile(galleryInput())
    await act(async () => { fireEvent.click(q('[data-scan-submit]')!) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/scan')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ imageBase64: 'QUJD', mimeType: 'image/jpeg' })

    await waitFor(() => expect(q('[data-scan-result]')).toBeTruthy())
    expect(q('[data-scan-result]')!.textContent).toContain('Hóa đơn số 42')
    const actions = Array.from(q('[data-scan-export]')!.querySelectorAll('button')).map(b => b.textContent)
    expect(actions).toEqual([enCopy['scan.copy'], '.TXT', '.DOCX', enCopy['scan.share']])
    // Tips step aside once there is a result, as before.
    expect(q('[data-scan-tips]')).toBeNull()
    expect(q('[data-scan-error]')).toBeNull()
  })

  it('disables the CTA and shows the scanning label while the request is out', async () => {
    let release!: () => void
    fetchMock.mockImplementationOnce(() => new Promise(resolve => {
      release = () => resolve({ ok: true, json: async () => ({ text: 'ok' }) })
    }))
    render(<ScanPage />)
    pickFile(galleryInput())
    await act(async () => { fireEvent.click(q('[data-scan-submit]')!) })
    await waitFor(() => expect(q<HTMLButtonElement>('[data-scan-submit]')!.disabled).toBe(true))
    expect(q('[data-scan-submit]')!.textContent).toContain(enCopy['scan.scanning'])
    expect(q('[data-scan-tips]')).toBeNull()
    await act(async () => { release() })
    await waitFor(() => expect(q<HTMLButtonElement>('[data-scan-submit]')!.disabled).toBe(false))
  })

  it('a non-OK response surfaces the server message in the alert and renders no result', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: 'rate_limit', message: 'Bạn đã quét quá 20 tài liệu hôm nay.' }) }))
    render(<ScanPage />)
    pickFile(galleryInput())
    await act(async () => { fireEvent.click(q('[data-scan-submit]')!) })
    await waitFor(() => expect(q('[data-scan-error]')).toBeTruthy())
    expect(q('[data-scan-error]')!.getAttribute('role')).toBe('alert')
    expect(q('[data-scan-error]')!.textContent).toContain('Bạn đã quét quá 20 tài liệu hôm nay.')
    expect(q('[data-scan-result]')).toBeNull()
    expect(q('[data-scan-tips]')).toBeTruthy()
  })

  it('a thrown fetch shows the network message', async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error('offline') })
    render(<ScanPage />)
    pickFile(galleryInput())
    await act(async () => { fireEvent.click(q('[data-scan-submit]')!) })
    await waitFor(() => expect(q('[data-scan-error]')).toBeTruthy())
    expect(q('[data-scan-error]')!.textContent).toContain(enCopy['scan.errorNetwork'])
  })

  it('copy writes the result to the clipboard and flips the label', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ScanPage />)
    pickFile(galleryInput())
    await act(async () => { fireEvent.click(q('[data-scan-submit]')!) })
    await waitFor(() => expect(q('[data-scan-export]')).toBeTruthy())
    await act(async () => { fireEvent.click(q('[data-scan-export] button')!) })
    expect(writeText).toHaveBeenCalledWith('Hóa đơn số 42')
    await waitFor(() => expect(q('[data-scan-export] button')!.textContent).toContain(enCopy['scan.copied']))
  })
})

describe('i18n', () => {
  it('vi and en carry the same scan keys, and the page reads every key it uses from them', () => {
    expect(Object.keys(enCopy).sort()).toEqual(Object.keys(viCopy).sort())
    const used = Array.from(SRC.matchAll(/t\('(scan\.[a-zA-Z0-9]+)'/g)).map(m => m[1])
    expect(used.length).toBeGreaterThan(20)
    for (const k of used) expect(viCopy, k).toHaveProperty(k)
    for (const k of Object.keys(viCopy)) {
      expect(viCopy[k].trim(), k).not.toBe('')
      expect(enCopy[k].trim(), k).not.toBe('')
    }
  })
})
