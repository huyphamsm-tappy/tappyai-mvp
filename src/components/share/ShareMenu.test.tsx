// @vitest-environment jsdom
//
// The share menu: eight product targets (+ TikTok for Reviews, + the system
// sheet when the browser has one), every label describing what will actually
// happen, and no "sent" claim except for the one target where the server
// confirmed the write (the Tappy Inbox).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { PlacesLiveView } from '@/lib/recommendation/liveView'
import fixture from '@/lib/share/__fixtures__/placesLiveView.food.json'
import { buildPlacesArtifact, inboxBody, INBOX_MAX_BODY } from '@/lib/share/shareArtifact'
import ShareMenu from './ShareMenu'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'vi',
  }),
}))

// The existing web Messenger entry: the stub exposes its two callbacks as buttons.
vi.mock('@/components/messaging/NewMessageSheet', () => ({
  default: ({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) => (
    <div data-testid="new-message-sheet">
      <button data-testid="stub-start" onClick={() => onStarted('thread-1')}>start</button>
      <button data-testid="stub-close" onClick={onClose}>close</button>
    </div>
  ),
}))

// jsdom has no 2D canvas; the renderer is mocked per test.
const renderMock = vi.fn(async (): Promise<Blob | null> => null)
vi.mock('@/lib/share/renderCardImage', () => ({
  renderArtifactImage: (...args: unknown[]) => renderMock(...(args as [])),
}))

const env = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv
const view = fixture as unknown as PlacesLiveView
const artifact = buildPlacesArtifact(view, 'Quán bún bò ngon ở TP.HCM', 'vi', env)

let writeText: ReturnType<typeof vi.fn>
let open: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  open = vi.fn(() => ({}) as Window)
  vi.stubGlobal('open', open)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
  renderMock.mockReset()
  renderMock.mockResolvedValue(null)
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
})

const DESKTOP_UA = navigator.userAgent
afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'userAgent', { value: DESKTOP_UA, configurable: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  delete (navigator as unknown as { share?: unknown }).share
})

const status = () => screen.queryByRole('status')?.textContent ?? ''

