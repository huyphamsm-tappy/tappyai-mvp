// ── Architecture freeze 02/11/2026 (owner: "đóng băng kiến trúc hiện tại") ─────────────────────────────────────────────────────────────
//
// The frozen shape of the one-brain chat is written in docs/architecture/ONE-BRAIN-FREEZE-20261102.md. This test pins the numbers and
// switches that shape rests on. A red line here is not a test to update: changing one of these values is an architecture change, and it
// needs the owner's approval and a new dated entry in that document first.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readChatMode } from '@/lib/ai/security/clientInput'
import { tierOf, modeForTier, DEEP_RESEARCH_MONTHLY } from '@/lib/plans/tiers'
import { SALE_PLAN_IDS } from '@/lib/plans/planConfig'
import { ONE_BRAIN_MAX_STEPS, ONE_BRAIN_MAX_TOKENS, CHAT_SEARCH_BUDGET, ONE_BRAIN_MODE_LINES, PRESENT_PLAN_DESCRIPTION } from './oneBrain'
import { DEEP_RESEARCH_LIMITS } from '@/lib/ai/research/deepResearch'
import { isAiProductSource } from '@/lib/security/aiSourcePolicy'
import { guardPlaceGeography } from '@/lib/ai/tools/placeGeoGuard'
import { guardPlanItems, CHECK_HOURS_AND_FEES } from '@/lib/ai/planItemGuard'

const ROUTE = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
const FREEZE_DOC = readFileSync(join(process.cwd(), 'docs/architecture/ONE-BRAIN-FREEZE-20261102.md'), 'utf8')

describe('architecture freeze 02/11/2026', () => {
  it('the freeze document exists and names this test', () => {
    expect(FREEZE_DOC).toContain('architectureFreeze.test.ts')
  })
  it('modes: five, read from the request; absent or unknown is Chat (old clients and the apps)', () => {
    for (const m of ['chat', 'web', 'think', 'deep', 'auto']) expect(readChatMode({ mode: m })).toBe(m)
    expect(readChatMode({})).toBe('chat')
    expect(readChatMode({ mode: 'turbo' })).toBe('chat')
    expect(Object.keys(ONE_BRAIN_MODE_LINES).sort()).toEqual(['auto', 'chat', 'think', 'web'])
  })
  it('tiers: Pip (Free) runs Chat only; every paid plan has every mode; Deep Research 0 / 10 / 69 a month', () => {
    for (const m of ['web', 'think', 'deep', 'auto'] as const) expect(modeForTier(m, 'free')).toBe('chat')
    for (const m of ['chat', 'web', 'think', 'deep', 'auto'] as const) { expect(modeForTier(m, 'pro')).toBe(m); expect(modeForTier(m, 'promax')).toBe(m) }
    expect([tierOf(null), tierOf('guest'), tierOf('pip'), tierOf('coco'), tierOf('milo'), tierOf('promax1m'), tierOf('promax3m')]).toEqual(['free', 'free', 'pro', 'pro', 'pro', 'promax', 'promax'])
    expect(DEEP_RESEARCH_MONTHLY).toEqual({ free: 0, pro: 10, promax: 69 })
    expect([...SALE_PLAN_IDS]).toEqual(['pip', 'momo', 'coco', 'promax1m', 'promax3m'])
  })
  it('one brain: 8 steps, 4000 output tokens; Chat lookups quick 1 / thorough 3', () => {
    expect([ONE_BRAIN_MAX_STEPS, ONE_BRAIN_MAX_TOKENS]).toEqual([8, 4000])
    expect(CHAT_SEARCH_BUDGET).toEqual({ quick: { searches: 1, reads: 1, followUp: false }, thorough: { searches: 3, reads: 3, followUp: true } })
  })
  it('time: 300 s only for Deep Research (research 120 s, writing stops at 270 s); every other answer ends at the 110 s turn deadline', () => {
    expect(ROUTE).toContain('export const maxDuration = 300')
    expect(ROUTE).toContain('const TURN_DEADLINE_MS = 110_000')
    expect(ROUTE).toContain('abortSignal: turnSignal(req.signal, startTime, TURN_DEADLINE_MS),')
    expect([DEEP_RESEARCH_LIMITS.researchDeadlineMs, DEEP_RESEARCH_LIMITS.runDeadlineMs]).toEqual([120_000, 270_000])
  })
  it('Auto: the model\'s own think_deeper call is the only switch to thinking (no keyword decides it)', () => {
    expect(ROUTE).toContain("chatMode === 'auto'")
    expect(ROUTE).toContain('think_deeper')
    expect(ROUTE).toContain('...(oneBrain && chatMode === \'auto\' ? { autoThink } : {})')
  })
})

