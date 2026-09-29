// @vitest-environment jsdom
//
// Owner UAT 2026-09-28: Explore's share was the OLD sheet, and the downloaded file did not match
// the layout on screen. Explore now opens the approved sheet (`variant="post"`), and Save and
// TikTok both produce the file through ONE generator in THAT layout.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ShareMenu from './ShareMenu'

vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi' }) }))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
const artifactRender = vi.fn(async (): Promise<Blob | null> => new Blob(['generic'], { type: 'image/png' }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: (...a: unknown[]) => artifactRender(...(a as [])) }))
const brandedRender = vi.fn(async (_o: unknown): Promise<Blob | null> => new Blob(['branded'], { type: 'image/png' }))
vi.mock('@/lib/qr/brandedCard', () => ({ renderBrandedQrCard: (o: unknown) => brandedRender(o) }))

const URL_ = 'https://www.tappyai.com/reviews/r1'
const VIDEO = 'https://storage.googleapis.com/tappyai-media-prod/videos/u/r1.mp4'
let open: ReturnType<typeof vi.fn>
let downloads: string[]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.tappyai.com')
  open = vi.fn(() => ({}) as Window)
  vi.stubGlobal('open', open)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true })
  downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
  artifactRender.mockClear(); brandedRender.mockClear()
})
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks()
  delete (navigator as unknown as { share?: unknown }).share
  delete (navigator as unknown as { canShare?: unknown }).canShare
})

const status = () => screen.queryByRole('status')?.textContent ?? ''

describe('Explore post share — the approved sheet', () => {
  it('renders the approved "Chia sẻ với mọi người" layout with the post card line', () => {
    render(<ShareMenu url={URL_} title="Phở Hòa" variant="post" profileName="Phở Hòa" open onClose={() => {}} />)
    expect(document.querySelector('[data-share-variant="post"]')).not.toBeNull()
    expect(screen.getByText('share.profile.title')).toBeTruthy()
    expect(screen.getByText('share.post.cardLine')).toBeTruthy()
  })

  it('🚨 Save downloads THE CHOSEN LAYOUT (the TappyAI card for this post), not the generic card', async () => {
    render(<ShareMenu url={URL_} title="Phở Hòa" variant="post" profileName="Phở Hòa" open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedImage'))
    expect(brandedRender).toHaveBeenCalledTimes(1)
    expect(brandedRender.mock.calls[0][0]).toMatchObject({ text: URL_, displayName: 'Phở Hòa', caption: 'share.post.scanHint' })
    expect(artifactRender).not.toHaveBeenCalled()
    expect(downloads[0]).toMatch(/^tappyai-post-\d{4}-\d{2}-\d{2}\.png$/)
  })

  it('the profile sheet saves the profile card (same generator, its own layout)', async () => {
    render(<ShareMenu url="https://www.tappyai.com/users/u1" title="An" variant="profile" profileName="An" open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-save'))
    await waitFor(() => expect(status()).toBe('share.savedImage'))
    expect(brandedRender.mock.calls[0][0]).toMatchObject({ text: 'https://www.tappyai.com/users/u1', caption: 'v3.qr.scanHint', invite: 'v3.qr.card.invite' })
    expect(downloads[0]).toMatch(/^tappyai-profile-/)
  })

  it('TikTok (image) on a phone: the SAME card file goes to navigator.share with caption + link', async () => {
    const share = vi.fn(async (_d: ShareData) => {})
    Object.assign(navigator, { share, canShare: () => true })
    render(<ShareMenu url={URL_} title="Phở Hòa" variant="post" profileName="Phở Hòa" open onClose={() => {}} />)
    expect(screen.getByTestId('share-target-tiktok').textContent).toContain('share.tiktokImage')
    fireEvent.click(screen.getByTestId('share-target-tiktok'))
    await waitFor(() => expect(status()).toBe('share.tiktokShared'))
    const data = share.mock.calls[0][0]
    expect(data.files?.[0].name).toMatch(/^tappyai-post-/)
    expect(data.text).toBe(`Phở Hòa\n${URL_}`)
    expect(open).not.toHaveBeenCalled()
  })

  it('TikTok (video) for an uploaded clip: shares the clip FILE itself', async () => {
    const share = vi.fn(async (_d: ShareData) => {})
    Object.assign(navigator, { share, canShare: () => true })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, headers: { get: (k: string) => (k === 'content-type' ? 'video/mp4' : null) }, blob: async () => new Blob(['vid'], { type: 'video/mp4' }) })))
    render(<ShareMenu url={URL_} title="Phở Hòa" variant="post" profileName="Phở Hòa" videoUrl={VIDEO} open onClose={() => {}} />)
    expect(screen.getByTestId('share-target-tiktok').textContent).toContain('share.tiktokVideo')
    fireEvent.click(screen.getByTestId('share-target-tiktok'))
    await waitFor(() => expect(status()).toBe('share.tiktokShared'))
    expect(share.mock.calls[0][0].files?.[0].type).toBe('video/mp4')
    // The card is only rendered for the sheet's preview; the video alone leaves.
    expect(share.mock.calls[0][0].files).toHaveLength(1)
  })

  it('TikTok for a clip whose video cannot be fetched (CORS/offline) falls back to the card; desktop downloads + opens upload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('CORS') }))
    render(<ShareMenu url={URL_} title="Phở Hòa" variant="post" profileName="Phở Hòa" videoUrl={VIDEO} open onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('share-target-tiktok'))
    await waitFor(() => expect(status()).toBe('share.tiktokDownloaded'))
    expect(brandedRender).toHaveBeenCalledTimes(1)
    expect(downloads[0]).toMatch(/^tappyai-post-/)
    expect(open).toHaveBeenCalledWith('https://www.tiktok.com/upload', '_blank', 'noopener,noreferrer')
  })
})
