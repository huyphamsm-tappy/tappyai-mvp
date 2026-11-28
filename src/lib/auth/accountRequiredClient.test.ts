// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { redirectIfAccountRequired } from './accountRequiredClient'

afterEach(() => { vi.unstubAllGlobals() })

const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const stubLocation = () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { pathname: '/scam-shield', search: '?url=x', assign })
  return assign
}

// Owner 28/11/2026: a visitor who taps something that needs an account is taken to sign in and brought back to the same page.
describe('redirectIfAccountRequired', () => {
  it('401 login_required and 403 account_required send the visitor to /login with the page to come back to', async () => {
    const assign = stubLocation()
    expect(await redirectIfAccountRequired(res(401, { error: 'login_required' }))).toBe(true)
    expect(await redirectIfAccountRequired(res(403, { error: 'account_required' }))).toBe(true)
    expect(await redirectIfAccountRequired(res(401, { error: 'unauthorized' }))).toBe(true) // older routes' wording for "no session"
    expect(assign).toHaveBeenCalledTimes(3)
    expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fscam-shield%3Furl%3Dx')
  })

  it('another 403 (AI consent, suspended account) or any other failure is NOT turned into a sign-in redirect', async () => {
    const assign = stubLocation()
    expect(await redirectIfAccountRequired(res(403, { error: 'ai_consent_required' }))).toBe(false)
    expect(await redirectIfAccountRequired(res(429, { error: 'rate_limit' }))).toBe(false)
    expect(await redirectIfAccountRequired(res(500, 'boom'))).toBe(false)
    expect(await redirectIfAccountRequired(new Response('not json', { status: 403 }))).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('reads a copy: the caller can still read the body when it was not a sign-in case', async () => {
    stubLocation()
    const r = res(403, { error: 'ai_consent_required' })
    await redirectIfAccountRequired(r)
    expect((await r.json()).error).toBe('ai_consent_required')
  })
})
