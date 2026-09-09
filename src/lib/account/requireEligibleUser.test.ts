import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const state: {
  user: { id: string; is_anonymous?: boolean } | null
  ageRow: { has_dob: boolean; age_years: number | null; age_band: string | null; corrections_used: number } | null
  rpcError: { message: string } | null
} = { user: null, ageRow: null, rpcError: null }

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: vi.fn(async () => ({
    user: state.user,
    supabase: {
      rpc: vi.fn(async () =>
        state.rpcError ? { data: null, error: state.rpcError } : { data: state.ageRow ? [state.ageRow] : [], error: null }
      ),
    },
  })),
}))

import { requireEligibleUser, refuseIneligible, productAccessResponse } from './requireEligibleUser'

const req = () => new Request('https://tappyai.test/api/chat', { method: 'POST' })

const adult = { has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0 }
const minor = { has_dob: true, age_years: 15, age_band: 'under_18', corrections_used: 0 }

beforeEach(() => {
  state.user = { id: 'u1', is_anonymous: false }
  state.ageRow = adult
  state.rpcError = null
})

afterEach(() => vi.restoreAllMocks())

describe('order: authentication → account-ness → eligibility', () => {
  it('lets an eligible signed-in user through', async () => {
    const r = await requireEligibleUser(req())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.eligibility.status).toBe('eligible')
  })

  it('refuses an unauthenticated caller with 401 auth_required', async () => {
    state.user = null
    const r = await requireEligibleUser(req())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(401)
      expect(r.body.error).toBe('auth_required')
    }
  })

  it('refuses an ANONYMOUS session with auth_required, not an age error', async () => {
    // A Supabase anonymous identity is a real auth.uid() on the `authenticated`
    // role, so "there is a user object" is not the same question as "this is an
    // account". No age data is collected for anonymous sessions, so telling them
    // their age is the problem would be false — they are one sign-in away from
    // being asked the real question.
    state.user = { id: 'anon-1', is_anonymous: true }
    const r = await requireEligibleUser(req())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.denial).toBe('auth_required')
      expect(r.status).toBe(401)
      expect(r.body.error).not.toContain('age')
    }
  })

  it('never reads eligibility for an unauthenticated caller', async () => {
    // Both because the read would be meaningless and because it would be a
    // database round trip on every unauthenticated request.
    const mod = await import('@/lib/auth/getRequestUser')
    state.user = null
    await requireEligibleUser(req())
    const call = (mod.getRequestUser as unknown as { mock: { results: Array<{ value: Promise<{ supabase: { rpc: { mock: { calls: unknown[] } } } }> }> } }).mock
    const resolved = await call.results[call.results.length - 1].value
    expect(resolved.supabase.rpc.mock.calls).toHaveLength(0)
  })
})

describe('the two age refusals are distinct, so clients route differently', () => {
  it('unknown age → 403 age_verification_required', async () => {
    state.ageRow = null
    const r = await requireEligibleUser(req())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.denial).toBe('age_verification_required')
      expect(r.body.error).toBe('age_verification_required')
    }
  })

  it('under age → 403 age_ineligible', async () => {
    state.ageRow = minor
    const r = await requireEligibleUser(req())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(403)
      expect(r.denial).toBe('age_ineligible')
    }
  })

  it('the two carry different codes AND different sentences', async () => {
    state.ageRow = null
    const unknown = await requireEligibleUser(req())
    state.ageRow = minor
    const ineligible = await requireEligibleUser(req())
    if (!unknown.ok && !ineligible.ok) {
      expect(unknown.body.error).not.toBe(ineligible.body.error)
      // A user who has never been asked must not read a sentence written for a
      // user who has been refused.
      expect(unknown.body.message).not.toBe(ineligible.body.message)
    }
  })
})

describe('a failed eligibility read withholds access', () => {
  it('refuses rather than admitting when the rpc errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpcError = { message: 'connection reset' }
    const r = await requireEligibleUser(req())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.denial).toBe('age_verification_required')
  })

  it('does not brand the user ineligible during an outage', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    state.rpcError = { message: 'boom' }
    const r = await requireEligibleUser(req())
    if (!r.ok) expect(r.denial).not.toBe('age_ineligible')
  })
})

describe('refuseIneligible — the one-line guard for routes with their own 401', () => {
  const supabase = (rowValue: unknown, error: unknown = null) =>
    ({ rpc: vi.fn(async () => ({ data: rowValue, error })) }) as never

  it('returns null when the caller may proceed', async () => {
    expect(await refuseIneligible(req(), supabase([adult]))).toBeNull()
  })

  it('returns a 403 Response when the caller may not', async () => {
    const res = await refuseIneligible(req(), supabase([minor]))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    expect((await res!.json()).error).toBe('age_ineligible')
  })

  it('returns a 403 for an unknown age', async () => {
    const res = await refuseIneligible(req(), supabase([]))
    expect(res!.status).toBe(403)
    expect((await res!.json()).error).toBe('age_verification_required')
  })
})