describe('ShareMenu — targets', () => {
  it('offers the eight product targets plus TikTok; the system sheet only when the browser has one', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    for (const id of ['facebook', 'zalo', 'viber', 'line', 'tiktok', 'email', 'inbox', 'save', 'copy']) {
      expect(screen.getByTestId(`share-target-${id}`)).toBeTruthy()
    }
    expect(screen.queryByTestId('share-target-native')).toBeNull()
  })

  it('shows the system sheet as "More apps" when navigator.share exists', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(async () => undefined), configurable: true })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('share-target-native')).toBeTruthy())
  })

  it('labels url-dialog targets truthfully as "Copy & open" for a brochure', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    expect(screen.getByTestId('share-target-facebook').textContent).toContain('share.copyAndOpen:{"app":"share.facebook"}')
    expect(screen.getByTestId('share-target-zalo').textContent).toContain('share.copyAndOpen:{"app":"share.zalo"}')
    // Text handoffs carry the brochure themselves — plain app names.
    expect(screen.getByTestId('share-target-viber').textContent).toContain('share.viber')
    expect(screen.getByTestId('share-target-line').textContent).toContain('share.line')
    expect(screen.getByTestId('share-target-copy').textContent).toContain('share.copyContent')
  })

  it('keeps the Reviews behaviour for a url-only share (backward compatibility)', () => {
    render(<ShareMenu url="https://www.tappyai.com/reviews/abc" title="Review" open onClose={() => {}} />)
    expect(screen.getByTestId('share-target-facebook').textContent).not.toContain('copyAndOpen')
    expect(screen.getByTestId('share-target-copy').textContent).toContain('share.copyLink')
  })

  it('WhatsApp and Telegram are offered everywhere; Messenger only where its app scheme can open', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    expect(screen.getByTestId('share-target-whatsapp')).toBeTruthy()
    expect(screen.getByTestId('share-target-telegram')).toBeTruthy()
    // jsdom's user agent is a desktop one: no Messenger tile, no dead link.
    expect(screen.queryByTestId('share-target-messenger')).toBeNull()
  })

  // Regression: a review with no venue is stored with place_name "Chia sẻ" (the composer's
  // share-only sentinel). The entry points used to pass it straight in as the title.
  it('a review titled through reviewShareTitle never previews the sentinel — place, caption, or brand', async () => {
    const { reviewShareTitle } = await import('@/lib/share/reviewShareTitle')
    const url = 'https://www.tappyai.com/reviews/abc'
    const subject = () => screen.getByTestId('share-preview').textContent ?? ''

    render(<ShareMenu url={url} title={reviewShareTitle({ place_name: 'The Rooftop', body: 'view đẹp' })} open onClose={() => {}} />)
    expect(subject()).toContain('The Rooftop')
    cleanup()

    render(<ShareMenu url={url} title={reviewShareTitle({ place_name: null, body: 'Mì lòng heo nóng hổi' })} open onClose={() => {}} />)
    expect(subject()).toContain('Mì lòng heo nóng hổi')
    cleanup()

    render(<ShareMenu url={url} title={reviewShareTitle({ place_name: 'Chia sẻ', body: 'Mì lòng heo nóng hổi' })} open onClose={() => {}} />)
    expect(subject()).toContain('Mì lòng heo nóng hổi')
    expect(subject()).not.toContain('Chia sẻ')
    cleanup()

    render(<ShareMenu url={url} title={reviewShareTitle({ place_name: 'Chia sẻ', body: '' })} open onClose={() => {}} />)
    expect(subject()).toContain('TappyAI')
    expect(subject()).not.toContain('Chia sẻ')
    // …and what leaves is still the canonical review URL.
    fireEvent.click(screen.getByTestId('share-target-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url))
  })

  it('renders the branded preview from the artifact', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    expect(screen.getByTestId('share-preview')).toBeTruthy()
    expect(screen.getAllByTestId('share-preview-place')).toHaveLength(3)
  })
})

// ── The marks ────────────────────────────────────────────────────────────────
//
// A platform tile shows the platform's OWN mark — the SVG on record in
// lib/share/shareBrands.ts — never a coloured initial, never a lucide glyph
// standing in for a brand. The neutral glyph is reserved for actions.
describe('ShareMenu — every platform tile carries the real platform mark', () => {
  const PLATFORMS = ['facebook', 'zalo', 'whatsapp', 'telegram', 'viber', 'line', 'tiktok'] as const

  it.each(PLATFORMS)('%s: the tile shows /brands/share/%s.svg and nothing generic', (id) => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    const tile = screen.getByTestId(`share-target-${id}`)
    const img = tile.querySelector('img[data-share-brand]') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.getAttribute('data-share-brand')).toBe(id)
    expect(img.getAttribute('src')).toBe(`/brands/share/${id}.svg`)
    // Decorative: the label beneath names the platform.
    expect(img.getAttribute('alt')).toBe('')
    // Same box for every mark, aspect ratio preserved — nothing stretched.
    expect(img.getAttribute('width')).toBe('40')
    expect(img.getAttribute('height')).toBe('40')
    expect(img.className).toContain('object-contain')
    // No generic substitute anywhere on the tile: no lucide svg, no initial, no emoji.
    expect(tile.querySelector('svg')).toBeNull()
    expect(tile.querySelector('[data-share-glyph]')).toBeNull()
    expect(tile.textContent).not.toMatch(/^[A-Z]$/)
    expect(tile.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('Messenger, where offered, shows its own mark too', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148', configurable: true })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    const img = screen.getByTestId('share-target-messenger').querySelector('img[data-share-brand="messenger"]')!
    expect(img.getAttribute('src')).toBe('/brands/share/messenger.svg')
  })

  it('Email is an action, not a brand: a neutral glyph, no platform mark', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    const tile = screen.getByTestId('share-target-email')
    expect(tile.querySelector('img')).toBeNull()
    expect(tile.querySelector('[data-share-glyph="email"] svg')).toBeTruthy()
  })

  it('no tile in the menu is a coloured initial any more', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    const tiles = Array.from(document.querySelectorAll('[data-testid^="share-target-"]'))
    expect(tiles.length).toBeGreaterThan(8)
    for (const tile of tiles) {
      for (const span of Array.from(tile.querySelectorAll('span'))) {
        const text = span.textContent?.trim() ?? ''
        expect(text.length === 1 && /[A-Z]/.test(text)).toBe(false)
      }
    }
  })
})

