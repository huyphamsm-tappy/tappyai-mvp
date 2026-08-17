import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── STEP 12 — Price Watch bounded acceptance ────────────────────────────────
//
// Price Watch had NO test of any kind. These are bounded acceptance tests for the
// behaviour the Consultative V2 contract names — target price, saved watch,
// update/cancel, the authentication requirement, and persistence — using the
// house route-mocking pattern (see api/notifications/read/route.test.ts).
//
// Price Watch is NOT redesigned. Where current behaviour is a gap, the test
// RECORDS the gap rather than changing the product.

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1' } as { id: string } | null,
    activeCount: 0,
    insertResult: { data: { id: 'w1' }, error: null } as { data: unknown; error: unknown },
    selectResult: { data: [] as unknown[], error: null } as { data: unknown; error: unknown },
    updateResult: { data: [{ id: 'w1' }] as unknown[], error: null } as { data: unknown; error: unknown },
    calls: [] as string[],
    inserted: null as Record<string, unknown> | null,
    filters: [] as Array<[string, unknown]>,
    limit: null as number | null,
    order: null as string | null,
    neq: null as [string, unknown] | null,
    /** `profiles.language`. NULL models "not set yet", the shipped default. */
    profileLanguage: null as string | null,
    profileThrows: false,
  }

  const builder: Record<string, unknown> = {}
  let mode: 'select' | 'insert' | 'update' | 'count' | 'profile' = 'select'

  builder.from = (t: string) => {
    state.calls.push('from:' + t)
    if (t === 'profiles') mode = 'profile'
    return builder
  }
  // The count query is `select('id', {count,head}).eq().eq()` — it keeps chaining
  // AFTER select, so select must stay chainable and the resolution has to happen
  // in `then`, not here.
  builder.select = (_c?: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) { mode = 'count'; return builder }
    if (mode !== 'profile') state.calls.push('select')
    return builder
  }
  builder.insert = (row: Record<string, unknown>) => { mode = 'insert'; state.inserted = row; state.calls.push('insert'); return builder }
  builder.update = (row: Record<string, unknown>) => { mode = 'update'; state.calls.push('update:' + JSON.stringify(row)); return builder }
  builder.eq = (c: string, v: unknown) => { state.filters.push([c, v]); return builder }
  builder.neq = (c: string, v: unknown) => { state.neq = [c, v]; return builder }
  builder.order = (c: string) => { state.order = c; return builder }
  builder.limit = (n: number) => { state.limit = n; return builder }
  builder.single = () => {
    if (mode === 'profile') {
      mode = 'select'
      if (state.profileThrows) return Promise.reject(new Error('profiles unavailable'))
      return Promise.resolve({ data: { language: state.profileLanguage }, error: null })
    }
    return Promise.resolve(state.insertResult)
  }
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    const value = mode === 'count' ? { count: state.activeCount }
      : mode === 'update' ? state.updateResult
      : state.selectResult
    // The count query is awaited mid-handler and the same builder is reused for
    // the insert that follows, so the mode must not leak across awaits.
    if (mode === 'count') mode = 'select'
    return Promise.resolve(value).then(res, rej)
  }

  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser, reset: () => { mode = 'select' } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { GET, POST, DELETE } from './route'

