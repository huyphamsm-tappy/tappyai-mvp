// @vitest-environment jsdom
//
// The PROFILE share sheet (UAT3, approved design "Chia sẻ với mọi người"): every section of the
// design is present, it runs the same handlers as the default sheet, and it needs no session.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ShareMenu from './ShareMenu'

vi.mock('@/lib/i18n/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string, vars?: Record<string, string>) => (vars ? `${k}:${JSON.stringify(vars)}` : k), locale: 'vi' }),
}))
vi.mock('@/components/messaging/NewMessageSheet', () => ({ default: () => null }))
vi.mock('@/lib/share/renderCardImage', () => ({ renderArtifactImage: async () => null }))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const URL_ = 'https://www.tappyai.com/users/0b6c0a4e-1111-4222-8333-944455556666'
const open = (name = 'Huy Phạm') =>
  render(<ShareMenu url={URL_} title={`${name} · TappyAI`} open onClose={() => {}} variant="profile" profileName={name} />)

describe('ShareMenu variant="profile"', () => {
  it('renders every section of the approved design', () => {
    const { container } = open()
    expect(container.querySelector('[data-share-variant="profile"]')).not.toBeNull()
    for (const key of ['share.profile.title', 'share.profile.subtitle', 'v3.page.subtitle', 'share.profile.cardLine', 'share.profile.copyLink', 'share.profile.quick', 'share.profile.other', 'share.profile.inboxDesc', 'share.profile.saveDesc', 'share.profile.bannerTitle', 'share.profile.bannerSub']) {
      expect(screen.getByText(key), key).toBeTruthy()
    }
    expect(screen.getByText('Huy Phạm · TappyAI')).toBeTruthy()
    expect(container.querySelector('[data-share-profile-url]')!.textContent).toBe(URL_)
    // The app grid: the same targets as the default sheet, each with its platform mark.
    for (const id of ['facebook', 'zalo', 'whatsapp', 'telegram', 'viber', 'line', 'tiktok', 'email']) {
      expect(screen.getByTestId(`share-target-${id}`), id).toBeTruthy()
    }
    // The generic sheet's own title and preview are not part of this layout.
    expect(screen.queryByText('share.previewTitle')).toBeNull()
    expect(container.querySelector('img[src="/tappy/wave.png"]')).not.toBeNull()
    expect(container.querySelector('img[src="/branding/otter-logo.png"]')).not.toBeNull()
  })

  it('"Sao chép link" copies exactly the profile url', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    open()
    fireEvent.click(screen.getByTestId('share-target-copy'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_))
  })

  it('without a name the card says TappyAI alone; "Ứng dụng khác" only where the OS sheet exists', () => {
    open('')
    expect(screen.getAllByText('TappyAI').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('share-target-native')).toBeNull()
  })

  it('makes no network call on open (no session needed)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    open()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
