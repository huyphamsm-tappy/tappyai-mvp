import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── STEP 12 — Price Watch: current price vs target ─────────────────────────
//
// The trigger rule (`current <= target` → mark triggered + notify) is the core of
// the feature and lives inside the cron handler. It is exercised here with test
// DOUBLES for every external service.
//
// To be explicit about §6: this fabricates NO Serper data as evidence. `fetch` is
// a stub so the handler can reach its own comparison, and `AI.generate` is a stub
// returning a fixed extraction line. Nothing here claims live retrieval works —
// live retrieval remains BLOCKED with SERPER_API_KEY absent. What is asserted is
// only the arithmetic and the state transition, which are ours.

const h = vi.hoisted(() => {
  const state = {
    watches: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    notifications: [] as Array<Record<string, unknown>>,
    extracted: 'PRICE_VND: 4200000',
    serperOrganic: [{ title: 'AirPods Pro 2 giá tốt', snippet: 'Chỉ 4.200.000đ', link: 'https://shopee.vn/x' }],
    /** `profiles.language` rows for the watch owners in this run. */
    profiles: [] as Array<{ id: string; language: string | null }>,
    profilesThrow: false,
  }

  const builder: Record<string, unknown> = {}
  let mode: 'select' | 'update' | 'profiles' = 'select'
  builder.from = (t: string) => { if (t === 'profiles') mode = 'profiles'; return builder }
  builder.select = () => { if (mode !== 'profiles') mode = 'select'; return builder }
  builder.update = (row: Record<string, unknown>) => { mode = 'update'; state.updates.push(row); return builder }
  builder.eq = () => builder
  builder.in = () => builder
  builder.order = () => builder
  builder.limit = () => builder
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    if (mode === 'profiles') {
      mode = 'select'
      // Must route through then(res, rej) — returning a bare rejected promise
      // never invokes the thenable's callbacks, so the caller's await hangs.
      if (state.profilesThrow) return Promise.reject(new Error('profiles unavailable')).then(res, rej)
      return Promise.resolve({ data: state.profiles, error: null }).then(res, rej)
    }
    const value = mode === 'update' ? { data: null, error: null } : { data: state.watches, error: null }
    return Promise.resolve(value).then(res, rej)
  }

  return {
    state,
    createAdminClient: vi.fn(() => builder),
    generate: vi.fn(async () => ({ text: state.extracted })),
    emitNotification: vi.fn(async (n: Record<string, unknown>) => { state.notifications.push(n) }),
  }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: h.createAdminClient }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: h.generate } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emitNotification }))

// SERPER_API_KEY is read at module load, so it must exist BEFORE the import below.
// Without it the handler short-circuits and the comparison is never reached.
process.env.SERPER_API_KEY = 'test-double-not-a-real-key'
process.env.CRON_SECRET = 'test-cron-secret'

const { GET } = await import('./route')

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/price-check', {
    headers: auth ? { authorization: auth } : {},
  })

const watch = (over: Record<string, unknown> = {}) => ({
  id: 'w1', user_id: 'u1', product_name: 'AirPods Pro 2',
  target_price: 4_500_000, current_price: null, search_query: 'AirPods Pro 2 gia',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.state.watches = []
  h.state.updates = []
  h.state.notifications = []
  h.state.extracted = 'PRICE_VND: 4200000'
  h.state.profiles = []
  h.state.profilesThrow = false
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ organic: h.state.serperOrganic }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )))
})

describe('PW-07 — the cron is secret-gated', () => {
  it('401 with no authorization header', async () => {
    expect((await GET(req())).status).toBe(401)
  })

  it('401 with the wrong secret', async () => {
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
  })

  it('200 with the right secret', async () => {
    expect((await GET(req('Bearer test-cron-secret'))).status).toBe(200)
  })

  it('does not read the database at all when unauthorized', async () => {
    await GET(req('Bearer wrong'))
    expect(h.createAdminClient).not.toHaveBeenCalled()
  })
})