describe('ShareMenu — what each target really does', () => {
  it('WhatsApp: opens wa.me click-to-chat with the brochure as the message, reports "opened with text"', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-whatsapp'))
    await waitFor(() => expect(status()).toBe('share.openedWithText:{"app":"share.whatsapp"}'))
    const url = open.mock.calls[0][0] as string
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(new URL(url).searchParams.get('text')).toBe(inboxBody(artifact))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('Telegram: opens t.me/share/url with the brand url and the brochure text', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-telegram'))
    await waitFor(() => expect(status()).toBe('share.openedWithText:{"app":"share.telegram"}'))
    const u = new URL(open.mock.calls[0][0] as string)
    expect(u.origin + u.pathname).toBe('https://t.me/share/url')
    expect(u.searchParams.get('url')).toBe(artifact.url)
    expect(u.searchParams.get('text')).toBe(inboxBody(artifact))
  })

  it('Telegram for a review link: the canonical link as the url, the same caption the other text handoffs carry', async () => {
    render(<ShareMenu url="https://www.tappyai.com/reviews/abc" title="Review" open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-telegram'))
    await waitFor(() => expect(open).toHaveBeenCalled())
    const u = new URL(open.mock.calls[0][0] as string)
    expect(u.searchParams.get('url')).toBe('https://www.tappyai.com/reviews/abc')
    expect(u.searchParams.get('text')).toContain('Review')
  })

  it('Messenger (phone): copies first, opens fb-messenger://share?link= with the canonical url, says copied & opened', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36', configurable: true })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-messenger'))
    await waitFor(() => expect(status()).toBe('share.copiedAndOpened:{"app":"share.messenger"}'))
    expect(writeText).toHaveBeenCalledWith(artifact.text)
    expect(open.mock.calls[0][0]).toBe(`fb-messenger://share?link=${encodeURIComponent(artifact.url)}`)
  })

  it('Messenger (desktop): no tile, so no fake action — nothing opens, nothing is copied', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    expect(screen.queryByTestId('share-target-messenger')).toBeNull()
    expect(open).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })


  it('Copy puts the FULL brochure (header … footer) on the clipboard', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-copy'))
    await waitFor(() => expect(status()).toBe('share.copiedContent'))
    expect(writeText).toHaveBeenCalledWith(artifact.text)
    expect(writeText.mock.calls[0][0]).toContain('Gợi ý bởi TappyAI · www.tappyai.com')
  })

  it('Facebook/Messenger: copies the brochure, opens the sharer with the BRAND url only, says copied & opened', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-facebook'))
    await waitFor(() => expect(status()).toBe('share.copiedAndOpened:{"app":"share.facebook"}'))
    expect(writeText).toHaveBeenCalledWith(artifact.text)
    const url = open.mock.calls[0][0] as string
    expect(url).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://www.tappyai.com')}`)
    // No brochure text, no place name, nothing private in the handoff URL.
    expect(decodeURIComponent(url)).not.toContain(view.items[0].name)
  })

  it('Viber: copies first (insurance), then opens viber://forward with the brochure inside', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-viber'))
    await waitFor(() => expect(status()).toBe('share.copiedAndOpened:{"app":"share.viber"}'))
    expect(writeText).toHaveBeenCalledWith(artifact.text)
    const url = open.mock.calls[0][0] as string
    expect(url.startsWith('viber://forward?text=')).toBe(true)
    expect(decodeURIComponent(url.slice('viber://forward?text='.length))).toBe(inboxBody(artifact))
  })

  it('LINE: opens line.me/R/share with the brochure inside and reports "opened with text"', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-line'))
    await waitFor(() => expect(status()).toBe('share.openedWithText:{"app":"share.line"}'))
    const url = open.mock.calls[0][0] as string
    expect(new URL(url).searchParams.get('text')).toBe(inboxBody(artifact))
  })

  it('TikTok: no endpoint exists — copies and says what to do, never "opened"', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-tiktok'))
    await waitFor(() => expect(status()).toBe('share.tiktokHint'))
    expect(open).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(artifact.text)
  })

  it('Save: falls back to a .txt of the brochure when no image can be rendered — never fails the share', async () => {
    renderMock.mockResolvedValue(null)
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedText'))
    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('Save: downloads the PNG when the renderer produced one', async () => {
    renderMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedImage'))
  })

  it('Save: a renderer that THROWS still yields the text download', async () => {
    renderMock.mockRejectedValue(new Error('canvas tainted'))
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedText'))
  })
})

