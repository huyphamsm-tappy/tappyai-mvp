// Unwind step 4 (28/10/2026): the keyword tool reading becomes a hint (S4A); the intent layer gives a question asked to KNOW no domain,
// and its empty domain is not refilled from the rules (S4B). 4c (the price filter) is NOT done in this step (see the report).
// Every flag OFF = HEAD 7e60081.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { unwindToolHint } from './unwindWriting'
import { INTENT_SYSTEM, INTENT_SYSTEM_UNWIND, runLunaIntent } from './luna'
import { consultUnwindS4aOn, consultUnwindS4bOn, CONSULT_UNWIND_S4A_FLAG, CONSULT_UNWIND_S4B_FLAG } from '@/lib/config/consultFlags'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('step 4 flags: exactly "1", never in production', () => {
  for (const [name, on] of [[CONSULT_UNWIND_S4A_FLAG, consultUnwindS4aOn], [CONSULT_UNWIND_S4B_FLAG, consultUnwindS4bOn]] as const) {
    it(name, () => {
      expect(on({})).toBe(false)
      expect(on({ [name]: 'true' })).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      expect(on({ [name]: '1', NODE_ENV: 'production' })).toBe(false)
    })
  }
})

describe('S4A — the keyword tool reading decides nothing, the model gets a hint', () => {
  it('the hint names the tool and says it is not binding', () => {
    expect(unwindToolHint('search_places', 'vi')).toContain('khong bat buoc')
    expect(unwindToolHint('search_places', 'vi')).toContain('search_places')
  })
  it('route: every DECIDING reader gets forcedToolDecides; memory and logs keep forcedTool', () => {
    const src = read('src/app/api/chat/route.ts')
    expect(src).toContain('const forcedToolDecides = consultUnwindS4aOn() ? null : forcedTool')
    expect(src.match(/planningIntent, forcedTool: forcedToolDecides, movieRecommend \}\)/g)?.length).toBe(2)
    expect(src).toContain('    forcedTool: forcedToolDecides,\n    hasGps: !!userLocation,')
    expect(src).toContain('need: needProfile, forcedTool: forcedToolDecides, isFirstReply:')
    expect(src).toContain("|| (forcedToolDecides === 'search_places' && !searchGate?.blocked)")
    expect(src).not.toMatch(/planningIntent, forcedTool, movieRecommend/)
    expect(src).toContain('buildMemoryBlock(existingMemory, forcedTool,')
    expect(src).toContain("+ (consultUnwindS4aOn() && forcedTool ? unwindToolHint(forcedTool, lang) : '')")
  })
})

describe('S4B — a question asked to know has no domain', () => {
  it('the variant replaces exactly the one domain sentence; the rest is byte-identical', () => {
    expect(INTENT_SYSTEM_UNWIND).not.toBe(INTENT_SYSTEM)
    expect(INTENT_SYSTEM).toContain('domains = [] chỉ khi thật sự ngoài 5 mảng.')
    expect(INTENT_SYSTEM_UNWIND).not.toContain('domains = [] chỉ khi thật sự ngoài 5 mảng.')
    expect(INTENT_SYSTEM_UNWIND).toContain('Câu hỏi để BIẾT')
    const head = INTENT_SYSTEM.indexOf('Nhu cầu thuộc 5 mảng LUÔN')
    expect(INTENT_SYSTEM_UNWIND.slice(0, head)).toBe(INTENT_SYSTEM.slice(0, head))
  })

  const intent = { domains: [], turn: 'chat', goal: 'biết giá đất', known: [], party: null, budget_vnd_max: null, difficulty: 'normal', missing: [], assumptions: [], ask: null, query: null, area: null, refers: [], reject_reason: null }
  const fakeExtract = (seen: string[]) => (async (o: { systemShared: string }) => { seen.push(o.systemShared); return { object: intent } }) as never
  it('ON: the intent call reads the variant, and its empty domain is NOT refilled from the rules', async () => {
    const seen: string[] = []
    const r = await runLunaIntent(fakeExtract(seen), [{ role: 'user', content: 'giá đất chung cư ở quy nhơn bây giờ bao nhiêu 1 m' }], { hasGps: false, previousWasAsk: false, deterministicDomain: 'shopping', userTexts: [], knowledgeDomainless: true })
    expect(seen[0]).toBe(INTENT_SYSTEM_UNWIND)
    expect(r?.decision.domains).toEqual([])
  })
  it('OFF: the HEAD prompt, and the rules domain fills the empty one (HEAD)', async () => {
    const seen: string[] = []
    const r = await runLunaIntent(fakeExtract(seen), [{ role: 'user', content: 'giá đất chung cư ở quy nhơn bây giờ bao nhiêu 1 m' }], { hasGps: false, previousWasAsk: false, deterministicDomain: 'shopping', userTexts: [] })
    expect(seen[0]).toBe(INTENT_SYSTEM)
    expect(r?.decision.domains).toEqual(['shopping'])
  })
  it('route wiring', () => {
    expect(read('src/app/api/chat/route.ts')).toContain("...(consultUnwindS4bOn() ? { knowledgeDomainless: true } : {}) })")
  })
})
