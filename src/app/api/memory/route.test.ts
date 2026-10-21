// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/memory is DISABLED (docs/phase8/MEMORY-POST-AUDIT.md): it must never reach the model, the memory store or the session lookup, whoever calls it and
// whatever they send. GET / PATCH / DELETE are the supported surface (Web "Tappy knows", Android, iOS) and must behave exactly as before.

const h = vi.hoisted(() => ({
  user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
  getRequestUser: vi.fn(),
  extract: vi.fn(),
  generate: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
  clearMemory: vi.fn(),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: h.generate, extract: h.generate, stream: h.generate } }))
vi.mock('@/lib/memory/memoryService', () => ({
  extractMemoryFromConversation: h.extract,
  getMemory: h.getMemory,
  updateMemory: h.updateMemory,
  clearMemory: h.clearMemory,
}))

import { GET, POST, PATCH, DELETE } from './route'
import * as route from './route'

// POST takes no argument (it cannot read a request); the tests still send real requests to prove that nothing in them matters.
const callPost = POST as unknown as (req: Request) => Promise<Response>

const url = 'http://localhost/api/memory'
const post = (body: unknown = { messages: [{ role: 'user', content: 'tôi sống ở Hà Nội' }] }, init: RequestInit = {}) =>
  callPost(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init }))

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'u1', is_anonymous: false }
  h.getRequestUser.mockImplementation(async () => ({ user: h.user, supabase: { tag: 'supabase' } }))
  h.getMemory.mockResolvedValue({ location_base: 'Hà Nội', preferences: {}, budget: {}, history: [] })
})

describe('POST /api/memory is disabled', () => {
  it('answers 404 with an empty body and does no work: no model call, no extraction, no memory read or write, no session lookup', async () => {
    const res = await post()
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.extract).not.toHaveBeenCalled()
    expect(h.getMemory).not.toHaveBeenCalled()
    expect(h.updateMemory).not.toHaveBeenCalled()
    expect(h.getRequestUser).not.toHaveBeenCalled()
  })

  it('the answer does not depend on who asks or what they send: signed in, anonymous, signed out, empty body, a huge body, malformed JSON', async () => {
    const huge = { messages: Array.from({ length: 2000 }, (_, i) => ({ role: 'user', content: 'x'.repeat(2000) + i })) }
    const cases: Array<() => Promise<Response>> = [
      () => post(),
      () => { h.user = { id: 'anon', is_anonymous: true }; return post() },
      () => { h.user = null; return post() },
      () => post({}),
      () => post(huge),
      () => callPost(new Request(url, { method: 'POST', body: '{not json' })),
      () => callPost(new Request(url, { method: 'POST' })),
    ]
    for (const c of cases) {
      const res = await c()
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('')
    }
    expect(h.generate).not.toHaveBeenCalled()
    expect(h.extract).not.toHaveBeenCalled()
    expect(h.updateMemory).not.toHaveBeenCalled()
    expect(h.getRequestUser).not.toHaveBeenCalled()
  })

  it('structure lock: the route module no longer imports the extraction function, and POST takes no request (it cannot read a body)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/api/memory/route.ts', 'utf8')
    expect(src).not.toContain('extractMemoryFromConversation')
    expect(src).toMatch(/export async function POST\(\) \{\s*return new NextResponse\(null, \{ status: 404 \}\)\s*\}/)
    expect(Object.keys(route).sort()).toEqual(['DELETE', 'GET', 'PATCH', 'POST'])
  })
})

describe('the supported methods are unchanged', () => {
  it('GET: the caller\'s memory (or null when signed out, or when it is empty) — never a model call', async () => {
    const res = await GET(new Request(url))
    expect((await res.json()).memory).toMatchObject({ location_base: 'Hà Nội' })
    h.user = null
    expect(await (await GET(new Request(url))).json()).toEqual({ memory: null })
    h.user = { id: 'u1', is_anonymous: false }
    h.getMemory.mockResolvedValue(null)
    expect(await (await GET(new Request(url))).json()).toEqual({ memory: null })
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('PATCH: 401 signed out; a whitelisted correction is written for the caller only; an empty patch is invalid_input; the model is never called', async () => {
    h.user = null
    expect((await PATCH(new Request(url, { method: 'PATCH', body: '{}' }))).status).toBe(401)
    h.user = { id: 'u1', is_anonymous: false }
    const ok = await PATCH(new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ location_base: '  Đà Lạt  ', ignored: 'x' }) }))
    expect(ok.status).toBe(200)
    expect(h.updateMemory).toHaveBeenCalledWith('u1', { location_base: 'Đà Lạt' }, { tag: 'supabase' })
    const bad = await PATCH(new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ignored: 'x' }) }))
    expect((await bad.json()).error).toBe('invalid_input')
    expect(h.updateMemory).toHaveBeenCalledTimes(1)
    expect(h.generate).not.toHaveBeenCalled()
  })

  it('DELETE: 401 signed out; clears the caller\'s memory only', async () => {
    h.user = null
    expect((await DELETE(new Request(url, { method: 'DELETE' }))).status).toBe(401)
    expect(h.clearMemory).not.toHaveBeenCalled()
    h.user = { id: 'u1', is_anonymous: false }
    expect((await DELETE(new Request(url, { method: 'DELETE' }))).status).toBe(200)
    expect(h.clearMemory).toHaveBeenCalledWith('u1', { tag: 'supabase' })
  })
})
