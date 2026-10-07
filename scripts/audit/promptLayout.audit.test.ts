/**
 * AUDIT — where each instruction sits in the system prompt the route actually sends. No LLM.
 * Runs the real POST handler with the model mocked (same harness as consultativeV1.route.test.ts),
 * CONSULTATIVE_V1=1, and records for a few eval queries: segment sizes (shared / dynamic), the
 * block headers in order with their offsets, the offsets of the ask/clarify/search directives
 * (item V / item 7 input), and the ≈token count (chars/3.6, the ratio measured on this prompt).
 * Output: docs/audit/prompt-layout-<date>.json. Run: AUDIT_PROMPT_LAYOUT=1 npx vitest run scripts/audit/promptLayout.audit.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { __resetAiQuestionQuotaLocal } from '@/lib/ai/quota/aiQuestionQuota'

const h = vi.hoisted(() => {
  const state = { streamOptions: null as Record<string, unknown> | null }
  const builder = (): any => {
    const b: any = {
      select: () => b, in: () => b, or: () => b, order: () => b, limit: () => b,
      gte: () => b, lt: () => b, not: () => b, is: () => b, eq: () => b,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
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
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: { id: 'u1' }, supabase: h.client }) }))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), dailyRateLimit: () => ({ ok: true }), clientIp: () => '127.0.0.1' }))
vi.mock('@/lib/ai/llm', () => ({
  AI: {
    isConfigured: () => true,
    stream: (opts: Record<string, unknown>) => { h.state.streamOptions = opts; return { toDataStreamResponse: () => new Response('', { status: 200 }) } },
    generate: () => Promise.resolve({ text: '' }),
    vision: () => Promise.resolve({ text: '' }),
  },
  type: {},
}))

import { POST } from '@/app/api/chat/route'

const QUERIES: Record<string, string> = {
  F8: 'Sinh nhật sếp, tiếp khách 8 người, phòng riêng, tầm 500k/người, Quận 1',
  F7: 'ăn gì ngon giờ',
  T5: 'đi chơi ở đâu',
  S2: 'mua laptop van phong duoi 15tr',
  S6: 'mua gì bây giờ',
  T2: 'khach san da nang gan bien duoi 1tr/dem',
  E1: 'Tối nay đi chơi gì với hội bạn 5 người ở Quận 1',
  HI: 'xin chào',
}
const DIRECTIVES: Array<[string, RegExp]> = [
  ['R7 ladder (a)(b)(c)', /R7: QUYET DINH TRA LOI THE NAO/],
  ['R7(c) thieu thong tin quyet dinh → hoi', /\(c\) THIEU THONG TIN QUYET DINH/],
  ['R7 LUAT CUNG toi da mot cau hoi', /LUAT CUNG: TOI DA MOT cau hoi/],
  ['R4 ket thuc bang khuyen nghi', /R4: KET THUC REPLY BANG KHUYEN NGHI/],
  ['KHONG HOI "ban muon an loai gi" (rulebook)', /KHONG HOI "ban muon an loai gi/],
  ['relaxation: HOI user chon option TRUOC KHI de xuat', /HOI user chon option nao TRUOC KHI de xuat/],
  ['pre-send: TOI DA MOT dau hoi', /TRUOC KHI GUI - KIEM TRA CAU CUOI/],
  ['decisionFrame THIEU (clarify) — KHONG tim kiem truoc khi biet', /THIEU: (?:khu vuc|user chua noi)/],
  ['decisionFrame DU DE GOI Y — KHONG hoi truoc', /DU DE GOI Y: KHONG hoi truoc/],
  ['V1 BUOC 1 (search-now, top of block)', /===== BUOC 1 CUA LUOT NAY/],
  ['V1 LENH LUOT NAY (search-now, bottom of block)', /- LENH LUOT NAY \(bat buoc/],
  ['V1 rule 4 gia su, KHONG hoi', /^4\. Neu co gia su/m],
  ['V1 rule 5 TOI DA 1 cau hoi', /^5\. TOI DA 1 cau hoi/m],
  ['V1 BANG CHUNG THIEU line (dead: gaps always [])', /- BANG CHUNG THIEU:/],
  ['memory block: KHONG BAO GIO hoi lai', /KHONG BAO GIO hoi lai vi thong tin tren/],
  ['legacy memory block: hoi lai mot cau ngan TRUOC KHI tim kiem', /hoi lai mot cau ngan/],
  ['shopping pick: chi duoc hoi lai khi bang chung khong du', /Chi duoc hoi lai thay vi chon/],
]

const post = async (text: string) => {
  const req = {
    url: 'http://localhost/api/chat', nextUrl: new URL('http://localhost/api/chat'),
    headers: new Headers({ 'content-type': 'application/json', 'x-tappy-surface': 'web' }),
    json: () => Promise.resolve({ messages: [{ role: 'user', content: text }], userLocation: { lat: 10.7769, lng: 106.7009 } }),
    signal: undefined,
  }
  return POST(req as never)
}
const headers = (s: string) => [...s.matchAll(/^=====+\s*([^=\n][^\n]*?)\s*=*\s*$/gm)].map(m => ({ header: m[1].trim(), at: m.index ?? 0 })).filter(x => x.header)

beforeEach(() => { __resetAiQuestionQuotaLocal(); h.state.streamOptions = null; vi.stubEnv('CONSULTATIVE_V1', '1') })

describe('AUDIT — prompt layout (records only)', () => {
  it('records segment sizes, block order and directive offsets per query', async () => {
    if (!process.env.AUDIT_PROMPT_LAYOUT) return
    const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), flag: 'CONSULTATIVE_V1=1', queries: {} }
    for (const [id, text] of Object.entries(QUERIES)) {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      h.state.streamOptions = null
      await post(text)
      vi.restoreAllMocks()
      if (!h.state.streamOptions) { (out.queries as Record<string, unknown>)[id] = { text, modelled: false, note: 'server-authored turn (canned / clarify gate) — no prompt' }; continue }
      const o = (h.state.streamOptions ?? {}) as Record<string, unknown>
      const shared = String(o.systemShared ?? '')
      const dyn = String(o.system ?? '')
      const full = shared + dyn
      const tools = Object.keys((o.tools as object) ?? {})
      if (id === 'F8' || id === 'S2') writeFileSync(join(process.cwd(), 'docs', 'audit', `prompt-dump-${id}.txt`), `<<<SHARED ${shared.length} chars>>>
${shared}
<<<DYNAMIC ${dyn.length} chars>>>
${dyn}`)
      const found = DIRECTIVES.map(([name, re]) => {
        const all = [...full.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].map(m => m.index ?? -1)
        return { name, count: all.length, offsets: all, segment: all.map(a => (a < shared.length ? 'shared' : 'dynamic')) }
      })
      ;(out.queries as Record<string, unknown>)[id] = {
        text, tools, sharedChars: shared.length, dynamicChars: dyn.length, totalChars: full.length, approxTokens: Math.round(full.length / 3.6),
        blocks: headers(full).map(b => ({ ...b, segment: b.at < shared.length ? 'shared' : 'dynamic' })),
        directives: found.filter(f => f.count > 0),
      }
    }
    const dir = join(process.cwd(), 'docs', 'audit')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `prompt-layout-${new Date().toISOString().slice(0, 10)}.json`)
    writeFileSync(file, JSON.stringify(out, null, 2))
    expect(Object.keys(out.queries as object).length).toBe(Object.keys(QUERIES).length)
  })
})
