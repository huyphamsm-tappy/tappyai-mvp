// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UsersManager } from './UsersManager'
import { en as enStrings } from '@/lib/i18n/admin'

// How the session panel is WIRED, as opposed to how it behaves.
//
// `UserSessionsPanel.test.tsx` hands the component its two capabilities
// directly, so it can prove the panel obeys them — and cannot prove the panel
// is given the right ones. Mutations C22 and C23 both survived that suite by
// collapsing `security.sessions.revoke` into `security.sessions.read`: the
// panel behaved perfectly, on the wrong input.
//
// `11_…` §7 grants LISTING to `security.sessions.read`; §5.1 keeps REVOCATION
// on `security.sessions.revoke`. They are two permissions because an operator
// may be trusted to see where somebody is signed in without being trusted to
// sign them out. Collapsing them silently promotes every reader to a revoker.

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/users' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(cleanup)

const T = enStrings

const USER = {
  id: 'uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu',
  full_name: 'Test Person',
  standing: 'active' as const,
  created_at: '2026-08-01T00:00:00Z',
  suspended_until: null,
  is_banned: false,
  ban_reason: null,
  ban_reason_withheld: false,
  email: null,
  email_masked: false,
  language: 'vi',
}

const BASE = {
  detail: true, suspend: true, unsuspend: true, ban: true, unban: true, emailSearch: true,
}

function stubApi() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
    if (url.includes('/api/admin/security/sessions')) {
      return ok({
        data: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          user_id: USER.id, state: 'active', created_at: '2026-08-19T02:00:00Z',
          last_refreshed_at: '2026-08-20T02:00:00Z', expires_at: '2026-08-27T02:00:00Z',
          aal: 'aal1', client_class: 'web',
        }],
      })
    }
    if (url.includes(`/api/admin/users/${USER.id}`)) return ok({ data: USER })
    // The list envelope is `{ data: [...], meta: { page } }` — the same shape
    // `/api/admin/users` actually returns. A stub that invents its own shape
    // tests the stub.
    return ok({ data: [USER], meta: { page: { cursor: null, hasMore: false } } })
  }))
}

beforeEach(() => { vi.unstubAllGlobals(); stubApi() })

/** Open the detail panel for the seeded user, which is what mounts the panel. */
async function openDetail(can: Record<string, boolean>) {
  render(<UsersManager can={can as never} />)
  const row = await screen.findByText(USER.full_name)
  await userEvent.click(row)
}

describe('the two session permissions stay two', () => {
  it('🔑 read WITHOUT revoke shows the list and NO revoke affordance', async () => {
    await openDetail({ ...BASE, sessionsRead: true, sessionsRevoke: false })
    // Scoped to the sessions list on purpose: in English the account standing
    // badge and the session state badge both read "Active", so an unscoped
    // query finds two and fails for a reason that has nothing to do with
    // permissions.
    const list = await screen.findByRole('list', { name: T['admin.sessions.title'] })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: T['admin.sessions.revoke'] })).toBeNull()
    expect(screen.queryByRole('button', { name: T['admin.sessions.forceLogout'] })).toBeNull()
  })

  it('read WITH revoke shows both affordances', async () => {
    await openDetail({ ...BASE, sessionsRead: true, sessionsRevoke: true })
    expect(await screen.findByRole('button', { name: T['admin.sessions.revoke'] })).toBeDefined()
    expect(screen.getByRole('button', { name: T['admin.sessions.forceLogout'] })).toBeDefined()
  })

  it('no read means no panel at all, whatever revoke says', async () => {
    await openDetail({ ...BASE, sessionsRead: false, sessionsRevoke: true })
    await screen.findByText(T['admin.users.detail.title'])
    expect(screen.queryByText(T['admin.sessions.title'])).toBeNull()
  })

  it('the panel appears only once a subject is open — §7 is per-subject', async () => {
    render(<UsersManager can={{ ...BASE, sessionsRead: true, sessionsRevoke: true } as never} />)
    await screen.findByText(USER.full_name)
    // The list alone is not a subject. A panel rendered here would be reading
    // sessions nobody asked about.
    expect(screen.queryByText(T['admin.sessions.title'])).toBeNull()
  })

  it('no session request is made before a subject is opened', async () => {
    render(<UsersManager can={{ ...BASE, sessionsRead: true, sessionsRevoke: true } as never} />)
    await screen.findByText(USER.full_name)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0))
    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/security/sessions'))).toBe(false)
  })
})

describe('the page derives each capability from its own permission', () => {
  // A source assertion, because the page is a server component whose whole job
  // is this derivation. Rendering it would test Next's plumbing; reading it
  // tests the claim.
  const page = readFileSync(
    join(__dirname, '..', '..', '..', 'app', 'admin', 'users', 'page.tsx'),
    'utf8'
  )

  it('🔑 sessionsRead comes from SECURITY_SESSIONS_READ', () => {
    expect(page).toMatch(/sessionsRead:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.SECURITY_SESSIONS_READ\s*\)/)
  })

  it('🔑 sessionsRevoke comes from SECURITY_SESSIONS_REVOKE — not from the read permission', () => {
    expect(page).toMatch(/sessionsRevoke:\s*permissionEngine\.can\(\s*ctx\.actor,\s*PERMISSIONS\.SECURITY_SESSIONS_REVOKE\s*\)/)
  })

  it('the anchors above are real — the file does contain both permission names', () => {
    // Guards the two regexes against silently matching nothing if the page is
    // renamed or restructured.
    expect(page).toContain('SECURITY_SESSIONS_READ')
    expect(page).toContain('SECURITY_SESSIONS_REVOKE')
  })

  it('the page performs no role comparison', () => {
    // Comments stripped first. The page's header explains WHY a moderator must
    // not be shown a Ban button, which is the rule being kept — asserting over
    // the raw file would fail the test for documenting it.
    const code = page
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code.length).toBeLessThan(page.length) // the stripper really strips
    for (const role of ['super_admin', 'moderator', 'analyst', 'highestRole']) {
      expect(code, `references ${role}`).not.toContain(role)
    }
  })
})
