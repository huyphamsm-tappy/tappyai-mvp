import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { planPresearch, planFlightPresearch } from './presearch'
import { deriveSituation } from './situationFrame'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Phase 8 orchestration fix A — LEGACY PATH: NOTHING IS SEARCHED BEFORE THE ASK / BEFORE A NO-TOOL TURN.
//
// The audit suspected the legacy route ran `preCall` / trip-prefetch before the turn could clarify. Reading the route
// shows the opposite ORDER (measured, not assumed): the canned ask / clarify / chit-chat reply returns BEFORE any pre-call
// is built, a no-tool turn (chit-chat, confirmation, follow-up on a shown card) has no `tools` object at all, and the
// agent runtimes null the consult decision so none of the consult pre-calls exist. These tests pin that order and the
// pure planners' refusals, so a later edit cannot reintroduce a search-first turn. No network, no model.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
const at = (needle: string | RegExp): number => {
  const i = typeof needle === 'string' ? route.indexOf(needle) : route.search(needle)
  expect(i, String(needle)).toBeGreaterThan(-1)
  return i
}

describe('legacy route order — a canned ask / clarify returns before ANY pre-call is built', () => {
  it('the canned reply block returns before preCall, eveningSearches and the trip prefetch exist', () => {
    const canned = at('const canned = agentOn ?')
    const cannedReturn = at('if (!consult || !cannedRes.body) return cannedRes')
    expect(canned).toBeLessThan(cannedReturn)
    for (const later of ['const preCall:', 'const eveningSearches =', 'const consultTripPrefetch =', 'let presearchOutcome']) {
      expect(cannedReturn, later).toBeLessThan(at(later))
    }
  })

  it('the canned reply covers the consult ask, the clarify gate and chit-chat (all sent with zero Serper calls)', () => {
    const line = route.slice(at('const canned = agentOn ?'), at('const canned = agentOn ?') + 260)
    expect(line).toContain('consultAskReply')
    expect(line).toContain('clarifyGate?.reply')
    expect(line).toContain('cannedEarly')
    expect(route.slice(at('const cannedRes = cannedDataStreamResponse'), at('const cannedRes = cannedDataStreamResponse') + 900)).toContain('serperCalls: 0')
  })

  it('a no-tool turn (chit-chat, confirmation, follow-up/compare on a shown card) gets no tools, so no pre-call can run', () => {
    expect(route).toMatch(/const noToolTurn = !clipContext && \(intent === 'chitchat' \|\| decisionStage === 'confirmation' \|\| \(\(consult\?\.turn === 'followup' \|\| consult\?\.turn === 'compare'\) && !consultFollowReuse\)\)/)
    expect(route).toContain('const tools = noToolTurn && !agentOn ? undefined :')
    const toolExecutes = route.slice(at('const toolExecutes ='), at('const toolExecutes =') + 200)
    expect(toolExecutes).toContain('typeof (tools as Record<string, { execute?: unknown }> | undefined)?.[name]?.execute')
    expect(route).toContain('const willPresearch = !!(!noToolTurn && tools && preCall) || eveningSearches || (consultTripPrefetch && !!tools)')
    expect(route).toContain('const eveningSearches = !agentOn && eveningFrame && !noToolTurn')
  })

  it('the agent runtimes have no consult decision, so no consult-derived pre-call or prefetch can exist', () => {
    expect(route).toMatch(/const consult = agentOn \? null :/)
    expect(route).toContain('const consultTripPrefetch = !!consult &&')
    expect(route).toContain("let presearchPlan = consultativeV1 && !agentOn ? planPresearch(")
    expect(route).toContain('const flightPresearch = consultativeV1 && !agentOn &&')
  })
})

describe('the pure pre-search planners refuse anything that is not an exact, complete directive', () => {
  const need = { budget: null as never, location: { text: 'Quận 1', gps: null } }
  const s = deriveSituation(['ăn gì ngon giờ — dưới 100k/người'], need, { hasGps: true })

  it('no directive (an ask turn has none) → no search', () => {
    expect(planPresearch(null, s)).toBeNull()
    expect(planPresearch({ query: '', type: 'restaurant', exact: true }, s)).toBeNull()
  })

  it('a suggestion the model should sharpen is NOT pre-searched when the query loses part of the request', () => {
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: false }, s, { userText: 'tìm quán Nhật omakase' })).toBeNull()
  })

  it('plan / clip / movie turns never pre-search a place, and a flight needs two named airports', () => {
    expect(planPresearch({ query: 'quán ăn ngon', type: 'restaurant', exact: true }, s, { planning: true })).toBeNull()
    expect(planFlightPresearch({ query: 'vé máy bay', type: 'flight', exact: true }, 'cho mình hỏi vé máy bay rẻ', new Date('2026-10-09T00:00:00Z'))).toBeNull()
    expect(planFlightPresearch({ query: 'vé máy bay', type: 'flight', exact: true }, 'vé máy bay Hà Nội Đà Nẵng', new Date('2026-10-09T00:00:00Z'), { planning: true })).toBeNull()
  })

  it('a complete exact directive still works (the old flow is unchanged)', () => {
    const plan = planPresearch({ query: 'quán ăn tối ngon', type: 'restaurant', exact: true }, s)
    expect(plan).toMatchObject({ toolName: 'search_places', exact: true, args: { query: 'quán ăn tối ngon', type: 'restaurant', location: 'Quận 1' } })
    expect(planFlightPresearch({ query: 'vé máy bay', type: 'flight', exact: true }, 'vé máy bay Hà Nội Đà Nẵng 20/10', new Date('2026-10-09T00:00:00Z'))).toMatchObject({ toolName: 'get_flight_prices', args: { departDate: '2026-10-20' } })
  })
})
