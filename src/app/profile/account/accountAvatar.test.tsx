// @vitest-environment jsdom
//
// The Profile card the owner screenshotted: a Zalo user, a broken avatar, and no way to change
// it. The avatar itself now carries the edit affordance — /profile/edit already owns the upload
// (file picker, 3 MB + magic-byte validation, POST /api/profile), so this only makes that
// existing screen reachable from the thing the user is actually trying to change.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import AccountView from './AccountView'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile/account',
  useSearchParams: () => new URLSearchParams(),
}))

// The chrome around the card is not under test, and both pieces reach for browser APIs this
// environment does not provide. Stubbing them also means every <img> asserted below belongs to
// the profile card itself.
vi.mock('@/components/Header', () => ({ default: () => null }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))

type UserInfo = {
  full_name?: string | null
  avatar_url?: string | null
  email?: string | null
  created_at?: string | null
}

const ZALO_USER: UserInfo = {
  full_name: 'Huy Pham',
  avatar_url: 'https://s120-ava-talk.zadn.vn/a/b/c/d/1/abcdef.jpg',
  email: 'zalo_123456@zalo.tappyai.com',
  created_at: '2026-01-01T00:00:00.000Z',
}

const view = (userInfo: UserInfo) =>
  render(<AccountView userInfo={userInfo} firstName="Huy" joinDateIso={userInfo.created_at ?? null} />)

afterEach(cleanup)

describe('Profile card — Zalo avatar', () => {
  it('displays the Zalo avatar', () => {
    view(ZALO_USER)
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
  })

  it('falls back cleanly when the Zalo avatar cannot be loaded', () => {
    view(ZALO_USER)
    for (const img of screen.getAllByRole('img')) fireEvent.error(img)
    // No broken image is left behind, and the card still shows an avatar state.
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getAllByText('H').length).toBeGreaterThan(0)
  })

  it('shows the initial for a Zalo user who has no avatar at all', () => {
    view({ ...ZALO_USER, avatar_url: null })
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getAllByText('H').length).toBeGreaterThan(0)
  })

  it('offers a way to change the avatar from the card itself', () => {
    view(ZALO_USER)
    const edit = screen.getByTestId('account-avatar-edit')
    expect(edit.getAttribute('href')).toBe('/profile/edit')
  })

  it('offers it even when there is no avatar yet — the empty state is where users need it most', () => {
    view({ ...ZALO_USER, avatar_url: null })
    expect(screen.getByTestId('account-avatar-edit').getAttribute('href')).toBe('/profile/edit')
  })
})