describe('productAccessResponse', () => {
  it('serialises the denial with its status and JSON content type', async () => {
    state.ageRow = minor
    const r = await requireEligibleUser(req())
    if (r.ok) throw new Error('expected a denial')
    const res = productAccessResponse(r)
    expect(res.status).toBe(403)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual(r.body)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Source-level assertions: the gate is actually WIRED into the product routes.
//
// A unit test of the guard proves the guard works. It does not prove any route
// calls it — and a gate nothing calls is the exact failure this task exists to
// prevent ("do not rely on hiding UI"). These read the route source, the same
// technique `preModelParallel.test.ts` already uses in this codebase.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = (p: string) => readFileSync(join(process.cwd(), 'src/app/api', p), 'utf8')

describe('the product surfaces are actually gated', () => {
  it('chat refuses anonymous sessions and checks eligibility before any LLM work', () => {
    const code = SRC('chat/route.ts')
    expect(code).toContain('getAgeEligibility')
    expect(code).toMatch(/if\s*\(!user\s*\|\|\s*user\.is_anonymous\)/)

    // The gate must precede the model call, so a refused turn costs no LLM
    // tokens and no third-party calls — the same discipline the Module 08
    // suspension gate follows.
    //
    // Matched on the ASSIGNMENT rather than the bare name: `AI.stream()` is
    // mentioned in several comments hundreds of lines above the real call, and
    // a looser pattern would compare the gate against a comment and pass or
    // fail for the wrong reason.
    const gate = code.indexOf('getAgeEligibility(supabase)')
    const stream = code.search(/result\s*=\s*AI\.stream\(/)
    expect(gate).toBeGreaterThan(-1)
    expect(stream).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(stream)

    // …and before the suspension gate's own reads, which are the first DB work
    // the authenticated path does.
    expect(gate).toBeLessThan(code.indexOf('getAccountRestriction(supabase'))
  })

  it('explore, recommendations and review posting are gated', () => {
    expect(SRC('explore/process/route.ts')).toContain('refuseIneligible')
    expect(SRC('reviews/route.ts')).toContain('refuseIneligible')
    expect(SRC('recommendations/route.ts')).toContain('getAgeEligibility')
  })

  it('the profile route is deliberately NOT gated — it is the remediation path', () => {
    // A user whose eligibility is unknown reaches it to supply a date of birth,
    // and an ineligible user reaches it to spend their single self-correction.
    // Gating it would make both states unrecoverable.
    const code = SRC('profile/route.ts')
    expect(code).not.toContain('refuseIneligible')
    expect(code).not.toContain('requireEligibleUser')
    // …but it still requires authentication.
    expect(code).toContain("error: 'unauthorized'")
  })

  it('the CLIENTS route an age refusal somewhere actionable', () => {
    // ── The path the existing user base actually takes ──────────────────────
    //
    // The auth-callback redirect and the Android login gate both fire on a
    // LOGIN TRANSITION. Every account already signed in when this ships skips
    // both, so their first contact with the gate is a 403 from a product
    // endpoint. If the clients do not recognise that code, the entire existing
    // user base gets a generic "something went wrong, try again" and can retry
    // forever — retrying is not what fixes it.
    // Both halves are delegated to the ONE shared handler rather than spelled
    // out here — `ageGateClient.test.ts` owns the detail, including that no
    // surface kept a hand-rolled copy. This asserts only that chat participates.
    const chat = readFileSync(join(process.cwd(), 'src/components/ChatInterface.tsx'), 'utf8')
    expect(chat).toContain("from '@/lib/account/ageGateClient'")
    expect(chat).toContain('isAgeGateMessage(error.message)')
    expect(chat).toContain('redirectToAgeCheck()')

    // Android reaches the same conclusion from the other side: it runs the
    // eligibility check on COLD START, not only on the login transition.
    const nav = readFileSync(
      join(process.cwd(), 'android/app/src/main/java/com/tappyai/app/navigation/AppNavHost.kt'),
      'utf8'
    )
    const coldStart = nav.indexOf('hasHandledInitialState = true')
    const loginGate = nav.indexOf('viewModel.needsOnboarding()')
    expect(coldStart).toBeGreaterThan(-1)
    // An ageStatus() call exists inside the cold-start block, before the
    // login-transition gate further down.
    const inColdStart = nav.slice(coldStart, loginGate)
    expect(inColdStart).toContain('viewModel.ageStatus()')
    expect(inColdStart).toContain('AppRoute.AgeCheck')
  })

  it('the profile route never selects the raw date of birth', () => {
    const code = SRC('profile/route.ts')
    expect(code).not.toMatch(/select\([^)]*date_of_birth/)
    expect(code).not.toMatch(/date_of_birth:/)
  })
})