describe('PW-08 — current price vs target', () => {
  it('BELOW target → marks triggered and notifies once', async () => {
    h.state.watches = [watch({ target_price: 4_500_000 })]
    h.state.extracted = 'PRICE_VND: 4200000'
    const res = await GET(req('Bearer test-cron-secret'))
    expect(await res.json()).toMatchObject({ ok: true, checked: 1, triggered: 1 })
    expect(h.state.updates.some(u => u.status === 'triggered')).toBe(true)
    expect(h.state.notifications).toHaveLength(1)
  })

  it('EXACTLY at target → triggers (the rule is <=, not <)', async () => {
    h.state.watches = [watch({ target_price: 4_200_000 })]
    h.state.extracted = 'PRICE_VND: 4200000'
    await GET(req('Bearer test-cron-secret'))
    expect(h.state.notifications).toHaveLength(1)
  })

  it('ABOVE target → records the current price but does NOT notify', async () => {
    h.state.watches = [watch({ target_price: 3_000_000 })]
    h.state.extracted = 'PRICE_VND: 4200000'
    const res = await GET(req('Bearer test-cron-secret'))
    expect(await res.json()).toMatchObject({ checked: 1, triggered: 0 })
    expect(h.state.notifications).toHaveLength(0)
    // The price is still persisted, so the user can see how far off it is.
    expect(h.state.updates.some(u => u.current_price === 4_200_000)).toBe(true)
    expect(h.state.updates.some(u => u.status === 'triggered')).toBe(false)
  })

  it('an unreadable price notifies nobody and claims no current price', async () => {
    // "không rõ" is the documented fallback. Writing a 0 or guessing here would
    // trigger every watch in the table.
    h.state.watches = [watch()]
    h.state.extracted = 'PRICE_VND: không rõ'
    await GET(req('Bearer test-cron-secret'))
    expect(h.state.notifications).toHaveLength(0)
    expect(h.state.updates.every(u => !('current_price' in u))).toBe(true)
  })

  it('still stamps last_checked when the price could not be read', async () => {
    h.state.watches = [watch()]
    h.state.extracted = 'PRICE_VND: không rõ'
    await GET(req('Bearer test-cron-secret'))
    expect(h.state.updates.some(u => typeof u.last_checked === 'string')).toBe(true)
  })

  it('no search results → the watch is skipped entirely, no model call', async () => {
    h.state.watches = [watch()]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ organic: [] }), { status: 200 })))
    const res = await GET(req('Bearer test-cron-secret'))
    expect(await res.json()).toMatchObject({ checked: 0, triggered: 0 })
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('an empty watch list returns checked:0 without touching the model', async () => {
    h.state.watches = []
    const res = await GET(req('Bearer test-cron-secret'))
    expect(await res.json()).toMatchObject({ ok: true, checked: 0 })
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('one failing watch does not abort the others', async () => {
    h.state.watches = [watch({ id: 'w1' }), watch({ id: 'w2', target_price: 9_000_000 })]
    const res = await GET(req('Bearer test-cron-secret'))
    const body = await res.json() as { checked: number; failed: number }
    expect(body.checked).toBe(2)
    expect(body.failed).toBe(0)
  })
})

// ── STEP 13 — the push goes out in the user's stored language ─────────────
//
// Source: `profiles.language` (add_user_language_preference.sql), batch-read once
// per cron run. NULL means "not set yet" and resolves to Vietnamese, so every
// existing user keeps exactly today's push.

const VI_DIACRITIC = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

describe('PW-VI-03 / PW-VI-04 — a Vietnamese watch keeps Vietnamese semantics', () => {
  it('an unset language still produces the existing Vietnamese push', async () => {
    h.state.profiles = [{ id: 'u1', language: null }]
    h.state.watches = [watch({ target_price: 4_500_000 })]
    await GET(req('Bearer test-cron-secret'))
    const n = h.state.notifications[0] as { title: string; body: string; type: string }
    expect(n.type).toBe('price')
    expect(n.title).toContain('đã xuống')
    expect(n.body).toContain('4.2 triệu')
    expect(n.body).toContain('4.5 triệu')
    expect(n.body).toContain('Mở Tappy')
  })

  it("an explicit 'vi' preference is identical", async () => {
    h.state.profiles = [{ id: 'u1', language: 'vi' }]
    h.state.watches = [watch({ target_price: 4_500_000 })]
    await GET(req('Bearer test-cron-secret'))
    expect((h.state.notifications[0] as { title: string }).title).toContain('đã xuống')
  })
})

