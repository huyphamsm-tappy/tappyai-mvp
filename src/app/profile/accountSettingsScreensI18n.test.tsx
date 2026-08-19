// @vitest-environment jsdom
//
// Locale coverage for the remaining Account & Settings screens — the ones that
// were already Client Components but had never adopted useTranslation(), plus
// the two Group Dining screens and the Language switcher.
//
// These screens fetch on mount, so network and Supabase are stubbed; the point
// of these tests is the rendered copy, not the data layer. Together with
// accountSettingsI18n.test.tsx (the three former Server Components) this covers
// every screen listed in the sprint scope in both languages.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { setLocale } from '@/lib/i18n/useTranslation'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'g1' }),
}))

// Preferences / My reviews read the signed-in user through the browser client.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', user_metadata: {} } } }) },
    // Query builders chain arbitrarily (.select().eq().eq().order()), so return a
    // self-referential thenable rather than modelling each call site's exact chain.
    from: () => {
      const qb: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit', 'in']) qb[m] = () => qb
      qb.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      return qb
    },
  }),
}))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

import FavoritesPage from './favorites/page'
import PriceWatchesPage from './price-watches/page'
import TappyKnowsPage from './tappy-knows/page'
import PreferencesPage from './preferences/page'
import MyPostsPage from './posts/page'
import EditProfilePage from './edit/page'
import IntegrationsPage from './integrations/page'
import LanguageSwitcher from './settings/LanguageSwitcher'
import GroupNewForm from '../group/new/GroupNewForm'

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
  // Every screen here fetches on mount; empty payloads exercise the empty states,
  // which is exactly the copy most likely to be left hard-coded.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ favorites: [], reviews: [], watches: [], memory: null, preferences: {} }),
  })))
  setLocale('vi')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Renders `ui` under `locale` and resolves once the mount-time fetch has settled. */
async function renderIn(locale: 'vi' | 'en', ui: React.ReactElement) {
  setLocale(locale)
  const result = render(ui)
  await waitFor(() => expect(document.body.textContent).not.toBe(''))
  return result
}

type Case = {
  name: string
  ui: () => React.ReactElement
  vi: string[]
  en: string[]
}

const CASES: Case[] = [
  {
    name: 'Saved',
    ui: () => <FavoritesPage />,
    vi: ['Đã lưu', 'Chưa có mục nào được lưu'],
    en: ['Saved', 'Nothing saved yet'],
  },
  {
    name: 'Price tracking',
    ui: () => <PriceWatchesPage />,
    vi: ['🎯 Theo dõi giá', 'Chưa có mục theo dõi giá nào'],
    en: ['🎯 Price tracking', 'No price watches yet'],
  },
  {
    name: 'AI Memory',
    ui: () => <TappyKnowsPage />,
    vi: ['Giọng điệu', 'Thân mật'],
    en: ['Tone', 'Friendly'],
  },
  {
    name: 'Preferences',
    ui: () => <PreferencesPage />,
    vi: ['Phở & Bún', 'Lưu sở thích'],
    en: ['Pho & Bun', 'Save preferences'],
  },
  {
    name: 'My reviews',
    ui: () => <MyPostsPage />,
    vi: ['Bài viết của tôi'],
    en: ['My Reviews'],
  },
  {
    name: 'Edit profile',
    ui: () => <EditProfilePage />,
    vi: ['Họ và tên', 'Lưu'],
    en: ['Full name', 'Save'],
  },
  {
    name: 'App connections',
    ui: () => <IntegrationsPage />,
    vi: ['Kết nối ứng dụng'],
    en: ['App connections'],
  },
  {
    name: 'Group dining — create',
    ui: () => <GroupNewForm />,
    vi: ['Đi đâu ăn gì cả team?', 'Tên nhóm của bạn'],
    en: ['Where should the team eat?', 'Group name'],
  },
  {
    name: 'Language switcher',
    ui: () => <LanguageSwitcher />,
    vi: ['Ngôn ngữ'],
    en: ['Language'],
  },
]