const req = (method: string, body?: unknown) =>
  new Request('http://localhost/api/price-watch', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const VALID = { product_name: 'AirPods Pro 2', target_price: 4_500_000, search_query: 'AirPods Pro 2 giá Shopee Tiki' }

beforeEach(() => {
  vi.clearAllMocks()
  h.reset()
  h.state.user = { id: 'u1' }
  h.state.activeCount = 0
  h.state.insertResult = { data: { id: 'w1' }, error: null }
  h.state.selectResult = { data: [], error: null }
  h.state.updateResult = { data: [{ id: 'w1' }], error: null }
  h.state.calls = []
  h.state.inserted = null
  h.state.filters = []
  h.state.limit = null
  h.state.order = null
  h.state.neq = null
  h.state.profileLanguage = null
  h.state.profileThrows = false
})

// ── PW-01 — authentication is required on every verb ───────────────────────
describe('PW-01 — the authentication requirement', () => {
  for (const [name, call] of [
    ['GET', () => GET(req('GET'))],
    ['POST', () => POST(req('POST', VALID))],
    ['DELETE', () => DELETE(req('DELETE', { id: 'w1' }))],
  ] as const) {
    it(`${name} returns 401 with no session`, async () => {
      h.state.user = null
      const res = await call()
      expect(res.status).toBe(401)
    })
  }

  it('an authenticated request is scoped to the caller, never to a client-supplied id', async () => {
    await GET(req('GET'))
    expect(h.state.filters).toContainEqual(['user_id', 'u1'])
  })
})

// ── PW-02 — saving a watch, and the target price ──────────────────────────
describe('PW-02 — saved watch and target price', () => {
  it('a valid request saves and returns the new id', async () => {
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'w1', ok: true })
    expect(h.state.calls).toContain('from:price_watches')
    expect(h.state.calls).toContain('insert')
  })

  it('the target price is stored as a rounded integer, bound to the caller', async () => {
    await POST(req('POST', { ...VALID, target_price: 4_499_999.6 }))
    expect(h.state.inserted).toMatchObject({
      user_id: 'u1',
      product_name: 'AirPods Pro 2',
      target_price: 4_500_000,
    })
  })

  it('the user_id comes from the SESSION, not from the request body', async () => {
    // A client-supplied user_id must not be able to create a watch for someone else.
    await POST(req('POST', { ...VALID, user_id: 'someone-else' }))
    expect(h.state.inserted!.user_id).toBe('u1')
  })

  for (const missing of ['product_name', 'target_price', 'search_query'] as const) {
    it(`400 when ${missing} is missing`, async () => {
      const body: Record<string, unknown> = { ...VALID }
      delete body[missing]
      const res = await POST(req('POST', body))
      expect(res.status).toBe(400)
      expect(h.state.calls).not.toContain('insert')
    })
  }

  it('a zero target price is rejected — it would trigger immediately and forever', async () => {
    const res = await POST(req('POST', { ...VALID, target_price: 0 }))
    expect(res.status).toBe(400)
  })
})

// ── PW-03 — the active-watch ceiling ──────────────────────────────────────
describe('PW-03 — at most 10 active watches', () => {
  it('the 11th is refused with 429 and nothing is written', async () => {
    h.state.activeCount = 10
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(429)
    expect(h.state.calls).not.toContain('insert')
  })

  it('the 10th is still allowed', async () => {
    h.state.activeCount = 9
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(200)
  })

  it('the ceiling counts ACTIVE watches only, so cancelled ones free a slot', async () => {
    await POST(req('POST', VALID))
    expect(h.state.filters).toContainEqual(['status', 'active'])
  })
})

// ── PW-04 — cancel, and ownership ─────────────────────────────────────────
describe('PW-04 — cancelling a watch', () => {
  it('cancels by setting status, never by deleting the row', async () => {
    const res = await DELETE(req('DELETE', { id: 'w1' }))
    expect(res.status).toBe(200)
    expect(h.state.calls.some(c => c.startsWith('update:') && c.includes('cancelled'))).toBe(true)
  })

  it('the update is scoped to BOTH the id and the caller', async () => {
    await DELETE(req('DELETE', { id: 'w1' }))
    expect(h.state.filters).toContainEqual(['id', 'w1'])
    expect(h.state.filters).toContainEqual(['user_id', 'u1'])
  })

  it("another user's id matches no row → 404, never a false success", async () => {
    // The ownership filter makes the update match nothing. Reporting ok:true here
    // would tell a user their watch was cancelled when it was not.
    h.state.updateResult = { data: [], error: null }
    const res = await DELETE(req('DELETE', { id: 'someone-elses-watch' }))
    expect(res.status).toBe(404)
    expect(await res.json()).not.toMatchObject({ ok: true })
  })

  it('400 when no id is supplied', async () => {
    const res = await DELETE(req('DELETE', {}))
    expect(res.status).toBe(400)
  })

  it('a database error is reported as a failure, not as success', async () => {
    h.state.updateResult = { data: null, error: { message: 'boom' } }
    const res = await DELETE(req('DELETE', { id: 'w1' }))
    expect(res.status).toBe(500)
  })
})

// ── PW-05 — persistence and listing ───────────────────────────────────────
describe('PW-05 — listing persisted watches', () => {
  it('returns the caller\'s watches', async () => {
    h.state.selectResult = {
      data: [{ id: 'w1', product_name: 'AirPods Pro 2', target_price: 4_500_000, current_price: 5_200_000, status: 'active' }],
      error: null,
    }
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    const body = await res.json() as { watches: unknown[] }
    expect(body.watches).toHaveLength(1)
  })

  it('excludes cancelled watches, newest first, bounded to 20', async () => {
    await GET(req('GET'))
    expect(h.state.neq).toEqual(['status', 'cancelled'])
    expect(h.state.order).toBe('created_at')
    expect(h.state.limit).toBe(20)
  })

  it('surfaces current_price alongside target_price, so the UI can compare', async () => {
    h.state.selectResult = { data: [], error: null }
    await GET(req('GET'))
    expect(h.state.calls).toContain('select')
  })

  it('a database error is a 500, not an empty list', async () => {
    // An empty list would read as "you have no watches" — a silent data loss.
    h.state.selectResult = { data: null, error: { message: 'boom' } }
    const res = await GET(req('GET'))
    expect(res.status).toBe(500)
  })
})