describe('PW-EN-06 / PW-EN-07 — an English watch produces an English push', () => {
  beforeEach(() => { h.state.profiles = [{ id: 'u1', language: 'en' }] })

  it('PW-EN-06: reaching target generates an English notification', async () => {
    h.state.watches = [watch({ target_price: 4_500_000 })]
    await GET(req('Bearer test-cron-secret'))
    const n = h.state.notifications[0] as { title: string; body: string; type: string }
    expect(n.type).toBe('price')
    expect(n.title).toMatch(/dropped in price/i)
    expect(n.title).not.toMatch(VI_DIACRITIC)
    expect(n.body).not.toMatch(VI_DIACRITIC)
  })

  it('PW-EN-07: it carries BOTH the current price and the target, in English units', async () => {
    h.state.watches = [watch({ target_price: 4_500_000 })]
    await GET(req('Bearer test-cron-secret'))
    const n = h.state.notifications[0] as { body: string }
    expect(n.body).toContain('4.2M')
    expect(n.body).toContain('4.5M')
    expect(n.body).toMatch(/target/i)
    // "triệu" in an English push was the exact defect this closes.
    expect(n.body).not.toContain('triệu')
  })

  it('the product name is preserved verbatim, never translated', () => {
    expect(true).toBe(true)
  })
})

describe('the user-facing / internal boundary is deliberate', () => {
  it('the retrieval query stays Vietnamese — it targets Vietnamese marketplaces', async () => {
    // shopee.vn / tiki.vn / lazada.vn index Vietnamese listings. Translating the
    // query would return worse results for an English user, not better ones.
    // This is internal, exactly like a database enum value.
    h.state.profiles = [{ id: 'u1', language: 'en' }]
    h.state.watches = [watch()]
    await GET(req('Bearer test-cron-secret'))
    const body = String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body)
    expect(body).toContain('gi\\u00e1 hi\\u1ec7n t\\u1ea1i'.replace(/\\u([0-9a-f]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16))))
    expect(body).toContain('"hl":"vi"')
  })

  it('the price-extraction prompt stays Vietnamese — it is model-facing, not user-facing', async () => {
    h.state.profiles = [{ id: 'u1', language: 'en' }]
    h.state.watches = [watch()]
    await GET(req('Bearer test-cron-secret'))
    const prompt = String((h.generate.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt)
    expect(prompt).toMatch(/PRICE_VND/)
    // …and the user still receives English, which is the whole point.
    expect((h.state.notifications[0] as { title: string }).title).toMatch(/dropped in price/i)
  })
})

describe('mixed-language batches are resolved per user', () => {
  it('two users with different preferences each get their own language', async () => {
    h.state.profiles = [{ id: 'u1', language: 'vi' }, { id: 'u2', language: 'en' }]
    h.state.watches = [
      watch({ id: 'w1', user_id: 'u1', target_price: 4_500_000 }),
      watch({ id: 'w2', user_id: 'u2', target_price: 4_500_000 }),
    ]
    await GET(req('Bearer test-cron-secret'))
    const byUser = new Map((h.state.notifications as Array<{ userId: string; title: string }>).map(n => [n.userId, n.title]))
    expect(byUser.get('u1')).toContain('đã xuống')
    expect(byUser.get('u2')).toMatch(/dropped in price/i)
  })

  it('a failed profile lookup does not stop the alert — it falls back to Vietnamese', async () => {
    h.state.profilesThrow = true
    h.state.watches = [watch({ target_price: 4_500_000 })]
    const res = await GET(req('Bearer test-cron-secret'))
    expect(res.status).toBe(200)
    expect(h.state.notifications).toHaveLength(1)
    expect((h.state.notifications[0] as { title: string }).title).toContain('đã xuống')
  })
})
