// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' as string | null,
  user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
  details: vi.fn(), approve: vi.fn(), deny: vi.fn(), assign: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(h.id ? `authorization_id=${h.id}` : '') }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: h.user } }), oauth: { getAuthorizationDetails: h.details, approveAuthorization: h.approve, denyAuthorization: h.deny } } }),
}))
vi.mock('@/lib/i18n/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'vi', setLocale: () => {} }) }))
vi.mock('@/components/TappyMascot', () => ({ TappyMascot: () => null }))

import ConsentView from './ConsentView'

const ASK = { data: { authorization_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', client: { name: 'Claude' }, scope: 'places:read itinerary:create', user: { email: 'me@example.test' } }, error: null }

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  h.id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; h.user = { id: 'u1', is_anonymous: false }
  Object.defineProperty(window, 'location', { value: { assign: h.assign, href: 'http://localhost/oauth/consent' }, writable: true })
  h.details.mockResolvedValue(ASK)
})

describe('/oauth/consent', () => {
  it('shows who asks and what they may do, and grants nothing by loading', async () => {
    render(<ConsentView />)
    await screen.findByTestId('oauth-allow')
    expect(screen.getByText(/Claude muốn dùng Tappy/)).toBeTruthy()
    expect(screen.getByTestId('oauth-scopes').textContent).toMatch(/Tìm quán ăn/)
    expect(screen.getByTestId('oauth-scopes').textContent).toMatch(/không đặt chỗ, không thanh toán/)
    expect(h.approve).not.toHaveBeenCalled(); expect(h.deny).not.toHaveBeenCalled()
  })
  it('Allow approves that exact request and goes to the address the server returned', async () => {
    h.approve.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s' }, error: null })
    render(<ConsentView />)
    fireEvent.click(await screen.findByTestId('oauth-allow'))
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=abc&state=s'))
    expect(h.approve).toHaveBeenCalledWith('a1b2c3d4-e5f6-7890-abcd-ef1234567890', { skipBrowserRedirect: true })
  })
  it('Deny denies and goes back; an unsafe address from the server is never followed', async () => {
    h.deny.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?error=access_denied' }, error: null })
    render(<ConsentView />)
    fireEvent.click(await screen.findByTestId('oauth-deny'))
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied'))
    expect(h.approve).not.toHaveBeenCalled()
  })
  it('an unsafe redirect from the server shows an error and navigates nowhere', async () => {
    h.approve.mockResolvedValue({ data: { redirect_url: 'javascript:alert(1)' }, error: null })
    render(<ConsentView />)
    fireEvent.click(await screen.findByTestId('oauth-allow'))
    await screen.findByRole('alert')
    expect(h.assign).not.toHaveBeenCalled()
  })
  it('a missing or malformed authorization_id is invalid and asks the server nothing', async () => {
    h.id = null
    render(<ConsentView />)
    await screen.findByRole('alert')
    expect(h.details).not.toHaveBeenCalled()
  })
  it('a signed-out visitor or a guest is sent to sign in and returns to this same request', async () => {
    h.user = null
    render(<ConsentView />)
    await waitFor(() => expect(h.assign).toHaveBeenCalled())
    expect(String(h.assign.mock.calls[0][0])).toMatch(/^\/login\?returnTo=.*oauth%2Fconsent/)
    expect(h.details).not.toHaveBeenCalled()
    h.assign.mockClear(); h.user = { id: 'g', is_anonymous: true }
    render(<ConsentView />)
    await waitFor(() => expect(h.assign).toHaveBeenCalled())
    expect(h.details).not.toHaveBeenCalled()
  })
  it('already consented: goes straight back without asking again', async () => {
    h.details.mockResolvedValue({ data: { redirect_url: 'https://claude.ai/cb?code=z' }, error: null })
    render(<ConsentView />)
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith('https://claude.ai/cb?code=z'))
  })
  it('asks the server ONCE per request even when React runs the effect twice (StrictMode), because the real server answers 400 to a second call; the first answer is kept and followed', async () => {
    const { StrictMode } = await import('react')
    h.details.mockReset()
    h.details.mockResolvedValueOnce({ data: { redirect_url: 'https://claude.ai/cb?code=z' }, error: null }).mockResolvedValue({ data: null, error: { message: 'cannot be processed' } })
    render(<StrictMode><ConsentView /></StrictMode>)
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith('https://claude.ai/cb?code=z'))
    expect(h.details).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('an error from the server is shown as invalid', async () => {
    h.details.mockResolvedValue({ data: null, error: { message: 'x' } })
    render(<ConsentView />)
    await screen.findByRole('alert')
  })
})
