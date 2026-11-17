// CONSULT_PERSON_MODEL (14/11/2026): the durable memory of WHO the person is (style, company) was deleted unless the latest message alone carried a habit phrase a regex knows, and the extraction behind
// it rarely ran. This is an INPUT fix (what the product remembers), not a prompt: one flag, default OFF, locked in production, lifts the extraction gate on ordinary turns and keeps the WHO traits
// (style, company) while the transient things stay dropped. (The prompt texts that were first added to this flag were removed on 14/11: the investigation showed the model writes well when it has the inputs.)
// Flag off: every line below that says "unchanged" is the behaviour of the day before.
import { describe, it, expect } from 'vitest'
import { consultPersonModelOn, CONSULT_PERSON_MODEL_FLAG } from '@/lib/config/consultFlags'
import { filterTransientMemory } from './memoryTransientFilter'
import { shouldExtractMemory } from '@/lib/ai/memoryGate'
import { buildConsultativeMemoryBlock } from './memoryBlock'
import { oneBrainDynamic } from './oneBrain'
import type { UserMemory } from '@/lib/memory/memoryService'

const PROD = { VERCEL_ENV: 'production', NODE_ENV: 'production' }
const ON = { CONSULT_ONE_BRAIN: '1', CONSULT_PERSON_MODEL: '1' }

describe('the flag', () => {
  it('is off by default and for any value but exactly "1"; needs the one brain', () => {
    expect(CONSULT_PERSON_MODEL_FLAG).toBe('CONSULT_PERSON_MODEL')
    expect(consultPersonModelOn({})).toBe(false)
    expect(consultPersonModelOn({ CONSULT_ONE_BRAIN: '1' })).toBe(false)
    expect(consultPersonModelOn({ CONSULT_PERSON_MODEL: '1' })).toBe(false)
    for (const v of ['0', 'true', ' 1', '']) expect(consultPersonModelOn({ CONSULT_ONE_BRAIN: '1', CONSULT_PERSON_MODEL: v })).toBe(false)
    expect(consultPersonModelOn(ON)).toBe(true)
  })
  it('is locked in production unless the owner names it (and the one brain) in the allow list', () => {
    expect(consultPersonModelOn({ ...PROD, ...ON })).toBe(false)
    expect(consultPersonModelOn({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN CONSULT_PERSON_MODEL' })).toBe(true)
    expect(consultPersonModelOn({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_PERSON_MODEL' })).toBe(false)
  })
})

describe('the write side keeps WHO the person is, and still drops what is only tonight', () => {
  const extracted = { personality: 'thích đi nhậu, hay đi chơi đêm', companions: 'đi với bạn gái', timing: 'tối nay', budget: { food: { min: 0, max: 500000 } }, preferences: { food: ['bún bò'] }, discovery_city: 'Quận 1' } as Partial<UserMemory>
  const said = ['tìm quán nhậu êm êm ở phú nhuận chiều nay']

  it('unchanged without the option: a trait the latest message does not state as a habit is dropped', () => {
    const { memory, stats } = filterTransientMemory(extracted, said)
    expect(memory.personality).toBeUndefined()
    expect(memory.companions).toBeUndefined()
    expect(stats.personality_dropped).toBe(true)
  })
  it('keepPerson: style and company stay; timing, a per-turn budget, a search subject and a district still go', () => {
    const { memory, stats } = filterTransientMemory(extracted, said, { keepPerson: true })
    expect(memory.personality).toBe('thích đi nhậu, hay đi chơi đêm')
    expect(memory.companions).toBe('đi với bạn gái')
    expect(memory.timing).toBeUndefined()
    expect(memory.budget).toBeUndefined()
    expect(memory.preferences).toBeUndefined()
    expect(memory.discovery_city).toBeUndefined()
    expect(stats.personality_dropped).toBeUndefined()
    expect(stats.timing_dropped).toBe(true)
  })
  it('keepPerson: a trait that only describes this outing is still dropped', () => {
    const { memory } = filterTransientMemory({ personality: 'muốn chill tối nay', companions: 'đi 2 người hôm nay' } as Partial<UserMemory>, said, { keepPerson: true })
    expect(memory.personality).toBeUndefined()
    expect(memory.companions).toBeUndefined()
  })
})

describe('the extraction gate', () => {
  const ask = (text: string, extra: Record<string, unknown> = {}) => shouldExtractMemory({ text, intent: 'tool', forcedTool: null, consultative: true, ...extra })
  it('unchanged: in the consultative mode an ordinary request does not earn the call', () => {
    expect(ask('đi quán nhậu êm êm ở phú nhuận chiều nay')).toBe(false)
  })
  it('personModel: an ordinary request earns it, a greeting, a point-in-time lookup and a too-short message do not', () => {
    expect(ask('đi quán nhậu êm êm ở phú nhuận chiều nay', { personModel: true })).toBe(true)
    expect(shouldExtractMemory({ text: 'chào bạn', intent: 'chitchat', forcedTool: null, consultative: true, personModel: true })).toBe(false)
    expect(ask('nay giá vàng là bao nhiêu', { personModel: true })).toBe(false)
    expect(ask('thời tiết sài gòn mai', { personModel: true })).toBe(false)
    expect(ask('ok', { personModel: true })).toBe(false)
  })
  it('personModel does not change a stated personal fact, which always earned the call', () => {
    expect(ask('mình thích đi nhậu với bạn', { personModel: true })).toBe(true)
    expect(ask('mình thích đi nhậu với bạn')).toBe(true)
  })
})

describe('no prompt text rides on this flag any more (14/11: removed after the investigation)', () => {
  it('the memory block renders a stored style and companion exactly as it always did: as defaults for when the message says nothing', () => {
    // the block builder has no person-model option: the flag only changes WHAT IS REMEMBERED, never what the model is told about how to use it
    const mem = { location_base: 'Phú Nhuận', preferences: {}, budget: {}, history: [], personality: 'thích đi nhậu', companions: 'đi với bạn gái' } as UserMemory
    const b = buildConsultativeMemoryBlock(mem)
    expect(b).toContain('Mac dinh neu tin nhan khong noi')
    expect(b).toContain('thích đi nhậu')
    expect(b).not.toContain('Suy doan')
  })
  it('the per-turn instruction carries no person principle', () => {
    const d = oneBrainDynamic({ lang: 'vi', now: new Date('2026-11-14T03:00:00Z'), address: null, hasLocation: false, blocks: [] })
    expect(d).not.toContain('Know who you are talking to')
  })
})