describe('ShareMenu — Tappy Inbox (the existing web Messenger)', () => {
  it('opens the existing NewMessageSheet, then POSTs the ≤4000 body to the existing messages endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { id: 'm1' } }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    expect(screen.getByTestId('new-message-sheet')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByTestId('stub-start')) })
    await waitFor(() => expect(status()).toBe('share.inboxSent'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/messaging/threads/thread-1/messages')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as { body: string }
    expect(Object.keys(body)).toEqual(['body'])
    expect(body.body.length).toBeLessThanOrEqual(INBOX_MAX_BODY)
    expect(body.body).toBe(inboxBody(artifact))
    expect(body.body.endsWith('Gợi ý bởi TappyAI · www.tappyai.com')).toBe(true)
  })

  // chat_messages.body has a CHECK ≤ 4000; a brochure that overflows must be
  // compacted BEFORE the POST, never sent raw to fail (or be cut) server-side.
  it('an overflowing brochure is compacted to ≤4000 before it is posted', async () => {
    const big = buildPlacesArtifact({ ...view, items: Array.from({ length: 6 }, () => view.items).flat() }, 'x', 'vi', env)
    expect(big.text.length).toBeGreaterThan(INBOX_MAX_BODY)
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { id: 'm1' } }) })
    render(<ShareMenu artifact={big} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    await act(async () => { fireEvent.click(screen.getByTestId('stub-start')) })
    await waitFor(() => expect(status()).toBe('share.inboxSent'))
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as { body: string }
    expect(body.body.length).toBeLessThanOrEqual(INBOX_MAX_BODY)
    expect(body.body.endsWith('Gợi ý bởi TappyAI · www.tappyai.com')).toBe(true)
  })

  it('an anonymous user is told to sign in (401/403) — no "sent"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'sign in' }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    await act(async () => { fireEvent.click(screen.getByTestId('stub-start')) })
    await waitFor(() => expect(status()).toBe('share.inboxSignIn'))
  })

  // `fetch` resolves on HTTP errors. A body that LOOKS like success with ok:false
  // is the only shape that proves `res.ok` is what decides.
  it('a server error with a success-looking body is still a failure — never a false "sent"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ data: { id: 'm1' } }) })
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    await act(async () => { fireEvent.click(screen.getByTestId('stub-start')) })
    await waitFor(() => expect(status()).toBe('share.inboxFailed'))
  })

  it('closing the sheet without picking anyone sends nothing', async () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-inbox'))
    fireEvent.click(screen.getByTestId('stub-close'))
    await waitFor(() => expect(screen.queryByTestId('new-message-sheet')).toBeNull())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(status()).toBe('')
  })
})
