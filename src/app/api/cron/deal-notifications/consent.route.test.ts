import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AI_DATA_CONSENT_VERSION } from '@/lib/ai/consent/aiDataConsent'
import { DEAL_NUDGE_TITLE } from '@/lib/i18n/backgroundNotices'

// The deal alert sends the user's preferences to the model. These tests pin the consent rule on the real route, by account state:
//   a  — used iOS and agreed to the current disclosure        → model, with the user's preferences
//   b  — used iOS and refused                                  → the first deal as it is written, no model, no preferences
//   c  — web-only (no iOS use recorded)                        → model, as before (existing behaviour kept)
//   d  — used iOS, has not answered the sheet                  → the first deal as it is written, no model, no preferences
// A read error on the consent table sends everyone the plain deal (fail closed).

const h = vi.hoisted(() => ({ consentError: false }))

const aiGenerate = vi.fn(async (_o: { prompt: string }) => ({ text: 'TITLE: 🛍️ Phở rẻ hôm nay\nBODY: Phở 50% nhé!' }))
const emit = vi.fn(async (_n: { userId: string; title: string; body: string }) => {})

const DEALS = [{ title: 'Phở 50% tại Bếp Nhà', category: 'food', description: 'Áp dụng cuối tuần' }]

vi.mock('@/lib/ai/llm', () => ({ AI: { generate: (o: { prompt: string }) => aiGenerate(o) } }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: (n: { userId: string; title: string; body: string }) => emit(n) }))
vi.mock('@/lib/notifications/send', () => ({ getAllSubscribedUserIds: async () => ['a', 'b', 'c', 'd'] }))
vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => true }))
vi.mock('@/lib/deals/partnerDeals', () => ({ getActiveDeals: async () => DEALS }))

// Account c has no consent row: it is web-only.
const ROWS: Record<string, Array<Record<string, unknown>>> = {
  user_preferences: [
    { user_id: 'a', preferences: ['phở bò'], cuisine_likes: [] },
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
          if (table === 'ai_data_consent' && h.consentError) {
            return Promise.resolve({ data: null, error: { code: 'PGRST301', message: 'db down' } }).then(resolve, reject)
          }
          const all = ROWS[table] ?? []
          const data = ids ? all.filter(r => (ids as string[]).includes(r.user_id as string)) : all
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return b
    },
  }),
}))

const PLAIN_BODY = `${DEALS[0].title} — ${DEALS[0].description}`

describe('cron/deal-notifications — consent by account state', () => {
  beforeEach(() => {
    aiGenerate.mockClear()
    emit.mockClear()
    h.consentError = false
  })

  async function run() {
    const { GET } = await import('@/app/api/cron/deal-notifications/route')
    const res = await GET(new Request('http://localhost/api/cron/deal-notifications'))
    expect(res.status).toBe(200)
    return res
  }

  it('the model is called only for the agreed account and the web-only account, with their preferences', async () => {
    await run()
    const prompts = aiGenerate.mock.calls.map(c => c[0].prompt).join('\n')
    expect(aiGenerate).toHaveBeenCalledTimes(2)
    expect(prompts).toContain('phở bò') // a: agreed
    expect(prompts).toContain('bánh xèo web') // c: web-only keeps the personalised deal
  })

  it('a refusing iOS account and an undecided iOS account never reach the model or get their preferences', async () => {
    await run()
    const prompts = aiGenerate.mock.calls.map(c => c[0].prompt).join('\n')
    expect(prompts).not.toContain('bún chả bí mật')
    expect(prompts).not.toContain('cơm hến ios chưa hỏi')
  })

  it('every account gets a notification; the blocked ones get the plain deal and the plain title, nothing personal', async () => {
    await run()
    expect(emit).toHaveBeenCalledTimes(4)
    for (const id of ['b', 'd']) {
      const sent = emit.mock.calls.find(c => c[0].userId === id)![0]
      expect(sent.title).toBe(DEAL_NUDGE_TITLE)
      expect(sent.body).toBe(PLAIN_BODY)
    }
  })

  it('a failed consent read sends everyone the plain deal and no model call (fail closed)', async () => {
    h.consentError = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await run()
    spy.mockRestore()
    expect(aiGenerate).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledTimes(4)
    for (const call of emit.mock.calls) expect(call[0].body).toBe(PLAIN_BODY)
  })
})
