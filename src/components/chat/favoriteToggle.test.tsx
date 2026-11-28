// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { FavoriteToggle } from '@/components/ChatInterface'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const props = { placeId: 'p1', placeName: 'Quán Một', placeAddress: '1 Phố', placeType: 'restaurant' }
const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const stubLocation = () => { const assign = vi.fn(); vi.stubGlobal('location', { pathname: '/chat/x', search: '', assign }); return assign }
const label = () => screen.getByRole('button').getAttribute('aria-label')

// The save heart used to flip to "saved" before the server answered and never looked at the answer: with a visitor session now refused (403), it would show a place as saved that was not.
describe('FavoriteToggle (the save heart in the chat)', () => {
  it('a refused save (visitor session) is not shown as saved, and the visitor is taken to sign in', async () => {
    const assign = stubLocation()
    const f = answer(403, { error: 'account_required' })
    vi.stubGlobal('fetch', f)
    render(<FavoriteToggle {...props} />)
    const before = label()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fchat%2Fx'))
    await waitFor(() => expect(label()).toBe(before))
  })

  it('any other failed save puts the heart back too', async () => {
    stubLocation()
    const f = answer(500, { error: 'boom' })
    vi.stubGlobal('fetch', f)
    render(<FavoriteToggle {...props} />)
    const before = label()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(f).toHaveBeenCalled())
    await waitFor(() => expect(label()).toBe(before))
  })

  it('a save the server accepted stays shown as saved', async () => {
    stubLocation()
    vi.stubGlobal('fetch', answer(200, { ok: true }))
    render(<FavoriteToggle {...props} />)
    const before = label()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(label()).not.toBe(before))
  })
})
