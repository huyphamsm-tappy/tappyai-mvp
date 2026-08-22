import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controller V2 — Public Home, the SERVER decision.
//
// The page itself is a marketing surface and needs no authentication. The one
// thing the server decides is who is NOT allowed to stay: an authenticated
// visitor is sent into the Controller flow rather than being shown a sign-in
// pitch they have already answered.
//
// These tests read that decision directly. They do NOT render — rendering is
// `publicHome.test.tsx`'s job — because what is under test here is a redirect,
// and a redirect has no markup.
//
// 🔑 NO NEW AUTHENTICATION MECHANISM. The page reads the SAME session the rest
// of the app reads (`@/lib/supabase/server` → `auth.getUser()`), and hands off
// to `/admin`, whose own `requirePagePermission` guard is the only thing that
// decides whether that visitor may actually see the Control Center. This page
// makes no authorization decision, so `singleDecisionPath` is untouched.

const getUser = vi.fn()
const redirect = vi.fn((path: string) => {
  // Next's real `redirect()` throws to unwind the render. Model that, otherwise
  // a page that redirects and then keeps going would look like it stopped.
  throw Object.assign(new Error(`NEXT_REDIRECT:${path}`), { digest: `NEXT_REDIRECT;${path}` })
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser } }),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}))

// The view is irrelevant to the redirect decision; stub it so this suite fails
// only when the SERVER's behaviour changes.
vi.mock('@/components/controller/ControllerPublicHome', () => ({
  ControllerPublicHome: () => null,
}))

async function loadPage() {
  const mod = await import('./page')
  return mod.default
}

describe('Controller Public Home — who is allowed to stay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('an anonymous visitor sees the page — no authentication required', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const Page = await loadPage()

    const element = await Page()

    expect(redirect).not.toHaveBeenCalled()
    expect(element).toBeTruthy()
  })

  it('an authenticated visitor is redirected into the Controller flow', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@tappyai.com' } } })
    const Page = await loadPage()

    await expect(Page()).rejects.toThrow(/NEXT_REDIRECT/)

    expect(redirect).toHaveBeenCalledTimes(1)
  })

  it('the redirect target is the Controller home, not the login page', async () => {
    // Sending an already-authenticated visitor to /login would be the loop:
    // /login sees a session and bounces them straight back here.
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const Page = await loadPage()

    await expect(Page()).rejects.toThrow()

    expect(redirect).toHaveBeenCalledWith('/admin')
  })

  it('reads the session through the app-wide client — no second auth mechanism', async () => {
    // If this page ever grows its own token parsing, OTP, or SSO handshake, the
    // shared client stops being consulted and this fails.
    getUser.mockResolvedValue({ data: { user: null } })
    const Page = await loadPage()

    await Page()

    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('survives an auth backend that cannot be reached at all', async () => {
    // The page needs no session to do its job — it renders the same markup
    // either way. If `createClient()` throws (missing env, unreachable auth),
    // the CONSUMER-facing front door of the Controller should still open;
    // 500-ing a public marketing page because the auth service is unhappy
    // breaks it for the exact visitor it exists to serve.
    //
    // Caught in dev, where the worktree had no `.env.local`: `/controller`
    // returned 500 while its own comment claimed it failed open.
    getUser.mockRejectedValue(new Error('supabase unreachable'))
    const Page = await loadPage()

    const element = await Page()

    expect(redirect).not.toHaveBeenCalled()
    expect(element).toBeTruthy()
  })

  it('a session lookup that returns no data block is treated as anonymous', async () => {
    // Fail OPEN here on purpose: this is a public page. Failing closed would
    // redirect an anonymous visitor into /admin, which bounces them to /login —
    // a broken front door for the exact person the page exists to serve.
    getUser.mockResolvedValue({ data: {} })
    const Page = await loadPage()

    const element = await Page()

    expect(redirect).not.toHaveBeenCalled()
    expect(element).toBeTruthy()
  })
})
