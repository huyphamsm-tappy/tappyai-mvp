import { describe, it, expect } from 'vitest'
import { filterTransientMemory } from './memoryTransientFilter'

// Consultative V1 §8 — what was said about TONIGHT does not become a trait.

describe('filterTransientMemory', () => {
  it('drops a transient timing, a per-turn budget, an atmosphere wish AND the search subject from one turn', () => {
    // Measured 2026-09-18: `food: bún bò` from one bún bò search was echoed on every later
    // extraction and read back as a taste ("bạn muốn ăn bún bò hay món khác?"). A subject searched
    // once is history, not a preference.
    const { memory, stats } = filterTransientMemory(
      { timing: 'tối nay', budget: { food: { min: 0, max: 500000 } }, preferences: { food: ['bún bò', 'yên tĩnh', 'gần đây'] } },
      ['tìm quán bún bò yên tĩnh gần đây tối nay dưới 500k'],
    )
    expect(memory.timing).toBeUndefined()
    expect(memory.budget).toBeUndefined()
    expect(memory.preferences).toBeUndefined()
    expect(stats).toEqual({ timing_dropped: true, budget_dropped: 1, preferences_dropped: 3 })
  })
  it('a liking stated by the user is a preference; a dietary constraint is kept even without a habit marker', () => {
    expect(filterTransientMemory({ preferences: { food: ['bún bò'] } }, ['mình thích bún bò']).memory.preferences).toEqual({ food: ['bún bò'] })
    expect(filterTransientMemory({ preferences: { avoid: ['hải sản'] } }, ['tôi bị dị ứng hải sản']).memory.preferences).toEqual({ avoid: ['hải sản'] })
    expect(filterTransientMemory({ preferences: { avoid: ['đồ mặn'], food: ['chay'] } }, ['tôi ăn chay']).memory.preferences).toEqual({ avoid: ['đồ mặn'] })
  })
  it('timing is a habit only when the user says so: "tối", "cuối tuần", "3 ngày 2 đêm" from one request are dropped', () => {
    for (const [timing, text] of [['tối', 'quán ăn tối gần Quận 1'], ['cuối tuần', 'cả nhà ăn trưa cuối tuần'], ['3 ngày 2 đêm', 'đi Đà Nẵng 3 ngày 2 đêm']]) {
      const r = filterTransientMemory({ timing }, [text])
      expect(r.memory.timing, text).toBeUndefined()
      expect(r.stats.timing_dropped).toBe(true)
    }
    expect(filterTransientMemory({ timing: 'buổi tối' }, ['mình hay đi ăn buổi tối']).memory.timing).toBe('buổi tối')
  })
  it('discovery_city needs a trip or a stay in the user\'s words — a district in a food query is not a destination', () => {
    expect(filterTransientMemory({ discovery_city: 'Quận 1' }, ['Tìm quán ăn tối ngon gần Quận 1 cho 2 người']).memory.discovery_city).toBeUndefined()
    expect(filterTransientMemory({ discovery_city: 'Phú Nhuận' }, ['cần chỗ đậu xe ô tô, Phú Nhuận']).stats.discovery_city_dropped).toBe(true)
    expect(filterTransientMemory({ discovery_city: 'Đà Nẵng' }, ['Đi Đà Nẵng 3 ngày 2 đêm cho 2 người']).memory.discovery_city).toBe('Đà Nẵng')
    expect(filterTransientMemory({ discovery_city: 'Đà Nẵng' }, ['khach san da nang gan bien duoi 1tr/dem']).memory.discovery_city).toBe('Đà Nẵng')
    expect(filterTransientMemory({ discovery_city: 'Phú Quốc' }, ['Resort Phú Quốc cho kỷ niệm 1 năm']).memory.discovery_city).toBe('Phú Quốc')
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
    // A companion trait survives only with a habit marker in the user's words (measured E5).
    expect(filterTransientMemory({ location_base: 'Quận 1', companions: 'hay đi 2 người' }, ['x']).memory)
      .toEqual({ location_base: 'Quận 1' })
    expect(filterTransientMemory({ location_base: 'Quận 1', companions: 'hay đi 2 người' }, ['mình hay đi 2 người']).memory)
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
