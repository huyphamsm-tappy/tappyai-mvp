/**
 * Q-02 X3 (owner 18/10, PREIMPL-Q01-Q03): end to end — a URL the server GRANTS (a venue's own `website_uri` from search_places, an owner-
 * written field) travels through the settle-path egress to the client, and the chat renderer (formatMessage, CONSULT_V3 build) must keep it
 * inert. SAFE TEST: scripted model, no network; the reply is only PARSED with JSDOM (scripts never run, no event dispatched, no browser).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'
import { __resetClarifyCreditLocal } from '@/lib/ai/quota/clarifyCredit'

// an inert identifier with NO trailing punctuation: the egress strips trailing "_" / "." from a bare URL, which would hide the case
const INERT = 'tappyNever'
const EVIL_SITE = `https://evil.example/a/onmouseover=${INERT}/menu`
const h = vi.hoisted(() => {
  const state = { steps: [] as Array<{ text: string; toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> }> }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b, gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }), maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }), upsert: () => Promise.resolve({ data: null, error: null }),
      then: (r: any) => r({ data: [], error: null }),
    }
    return b
  }
  return { state, client: { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) } }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: () => h.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
vi.mock('@/lib/account/ageEligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/account/ageEligibility')>()),
  getAgeEligibility: async () => ({ status: 'eligible', ageBand: '25_34', age: 30, canSelfCorrect: true }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u-attr' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    providerId: () => 'mock',
    serving: () => ({ provider: 'mock', model: 'mock-model', effort: 'none' }),
    extract: () => Promise.reject(new Error('no provider in this test')),
    stream: () => ({ toDataStreamResponse: () => new Response('0:"old path"\nd:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n', { status: 200, headers: { 'content-type': 'text/plain' } }), steps: Promise.resolve([]) }),
    step: (opts: Record<string, unknown>) => {
      const s = h.state.steps.shift() ?? { text: 'Mặc định.', toolCalls: [] }
      return Promise.resolve({ text: s.text, toolCalls: opts.tools ? s.toolCalls : [], finishReason: 'stop', usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: {} })
    },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
}))
vi.mock('@/lib/ai/tools/food', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/tools/food')>()
  return { ...real, searchPlaces: async () => ({ source: 'test', count: 1, location: 'Quận 1', results: [{ name: 'Quán Mẫu', address: '1 Lê Lợi, Quận 1', rating_value: 4.5, website_uri: EVIL_SITE }], place_search_status: 'has_results' }) }
})

import { POST } from '@/app/api/chat/route'
import { c2FlagsOff } from '@/test/c2FlagsOff'
c2FlagsOff() // C2 P2: this suite tests the DEFAULT behaviour, also when a run sets the C2 flags globally (setup only, no assertion changed)

// jsdom ships no type declarations here (no new dev dependency is added for a test): loaded untyped, used only to PARSE.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string) => { window: { document: Document } } }

const textOf = (body: string) => body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
const parse = (html: string) => new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document.getElementById('r')!
const foreignHandlers = (root: Element) => [...root.querySelectorAll('*')].flatMap(el => [...el.attributes]
  .filter(a => /^on/i.test(a.name) && !(el.tagName === 'IMG' && a.name === 'onerror' && a.value === "this.style.display='none'"))
  .map(a => `${el.tagName.toLowerCase()}[${a.name}=${a.value}]`))

beforeEach(() => {
  h.state.steps = []
  __resetAiQuestionQuotaLocal(); __resetClarifyCreditLocal()
  vi.stubGlobal('fetch', async (input: unknown) => { throw new Error('network disabled in this test: ' + String(input).slice(0, 60)) })
  for (const [k, v] of Object.entries({ TAPPY_AGENT: '2', CONSULTATIVE_IN_AGENT: '1', CONSULT_V2: '1', CONSULTATIVE_V1: '1', CONSULT_V3: '1' })) process.env[k] = v
})
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  for (const k of ['TAPPY_AGENT', 'CONSULTATIVE_IN_AGENT', 'CONSULT_V2', 'CONSULTATIVE_V1', 'CONSULT_V3']) delete process.env[k]
})

describe('Q-02 X3 · a granted external URL, through the server egress, rendered by the client', () => {
  it('the model writes the venue website (granted) inside a citation label: nothing executable reaches the rendered DOM', async () => {
    const label = `quán https://evil.example/a/onmouseover=${INERT}`
    h.state.steps = [
      { text: '[TAPPY_TASK]{"kind":"place_find","constraints":[],"servings":null,"missing":[]}[/TAPPY_TASK]', toolCalls: [{ toolCallId: 'c1', toolName: 'search_places', args: { query: 'quán ăn', location: 'Quận 1' } }] },
      { text: `Bạn thử **Quán Mẫu** ở 1 Lê Lợi, Quận 1 ([${label}](${EVIL_SITE})).`, toolCalls: [] },
    ]
    const req = {
      url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
      headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web', 'x-tappy-age-declared': '18plus' }),
      json: () => Promise.resolve({ messages: [{ role: 'user', content: 'quán ăn ngon quận 1' }] }), signal: undefined,
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = await (await POST(req as never)).text()
    log.mockRestore(); warn.mockRestore()
    const sent = textOf(body)
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_CONSULT_V3', '1')
    const { formatMessage } = await import('@/components/ChatInterface')
    const root = parse(formatMessage(sent))
    // the granted prefix survives the server egress (that is the case under test), and the rendered DOM must still carry no handler
    expect(sent).toContain(`https://evil.example/a/onmouseover=${INERT}`)
    expect(foreignHandlers(root)).toEqual([])
  })
})
