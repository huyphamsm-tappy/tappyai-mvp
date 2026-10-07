// @vitest-environment jsdom
//
// ── "I changed my name and it still shows the old one" ───────────────────────
//
// Owner report: after a Zalo sign-in, changing the full name did not appear to take effect.
//
// The persistence model is NOT the problem, and this test exists so nobody re-litigates that.
// `on_auth_user_created` fires on INSERT only, so a returning Zalo user's profiles row is never
// rewritten; PATCH /api/profile writes `profiles.full_name`; and every reader is
// `profile?.full_name || user_metadata`. Two devices read the same row.
//
// What is wrong is the trip back. /profile/account is a server component, and Next's CLIENT
// router cache holds its RSC payload for ~30s. The user's path is
//
//   /profile/account → Edit → Save → back to /profile/account
//
// which lands on that page well inside the window, so the browser re-renders the cached copy —
// carrying the name from before the edit. The avatar path already knows this and calls
// `router.refresh()` (with a comment saying exactly why). The name path was the one writer that
// did not, so only the name looked like it "didn't save".
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const refresh = vi.fn()
const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile/edit',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/Header', () => ({ default: () => null }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))

const PROFILE = { full_name: 'Huy Pham', avatar_url: '', email: 'zalo_1@zalo.tappyai.com', bio: '' }

beforeEach(() => {
  refresh.mockClear()
  push.mockClear()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) return { ok: true, json: async () => PROFILE } as Response
    if (init.method === 'PATCH') return { ok: true, json: async () => ({ ok: true }) } as Response
    if (init.method === 'POST') return { ok: true, json: async () => ({ avatar_url: 'https://x.supabase.co/a.jpg' }) } as Response
    return { ok: false, json: async () => ({}) } as Response
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const load = async () => {
  const { default: EditProfilePage } = await import('./page')
  render(<EditProfilePage />)
  await screen.findByDisplayValue('Huy Pham')
}

describe('saving the profile must not leave a stale Account page behind', () => {
  it('invalidates the router cache after the name is saved', async () => {
    await load()

    fireEvent.change(screen.getByDisplayValue('Huy Pham'), { target: { value: 'Huy Phạm Mới' } })
    fireEvent.click(screen.getByRole('button', { name: /Lưu|Save/i }))

    // The PATCH must land AND the cached Account payload must be dropped. Without the second
    // half the user navigates straight back onto the pre-edit copy.
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('does not invalidate when the save fails — nothing changed to re-read', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (!init || init.method === undefined) return { ok: true, json: async () => PROFILE } as Response
      return { ok: false, json: async () => ({ message: 'nope' }) } as Response
    }))
    await load()

    fireEvent.change(screen.getByDisplayValue('Huy Pham'), { target: { value: 'Huy Phạm Mới' } })
    fireEvent.click(screen.getByRole('button', { name: /Lưu|Save/i }))

    await screen.findByText(/nope/)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('still invalidates after an avatar upload — the behaviour that was already right', async () => {
    await load()

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
