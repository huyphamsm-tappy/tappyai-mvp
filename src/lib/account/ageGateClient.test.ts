// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  apiFetch,
  ageCheckHref,
  isAgeGateCode,
  isAgeGateMessage,
  AGE_GATE_CODES,
} from './ageGateClient'

const replace = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  replace.mockClear()
  // jsdom forbids assigning window.location; replace just the method under test.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { replace, pathname: '/reviews/new', search: '?draft=1' },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function mockFetch(res: Response) {
  const f = vi.fn(async () => res)
  vi.stubGlobal('fetch', f)
  return f
}

describe('the code list is the single source of truth', () => {
  it('covers exactly the two codes the server can return', () => {
    expect([...AGE_GATE_CODES]).toEqual(['age_verification_required', 'age_ineligible'])
  })

  it('recognises both, and nothing else', () => {
    for (const c of AGE_GATE_CODES) expect(isAgeGateCode(c)).toBe(true)
    for (const c of ['auth_required', 'account_suspended', 'age', '', null, undefined, 42]) {
      expect(isAgeGateCode(c), String(c)).toBe(false)
    }
  })
})

describe('isAgeGateMessage — for transports that only hand back a body string', () => {
  it('detects a code embedded in a raw response body', () => {
    // `useChat` surfaces the server's body as `error.message`; there is no
    // status and no parsed JSON to inspect.
    expect(isAgeGateMessage('{"error":"age_verification_required","message":"…"}')).toBe(true)
    expect(isAgeGateMessage('{"error":"age_ineligible"}')).toBe(true)
  })

  it('does NOT fire on prose that merely mentions age', () => {
    // A loose /age/ match would send a user to the age screen for an unrelated
    // failure — the copy itself says "aged 18 and over".
    expect(isAgeGateMessage('TappyAI is only available to people aged 18 and over.')).toBe(false)
    expect(isAgeGateMessage('{"error":"server_error","message":"age of the cache"}')).toBe(false)
  })

  it('is safe on empty input', () => {
    for (const v of ['', undefined, null]) expect(isAgeGateMessage(v)).toBe(false)
  })
})

describe('ageCheckHref', () => {
  it('carries the current location as the return path', () => {
    expect(ageCheckHref()).toBe('/age-check?next=' + encodeURIComponent('/reviews/new?draft=1'))
  })

  it('refuses to build an open redirect', () => {
    // Same restriction the auth callback and the age-check page apply.
    for (const evil of ['//evil.com', 'https://evil.com', 'javascript:alert(1)']) {
      expect(ageCheckHref(evil), evil).toBe('/age-check')
    }
  })

  it('omits the query entirely for the root, rather than sending next=/', () => {
    expect(ageCheckHref('/')).toBe('/age-check')
  })
})

describe('apiFetch behaves exactly like fetch for everything that is not an age refusal', () => {
  it('passes a success straight through', async () => {
    const res = json(200, { ok: true })
    mockFetch(res)
    await expect(apiFetch('/api/reviews')).resolves.toBe(res)
    expect(replace).not.toHaveBeenCalled()
  })

  it('passes a 401 through untouched — that is the login path, not this one', async () => {
    mockFetch(json(401, { error: 'auth_required' }))
    const out = await apiFetch('/api/reviews')
    expect(out.status).toBe(401)
    expect(replace).not.toHaveBeenCalled()
  })

  it('passes a 403 that is NOT an age refusal through', async () => {
    mockFetch(json(403, { error: 'account_suspended' }))
    const out = await apiFetch('/api/reviews')
    expect(out.status).toBe(403)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not consume the body of a 403 it declines to handle', async () => {
    // Reading the original would break every existing 403 handler that parses
    // its own JSON.
    mockFetch(json(403, { error: 'account_suspended', message: 'blocked' }))
    const out = await apiFetch('/api/reviews')
    await expect(out.json()).resolves.toMatchObject({ error: 'account_suspended' })
  })

  it('passes a non-JSON 403 through without throwing', async () => {
    mockFetch(new Response('<html>nope</html>', { status: 403 }))
    const out = await apiFetch('/api/reviews')
    expect(out.status).toBe(403)
    expect(replace).not.toHaveBeenCalled()
  })

  it('does not read the body at all on a non-403', async () => {
    const res = json(500, { error: 'server_error' })
    mockFetch(res)
    const out = await apiFetch('/api/reviews')
    expect(out.bodyUsed).toBe(false)
  })
})

