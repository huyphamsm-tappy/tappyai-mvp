/**
 * UAT — the 18+ boundary on the REVIEW VIDEO upload authorization.
 *
 * `uploadRoutes.test.ts` covers this endpoint's other guards (auth, rate limit,
 * kind scoping, the retired Blob handshake). This file is only about the age
 * gate, and about the one design decision it forced.
 *
 * ── WHY THIS ENDPOINT IS THE SHARP ONE ───────────────────────────────────────
 *
 * `/api/reviews/upload` receives the bytes. This endpoint does not: it mints a
 * resumable session URI and the browser PUTs straight to Cloud Storage. So the
 * write is authorized here and performed somewhere this server never sees.
 * Refusing after the fact is not possible — the only place an ineligible account
 * can be stopped is the mint.
 *
 * ── WHY `complete` IS DELIBERATELY NOT GATED ─────────────────────────────────
 *
 * The same POST serves a second protocol that CONFIRMS an object a
 * previously-authorized session already created. Gating that too would mean a
 * transient eligibility-read failure could refuse the confirmation of bytes that
 * are already in storage, stranding an object nothing references — the gate
 * would then CREATE the orphan class it was added to close. Asserted below.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CREATE_UPLOAD_SESSION_TYPE } from '@/lib/media/uploadRoute'
import { COMPLETE_UPLOAD_TYPE } from '@/lib/media/uploadCompletion'

const h = vi.hoisted(() => {
  const state = {
    user: null as { id: string } | null,
    ageRow: null as Record<string, unknown> | null,
    rpcError: null as { message: string } | null,
    rpcCalls: [] as string[],
    minted: 0,
    completed: 0,
  }
  const supabase = {
    rpc: (fn: string) => {
      state.rpcCalls.push(fn)
      if (fn !== 'user_age_status') return Promise.resolve({ data: null, error: null })
      if (state.rpcError) return Promise.resolve({ data: null, error: state.rpcError })
      return Promise.resolve({ data: state.ageRow ? [state.ageRow] : [], error: null })
    },
  }
  return { state, supabase }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.supabase }),
}))
vi.mock('@/lib/security/rateLimit', () => ({
  rateLimit: () => ({ ok: true, retryAfter: 0 }),
  clientIp: () => 'ip',
}))
vi.mock('@/lib/observability', () => ({ flushPending: () => undefined }))
vi.mock('@/lib/media', () => ({ getMediaProvider: () => 'test-provider' }))

// The two protocol handlers are the storage edge. Counting them is how these
// tests assert that nothing was authorized.
vi.mock('@/lib/media/uploadRoute', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    createUploadSessionResponse: async () => {
      h.state.minted++
      return { status: 200, body: { provider: 'gcs', uploadUrl: 'https://session', url: 'https://public' } }
    },
  }
})
vi.mock('@/lib/media/uploadCompletion', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    completeUploadResponse: async () => {
      h.state.completed++
      return { status: 200, body: { url: 'https://public' } }
    },
  }
})

import { POST } from './route'

const ELIGIBLE = { has_dob: true, age_years: 30, age_band: '25_34', corrections_used: 0 }
const UNDER_18 = { has_dob: true, age_years: 15, age_band: 'under_18', corrections_used: 0 }

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/upload/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  )

const createSession = () =>
  post({ type: CREATE_UPLOAD_SESSION_TYPE, kind: 'video', contentType: 'video/mp4', size: 1024 })

const completeUpload = () =>
  post({ type: COMPLETE_UPLOAD_TYPE, kind: 'video', key: 'videos/u-1/k.mp4' })

beforeEach(() => {
  h.state.user = { id: 'u-1' }
  h.state.ageRow = ELIGIBLE
  h.state.rpcError = null
  h.state.rpcCalls = []
  h.state.minted = 0
  h.state.completed = 0
})

describe('minting an upload session is 18+', () => {
  it('under 18 gets no session', async () => {
    h.state.ageRow = UNDER_18
    const res = await createSession()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('age_ineligible')
    // No session URI was minted, so no path to storage was ever opened.
    expect(h.state.minted).toBe(0)
  })

  it('an age-unknown account gets no session', async () => {
    h.state.ageRow = null
    const res = await createSession()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('age_verification_required')
    expect(h.state.minted).toBe(0)
  })

  it('fails CLOSED when the eligibility read fails', async () => {
    h.state.rpcError = { message: 'connection reset' }
    const res = await createSession()
    expect(res.status).toBe(403)
    expect(h.state.minted).toBe(0)
  })

  it('an eligible 18+ account gets a session', async () => {
    const res = await createSession()
    expect(res.status).toBe(200)
    expect(h.state.minted).toBe(1)
  })

  it('an unauthenticated caller still gets 401, and is never asked their age', async () => {
    h.state.user = null
    const res = await createSession()
    expect(res.status).toBe(401)
    expect(h.state.rpcCalls).not.toContain('user_age_status')
    expect(h.state.minted).toBe(0)
  })
})

describe('completing an upload is deliberately NOT gated', () => {
  it('confirms an already-stored object even when the eligibility read fails', async () => {
    // The bytes are already in Cloud Storage by this point. Refusing here would
    // strand them — the gate would create the orphan class it exists to close.
    // The write boundary is the mint, and the mint is gated.
    h.state.rpcError = { message: 'connection reset' }
    const res = await completeUpload()
    expect(res.status).toBe(200)
    expect(h.state.completed).toBe(1)
  })

  it('does not spend an eligibility read on the completion path at all', async () => {
    await completeUpload()
    expect(h.state.rpcCalls).not.toContain('user_age_status')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// One implementation of the rule.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('no second age gate was introduced', () => {
  const route = () => SRC('src/app/api/upload/video/route.ts')

  it('delegates to the shared refusal helper', () => {
    expect(route()).toContain("from '@/lib/account/requireEligibleUser'")
    expect(route()).toContain('refuseIneligible(req, supabase)')
  })

  it('carries no age rule and no raw date of birth of its own', () => {
    const code = route()
    expect(code).not.toContain('MINIMUM_AGE')
    expect(code).not.toContain('date_of_birth')
    expect(code).not.toMatch(/getAgeEligibility\s*\(/)
  })

  it('gates the mint, not the whole handler', () => {
    // Pinning the DECISION, not just the behaviour: the refusal must sit inside
    // the create-session branch, after it is selected.
    const code = route()
    const branch = code.indexOf('isCreateUploadSessionBody(body)')
    const gate = code.indexOf('refuseIneligible(req, supabase)')
    const complete = code.indexOf('isCompleteUploadBody(body)')
    expect(branch).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(branch)
    // The completion branch is earlier in the file and carries no gate.
    expect(complete).toBeLessThan(branch)
  })
})

describe('the refusal is actionable on the client', () => {
  it('the composer routes a video age refusal through the shared detector', () => {
    // `uploadMedia` owns its own request (XMLHttpRequest, for the progress bar)
    // so it cannot use `apiFetch`. It must still share the DETECTOR — the same
    // answer the chat transport reaches.
    const code = SRC('src/app/reviews/new/page.tsx')
    expect(code).toContain('isAgeGateMessage((e as Error)?.message)')
    expect(code).toContain('redirectToAgeCheck()')
    // …and no hand-rolled copy of the destination or the code list.
    expect(code).not.toContain('/age-check?next=')
    expect(code).not.toContain('age_verification_required')
  })
})
