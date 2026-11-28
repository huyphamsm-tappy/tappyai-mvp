// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import SavedDrawer from './SavedDrawer'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

// Owner 28/11/2026: everything except the chat needs an account, so the saved-places API answers a visitor session 403 account_required (a signed-out caller 401).
// The drawer must read both as "sign in", never as a failure to load.
describe('SavedDrawer for a person without an account', () => {
  it('401: shows the sign-in line', async () => {
    vi.stubGlobal('fetch', answer(401, { error: 'unauthorized' }))
    render(<SavedDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/đăng nhập/i)).toBeTruthy())
  })

  it('403 account_required (a visitor session): the same sign-in line, not an error', async () => {
    vi.stubGlobal('fetch', answer(403, { error: 'account_required' }))
    render(<SavedDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/đăng nhập/i)).toBeTruthy())
    expect(document.body.textContent).not.toMatch(/không tải được|thử lại|lỗi/i)
  })

  it('an account with saved places sees them', async () => {
    vi.stubGlobal('fetch', answer(200, { favorites: [{ id: '1', place_id: 'p1', place_name: 'Quán Một', place_address: '1 Phố', place_type: 'saved' }] }))
    render(<SavedDrawer onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Quán Một')).toBeTruthy())
  })
})