describe.each(CASES)('$name', ({ ui, vi: viCopy, en: enCopy }) => {
  it('renders Vietnamese under the vi locale', async () => {
    const { container } = await renderIn('vi', ui())
    for (const text of viCopy) expect(container.textContent).toContain(text)
  })

  it('renders English under the en locale, with no Vietnamese copy left', async () => {
    const { container } = await renderIn('en', ui())
    for (const text of enCopy) expect(container.textContent).toContain(text)
    // The Vietnamese strings for this screen must be gone entirely — this is the
    // exact failure the owner reported ("English selected, Vietnamese shown").
    for (const text of viCopy) {
      if (/^[\W\d\s]+$/.test(text)) continue // emoji/symbol-only labels are shared
      expect(container.textContent).not.toContain(text)
    }
  })
})

describe('Language switcher flips the whole app', () => {
  it('exposes both languages in their own script, not translated', async () => {
    await renderIn('en', <LanguageSwitcher />)
    // Language names are conventionally shown in their own language.
    expect(screen.getByText(/VI/)).toBeTruthy()
    expect(screen.getByText(/EN/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Screens that were already localized before this sprint. They are in the UAT
// scope, so they get the same both-languages assertion to guard against a
// regression from the w4 merge or the shared Header/MenuItem changes.
// ---------------------------------------------------------------------------

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    permission: 'default', subscribed: false, loading: false, error: null,
    subscribe: vi.fn(), unsubscribe: vi.fn(),
  }),
}))

const user = { full_name: 'Huy Pham', avatar_url: null, email: 'huy@example.com' }

describe('Settings hub', () => {
  it('renders both languages', async () => {
    const { default: SettingsView } = await import('./settings/SettingsView')
    const { container } = await renderIn('vi', <SettingsView user={user} />)
    expect(container.textContent).toContain('Cài đặt')
    cleanup()
    const en = await renderIn('en', <SettingsView user={user} />)
    expect(en.container.textContent).toContain('Settings')
    expect(en.container.textContent).toContain('Notifications')
    expect(en.container.textContent).not.toContain('Thông báo')
  })
})

describe('Profile hub', () => {
  it('renders both languages', async () => {
    const { default: ProfileView } = await import('./ProfileView')
    const props = { userId: 'u1', userInfo: user, firstName: 'Huy', conversationCount: 3 }
    const { container } = await renderIn('vi', <ProfileView {...props} />)
    expect(container.textContent).toContain('Lịch sử chat')
    cleanup()
    const en = await renderIn('en', <ProfileView {...props} />)
    expect(en.container.textContent).toContain('Chat history')
    expect(en.container.textContent).not.toContain('Lịch sử chat')
  })
})

describe('Notifications', () => {
  it('renders both languages', async () => {
    const { default: NotificationsView } = await import('./notifications/NotificationsView')
    const { container } = await renderIn('vi', <NotificationsView user={user} />)
    expect(container.textContent).toContain('Thông báo')
    cleanup()
    const en = await renderIn('en', <NotificationsView user={user} />)
    expect(en.container.textContent).toContain('Notifications')
    expect(en.container.textContent).not.toContain('Thông báo')
  })
})

describe('Group dining — detail', () => {
  it('renders the not-found state in both languages', async () => {
    // fetch resolves with no group, which is the screen's error/empty path.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const { default: GroupPage } = await import('../group/[id]/page')
    const { container } = await renderIn('vi', <GroupPage />)
    await waitFor(() => expect(container.textContent).toContain('Không tìm thấy nhóm'))
    cleanup()
    const en = await renderIn('en', <GroupPage />)
    await waitFor(() => expect(en.container.textContent).toContain('Group not found'))
    expect(en.container.textContent).not.toContain('Không tìm thấy nhóm')
  })
})
