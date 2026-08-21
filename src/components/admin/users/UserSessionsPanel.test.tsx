// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserSessionsPanel } from './UserSessionsPanel'
import { en as enStrings } from '@/lib/i18n/admin'

// Controller V2 — Component 11 Session Security: the Controller surface.
//
// C11 has been ACCEPTED and IN PRODUCTION since 2026-08-15 (migration
// `20260814_c11_session_security.sql`, ADR-021) with three working APIs and two
// registry permissions — and no surface at all. An operator could ban someone
// and had no way to see, let alone end, the session that ban does not touch.
//
// CONTRACT — 11_COMPONENT11_SESSION_SECURITY_CONTRACT.md §7:
//   • who may list      an admin holding `security.sessions.read`
//   • whose sessions    ONE SUBJECT AT A TIME, addressed by user_id. There is
//                       deliberately no platform-wide listing: §7 calls it "a
//                       compromise-amplifying surface and nothing requires it".
//                       That is why this is a panel inside the user detail and
//                       not a /admin/security/sessions page.
//   • ordering          most recently active first (the SQL function does it)
//   • pagination        limit <= 50, default 20
//   • NEVER EXPOSED     tokens, cookie values, IP ADDRESS, RAW USER-AGENT,
//                       credentials, secrets. Only a coarse platform class.
//   • end-user self-service — not in v1. Admin surface only.
//
// The API is the enforcement; every `can` flag here is UX. That is the same
// split `/admin/users` already uses, and the reason no test below treats a
// hidden button as a security control.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }))
afterEach(cleanup)

const T = enStrings // useTranslation resolves to the default locale under test

const SESSION = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user_id: 'uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu',
  state: 'active' as const,
  created_at: '2026-08-19T02:00:00Z',
  last_refreshed_at: '2026-08-20T02:00:00Z',
  expires_at: '2026-08-27T02:00:00Z',
  aal: 'aal1',
  client_class: 'web' as const,
}

const USER_ID = SESSION.user_id
const ALL = { read: true, revoke: true }
const READ_ONLY = { read: true, revoke: false }