describe('apiFetch intercepts an age refusal', () => {
  for (const code of AGE_GATE_CODES) {
    it(`redirects on ${code}`, async () => {
      mockFetch(json(403, { error: code, message: 'nope' }))
      apiFetch('/api/reviews')
      await vi.advanceTimersByTimeAsync(0)
      expect(replace).toHaveBeenCalledWith(
        '/age-check?next=' + encodeURIComponent('/reviews/new?draft=1')
      )
    })
  }

  it('withholds the response while the page navigates, then releases it as a fallback', async () => {
    // The caller's error branch would otherwise paint a generic failure over a
    // page that is already leaving. But a navigation CAN be prevented, and a
    // promise that never settles would leave a spinner up and a submit button
    // disabled forever — so it settles late rather than never.
    mockFetch(json(403, { error: 'age_ineligible' }))
    const settled = vi.fn()
    apiFetch('/api/reviews').then(settled)

    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    expect(settled).toHaveBeenCalled()
  })

  it('honours an explicit return path over the current location', async () => {
    mockFetch(json(403, { error: 'age_verification_required' }))
    apiFetch('/api/conversations', { method: 'POST' }, { next: '/chat/abc' })
    await vi.advanceTimersByTimeAsync(0)
    expect(replace).toHaveBeenCalledWith('/age-check?next=' + encodeURIComponent('/chat/abc'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// One implementation, actually adopted.
//
// A shared handler nothing imports is not shared — it is a fifth implementation
// that happens to be unused. These assert the four gated surfaces and the chat
// transport all route through this module, and that none of them kept a
// hand-rolled copy.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const GATED_SURFACES = [
  ['conversation persistence (new)', 'src/app/chat/page.tsx'],
  ['conversation persistence (existing)', 'src/app/chat/[id]/ChatConversation.tsx'],
  ['recommendations', 'src/app/recommendations/page.tsx'],
  ['review posting + explore import', 'src/app/reviews/new/page.tsx'],
  // The booking flow posts a review too. It was the surface this list existed
  // to catch: a second composer, reached from a different screen, hitting the
  // SAME gated endpoint with a bare fetch.
  ['review posting (booking flow)', 'src/app/profile/bookings/BookingReviewButton.tsx'],
] as const

describe('every gated surface uses the shared handler', () => {
  it.each(GATED_SURFACES)('%s', (_label, path) => {
    const code = SRC(path)
    expect(code).toContain("from '@/lib/account/ageGateClient'")
    expect(code).toContain('apiFetch(')
  })

  it('the chat transport shares the DETECTOR, since it cannot share the fetch', () => {
    // `useChat` owns its own request, so it cannot call apiFetch — but it must
    // not carry its own idea of what an age refusal looks like.
    const chat = SRC('src/components/ChatInterface.tsx')
    expect(chat).toContain('isAgeGateMessage(error.message)')
    expect(chat).toContain('redirectToAgeCheck()')
  })

  it('nobody hand-rolls the redirect or the code list', () => {
    for (const [, path] of GATED_SURFACES) {
      const code = SRC(path)
      expect(code, path).not.toContain('/age-check?next=')
      expect(code, path).not.toContain('age_verification_required')
    }
    // ChatInterface too — it delegates both halves.
    const chat = SRC('src/components/ChatInterface.tsx')
    expect(chat).not.toContain('/age-check?next=')
  })

  it('the gated surfaces no longer call bare fetch for the gated endpoints', () => {
    const pairs: Array<[string, RegExp]> = [
      ['src/app/chat/page.tsx', /fetch\('\/api\/conversations'/],
      ['src/app/chat/[id]/ChatConversation.tsx', /fetch\('\/api\/conversations'/],
      ['src/app/recommendations/page.tsx', /fetch\('\/api\/recommendations'/],
      ['src/app/reviews/new/page.tsx', /fetch\('\/api\/explore\/process'/],
      ['src/app/profile/bookings/BookingReviewButton.tsx', /fetch\(`\/api\/reviews\?lang=/],
      // The upload endpoint is age-gated too, so BOTH composers must reach it
      // through the shared handler or an age refusal shows as a generic upload error.
      ['src/app/reviews/new/page.tsx', /fetch\('\/api\/reviews\/upload'/],
      ['src/app/profile/bookings/BookingReviewButton.tsx', /fetch\('\/api\/reviews\/upload'/],
    ]
    for (const [path, bare] of pairs) {
      // `apiFetch(` contains `Fetch(` but not `fetch('` — the regexes are
      // anchored on the lowercase call, so a converted site does not match.
      expect(SRC(path), path).not.toMatch(bare)
    }
  })
})
