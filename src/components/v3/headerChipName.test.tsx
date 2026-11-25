// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'

// UAT 21/11/2026: a cached public page (Scam Shield) hands the shell no `user`, so a signed-in member read "Khách" in the corner.
// The shell now reads the member's own name — and asks the server nothing for a visitor.
const h = vi.hoisted(() => ({
  session: null as { user: { id: string; is_anonymous?: boolean } } | null,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      getUser: async () => ({ data: { user: h.session?.user ?? null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/scam-shield', useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/NotificationProvider', () => ({ useNotifications: () => ({ unreadCount: 0 }) }))
vi.mock('@/components/BottomNav', () => ({ default: () => null }))
vi.mock('@/lib/theme/useThemeMode', () => ({ useThemeMode: () => ({ mode: 'dark', toggle: vi.fn() }) }))

import V3Shell, { __resetChipProfile } from './V3Shell'
import { setLocale } from '@/lib/i18n/useTranslation'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  __resetChipProfile()
  setLocale('vi')
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ full_name: 'An Chủ Bài', avatar_url: '' }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('the header chip on a page that passes no user', () => {
  it('shows the signed-in member\'s own name instead of "Khách"', async () => {
    h.session = { user: { id: 'u-1', is_anonymous: false } }
    const { container } = render(<V3Shell title="Scam Shield">x</V3Shell>)
    await waitFor(() => expect(container.textContent).toContain('An Chủ Bài'))
    expect(fetchMock).toHaveBeenCalledWith('/api/profile')
  })
  const profileCalls = () => fetchMock.mock.calls.filter(c => String(c[0]) === '/api/profile')

  it('a visitor (anonymous session) still reads "Khách" and nothing is requested', async () => {
    h.session = { user: { id: 'anon', is_anonymous: true } }
    const { container } = render(<V3Shell title="Scam Shield">x</V3Shell>)
    await new Promise(r => setTimeout(r, 30))
    expect(container.textContent).toContain('Khách')
    expect(profileCalls().length).toBe(0)
  })

  it('a page that does pass the user is unchanged and makes no request', async () => {
    h.session = { user: { id: 'u-1', is_anonymous: false } }
    const { container } = render(<V3Shell title="t" user={{ name: 'Huy' }}>x</V3Shell>)
    await new Promise(r => setTimeout(r, 30))
    expect(container.textContent).toContain('Huy')
    expect(profileCalls().length).toBe(0)
  })
})
