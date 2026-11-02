// @vitest-environment jsdom
// Regression for the price-watch delete: the row may leave the list only after the server
// confirms the cancel. fetch() resolves on 401/404/500, so a bare await used to drop the row
// while the watch stayed active on the server.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profile/price-watches',
  useSearchParams: () => new URLSearchParams(),
}))

import PriceWatchesPage from './page'
import { setLocale } from '@/lib/i18n/useTranslation'

const WATCH = {
  id: 'w1',
  product_name: 'Tai nghe test',
  target_price: 500_000,
  current_price: 600_000,
  status: 'active',
  last_checked: null,
  notified_at: null,
  created_at: '2026-10-01T00:00:00Z',
}

function stubFetch(deleteResponse: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return deleteResponse()
    return new Response(JSON.stringify({ watches: [WATCH] }), { status: 200 })
  }))
}

beforeEach(() => setLocale('vi'))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('price-watch delete', () => {
  it('keeps the row and shows an error when the server refuses the cancel (500)', async () => {
    stubFetch(() => new Response('{}', { status: 500 }))
    render(<PriceWatchesPage />)
    const cancel = await screen.findByRole('button', { name: 'Hủy theo dõi' })
    fireEvent.click(cancel)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Không thể hủy theo dõi. Vui lòng thử lại.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hủy theo dõi' })).toBeTruthy()
  })

  it('removes the row only after the server confirms the cancel (200)', async () => {
    stubFetch(() => new Response('{"ok":true}', { status: 200 }))
    render(<PriceWatchesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy theo dõi' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Hủy theo dõi' })).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
