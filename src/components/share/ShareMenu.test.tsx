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

afterEach(() => {
  cleanup()
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

  it('renders the branded preview from the artifact', () => {
    render(<ShareMenu artifact={artifact} open onClose={() => {}} />)
    expect(screen.getByTestId('share-preview')).toBeTruthy()
    expect(screen.getAllByTestId('share-preview-place')).toHaveLength(3)
  })
})

describe('ShareMenu — what each target really does', () => {
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
