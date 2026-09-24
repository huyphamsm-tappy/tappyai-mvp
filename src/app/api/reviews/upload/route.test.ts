/**
 * UAT — the 18+ boundary on REVIEW MEDIA UPLOAD, through the REAL route.
 *
 * `publishLifecycle.test.ts` proves what `POST /api/reviews` writes. This proves
 * what `POST /api/reviews/upload` lets into STORAGE, by calling the actual
 * exported handler. Only the edges are faked: auth, the Supabase client and the
 * media provider. `sniffImageType` and `refuseAnonymousSocialWrite` run for real.
 *
 * ── WHY THIS SUITE EXISTS ────────────────────────────────────────────────────
 *
 * Both review composers upload photos FIRST and post the review afterwards:
 *
 *     UI -> /api/reviews/upload -> storage -> POST /api/reviews -> age gate
 *
 * Gating only the post therefore left an ineligible account able to write
 * user-generated media into storage and be refused one call later — media that
 * nothing then references. For an 18+ product the boundary has to sit at the
 * point of the write, so the assertions below are mostly about what does NOT
 * reach `putMedia`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGE_GATE_CODES } from '@/lib/account/ageGateClient'

type AgeRow = { has_dob: boolean; age_years: number; age_band: string; corrections_used: number }

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string; is_anonymous?: boolean } | null,
    ageRow: null as Record<string, unknown> | null,
    rpcError: null as { message: string } | null,
    rpcCalls: [] as string[],
    puts: [] as string[],
  }
  const rpc = (fn: string) => {
    state.rpcCalls.push(fn)
    if (fn !== 'user_age_status') return Promise.resolve({ data: null, error: null })
    if (state.rpcError) return Promise.resolve({ data: null, error: state.rpcError })
    // A `RETURNS TABLE` function arrives as an array of rows through PostgREST.
    return Promise.resolve({ data: state.ageRow ? [state.ageRow] : [], error: null })
  }
  return { state, client: { rpc, from: () => ({}) } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }),
}))

// The storage edge. Every assertion about orphaned objects is an assertion
// about whether this was reached.
vi.mock('@/lib/media', () => ({
  getMediaProvider: () => 'test-provider',
  putMedia: (path: string) => {
    h.state.puts.push(path)
    return Promise.resolve({ url: `https://cdn.example/${path}` })
  },
}))

import { POST } from './route'

// A REAL, DECODABLE 1x1 PNG — not just the magic bytes.
//
// 🚨 R-2 CHANGED WHAT THIS FIXTURE HAS TO BE. The route now strips EXIF before storing, which
// means it DECODES the image; a header followed by nothing is no longer something the route will
// accept, and it should not be — a payload that cannot be decoded is not an image we store. The
// old 12-byte stub passed the sniffer and died in sharp, so the test would have failed for a
// reason that had nothing to do with what it is testing.
const PNG = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC',
  'base64',
))

const ELIGIBLE: AgeRow = { has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0 }
const UNDER_18: AgeRow = { has_dob: true, age_years: 15, age_band: 'under_18', corrections_used: 0 }

async function upload() {
  const fd = new FormData()
  fd.append('file', new File([PNG], 'photo.png', { type: 'image/png' }))
  const req = {
    headers: new Headers(),
    nextUrl: new URL('http://localhost/api/reviews/upload'),
    formData: () => Promise.resolve(fd),
  }
  const res = await POST(req as never)
  return { status: res.status, body: await res.json(), puts: h.state.puts }
}

beforeEach(() => {
  h.state.user = { id: `u-${Math.random().toString(36).slice(2)}`, is_anonymous: false }
  h.state.ageRow = ELIGIBLE
  h.state.rpcError = null
  h.state.rpcCalls = []
  h.state.puts = []
})

describe('the upload route refuses everyone the review route refuses', () => {
  it('under 18 cannot upload, and nothing reaches storage', async () => {
    h.state.ageRow = UNDER_18
    const { status, body, puts } = await upload()
    expect(status).toBe(403)
    expect(body.error).toBe('age_ineligible')
    // The point of the whole change: no object was written.
    expect(puts).toEqual([])
  })

  it('an age-unknown account cannot upload, and nothing reaches storage', async () => {
    // No date of birth on file — every pre-existing account, on the day this ships.
    h.state.ageRow = null
    const { status, body, puts } = await upload()
    expect(status).toBe(403)
    expect(body.error).toBe('age_verification_required')
    expect(puts).toEqual([])
  })

  it('fails CLOSED when the eligibility read fails', async () => {
    // Matches `getAgeEligibility`: a read failure withholds access as `unknown`
    // rather than admitting the caller. It must never fall through to a write.
    h.state.rpcError = { message: 'connection reset' }
    const { status, body, puts } = await upload()
    expect(status).toBe(403)
    expect(body.error).toBe('age_verification_required')
    expect(puts).toEqual([])
  })

  it('an eligible 18+ account CAN upload', async () => {
    const { status, body, puts } = await upload()
    expect(status).toBe(200)
    expect(body.url).toContain('https://cdn.example/reviews/')
    expect(puts).toHaveLength(1)
  })
})

describe('the pre-existing refusals are unchanged', () => {
  it('an unauthenticated caller still gets 401, and is never asked their age', async () => {
    h.state.user = null
    const { status, body, puts } = await upload()
    expect(status).toBe(401)
    expect(body.error).toBe('unauthorized')
    // An unauthenticated caller must not cost a database round trip, and telling
    // them their age is the problem would be false.
    expect(h.state.rpcCalls).not.toContain('user_age_status')
    expect(puts).toEqual([])
  })

  it('an anonymous session still gets the account refusal, not an age one', async () => {
    h.state.user = { id: 'anon-1', is_anonymous: true }
    const { status, body, puts } = await upload()
    expect(status).toBe(403)
    expect(body.error).toBe('account_required')
    expect(h.state.rpcCalls).not.toContain('user_age_status')
    expect(puts).toEqual([])
  })
})

describe('a refused upload costs the user nothing', () => {
  it('does not consume the daily upload quota', async () => {
    // MAX_UPLOADS_PER_DAY is 10 and its counter is per user. If the age gate ran
    // AFTER the counter, these refusals would spend the allowance and the
    // eventual legitimate upload would 429 — so this pins the ORDER, not just
    // the outcome. One user id throughout, because the counter keys on it.
    const uid = 'u-quota-ordering'
    h.state.ageRow = UNDER_18
    for (let i = 0; i < 12; i++) {
      h.state.user = { id: uid, is_anonymous: false }
      const { status } = await upload()
      expect(status).toBe(403)
    }
    expect(h.state.puts).toEqual([])

    // Same user, now eligible: the allowance was never touched.
    h.state.user = { id: uid, is_anonymous: false }
    h.state.ageRow = ELIGIBLE
    const { status, puts } = await upload()
    expect(status).toBe(200)
    expect(puts).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// One implementation of the rule, and one implementation of the response to it.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('no second age gate was introduced', () => {
  const route = () => SRC('src/app/api/reviews/upload/route.ts')

  it('delegates to the shared refusal helper', () => {
    expect(route()).toContain("from '@/lib/account/requireEligibleUser'")
    expect(route()).toContain('refuseIneligible(req, supabase)')
  })

  it('carries no age rule, no age literal and no minimum of its own', () => {
    const code = route()
    // The codes and the threshold live in ONE place; a copy here is the drift
    // this assertion exists to prevent.
    expect(code).not.toContain('MINIMUM_AGE')
    expect(code).not.toContain('age_ineligible')
    expect(code).not.toContain('age_verification_required')
    expect(code).not.toContain('date_of_birth')
    expect(code).not.toContain('user_age_status')
    // It does not even resolve eligibility itself — it asks for a refusal.
    // Matched on the CALL, not the bare name: the route's comment names the
    // helper it delegates to, and comparing against prose would fail for the
    // wrong reason (same care `requireEligibleUser.test.ts` takes).
    expect(code).not.toMatch(/getAgeEligibility\s*\(/)
  })

  it('never receives or exposes a raw date of birth', async () => {
    // The route reads a DERIVED status through `user_age_status()` and nothing
    // else. Asserted behaviourally: that is the only RPC it makes.
    h.state.ageRow = ELIGIBLE
    const { body } = await upload()
    expect(h.state.rpcCalls).toEqual(['user_age_status'])
    expect(JSON.stringify(body)).not.toContain('date_of_birth')
  })
})

describe('the refusal is actionable on the client', () => {
  it('returns exactly the codes the shared client handler recognises', () => {
    // If the route ever returned a third code, the composers would show a
    // generic upload error instead of routing to /age-check.
    expect([...AGE_GATE_CODES]).toContain('age_ineligible')
    expect([...AGE_GATE_CODES]).toContain('age_verification_required')
  })

  it('both composers upload through the shared handler', () => {
    // Detail — including that neither kept a bare fetch — is owned by
    // `ageGateClient.test.ts`. This asserts only that both participate.
    for (const p of [
      'src/app/reviews/new/page.tsx',
      'src/app/profile/bookings/BookingReviewButton.tsx',
    ]) {
      expect(SRC(p), p).toContain("apiFetch('/api/reviews/upload'")
    }
  })
})
