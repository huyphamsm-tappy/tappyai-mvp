import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'
import { WEEKLY_NUDGE } from '@/lib/i18n/backgroundNotices'

// The weekly recap sends memory (places, topics, companions, preferences) to the model. These tests pin the consent rule on
// the real route, by account state:
//   a  — used iOS and agreed to the current disclosure        → model, with memory
//   b  — used iOS and refused                                  → the plain weekly nudge, no model, no memory
//   c  — web-only (no iOS use recorded)                        → model, as before (existing behaviour kept)
//   d  — used iOS, has not answered the sheet                  → the plain weekly nudge, no model, no memory
// Every account is active (3 conversations in the last 7 days), so the consent rule decides what each one gets.

const aiGenerate = vi.fn(async (_o: { prompt: string }) => ({ text: 'TITLE: 🎉 3 lần cùng Tappy\nBODY: Tuần tới thử món mới nhé?' }))
const emit = vi.fn(async (_n: { userId: string; title: string; body: string }) => {})

vi.mock('@/lib/ai/llm', () => ({ AI: { generate: (o: { prompt: string }) => aiGenerate(o) } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: (n: { userId: string; title: string; body: string }) => emit(n) }))
vi.mock('@/lib/notifications/send', () => ({ getAllSubscribedUserIds: async () => ['a', 'b', 'c', 'd'] }))
vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => true }))
vi.mock('@/lib/memory/memoryService', () => ({
  getMemoryBatch: async (ids: string[]) =>
    new Map(ids.map(id => [id, ({
      a: { discovery_city: 'Đà Lạt', history: ['chợ đêm Đà Lạt'], companions: 'bạn gái', preferences: { food: ['lẩu'] } },
      b: { discovery_city: 'Hà Nội', history: ['phố cổ Hà Nội bí mật'], companions: 'mẹ tôi', preferences: { food: ['bún chả'] } },
      c: { discovery_city: 'Đà Nẵng', history: ['bãi biển web'], companions: 'bạn web', preferences: { food: ['bánh xèo'] } },
      d: { discovery_city: 'Huế', history: ['cố đô ios chưa hỏi'], companions: 'đồng nghiệp', preferences: { food: ['cơm hến'] } },
    } as Record<string, unknown>)[id]])),
}))

// Every account has three conversations updated in the last seven days.
const ROWS: Record<string, Array<Record<string, unknown>>> = {
  conversations: ['a', 'b', 'c', 'd'].flatMap(id => [1, 2, 3].map(() => ({ user_id: id }))),
  ai_data_consent: [
    { user_id: 'a', ios_used: true, granted: true, decision: 'agreed', version: AI_DATA_CONSENT_VERSION },
    { user_id: 'b', ios_used: true, granted: false, decision: 'refused', version: AI_DATA_CONSENT_VERSION },
    { user_id: 'd', ios_used: true, granted: null, decision: null, version: null },
  ],
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      let ids: string[] | null = null
      const b = {
        select() { return b },
        in(_c: string, v: string[]) { ids = v; return b },
        gte() { return b },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          const all = ROWS[table] ?? []
          const data = ids ? all.filter(r => (ids as string[]).includes(r.user_id as string)) : all
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }),
}))

describe('cron/weekly-recap — consent by account state', () => {
  beforeEach(() => {
    aiGenerate.mockClear()
    emit.mockClear()
  })

  async function run() {
    const { GET } = await import('@/app/api/cron/weekly-recap/route')
    const res = await GET(new Request('http://localhost/api/cron/weekly-recap'))
    expect(res.status).toBe(200)
    return res
  }

  it('the model is called only for the agreed account and the web-only account, with their memory', async () => {
    await run()
    const prompts = aiGenerate.mock.calls.map(c => c[0].prompt).join('\n')
    expect(aiGenerate).toHaveBeenCalledTimes(2)
    expect(prompts).toContain('Đà Lạt') // a: agreed
    expect(prompts).toContain('chợ đêm Đà Lạt')
    expect(prompts).toContain('Đà Nẵng') // c: web-only keeps the personalised recap
  })

  it('a refusing iOS account and an undecided iOS account never reach the model or give their memory', async () => {
    await run()
    const prompts = aiGenerate.mock.calls.map(c => c[0].prompt).join('\n')
    for (const secret of ['Hà Nội', 'phố cổ Hà Nội bí mật', 'mẹ tôi', 'Huế', 'cố đô ios chưa hỏi', 'đồng nghiệp']) {
      expect(prompts).not.toContain(secret)
    }
  })

  it('every account gets a notification; the blocked ones get the plain weekly nudge with no memory', async () => {
    await run()
    expect(emit).toHaveBeenCalledTimes(4)
    for (const id of ['b', 'd']) {
      const sent = emit.mock.calls.find(c => c[0].userId === id)![0]
      expect(sent.title).toBe(WEEKLY_NUDGE.title)
      expect(sent.body).toBe(WEEKLY_NUDGE.body)
    }
  })
})
