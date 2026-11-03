// @vitest-environment jsdom
// Regression for the preferences data-loss bug: a failed GET /api/preferences must not render an
// empty, saveable form (saving it upserts blanks over the user's real preferences).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/preferences',
  useSearchParams: () => new URLSearchParams(),
}))

import PreferencesPage from './page'
import { setLocale } from '@/lib/i18n/useTranslation'

function stubFetch(prefsResponse: () => Response) {
  const calls: Array<{ url: string; method: string }> = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' })
    if (url === '/api/preferences' && (init?.method ?? 'GET') === 'GET') return prefsResponse()
    if (url === '/api/profile') return new Response('null', { status: 401 })
    return new Response('{}', { status: 200 })
  }))
  return calls
}

beforeEach(() => setLocale('vi'))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('preferences load failure', () => {
  it('shows a load error and no saveable form when GET /api/preferences fails (500)', async () => {
    const calls = stubFetch(() => new Response('{"error":"server_error"}', { status: 500 }))
    render(<PreferencesPage />)
    await waitFor(() => expect(screen.getByText('Không tải được sở thích của bạn. Vui lòng thử lại.')).toBeTruthy())
    expect(screen.queryByText('🧠 Tappy nhớ bạn')).toBeNull()
    // Nothing was written: no PUT/POST to /api/preferences was ever issued.
    expect(calls.filter(c => c.url === '/api/preferences' && c.method !== 'GET')).toEqual([])
  })

  it('renders the form normally when the load succeeds', async () => {
    stubFetch(() => new Response(JSON.stringify({ preferences: [], structured: null }), { status: 200 }))
    render(<PreferencesPage />)
    await waitFor(() => expect(screen.getByText('🧠 Tappy nhớ bạn')).toBeTruthy())
    expect(screen.queryByText('Không tải được sở thích của bạn. Vui lòng thử lại.')).toBeNull()
  })
})
