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

  it('owner 01/10 (TikTok style): a discreet plain row at the end of «Other», NOT red, NOT in the Sign out card', () => {
    setLocale('en')
    const { container } = render(<SettingsView user={user} />)
    const link = screen.getByRole('link', { name: /Request Account Deletion/i })

    // Not in the card that holds Sign out.
    const card = link.closest('.v3-panel')
    expect(card).not.toBeNull()
    expect(card!.textContent).not.toContain('Sign out')
    const signOutCard = screen.getByText('Sign out').closest('.v3-panel')
    expect(signOutCard).not.toBe(card)

    // It sits in the «Other» list, after Terms and Privacy (the last link of that list).
    const links = Array.from(card!.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(links[links.length - 1]).toBe('/delete-account')
    expect(links.indexOf('/privacy')).toBeLessThan(links.indexOf('/delete-account'))

    // Plain text: none of MenuItem's `danger` treatment (red label, red icon tile).
    expect(link.querySelector('.text-red-500')).toBeNull()
    expect(link.className).not.toMatch(/red/)
    expect(container.querySelector('.bg-red-50')).toBeNull()
  })

  it('keeps dark-mode variants on the new row', () => {
    setLocale('en')
    render(<SettingsView user={user} />)
    const link = screen.getByRole('link', { name: /Request Account Deletion/i })
    // Tailwind runs darkMode:'class'; the row must carry dark: variants or it
    // renders light-on-light once Header puts `dark` on <html>.
    expect(link.innerHTML).toMatch(/dark:/)
  })

  // UAT3 P0: where ACCOUNT_SELF_DELETE_ENABLED is on, the same row opens the in-app deletion page.
  it('opens the in-app deletion page when self-service deletion is enabled', () => {
    setLocale('vi')
    render(<SettingsView user={user} selfDelete />)
    const link = screen.getByRole('link', { name: /^Xóa tài khoản$/ })
    expect(link.getAttribute('href')).toBe('/profile/settings/delete-account')
    setLocale('en')
  })
})
