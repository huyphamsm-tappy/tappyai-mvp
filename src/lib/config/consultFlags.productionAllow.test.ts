// 02/11 (owner: deploy the one brain to production, "deploy lên web"): the consult flags are code-locked OFF in a production runtime. The owner
// opens a flag there by NAME, in the CONSULT_PRODUCTION_ALLOW variable, and sets the flag itself to "1". Nothing is open by default, so deploying
// this code changes no behaviour; taking a name out of the variable closes it again with no redeploy. The Parallel processor stays shut here
// until the privacy page decision (consultFlags.ts note on CONSULT_PARALLEL), whatever the variable says.
import { describe, it, expect } from 'vitest'
import {
  consultOneBrainOn, consultOneBrainMediaOn, consultUnwindS1aOn, consultSearchNowIntentGateOn, consultKnowledgeTurnToolsOn,
  consultAbortAbandonedFirstPartOn, consultTraceDiagnosticsOn, consultParallelOn, consultFinalWriteOn, capabilityLevel, productionAllows,
} from './consultFlags'

const PROD = { VERCEL_ENV: 'production', NODE_ENV: 'production' }
const ALL_ON = {
  CONSULT_ONE_BRAIN: '1', CONSULT_ONE_BRAIN_MEDIA: '1', CONSULT_UNWIND_S1A: '1', CONSULT_SEARCH_NOW_INTENT_GATE: '1',
  CONSULT_KNOWLEDGE_TURN_TOOLS: '1', CONSULT_ABORT_ABANDONED_FIRST_PART: '1', CONSULT_TRACE_DIAGNOSTICS: '1', CONSULT_FINAL_SYNTHESIS: '1',
  CONSULT_PARALLEL: '1', PARALLEL_API_KEY: 'x', CONSULT_CAPABILITY_LEVEL: '2',
}

describe('production lock with no allow list (today\'s behaviour, unchanged)', () => {
  it('every consult flag is off in a production runtime, however it is set', () => {
    const env = { ...PROD, ...ALL_ON }
    for (const f of [consultOneBrainOn, consultOneBrainMediaOn, consultUnwindS1aOn, consultSearchNowIntentGateOn, consultKnowledgeTurnToolsOn,
      consultAbortAbandonedFirstPartOn, consultTraceDiagnosticsOn, consultParallelOn, consultFinalWriteOn]) expect(f(env)).toBe(false)
    expect(capabilityLevel(env)).toBe(0)
  })
  it('outside production they follow their own value, as before', () => {
    expect(consultOneBrainOn({ CONSULT_ONE_BRAIN: '1' })).toBe(true)
    expect(consultOneBrainOn({ CONSULT_ONE_BRAIN: 'true' })).toBe(false)
    expect(capabilityLevel({ CONSULT_CAPABILITY_LEVEL: '2' })).toBe(2)
  })
})

describe('CONSULT_PRODUCTION_ALLOW opens a flag in production by name', () => {
  it('a listed flag that is also set to 1 is on; an unlisted one stays off', () => {
    const env = { ...PROD, ...ALL_ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN, CONSULT_UNWIND_S1A' }
    expect(consultOneBrainOn(env)).toBe(true)
    expect(consultUnwindS1aOn(env)).toBe(true)
    expect(consultOneBrainMediaOn(env)).toBe(false)
    expect(consultTraceDiagnosticsOn(env)).toBe(false)
    expect(consultSearchNowIntentGateOn(env)).toBe(false)
  })
  it('the list alone turns nothing on: the flag itself must be exactly "1"', () => {
    expect(consultOneBrainOn({ ...PROD, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN' })).toBe(false)
    expect(consultOneBrainOn({ ...PROD, CONSULT_ONE_BRAIN: 'yes', CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN' })).toBe(false)
  })
  it('names are exact: no wildcard, no prefix, no other case; commas or spaces separate; junk is ignored', () => {
    const env = { ...PROD, ...ALL_ON }
    for (const list of ['*', 'CONSULT_*', 'consult_one_brain', 'CONSULT_ONE_BRAIN_MEDIAX', 'CONSULT_ONE', '', '  ,, ']) {
      expect(consultOneBrainOn({ ...env, CONSULT_PRODUCTION_ALLOW: list })).toBe(false)
    }
    expect(consultOneBrainOn({ ...env, CONSULT_PRODUCTION_ALLOW: 'X;CONSULT_ONE_BRAIN' })).toBe(false)
    expect(consultOneBrainOn({ ...env, CONSULT_PRODUCTION_ALLOW: 'CONSULT_UNWIND_S1A  CONSULT_ONE_BRAIN\nCONSULT_X' })).toBe(true)
    expect(productionAllows({ CONSULT_PRODUCTION_ALLOW: 'A,B  C' }, 'B')).toBe(true)
    expect(productionAllows({}, 'B')).toBe(false)
  })
  it('flags that depend on another keep that dependency: the knowledge tools also need the search-now gate open', () => {
    const only = { ...PROD, ...ALL_ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_KNOWLEDGE_TURN_TOOLS' }
    expect(consultKnowledgeTurnToolsOn(only)).toBe(false)
    expect(consultKnowledgeTurnToolsOn({ ...only, CONSULT_PRODUCTION_ALLOW: 'CONSULT_KNOWLEDGE_TURN_TOOLS CONSULT_SEARCH_NOW_INTENT_GATE' })).toBe(true)
  })
  it('the final writing call and the capability level open by their own names', () => {
    expect(consultFinalWriteOn({ ...PROD, ...ALL_ON })).toBe(false)
    expect(consultFinalWriteOn({ ...PROD, ...ALL_ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_FINAL_SYNTHESIS' })).toBe(true)
    expect(capabilityLevel({ ...PROD, ...ALL_ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_CAPABILITY_LEVEL' })).toBe(2)
    expect(capabilityLevel({ ...PROD, ...ALL_ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN' })).toBe(0)
  })
  it('Parallel (a new data processor) never opens in production, even when listed and keyed', () => {
    expect(consultParallelOn({ ...PROD, ...ALL_ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_PARALLEL' })).toBe(false)
    expect(consultParallelOn({ CONSULT_PARALLEL: '1', PARALLEL_API_KEY: 'x' })).toBe(true)
  })
})