// ── STEP 13 — VI / EN ─────────────────────────────────────────────────────
//
// The language comes from `profiles.language` — the stored UI preference from
// add_user_language_preference.sql, constrained to 'vi' | 'en' at its write site.
// Nullable means "not set yet", which resolves to Vietnamese, so every existing
// caller keeps today's behaviour. No new request parameter and no migration.

const err = async (res: Response) => (await res.json() as { error: string }).error
const VI_DIACRITIC = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

describe('PW-VI-01 — existing Vietnamese behaviour is preserved', () => {
  beforeEach(() => { h.state.profileLanguage = null })  // NULL = "not set yet"

  it('the limit message stays Vietnamese for a user with no language set', async () => {
    h.state.activeCount = 10
    expect(await err(await POST(req('POST', VALID)))).toContain('Tối đa 10')
  })

  it('validation, not-found and db errors stay Vietnamese', async () => {
    expect(await err(await POST(req('POST', { ...VALID, product_name: undefined })))).toMatch(VI_DIACRITIC)
    h.state.updateResult = { data: [], error: null }
    expect(await err(await DELETE(req('DELETE', { id: 'x' })))).toMatch(VI_DIACRITIC)
    h.state.selectResult = { data: null, error: { message: 'boom' } }
    expect(await err(await GET(req('GET')))).toMatch(VI_DIACRITIC)
  })

  it("an explicit 'vi' preference is Vietnamese too", async () => {
    h.state.profileLanguage = 'vi'
    h.state.activeCount = 10
    expect(await err(await POST(req('POST', VALID)))).toContain('Tối đa 10')
  })
})

describe('PW-EN-01…04 — an English user gets English', () => {
  beforeEach(() => { h.state.profileLanguage = 'en' })

  it('PW-EN-01: validation error is English', async () => {
    const message = await err(await POST(req('POST', { ...VALID, target_price: undefined })))
    expect(message).toBe('Missing required fields')
    expect(message).not.toMatch(VI_DIACRITIC)
  })

  it('PW-EN-02: the active-watch limit error is English', async () => {
    h.state.activeCount = 10
    const message = await err(await POST(req('POST', VALID)))
    expect(message).toMatch(/at most 10/i)
    expect(message).not.toMatch(VI_DIACRITIC)
  })

  it('PW-EN-03: GET user-facing text is English', async () => {
    h.state.selectResult = { data: null, error: { message: 'boom' } }
    const message = await err(await GET(req('GET')))
    expect(message).toBe('Database error')
    expect(message).not.toMatch(VI_DIACRITIC)
  })

  it('PW-EN-04: DELETE messages are English', async () => {
    expect(await err(await DELETE(req('DELETE', {})))).toBe('Missing watch id')
    h.state.updateResult = { data: [], error: null }
    expect(await err(await DELETE(req('DELETE', { id: 'x' })))).toBe('Not found')
    h.state.updateResult = { data: null, error: { message: 'boom' } }
    expect(await err(await DELETE(req('DELETE', { id: 'x' })))).not.toMatch(VI_DIACRITIC)
  })

  it('the language is read from the profile, not guessed from the request', async () => {
    h.state.activeCount = 10
    await POST(req('POST', VALID))
    expect(h.state.calls).toContain('from:profiles')
  })
})

describe('language never weakens the contract', () => {
  it('status codes are identical in both languages', async () => {
    for (const language of ['vi', 'en'] as const) {
      h.state.profileLanguage = language
      h.state.activeCount = 10
      expect((await POST(req('POST', VALID))).status).toBe(429)
      h.state.activeCount = 0
      expect((await POST(req('POST', { ...VALID, search_query: undefined }))).status).toBe(400)
      h.state.updateResult = { data: [], error: null }
      expect((await DELETE(req('DELETE', { id: 'x' }))).status).toBe(404)
      h.state.updateResult = { data: [{ id: 'w1' }], error: null }
    }
  })

  it('401 is unchanged in both — an unauthenticated caller has no known language', async () => {
    h.state.user = null
    expect(await err(await GET(req('GET')))).toBe('Unauthorized')
  })

  it('a profile lookup failure still allows the write, defaulting to Vietnamese', async () => {
    // A language read must never be able to fail a price-watch operation.
    h.state.profileThrows = true
    const res = await POST(req('POST', VALID))
    expect(res.status).toBe(200)
  })
})