/** A fetch stub that answers each URL from a table, and records what was called. */
function stubFetch(handlers: Record<string, () => { status?: number; body: unknown }>) {
  const calls: { url: string; method: string; body: unknown }[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const key = Object.keys(handlers).find((k) => url.startsWith(k))
    if (!key) throw new Error(`unstubbed fetch: ${url}`)
    const { status = 200, body } = handlers[key]()
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const listOk = (rows: unknown[]) => ({ body: { data: rows } })

beforeEach(() => vi.unstubAllGlobals())

// ===========================================================================
// §7 — who may list
// ===========================================================================
describe('§7 — the panel exists only for an actor who may list sessions', () => {
  it('renders NOTHING without security.sessions.read — and issues no request', async () => {
    const calls = stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    const { container } = render(
      <UserSessionsPanel userId={USER_ID} can={{ read: false, revoke: false }} />
    )
    // Plain vitest here — jest-dom's matchers are not registered in this
    // config, and `toBeEmptyDOMElement` would throw rather than assert.
    expect(container.innerHTML).toBe('')
    // Not merely hidden: an actor who may not list must not cause a listing.
    expect(calls).toHaveLength(0)
  })

  it('lists one subject at a time, addressed by user_id', async () => {
    const calls = stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    expect(calls[0].url).toContain(`userId=${USER_ID}`)
  })

  it('🔑 never requests a platform-wide listing', async () => {
    // §7 refuses an "all sessions" view by design. A request without userId is
    // that view, whatever the UI calls it.
    const calls = stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    for (const c of calls) expect(c.url).toMatch(/userId=/)
  })
})

// ===========================================================================
// §7 — NEVER EXPOSED. The list is explicit, so the test is too.
// ===========================================================================
describe('🔑 §7 — the forbidden fields never reach the DOM', () => {
  it('renders no IP, user-agent, token or cookie even when the response carries them', async () => {
    // Defence in depth. `fn_session_inventory` projects eight columns and no
    // more, so this can only happen if that contract is broken upstream — which
    // is exactly when a component that renders whatever it receives becomes the
    // thing that leaks it.
    stubFetch({
      '/api/admin/security/sessions': () =>
        listOk([
          {
            ...SESSION,
            ip_address: '203.0.113.42',
            user_agent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140',
            refresh_token: 'rt_secret_value',
            cookie: 'sb-access-token=eyJhbGciOi',
          },
        ]),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await screen.findByText(T['admin.sessions.state.active'])

    const html = document.body.innerHTML
    for (const forbidden of ['203.0.113.42', 'Mozilla/5.0', 'rt_secret_value', 'eyJhbGciOi', 'Chrome/140']) {
      expect(html, `leaked: ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('shows only the coarse client class §7 permits', async () => {
    stubFetch({ '/api/admin/security/sessions': () => listOk([{ ...SESSION, client_class: 'native' }]) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.sessions.client.native'])).toBeDefined()
  })
})

// ===========================================================================
// States — the M01/M04 rule, applied to a list
// ===========================================================================
describe('a failed read is not an empty one', () => {
  it('an empty inventory says so', async () => {
    stubFetch({ '/api/admin/security/sessions': () => listOk([]) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.sessions.empty'])).toBeDefined()
  })

  it('🔑 a 500 renders the ERROR state, never "no sessions"', async () => {
    // "This account has no active sessions" is a statement an operator acts on.
    // Rendering it because the read failed tells them the opposite of the truth.
    stubFetch({
      '/api/admin/security/sessions': () => ({ status: 500, body: { error: { message: 'Operation failed' } } }),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.sessions.error'])).toBeDefined()
    expect(screen.queryByText(T['admin.sessions.empty'])).toBeNull()
  })

  it('a 403 renders the error state rather than crashing', async () => {
    stubFetch({
      '/api/admin/security/sessions': () => ({ status: 403, body: { error: { message: 'Forbidden' } } }),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.sessions.error'])).toBeDefined()
  })

  it('🔑 a NETWORK failure is the error state too — mutation C06 lived here', async () => {
    // Every other case in this block stubs a non-2xx RESPONSE. A rejected
    // promise takes a different branch, and without this case deleting the
    // `catch`'s error state and reporting "no sessions" survived untouched.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.sessions.error'])).toBeDefined()
    expect(screen.queryByText(T['admin.sessions.empty'])).toBeNull()
  })

  it('an expired session is labelled expired, not silently dropped', async () => {
    stubFetch({ '/api/admin/security/sessions': () => listOk([{ ...SESSION, state: 'expired' }]) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    expect(await screen.findByText(T['admin.sessions.state.expired'])).toBeDefined()
  })
})

// ===========================================================================
// Revocation — UX gating, and honest reporting of the result
// ===========================================================================
describe('revoke', () => {
  it('offers no revoke affordance without security.sessions.revoke', async () => {
    stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    render(<UserSessionsPanel userId={USER_ID} can={READ_ONLY} />)
    await screen.findByText(T['admin.sessions.state.active'])
    expect(screen.queryByRole('button', { name: T['admin.sessions.revoke'] })).toBeNull()
    expect(screen.queryByRole('button', { name: T['admin.sessions.forceLogout'] })).toBeNull()
  })

  it('revoking one session calls DELETE on that session id', async () => {
    const calls = stubFetch({
      '/api/admin/security/sessions/': () => ({ body: { data: { revoked: 1, reason: 'ok' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await userEvent.click(await screen.findByRole('button', { name: T['admin.sessions.revoke'] }))

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    const del = calls.find((c) => c.method === 'DELETE')!
    expect(del.url).toContain(SESSION.id)
  })

  it('🔑 owner_protected is reported as REFUSED, not as "0 revoked"', async () => {
    // `fn_session_revoke` returns {revoked: 0, reason: 'owner_protected'} when
    // the subject is the Platform Owner (§5.1: an administrator may not log the
    // Owner out). "0 sessions revoked" reads as "there was nothing to do" and
    // hides a refusal the operator needs to see.
    stubFetch({
      '/api/admin/security/sessions/': () => ({ body: { data: { revoked: 0, reason: 'owner_protected' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await userEvent.click(await screen.findByRole('button', { name: T['admin.sessions.revoke'] }))
    expect(await screen.findByText(T['admin.sessions.ownerProtected'])).toBeDefined()
  })

  it('a session that was already gone says so rather than claiming success', async () => {
    stubFetch({
      '/api/admin/security/sessions/': () => ({ body: { data: { revoked: 0, reason: 'not_found' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await userEvent.click(await screen.findByRole('button', { name: T['admin.sessions.revoke'] }))
    expect(await screen.findByText(T['admin.sessions.notFound'])).toBeDefined()
  })

  it('🔑 the STATUS decides, not the body — a 403 carrying a success shape is still a failure', async () => {
    // Mutation C11 deleted the `res.ok` check and survived, because every other
    // failing case here also happened to produce an unusable body, so the
    // outer catch reached the same message by accident. A failure status with a
    // well-formed success body separates the check from the accident — and
    // encodes the rule that matters: never believe the payload over the status.
    stubFetch({
      '/api/admin/security/sessions/': () =>
        ({ status: 403, body: { data: { revoked: 5, reason: 'ok' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await userEvent.click(await screen.findByRole('button', { name: T['admin.sessions.revoke'] }))
    expect(await screen.findByText(T['admin.sessions.revokeError'])).toBeDefined()
    expect(screen.queryByText(/5/)).toBeNull()
  })

  it('a revoke re-reads the inventory, so the list cannot show a dead session', async () => {
    let listed = 0
    const calls = stubFetch({
      '/api/admin/security/sessions/': () => ({ body: { data: { revoked: 1, reason: 'ok' } } }),
      '/api/admin/security/sessions': () => { listed++; return listOk(listed === 1 ? [SESSION] : []) },
    })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await userEvent.click(await screen.findByRole('button', { name: T['admin.sessions.revoke'] }))
    await waitFor(() => expect(listed).toBeGreaterThan(1))
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1)
  })
})

// ===========================================================================
// Force logout — the reason is required by the API schema, so the UI must
// not let an operator discover that with a 422.
// ===========================================================================
describe('force logout all', () => {
  async function openForceLogout() {
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await userEvent.click(await screen.findByRole('button', { name: T['admin.sessions.forceLogout'] }))
  }

  it('🔑 cannot be submitted without a reason', async () => {
    // `ForceLogoutSchema` requires min 3 characters, and the contract's own
    // words are that a forced logout with no recorded reason "is
    // indistinguishable from an attack when the audit trail is read later".
    const calls = stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    await openForceLogout()
    const confirm = screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] })
    expect(confirm.hasAttribute('disabled')).toBe(true)
    await userEvent.click(confirm)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('a whitespace-only reason is still no reason', async () => {
    stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    await openForceLogout()
    await userEvent.type(screen.getByRole('textbox', { name: T['admin.sessions.reasonLabel'] }), '   ')
    expect(
      screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('sends userId and the reason to the force-logout endpoint', async () => {
    const calls = stubFetch({
      '/api/admin/security/sessions/force-logout': () => ({ body: { data: { revoked: 3, reason: 'ok' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    await openForceLogout()
    await userEvent.type(
      screen.getByRole('textbox', { name: T['admin.sessions.reasonLabel'] }),
      'compromised device'
    )
    await userEvent.click(screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] }))

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toContain('/force-logout')
    expect(post.body).toEqual({ userId: USER_ID, reason: 'compromised device' })
  })

  it('🔑 sends the TRIMMED reason — padding is not content', async () => {
    // Mutation C20 lived here: every other case typed a reason with no
    // surrounding whitespace, so trimming was never actually exercised. An
    // untrimmed reason reaches the audit log with the padding baked in.
    const calls = stubFetch({
      '/api/admin/security/sessions/force-logout': () => ({ body: { data: { revoked: 1, reason: 'ok' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    await openForceLogout()
    await userEvent.type(
      screen.getByRole('textbox', { name: T['admin.sessions.reasonLabel'] }),
      '   stolen laptop   '
    )
    await userEvent.click(screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      userId: USER_ID,
      reason: 'stolen laptop',
    })
  })

  it('reports how many sessions actually ended', async () => {
    stubFetch({
      '/api/admin/security/sessions/force-logout': () => ({ body: { data: { revoked: 3, reason: 'ok' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    await openForceLogout()
    await userEvent.type(screen.getByRole('textbox', { name: T['admin.sessions.reasonLabel'] }), 'stolen laptop')
    await userEvent.click(screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] }))
    expect(await screen.findByText(/3/)).toBeDefined()
  })

  it('🔑 the Owner refusal survives force-logout too', async () => {
    stubFetch({
      '/api/admin/security/sessions/force-logout': () =>
        ({ body: { data: { revoked: 0, reason: 'owner_protected' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    await openForceLogout()
    await userEvent.type(screen.getByRole('textbox', { name: T['admin.sessions.reasonLabel'] }), 'testing refusal')
    await userEvent.click(screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] }))
    expect(await screen.findByText(T['admin.sessions.ownerProtected'])).toBeDefined()
  })

  it('a 403 from the API is surfaced, not swallowed into success', async () => {
    stubFetch({
      '/api/admin/security/sessions/force-logout': () =>
        ({ status: 403, body: { error: { message: 'Forbidden' } } }),
      '/api/admin/security/sessions': () => listOk([SESSION]),
    })
    await openForceLogout()
    await userEvent.type(screen.getByRole('textbox', { name: T['admin.sessions.reasonLabel'] }), 'denied case')
    await userEvent.click(screen.getByRole('button', { name: T['admin.sessions.forceLogoutConfirm'] }))
    expect(await screen.findByText(T['admin.sessions.revokeError'])).toBeDefined()
  })
})

// ===========================================================================
// No second authorization path
// ===========================================================================
describe('the component decides nothing about authorization', () => {
  /**
   * The component's CODE, with comments removed.
   *
   * Both assertions below are about what the component *does*. Run against the
   * raw file they also match the header comment — which names
   * `permissionEngine.can` precisely to say the decision happens elsewhere, and
   * would have failed the test for documenting the rule it obeys.
   */
  async function code(): Promise<string> {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    return readFileSync(join(__dirname, 'UserSessionsPanel.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
  }

  it('🔑 contains no role name and no role comparison', async () => {
    // The PDP is the only decision path. A component that reads `role` has
    // become a second one, and the two will disagree eventually.
    const src = await code()
    for (const role of ['super_admin', 'moderator', 'analyst', "'admin'", 'isOwner', 'highestRole']) {
      expect(src, `references ${role}`).not.toContain(role)
    }
  })

  it('takes its capabilities as props — it never computes them', async () => {
    const src = await code()
    expect(src).not.toContain('permissionEngine')
    expect(src).not.toContain('PERMISSIONS.')
  })

  it('🔑 the comment stripper actually strips — otherwise both tests above are vacuous', async () => {
    // If the regexes silently failed, `code()` would return the whole file and
    // the two assertions would be testing the comments they are meant to ignore.
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const raw = readFileSync(join(__dirname, 'UserSessionsPanel.tsx'), 'utf8')
    expect(raw).toContain('permissionEngine') // the header comment names it
    expect((await code()).length).toBeLessThan(raw.length)
  })
})

// ===========================================================================
// Pagination bound — §7 says limit <= 50
// ===========================================================================
describe('§7 pagination', () => {
  it('never asks for more than the contract cap of 50', async () => {
    const calls = stubFetch({ '/api/admin/security/sessions': () => listOk([SESSION]) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    const limit = new URL(calls[0].url, 'https://x').searchParams.get('limit')
    expect(limit === null || Number(limit) <= 50).toBe(true)
  })

  it('renders every returned session, one row each', async () => {
    const rows = [SESSION, { ...SESSION, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }]
    stubFetch({ '/api/admin/security/sessions': () => listOk(rows) })
    render(<UserSessionsPanel userId={USER_ID} can={ALL} />)
    const list = await screen.findByRole('list', { name: T['admin.sessions.title'] })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })
})
