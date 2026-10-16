import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'

// The morning brief sends preferences, location and weather to the model. These tests pin the consent rule on the real
// route, per account and by state:
//   a  — used iOS and agreed to the current disclosure        → model
//   b  — used iOS and refused                                  → generic nudge, no model, no personal data
//   c  — web-only (no iOS use recorded)                        → model, as before (existing behaviour kept)
//   d  — used iOS, has not answered the sheet                  → generic nudge (never assumed agreed)

const aiGenerate = vi.fn(async (_o: { prompt: string }) => ({ text: 'TITLE: 🌞 Chào bạn\nBODY: Thử phở nhé!' }))
const emit = vi.fn(async (_n: { userId: string; title: string; body: string }) => {})

vi.mock('@/lib/ai/llm', () => ({ AI: { generate: (o: { prompt: string }) => aiGenerate(o) } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: (n: { userId: string; title: string; body: string }) => emit(n) }))
vi.mock('@/lib/notifications/send', () => ({ getAllSubscribedUserIds: async () => ['a', 'b', 'c', 'd'] }))
vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => true }))
vi.mock('@/lib/ai/tools/weather', () => ({ getWeather: async () => ({ error: 'off' }) }))
vi.mock('@/lib/memory/memoryService', () => ({
  getMemoryBatch: async (ids: string[]) =>
    new Map(ids.map(id => [id, { location_base: ({ a: 'Quận 1, TP.HCM', b: 'Hà Nội', c: 'Đà Nẵng', d: 'Huế' } as Record<string, string>)[id] }])),
}))

// The consent rows and preferences come from this fake table. Account c has no consent row: it is web-only.
const ROWS: Record<string, Array<Record<string, unknown>>> = {
  user_preferences: [
    { user_id: 'a', preferences: ['phở'], cuisine_likes: [] },
    { user_id: 'b', preferences: ['bún chả bí mật'], cuisine_likes: [] },
    { user_id: 'c', preferences: ['bánh xèo web'], cuisine_likes: [] },
    { user_id: 'd', preferences: ['cơm hến ios chưa hỏi'], cuisine_likes: [] },
  ],
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

const GENERIC_BODY = 'Mở Tappy để tìm điểm ăn uống hoặc vui chơi hôm nay nhé!'

describe('cron/morning-brief — consent by account state', () => {
  beforeEach(() => {
    aiGenerate.mockClear()
    emit.mockClear()
  })

  async function run() {
    const { GET } = await import('@/app/api/cron/morning-brief/route')
    const res = await GET(new Request('http://localhost/api/cron/morning-brief'))
    expect(res.status).toBe(200)
    return res
  }

  it('the model is called only for the agreed account and the web-only account', async () => {
    await run()
    const prompts = aiGenerate.mock.calls.map(c => c[0].prompt).join('\n')
    expect(aiGenerate).toHaveBeenCalledTimes(2)
    expect(prompts).toContain('Quận 1, TP.HCM') // a: agreed
    expect(prompts).toContain('phở')
    expect(prompts).toContain('Đà Nẵng') // c: web-only keeps the personalised brief
    expect(prompts).toContain('bánh xèo web')
  })

  it('a refusing iOS account and an undecided iOS account never reach the model', async () => {
    await run()
    const prompts = aiGenerate.mock.calls.map(c => c[0].prompt).join('\n')
    for (const secret of ['bún chả bí mật', 'Hà Nội', 'cơm hến ios chưa hỏi', 'Huế']) {
      expect(prompts).not.toContain(secret)
    }
  })

  it('every account still gets a notification; the blocked ones get the plain nudge with no personal content', async () => {
    await run()
    expect(emit).toHaveBeenCalledTimes(4)
    for (const id of ['b', 'd']) {
      const sent = emit.mock.calls.find(c => c[0].userId === id)![0]
      expect(sent.body).toBe(GENERIC_BODY)
      expect(sent.title).not.toMatch(/Hà Nội|Huế/)
    }
  })
})
