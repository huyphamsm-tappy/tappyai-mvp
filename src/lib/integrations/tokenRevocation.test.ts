import { describe, it, expect, vi } from 'vitest'
import { revokeGoogleToken } from './googleCalendar'

// ─────────────────────────────────────────────────────────────────────────────
// C-1 — "disconnect" must revoke the grant, not just forget our copy of it.
//
// Deleting the `user_integrations` row removes the credential from the LIVE
// database. It does nothing to Google's grant, and a Google refresh token stays
// valid until revoked or six months unused.
//
// 🚨 THE PART THAT MATTERS IS THE BACKUP. A database copy taken before the
// disconnect — a nightly dump, a replica, a leak that already happened — still
// contains a WORKING credential to the user's calendar. Our DELETE cannot reach
// into a copy we do not control. Revoking at Google invalidates the token
// everywhere at once, which is the only lever we have over data that has already
// left. It is the difference between "a leaked backup contains an old secret"
// and "a leaked backup contains a live key to someone's Google account".
//
// The tests below pin three properties: it is ATTEMPTED, it FAILS SAFE, and the
// token never appears anywhere it could be read back.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN = '1//0gRefreshTokenThatWouldStillWork'

describe('C-1 · revokeGoogleToken', () => {
  it('POSTs the token to Google’s revocation endpoint', async () => {
    const calls: Array<{ url: string; body: string }> = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') })
      return new Response('', { status: 200 })
    }) as unknown as typeof fetch

    expect(await revokeGoogleToken(TOKEN, fake)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/revoke')
    expect(calls[0].body).toContain(encodeURIComponent(TOKEN))
  })

  it('treats 400 as revoked — an unknown token is already in the end state we want', async () => {
    const fake = (async () => new Response('', { status: 400 })) as unknown as typeof fetch
    expect(await revokeGoogleToken(TOKEN, fake)).toBe(true)
  })

  it('does not throw when Google is unreachable — the user can still disconnect', async () => {
    const fake = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    await expect(revokeGoogleToken(TOKEN, fake)).resolves.toBe(false)
  })

  it('reports failure rather than pretending, so a caller can log the truth', async () => {
    const fake = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect(await revokeGoogleToken(TOKEN, fake)).toBe(false)
  })

  it.each([[null], [undefined], ['']])('does not call out for a missing token (%s)', async (value) => {
    const fake = vi.fn()
    expect(await revokeGoogleToken(value as string | null, fake as unknown as typeof fetch)).toBe(false)
    expect(fake).not.toHaveBeenCalled()
  })

  it('🚨 never puts the token in the URL, where it would land in access logs', async () => {
    // Google accepts `?token=` too. It must not be used: a query string is
    // written to every proxy and access log on the path, which would turn a
    // revocation into a disclosure.
    let seen = ''
    const fake = (async (url: string | URL | Request) => {
      seen = String(url)
      return new Response('', { status: 200 })
    }) as unknown as typeof fetch

    await revokeGoogleToken(TOKEN, fake)
    expect(seen).not.toContain(TOKEN)
    expect(seen).not.toContain('?')
  })

  it('falls back to the access token when no offline grant was ever stored', async () => {
    const bodies: string[] = []
    const fake = (async (_u: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''))
      return new Response('', { status: 200 })
    }) as unknown as typeof fetch

    const stored = { access_token: 'ya29.onlyAccess', refresh_token: null }
    await revokeGoogleToken(stored.refresh_token ?? stored.access_token, fake)
    expect(bodies[0]).toContain(encodeURIComponent('ya29.onlyAccess'))
  })
})