// ── Architecture freeze, second (owner: "đóng băng kiến trúc web sau khi fix bugs") ────────────────────────────────────────────────────
// The four rules added after the first freeze, written in section 5 of the same document. Same rule: a red line is an architecture change.
describe('architecture freeze, second (after the review of 01/11)', () => {
  it('sources: no AI product\'s page is read, listed or cited; the policy wraps every chat tool before the web ticket wrapper', () => {
    expect(isAiProductSource('https://ai-hay.vn/x')).toBe(true)
    expect(isAiProductSource('https://www.google.com/url?q=https://chatgpt.com/share/x')).toBe(true)
    expect(isAiProductSource('https://vi.wikipedia.org/wiki/Quang_Trung')).toBe(false)
    expect(ROUTE.indexOf('wrapToolsWithoutAiSources(tools')).toBeGreaterThan(0)
    expect(ROUTE.indexOf('wrapToolsWithTurnWebTicket(tools')).toBeGreaterThan(ROUTE.indexOf('wrapToolsWithoutAiSources(tools'))
  })
  it('places abroad: a search centred abroad keeps the rows near its centre; one about Việt Nam still drops rows outside it', () => {
    const near = { name: 'A', address: 'Jl. X, Bali, Indonesia', lat: -8.8, lng: 115.2 }
    const far = { name: 'B', address: '1 Main St, Omaha, NE 68144', lat: 41.2, lng: -96.1 }
    const abroad = guardPlaceGeography({ results: [near, far], centre_abroad: { lat: -8.8, lng: 115.22 } }, 'Bali, Indonesia')
    expect((abroad.result as { results: Array<{ name: string }> }).results.map(r => r.name)).toEqual(['A'])
    const home = guardPlaceGeography({ results: [near] }, 'Quận 1, TP.HCM')
    expect(home.dropped).toEqual([{ name: 'A', reason: 'foreign' }])
  })
  it('plan card: present_plan is described by principle (oneBrain.ts), a sight keeps the model\'s words, the hours/fees line is one tip per plan', () => {
    expect(ROUTE).toContain('description: PRESENT_PLAN_DESCRIPTION')
    expect(PRESENT_PLAN_DESCRIPTION).toMatch(/theme/i)
    const plan = `x [TAPPY_PLAN]${JSON.stringify({ type: 'trip', title: 'T', days: [{ label: 'Ngày 1', items: [1, 2].map(n => ({ time: '10:00', category: 'attraction', name: `Điểm ${n}`, description: 'Ngắm cảnh đẹp, mở cửa 07:00, vé 30.000đ' })) }] })}[/TAPPY_PLAN]`
    const out = JSON.parse((s => s.slice(s.indexOf('[TAPPY_PLAN]') + 12, s.indexOf('[/TAPPY_PLAN]')))(guardPlanItems(plan, [], { destination: 'Đà Nẵng', keepSights: true, knownSightsUnlabelled: true }).text))
    expect(out.days[0].items.map((i: { description: string }) => i.description)).toEqual(['Ngắm cảnh đẹp', 'Ngắm cảnh đẹp'])
    expect(out.local_tips.filter((t: { text: string }) => t.text === CHECK_HOURS_AND_FEES)).toHaveLength(1)
  })
  it('Deep Research quota: given back when the person leaves before any report text, not after it started streaming', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/ai/research/deepResearchResponse.ts'), 'utf8')
    expect(src).toContain("if (out.failed === 'client_gone') { if (chars === 0)")
  })
  it('the freeze document has its second section', () => {
    expect(FREEZE_DOC).toContain('## 5. Đóng băng lần 2')
  })
})
