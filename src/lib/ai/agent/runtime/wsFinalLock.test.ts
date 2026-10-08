// @vitest-environment node
// Phase 8 WS2 FINAL — architecture locks for the reliability closure.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
const GATE = code('src/lib/ai/noFabricationGate.ts')
const SE = read('src/lib/ai/streamEnrichment.ts')
const LOOP = code('src/lib/ai/agent/runtime/loop.ts')
const STATE = code('src/lib/ai/agent/runtime/toolState.ts')

describe('WS2 final lock · the No-Fabrication Gate is deterministic integrity, not a second brain', () => {
  it('pure: no model, no network, no tool, no ranking', () => {
    expect(GATE).not.toMatch(/from '@\/lib\/ai\/llm'|AI\.(step|stream|extract|generate)|fetch\(|serper|\.sort\(|score/i)
  })
  it('runs on the agent runtime only, after the specialised guards and before the M4 restore / code-written lines', () => {
    const at = SE.indexOf('const gate = collector?.semanticRanking')
    expect(at).toBeGreaterThan(SE.indexOf('const unsupported = (hadPlaceSearch'))
    expect(at).toBeLessThan(SE.indexOf('const evRestored = evShield.restore(gate ? gate.text : unsupported.text)'))
    expect(SE.indexOf('const evRestored')).toBeLessThan(SE.indexOf('appendPlanBudgetMath(planMask.restore(evRestored)'))
  })
  it('model memory is not evidence: the gate\'s evidence is tool results, pages, the DATA context, earlier replies and the user', () => {
    expect(SE).toMatch(/corpus: \[\.\.\.gateCorpus, \.\.\.\(collector\.gateContext \?\? \[\]\)/)
    expect(GATE).toMatch(/FABRICATED/)
  })
})

describe('WS2 final lock · tool failures are never evidence', () => {
  it('every tool result the model reads carries an explicit state', () => {
    expect(LOOP).toMatch(/const state = toolStateOf\(pl\.outcome, pl\.result\)\n\s*pl\.result = withToolState\(pl\.result, state, input\.lang\)/)
  })
  it('the product fallback is ONE public-web call, bounded by its own timeout, inside the same tool call (no retry loop)', () => {
    expect(STATE).toMatch(/PRODUCT_PROVIDER_TIMEOUT_MS = 8_000/)
    expect(STATE).not.toMatch(/while \(|for \(;;\)|retry/i)
    expect((STATE.match(/await webSearch\(/g) ?? []).length).toBe(1)
  })
})

describe('WS2 final lock · still one runtime, one brain', () => {
  it('no new loop, agent or model next to the runtime', () => {
    for (const f of ['src/lib/ai/noFabricationGate.ts', 'src/lib/ai/agent/runtime/toolState.ts', 'src/lib/ai/agent/runtime/claimConflict.ts']) {
      expect(code(f)).not.toMatch(/runAgentRuntime|startAgentTurn|maxSteps|AI\.step|generateText|streamText/)
    }
  })
  it('no legacy Consultative path is reintroduced on TAPPY_AGENT=2 (M7 gates intact)', () => {
    const route = read('src/app/api/chat/route.ts')
    expect(route).toMatch(/const lunaIntentRun = !agentOn && lunaOn/)
    expect(route).toMatch(/let presearchPlan = consultativeV1 && !agentOn \?/)
  })
})
