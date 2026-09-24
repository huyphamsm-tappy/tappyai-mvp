// @vitest-environment jsdom
//
// Google Play requires the account-deletion route to be discoverable in the app,
// not only on the open web. Android exposes it from Settings; these tests pin the
// web equivalent so the entry cannot be dropped or drift out of the two languages.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'
import SettingsView from './SettingsView'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile/settings',
  useSearchParams: () => new URLSearchParams(),
}))

// SignOutButton builds a Supabase browser client on render, and since Settings moved onto
// `V3Shell` (Phase 7 RC §9) the shell's auth-aware sidebar row reads the session too
// (`useAuthStatus` → getUser + onAuthStateChange). A mock missing either one throws inside an
// effect, which fails every test in the file for a reason that has nothing to do with them.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn(),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}))

vi.mock('@/components/NotificationProvider', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, loading: false, refetch: vi.fn(), markAllRead: vi.fn() }),
}))

const user = { full_name: 'Huy Pham', avatar_url: null, email: 'huy@example.com' }

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }),
  })
  window.localStorage.clear()
  setLocale('vi')
})

afterEach(cleanup)

describe('Settings → Request Account Deletion', () => {
  it('renders the entry in English and links to the public page', () => {
    setLocale('en')
    render(<SettingsView user={user} />)
    const link = screen.getByRole('link', { name: /Request Account Deletion/i })
    expect(link.getAttribute('href')).toBe('/delete-account')
  })

  it('renders the entry in Vietnamese', () => {
    setLocale('vi')
    render(<SettingsView user={user} />)
    const link = screen.getByRole('link', { name: /Yêu cầu xóa tài khoản/i })
    expect(link.getAttribute('href')).toBe('/delete-account')
    // The English wording must be gone — this screen showed both at one point.
    expect(screen.queryByText('Request Account Deletion')).toBeNull()
  })

  it('sits beside Sign out, and is danger-styled like it', () => {
    setLocale('en')
    const { container } = render(<SettingsView user={user} />)
    const link = screen.getByRole('link', { name: /Request Account Deletion/i })

    // Same card as Sign out, matching how Android groups the two rows. The card is
    // `.v3-panel` since Settings moved onto the V3 shell (Phase 7 RC §9); it was `.card`.
    const card = link.closest('div.v3-panel')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('Sign out')

    // MenuItem's `danger` treatment: red label, red icon tile.
    expect(link.querySelector('.text-red-500')).not.toBeNull()
    expect(container.querySelector('.bg-red-50')).not.toBeNull()
  })

  it('keeps dark-mode variants on the new row', () => {
    setLocale('en')
    render(<SettingsView user={user} />)
    const link = screen.getByRole('link', { name: /Request Account Deletion/i })
    // Tailwind runs darkMode:'class'; the row must carry dark: variants or it
    // renders light-on-light once Header puts `dark` on <html>.
    expect(link.innerHTML).toMatch(/dark:/)
  })
})
