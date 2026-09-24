import { describe, it, expect, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// S-2 — the account-existence oracle must actually be throttled.
//
// `GET /api/users/search?q=<exact email>` answers "does this address have a
// TappyAI account?". That is a deliberate product capability (friend search) and
// it is built carefully: authentication is required, the match is EXACT so a
// partial value cannot enumerate, and the caller is capped at 30 lookups a
// minute.
//
// 🚨 THE CAP IS THE WHOLE CONTROL, and it was keyed on
// `req.headers.get('x-forwarded-for').split(',')[0]` — the leftmost entry, which
// is text the CALLER writes. Rotating it minted a fresh bucket on every request,
// so the cap did not exist and the entire address book could be tested against
// the user base.
//
// P3-F1 had already fixed this class centrally in `clientIp()`; this route was
// the last one still reading the header itself. The test drives the real handler
// with a rotating forged header and a fixed PLATFORM header, which is what a
// Vercel request actually looks like when someone is lying to it.
// ─────────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  // @supabase/supabase-js throws on construction without a global WebSocket on
  // Node 20 (CI). Removing it here reproduces the CI platform in the harness.
  delete (globalThis as { WebSocket?: unknown }).WebSocket
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon'
  return {}
})
void h

// The admin path is stubbed rather than disabled by unsetting the service-role
// env var: naming that variable here would trip `no-adhoc-service-role-client`,
// and admin.test.ts asserts the exact set of files that mention it. Stubbing
// keeps this test's blast radius inside this file — and works whether or not the
// key is present in the environment running the suite.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { listUsers: async () => ({ data: { users: [] } }) } },
  }),
}))

/** A profiles/user_follows query chain that always resolves empty. */
const emptyChain = () => {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'ilike', 'neq', 'limit', 'in', 'eq']) {
    chain[m] = () => chain
  }
  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
  return chain
}

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: { id: 'searcher-1' },
    supabase: { from: () => emptyChain() },
  }),
}))

const { GET } = await import('./route')

/** One search request: a fixed platform IP, a forged hop that changes each time. */
function search(forged: string) {
  return new Request(`https://tappy.ai/api/users/search?q=victim@example.com`, {
    headers: {
      'x-vercel-forwarded-for': '203.0.113.9', // what Vercel sets; the caller cannot author it
      'x-forwarded-for': forged,               // what the caller claims
    },
  }) as unknown as Parameters<typeof GET>[0]
}

describe('S-2 · rotating x-forwarded-for cannot buy more lookups', () => {
  it('🚨 the 31st lookup is refused even though every request forged a new hop', async () => {
    let refused = 0
    let allowed = 0

    for (let i = 0; i < 40; i++) {
      const res = await GET(search(`10.0.0.${i}`))
      if (res.status === 429) refused++
      else allowed++
    }

    // The cap is 30/minute. Without the fix every request looked like a new
    // caller and `refused` was 0.
    expect(allowed).toBe(30)
    expect(refused).toBe(10)
  })

  it('a genuinely different caller still gets their own allowance', async () => {
    // Fail-closed must not mean "one busy user throttles everyone" — the bucket
    // is still per-caller, it is just a caller we derive rather than accept.
    const res = await GET(
      new Request('https://tappy.ai/api/users/search?q=someone@example.com', {
        headers: { 'x-vercel-forwarded-for': '198.51.100.77' },
      }) as unknown as Parameters<typeof GET>[0],
    )
    expect(res.status).not.toBe(429)
  })
})
