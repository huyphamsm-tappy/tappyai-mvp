// Security audit 04/11 (D-09): the daily ceiling for Deep Research across every account.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globalDeepDailyLimit, withinGlobalDeepCeiling, GLOBAL_DEEP_DAILY_DEFAULT } from './globalCeiling'

describe('globalDeepDailyLimit', () => {
  it('defaults to 300, and AI_GLOBAL_DEEP_DAILY overrides it only with a positive number', () => {
    expect(GLOBAL_DEEP_DAILY_DEFAULT).toBe(300)
    expect(globalDeepDailyLimit({} as NodeJS.ProcessEnv)).toBe(300)
    expect(globalDeepDailyLimit({ AI_GLOBAL_DEEP_DAILY: '40' } as unknown as NodeJS.ProcessEnv)).toBe(40)
    for (const bad of ['0', '-3', 'abc', '']) expect(globalDeepDailyLimit({ AI_GLOBAL_DEEP_DAILY: bad } as unknown as NodeJS.ProcessEnv)).toBe(300)
  })
})

describe('withinGlobalDeepCeiling (in-process store)', () => {
  beforeEach(() => { process.env.AI_GLOBAL_DEEP_DAILY = '3' })
  it('admits the first runs of the day and refuses the next', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) results.push(await withinGlobalDeepCeiling())
    // another test file in this process may already have counted; the property is "never more than the ceiling admitted"
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(3)
    expect(results[results.length - 1]).toBe(false)
  })
})

describe('the chat route checks the ceiling before the per-account meter', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')
  it('wires withinGlobalDeepCeiling inside the Deep Research block, ahead of consumeDeepResearch', () => {
    const block = route.slice(route.indexOf("if (oneBrain && chatMode === 'deep') {"))
    expect(block.indexOf('withinGlobalDeepCeiling()')).toBeGreaterThan(0)
    expect(block.indexOf('withinGlobalDeepCeiling()')).toBeLessThan(block.indexOf('consumeDeepResearch('))
  })
})
