// Who the person is (14/11/2026): work / projects / goals, in the user's own words, behind the person-model flag, rendered apart from tastes, never a sensitive category by prompt.
import { describe, it, expect, vi } from 'vitest'

const generate = vi.fn()
vi.mock('@/lib/ai/llm', () => ({ AI: { generate: (o: unknown) => generate(o) } }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }))

import { personFactsOf, personLine, isPersonKey, PERSON_KEYS, PERSON_CAP } from './personFacts'
import { buildMemoryBlock, extractMemoryFromConversation, type UserMemory } from './memoryService'
import { buildConsultativeMemoryBlock } from '@/lib/ai/consultative/memoryBlock'
import { filterTransientMemory } from '@/lib/ai/consultative/memoryTransientFilter'
import { sanitizeMemoryPatch } from './memoryContract'
import { FENCE_OPEN, FENCE_CLOSE } from '@/lib/ai/security/fence'

const mem = (preferences: UserMemory['preferences']): UserMemory => ({ location_base: null, preferences, budget: {}, history: [] })

describe('personFactsOf / personLine', () => {
  it('newest PERSON_CAP per key, deduplicated, clipped; junk ignored', () => {
    const f = personFactsOf({ work: ['a', 'b', 'c', 'd', 'D', '  '], projects: [42, null, 'x'.repeat(200)], goals: 'not a list', food: ['phở'] })
    expect(f.work).toEqual(['b', 'c', 'd'].slice(-PERSON_CAP))
    expect(f.projects?.[0].length).toBeLessThanOrEqual(60)
    expect(f.goals).toBeUndefined()
    expect(personFactsOf(null)).toEqual({})
  })
  it('one line, in the order work / projects / goals; null when there is nothing', () => {
    expect(personLine({ goals: ['mở chi nhánh'], work: ['mở quán cafe'] })).toBe('- Ve nguoi dung (ho tu noi): cong viec / linh vuc: mở quán cafe; muc tieu: mở chi nhánh')
    expect(personLine({ food: ['phở'] })).toBeNull()
  })
  it('the three keys are the only person keys', () => {
    expect([...PERSON_KEYS]).toEqual(['work', 'projects', 'goals'])
    expect(isPersonKey('work')).toBe(true)
    expect(isPersonKey('food')).toBe(false)
  })
})

describe('rendering', () => {
  const m = mem({ food: ['phở'], work: ['mở quán cafe'], projects: ['đang làm app đặt bàn'] })
  it('both blocks carry the person line, and the consultative one does not read work as a taste', () => {
    for (const block of [buildMemoryBlock(m), buildConsultativeMemoryBlock(m)]) {
      expect(block).toContain('Ve nguoi dung (ho tu noi): cong viec / linh vuc: mở quán cafe; dang lam: đang làm app đặt bàn')
    }
    const consult = buildConsultativeMemoryBlock(m)
    expect(consult).toContain('So thich da noi ro: an uong: phở')
    expect(consult).not.toMatch(/So thich da noi ro:[^\n]*(work|mở quán)/)
  })
  it('the person line is not scoped away by the turn domain (what someone does bears on every choice)', () => {
    expect(buildConsultativeMemoryBlock(m, null, { domains: ['spa'] })).toContain('Ve nguoi dung')
  })
  it('a lookup that only needs the place or the date does not carry the person (weather, gold)', () => {
    expect(buildMemoryBlock(mem({ work: ['x'] }), 'get_weather')).toBe('')
    expect(buildConsultativeMemoryBlock(mem({ work: ['x'] }), 'get_gold_price')).toBe('')
  })
  it('the person values are fenced as untrusted with the rest of the block', () => {
    for (const block of [buildMemoryBlock(m), buildConsultativeMemoryBlock(m)]) {
      const fenced = block.slice(block.indexOf(FENCE_OPEN), block.lastIndexOf(FENCE_CLOSE) + 1)
      expect(fenced).toContain('Ve nguoi dung (ho tu noi)')
    }
  })
})

describe('the write boundary already holds them (no schema change)', () => {
  it('work / projects / goals survive the contract as preference lists and are bounded like any preference', () => {
    const p = sanitizeMemoryPatch({ preferences: { work: ['mở quán cafe'], projects: ['a'.repeat(500)], goals: [] } })
    expect(p.preferences?.work).toEqual(['mở quán cafe'])
    expect(p.preferences?.projects?.[0].length).toBeLessThanOrEqual(60)
  })
})

describe('the transient filter', () => {
  const said = ['mình mở quán cafe, đang làm app đặt bàn, tối nay đi ăn đâu']
  const extracted = { preferences: { work: ['mở quán cafe'], projects: ['đang làm app đặt bàn', 'xong việc tối nay'], goals: ['mở chi nhánh'], food: ['bún bò'] } } as Partial<UserMemory>
  it('with the person model: work / projects / goals stay without a habit marker; one with a transient word goes; a search-subject taste still goes', () => {
    const { memory } = filterTransientMemory(extracted, said, { keepPerson: true })
    expect(memory.preferences).toEqual({ work: ['mở quán cafe'], projects: ['đang làm app đặt bàn'], goals: ['mở chi nhánh'] })
  })
  it('without it: they are dropped like any non-habitual preference (the flag-off behaviour)', () => {
    const { memory } = filterTransientMemory(extracted, said, {})
    expect(memory.preferences).toBeUndefined()
  })
})

describe('the extraction prompt', () => {
  const ask = async (person?: boolean) => {
    generate.mockResolvedValueOnce({ text: '{}', usage: { promptTokens: 1, completionTokens: 1 } })
    await extractMemoryFromConversation([{ role: 'user', content: 'mình mở quán cafe nhỏ ở quận 3' }], null, person ? { person: true } : {})
    return String((generate.mock.calls.at(-1)![0] as { prompt: string }).prompt)
  }
  it('asks for work / projects / goals only when the person model is on, and names what is never recorded', async () => {
    const on = await ask(true)
    expect(on).toContain('"work"')
    expect(on).toContain('"projects"')
    expect(on).toContain('"goals"')
    expect(on).toMatch(/suc khoe/)
    expect(on).toMatch(/CHI khi user TU NOI ve CHINH HO/)
  })
  it('flag off: the prompt is exactly the one before this change (no person key, no person rule)', async () => {
    const off = await ask(false)
    expect(off).not.toContain('"work"')
    expect(off).not.toContain('"goals"')
    expect(off).not.toContain('TU NOI ve CHINH HO')
  })
})
