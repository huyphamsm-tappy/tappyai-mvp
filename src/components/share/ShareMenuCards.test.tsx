// @vitest-environment jsdom
//
// Owner picks 29/09: the share sheet (#6) shows a LAYOUT SELECTOR and the rendered card, and the
// file saved by "Lưu về máy" and sent to TikTok is EXACTLY the file shown — the same File object,
// rendered once per (layout, link).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ShareMenu from './ShareMenu'
import type { SharePostCard } from '@/lib/share/contentCards'
import type { ShareArtifact } from '@/lib/share/shareArtifact'

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }) }))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => new Blob(['legacy'], { type: 'image/png' }) }))
const brandedRender = vi.fn(async (_o: unknown): Promise<Blob | null> => new Blob(['qr'], { type: 'image/png' }))
vi.mock('@/lib/qr/brandedCard', () => ({ renderBrandedQrCard: (o: unknown) => brandedRender(o) }))
const postRender = vi.fn(async (..._a: unknown[]): Promise<Blob | null> => new Blob(['post'], { type: 'image/png' }))
const suggestionRender = vi.fn(async (..._a: unknown[]): Promise<Blob | null> => new Blob(['suggestion'], { type: 'image/png' }))
vi.mock('@/lib/share/contentCards', () => ({
  renderPostCard: (...a: unknown[]) => postRender(...a),
  renderSuggestionCard: (...a: unknown[]) => suggestionRender(...a),
}))
const planRender = vi.fn(async (..._a: unknown[]): Promise<Blob | null> => new Blob(['plan'], { type: 'image/png' }))
vi.mock('@/lib/share/planCard', () => ({ renderPlanCard: (...a: unknown[]) => planRender(...a) }))

const URL_ = 'https://www.tappyai.com/reviews/r1'
const post: SharePostCard = { kind: 'review', title: 'Phở Hòa', placeName: 'Phở Hòa', rating: 5, excerpt: 'Ngon', author: 'An' }
let objectUrls: Blob[]
let downloads: string[]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
  objectUrls = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { objectUrls.push(b); return `blob:${objectUrls.length}` }), revokeObjectURL: vi.fn() }))
  vi.stubGlobal('open', vi.fn(() => ({}) as Window))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true })
  downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
  brandedRender.mockClear(); postRender.mockClear(); suggestionRender.mockClear(); planRender.mockClear()
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks()
  delete (navigator as unknown as { share?: unknown }).share
  delete (navigator as unknown as { canShare?: unknown }).canShare
})

const status = () => screen.queryByRole('status')?.textContent ?? ''
const openPost = () => render(<ShareMenu url={URL_} title="Phở Hòa" variant="post" profileName="Phở Hòa" post={post} open onClose={() => {}} />)

describe('share sheet — layout selector + the one card file', () => {
  it('an Explore post offers its own card first and the QR card second, and previews the chosen one', async () => {
    openPost()
    expect(screen.getByTestId('share-layout-review').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('share-layout-post').getAttribute('aria-checked')).toBe('false')
    await waitFor(() => expect(document.querySelector('[data-share-card-preview="review"]')).not.toBeNull())
    expect(postRender).toHaveBeenCalledTimes(1)
    expect(postRender.mock.calls[0][0]).toBe(post)
    expect(postRender.mock.calls[0][1]).toBe(URL_)
    expect(brandedRender).not.toHaveBeenCalled()
  })

  it('🔑 "Lưu về máy" downloads THE SAME File the preview shows — rendered once', async () => {
    openPost()
    await waitFor(() => expect(document.querySelector('[data-share-card-preview="review"]')).not.toBeNull())
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedImage'))
    expect(postRender).toHaveBeenCalledTimes(1)
    expect(objectUrls).toHaveLength(2)
    expect(objectUrls[1]).toBe(objectUrls[0])
    expect(downloads[0]).toMatch(/^tappyai-review-\d{4}-\d{2}-\d{2}\.png$/)
  })

  it('🔑 switching the layout switches the preview AND the saved file; TikTok gets that same file', async () => {
    const share = vi.fn(async (_d: ShareData) => {})
    Object.assign(navigator, { share, canShare: () => true })
    openPost()
    fireEvent.click(screen.getByTestId('share-layout-post'))
    await waitFor(() => expect(document.querySelector('[data-share-card-preview="post"]')).not.toBeNull())
    const shown = objectUrls[objectUrls.length - 1]
    fireEvent.click(screen.getByTestId('share-target-tiktok'))
    await waitFor(() => expect(status()).toBe('share.tiktokShared'))
    expect(share.mock.calls[0][0].files?.[0]).toBe(shown)
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(downloads.length).toBe(1))
    expect(objectUrls[objectUrls.length - 1]).toBe(shown)
    expect(downloads[0]).toMatch(/^tappyai-post-/)
    expect(brandedRender).toHaveBeenCalledTimes(1)
  })

  it('a clip post offers the clip card', () => {
    render(<ShareMenu url={URL_} title="Clip" variant="post" post={{ ...post, kind: 'clip' }} open onClose={() => {}} />)
    expect(screen.getByTestId('share-layout-clip').getAttribute('aria-checked')).toBe('true')
  })

  it('a chat recommendation opens the approved sheet with the suggestion card (one layout → no selector)', async () => {
    const artifact: ShareArtifact = { kind: 'places', title: 'Phở Q3', subject: 'Phở Q3', text: 'Phở Q3\n1. Phở Hòa', url: 'https://www.tappyai.com', places: [{ name: 'Phở Hòa', links: [] }] }
    render(<ShareMenu artifact={artifact} variant="suggestion" open onClose={() => {}} />)
    expect(document.querySelector('[data-share-variant="suggestion"]')).not.toBeNull()
    expect(screen.getByText('share.suggestion.cardLine')).toBeTruthy()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    await waitFor(() => expect(document.querySelector('[data-share-card-preview="suggestion"]')).not.toBeNull())
    expect(suggestionRender.mock.calls[0][0]).toBe('Phở Q3')
    // The brochure text is more than the url: the copy button says so.
    expect(screen.getByTestId('share-target-copy').textContent).toContain('share.copyContent')
  })

  it('the /plan page sheet: already linked (never re-published), the plan image is the card', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const artifact: ShareArtifact = {
      kind: 'plan', title: 'Quy Nhơn', subject: 'Quy Nhơn', text: 'Quy Nhơn\nhttps://www.tappyai.com/plan/AbCdEfGhIjK1', url: 'https://www.tappyai.com/plan/AbCdEfGhIjK1', places: [],
      plan: { v: 1, title: 'Quy Nhơn', days: [{ label: 'Ngày 1', items: [{ name: 'Kỳ Co' }] }] }, planLink: true,
    }
    render(<ShareMenu artifact={artifact} variant="plan" open onClose={() => {}} />)
    await waitFor(() => expect(document.querySelector('[data-share-card-preview="plan"]')).not.toBeNull())
    expect(planRender.mock.calls[0][1]).toBe(artifact.url)
    expect(fetchSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(downloads[0]).toMatch(/^tappyai-plan-/))
  })

  it('a failed render says so and Save falls back to text — the share never fails', async () => {
    postRender.mockResolvedValue(null)
    openPost()
    await waitFor(() => expect(document.querySelector('[data-share-card-state="failed"]')).not.toBeNull())
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedText'))
    postRender.mockImplementation(async () => new Blob(['post'], { type: 'image/png' }))
  })
})
