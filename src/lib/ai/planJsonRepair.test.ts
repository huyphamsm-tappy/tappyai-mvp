import { describe, it, expect } from 'vitest'
import { repairPlanBlock } from './planJsonRepair'

describe('repairPlanBlock (R15)', () => {
  it('repairs the measured `{time":"10:00"` slip', () => {
    const bad = 'a\n[TAPPY_PLAN]\n{"type":"trip","days":[{"label":"Ngày 1","items":[{"time":"08:00","name":"A"},{time":"10:00","name":"B"}]}]}\n[/TAPPY_PLAN]\nb'
    const out = repairPlanBlock(bad)
    expect(out.repaired).toBe(true)
    const body = /\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/.exec(out.text)![1]
    expect(JSON.parse(body).days[0].items[1].time).toBe('10:00')
    expect(out.text.startsWith('a\n')).toBe(true)
    expect(out.text.endsWith('\nb')).toBe(true)
  })
  it('repairs unquoted keys and trailing commas; leaves valid or hopeless bodies alone', () => {
    expect(repairPlanBlock('[TAPPY_PLAN]{type: "trip", days: [],}[/TAPPY_PLAN]').repaired).toBe(true)
    const ok = '[TAPPY_PLAN]{"type":"trip"}[/TAPPY_PLAN]'
    expect(repairPlanBlock(ok)).toEqual({ text: ok, repaired: false })
    expect(repairPlanBlock('[TAPPY_PLAN]{"type":[/TAPPY_PLAN]').repaired).toBe(false)
  })
})
