// @vitest-environment jsdom
// Phase 7 closeout 4B — Profile V3 → Edit Profile V3 → Save → Profile V3; Back → Profile V3. Never the old /profile/account layout.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
const headerProps: Array<Record<string, unknown>> = []
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile/edit',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/Header', () => ({ default: (p: Record<string, unknown>) => { headerProps.push(p); return null } }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))

const PROFILE = { full_name: 'Huy Pham', avatar_url: '', email: 'huy@example.com', bio: '' }
beforeEach(() => {
  push.mockClear(); headerProps.length = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) return { ok: true, json: async () => PROFILE } as Response
    return { ok: true, json: async () => ({ ok: true }) } as Response
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Edit Profile navigation returns to Profile V3', () => {
  it('Back goes to /profile (V3), not /profile/account', async () => {
    const { default: EditProfilePage } = await import('./page')
    render(<EditProfilePage />)
    await screen.findByDisplayValue('Huy Pham')
    const last = headerProps[headerProps.length - 1]
    expect(last.backHref).toBe('/profile')
    expect(headerProps.some(p => p.backHref === '/profile/account')).toBe(false)
  })
  it('Save lands on /profile (V3)', async () => {
    const { default: EditProfilePage } = await import('./page')
    render(<EditProfilePage />)
    await screen.findByDisplayValue('Huy Pham')
    fireEvent.change(screen.getByDisplayValue('Huy Pham'), { target: { value: 'Huy Phạm' } })
    fireEvent.click(screen.getByRole('button', { name: /Lưu|Save/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile'), { timeout: 3000 })
    expect(push).not.toHaveBeenCalledWith('/profile/account')
  })
})
