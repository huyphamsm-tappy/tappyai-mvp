import { describe, it, expect } from 'vitest'
import { filterTransientMemory } from './memoryTransientFilter'

// Consultative V1 §8 — what was said about TONIGHT does not become a trait.

describe('filterTransientMemory', () => {
  it('drops a transient timing, a per-turn budget and an atmosphere wish from one turn', () => {
    const { memory, stats } = filterTransientMemory(
      { timing: 'tối nay', budget: { food: { min: 0, max: 500000 } }, preferences: { food: ['bún bò', 'yên tĩnh', 'gần đây'] } },
      ['tìm quán bún bò yên tĩnh gần đây tối nay dưới 500k'],
    )
    expect(memory.timing).toBeUndefined()
    expect(memory.budget).toBeUndefined()
    expect(memory.preferences).toEqual({ food: ['bún bò'] })
    expect(stats).toEqual({ timing_dropped: true, budget_dropped: 1, preferences_dropped: 2 })
  })
  it('keeps a habit: "mình thường đi cuối tuần, budget của mình tầm 300k, mình thích quán yên tĩnh"', () => {
    const { memory, stats } = filterTransientMemory(
      { timing: 'hay đi cuối tuần', budget: { food: { min: 0, max: 300000 } }, preferences: { food: ['yên tĩnh'] } },
      ['mình thường đi cuối tuần, budget của mình tầm 300k, mình thích quán yên tĩnh'],
    )
    expect(memory.timing).toBe('hay đi cuối tuần')
    expect(memory.budget).toEqual({ food: { min: 0, max: 300000 } })
    expect(memory.preferences).toEqual({ food: ['yên tĩnh'] })
    expect(stats.budget_dropped).toBe(0)
  })
  it('untouched fields pass through; an empty extraction stays empty', () => {
    expect(filterTransientMemory({ location_base: 'Quận 1', companions: 'hay đi 2 người' }, ['x']).memory)
      .toEqual({ location_base: 'Quận 1', companions: 'hay đi 2 người' })
    expect(filterTransientMemory({}, []).memory).toEqual({})
  })
  it('the habit marker is read from the user\'s words, not the extraction', () => {
    const { memory } = filterTransientMemory({ budget: { spa: { min: 0, max: 1000000 } } }, ['spa nào tốt dưới 1tr'])
    expect(memory.budget).toBeUndefined()
    const kept = filterTransientMemory({ budget: { spa: { min: 0, max: 1000000 } } }, ['i usually spend under 1M on spa'])
    expect(kept.memory.budget).toBeDefined()
  })
})

describe('filterTransientMemory — personality and companions from one outing are not traits', () => {
  it('"thích lãng mạn, yên tĩnh" after one date question is dropped; a stated habit stays', () => {
    const once = filterTransientMemory({ personality: 'thích lãng mạn, yên tĩnh', companions: 'đi 2 người tối nay' }, ['đi date với gấu tối nay chỗ nào lãng mạn yên tĩnh'])
    expect(once.memory.personality).toBeUndefined()
    expect(once.memory.companions).toBeUndefined()
    expect(once.stats.personality_dropped).toBe(true)
    const habit = filterTransientMemory({ personality: 'thích quán yên tĩnh', companions: 'hay đi 2 người' }, ['mình thích quán yên tĩnh, hay đi 2 người'])
    expect(habit.memory.personality).toBe('thích quán yên tĩnh')
    expect(habit.memory.companions).toBe('hay đi 2 người')
  })
})
