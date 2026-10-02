// The Home hero greeting rules — every boundary, both languages, and parity with Android.
//
// These are the PRODUCTION rules (they lived inline in `src/app/(app)/(home)/page.tsx` and
// `src/app/HomeView.tsx`, and Android carries a 1:1 port). The V3 Home used to ignore
// them and print a static line; now all three surfaces read this one module, so the
// module is what gets pinned: slot edges one hour and one minute either side, the
// weekend pools, the day-of-month rotation, the language, the fallback, and the
// Kotlin file's pools byte for byte.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HERO_SLOTS, heroGreeting, isWeekendDay, vietnamHeroClock, type HeroClock, type HeroLocale } from './heroGreeting'

const at = (hour: number, over: Partial<HeroClock> = {}): HeroClock => ({ hour, isWeekend: false, dayOfMonth: 1, ...over })
const slotOf = (hour: number) => HERO_SLOTS.find(s => hour >= s.range[0] && hour < s.range[1])!

describe('seven time-of-day slots, edge-exact', () => {
  it('covers every hour of the day exactly once, in production order', () => {
    expect(HERO_SLOTS.map(s => s.range)).toEqual([[0, 5], [5, 9], [9, 11], [11, 14], [14, 17], [17, 20], [20, 24]])
    for (let h = 0; h < 24; h++) expect(HERO_SLOTS.filter(s => h >= s.range[0] && h < s.range[1])).toHaveLength(1)
  })

  // One hour before and after every transition, both languages: the slot changes exactly there.
  it.each([
    [4, 5, 'late night → early morning'],
    [8, 9, 'early morning → mid-morning'],
    [10, 11, 'mid-morning → noon'],
    [13, 14, 'noon → afternoon'],
    [16, 17, 'afternoon → evening'],
    [19, 20, 'evening → night'],
  ])('%i:00 and %i:00 sit on different sides of the %s boundary', (before, after) => {
    for (const locale of ['vi', 'en'] as HeroLocale[]) {
      // The hour before the edge still reads like the rest of its slot…
      expect(slotOf(before - 1)).toBe(slotOf(before))
      expect(heroGreeting(at(before), locale)).toEqual(heroGreeting(at(before - 1), locale))
      // …and the edge hour itself is already the next slot.
      expect(slotOf(before)).not.toBe(slotOf(after))
      expect(heroGreeting(at(before), locale)).not.toEqual(heroGreeting(at(after), locale))
      expect(slotOf(after + 1)).toBe(slotOf(after))
    }
  })

  it('23:00 is the night slot and 00:00 the late-night slot (the day wraps)', () => {
    expect(slotOf(23).range).toEqual([20, 24])
    expect(slotOf(0).range).toEqual([0, 5])
    expect(heroGreeting(at(23), 'vi')).not.toEqual(heroGreeting(at(0), 'vi'))
  })

  it('the production copy is the copy: known instants resolve to the exact lines', () => {
    // Weekday noon, the 1st → index 1 of the four lunch templates.
    expect(heroGreeting(at(12, { dayOfMonth: 1 }), 'vi')).toEqual(['Giờ vàng ăn trưa —', 'để Tappy chọn chỗ hộ nhé 🥢'])
    expect(heroGreeting(at(12, { dayOfMonth: 1 }), 'en')).toEqual(['Lunch o’clock —', 'let Tappy pick for you 🥢'])
    // Weekday 7am, the 4th → index 0 (4 % 4).
    expect(heroGreeting(at(7, { dayOfMonth: 4 }), 'vi')).toEqual(['Chào buổi sáng!', 'Hôm nay ăn gì ngon đây? ☀️'])
    // Weekday 3pm, the 15th → index 3 of four.
    expect(heroGreeting(at(15, { dayOfMonth: 15 }), 'vi')).toEqual(['Slump buổi chiều?', 'Tappy có mấy gợi ý hay đây 💡'])
    // Weekday 6pm, the 8th → index 0.
    expect(heroGreeting(at(18, { dayOfMonth: 8 }), 'en')).toEqual(['Off work!', 'Where to eat tonight? 🎊'])
    // 2am, the 30th → 30 % 3 = 0.
    expect(heroGreeting(at(2, { dayOfMonth: 30 }), 'vi')).toEqual(['Thức khuya à?', 'Tappy đây, cần gì không? 🌙'])
    expect(heroGreeting(at(22, { dayOfMonth: 31 }), 'en')).toEqual(['End of the day —', 'let Tappy help you unwind! 🛁'])
  })
})

describe('the weekend pools', () => {
  it('Saturday and Sunday are the weekend; Friday and Monday are not', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(isWeekendDay)).toEqual([true, false, false, false, false, false, true])
  })

  it('only the early-morning and evening slots have weekend pools — exactly as production', () => {
    expect(HERO_SLOTS.map(s => !!s.viWeekend)).toEqual([false, true, false, false, false, true, false])
    expect(HERO_SLOTS.map(s => !!s.enWeekend)).toEqual([false, true, false, false, false, true, false])
  })

  it('a weekend morning and a weekend evening read differently from a weekday; noon does not', () => {
    for (const locale of ['vi', 'en'] as HeroLocale[]) {
      expect(heroGreeting(at(7, { isWeekend: true }), locale)).not.toEqual(heroGreeting(at(7), locale))
      expect(heroGreeting(at(18, { isWeekend: true }), locale)).not.toEqual(heroGreeting(at(18), locale))
      expect(heroGreeting(at(12, { isWeekend: true }), locale)).toEqual(heroGreeting(at(12), locale))
      expect(heroGreeting(at(22, { isWeekend: true }), locale)).toEqual(heroGreeting(at(22), locale))
    }
    expect(heroGreeting(at(7, { isWeekend: true, dayOfMonth: 0 }), 'vi')).toEqual(['Sáng cuối tuần đây!', 'Nghỉ ngơi hay đi đâu vui? ☀️'])
    expect(heroGreeting(at(18, { isWeekend: true, dayOfMonth: 0 }), 'en')).toEqual(['Weekend evening!', 'Out, or something tasty? 🎊'])
  })
})

describe('the template rotates by day of month — never one fixed greeting', () => {
  it('every pool has at least two templates, each of two non-empty lines', () => {
    for (const s of HERO_SLOTS) {
      for (const pool of [s.vi, s.viWeekend, s.en, s.enWeekend]) {
        if (!pool) continue
        expect(pool.length).toBeGreaterThanOrEqual(2)
        for (const [a, b] of pool) { expect(a.trim().length).toBeGreaterThan(0); expect(b.trim().length).toBeGreaterThan(0) }
      }
    }
  })

  it('consecutive days in the same slot pick different templates, and the pool cycles', () => {
    const noon = slotOf(12)
    expect(heroGreeting(at(12, { dayOfMonth: 1 }), 'vi')).not.toEqual(heroGreeting(at(12, { dayOfMonth: 2 }), 'vi'))
    expect(heroGreeting(at(12, { dayOfMonth: 1 }), 'vi')).toEqual(heroGreeting(at(12, { dayOfMonth: 1 + noon.vi.length }), 'vi'))
    const seen = new Set(Array.from({ length: 31 }, (_, i) => heroGreeting(at(12, { dayOfMonth: i + 1 }), 'vi').join('\n')))
    expect(seen.size).toBe(noon.vi.length)
  })

  it('the same day shows the same greeting on every call — deterministic, no randomness', () => {
    const a = heroGreeting(at(9, { dayOfMonth: 17 }), 'vi')
    for (let i = 0; i < 20; i++) expect(heroGreeting(at(9, { dayOfMonth: 17 }), 'vi')).toEqual(a)
  })
})

describe('language', () => {
  it('vi and en draw from their own pools for the same clock', () => {
    for (let h = 0; h < 24; h++) {
      const vi = heroGreeting(at(h), 'vi'), en = heroGreeting(at(h), 'en')
      expect(vi).not.toEqual(en)
      expect(slotOf(h).vi).toContainEqual(vi)
      expect(slotOf(h).en).toContainEqual(en)
    }
  })
})

describe('an impossible hour falls back to the early-morning slot, as production always did', () => {
  it.each([-1, 24, 99, Number.NaN])('hour %s', (hour) => {
    expect(slotOf(7).vi).toContainEqual(heroGreeting(at(hour), 'vi'))
    expect(slotOf(7).en).toContainEqual(heroGreeting(at(hour), 'en'))
  })
})

describe('the Vietnam clock (UTC+7) — the production page’s time source, to the minute', () => {
  const utc = (iso: string) => Date.parse(iso)

  it('04:59:59 VN is late night, 05:00:00 VN is early morning', () => {
    expect(vietnamHeroClock(utc('2026-09-15T21:59:59Z'))).toEqual({ hour: 4, isWeekend: false, dayOfMonth: 16 })
    expect(vietnamHeroClock(utc('2026-09-15T22:00:00Z'))).toEqual({ hour: 5, isWeekend: false, dayOfMonth: 16 })
    expect(slotOf(vietnamHeroClock(utc('2026-09-15T21:59:59Z')).hour).range).toEqual([0, 5])
    expect(slotOf(vietnamHeroClock(utc('2026-09-15T22:00:00Z')).hour).range).toEqual([5, 9])
  })

  it.each([
    ['08:59 → 09:00', '2026-09-16T01:59:00Z', '2026-09-16T02:00:00Z', 8, 9],
    ['10:59 → 11:00', '2026-09-16T03:59:00Z', '2026-09-16T04:00:00Z', 10, 11],
    ['13:59 → 14:00', '2026-09-16T06:59:00Z', '2026-09-16T07:00:00Z', 13, 14],
    ['16:59 → 17:00', '2026-09-16T09:59:00Z', '2026-09-16T10:00:00Z', 16, 17],
    ['19:59 → 20:00', '2026-09-16T12:59:00Z', '2026-09-16T13:00:00Z', 19, 20],
  ])('%s VN crosses a slot', (_l, before, after, hb, ha) => {
    expect(vietnamHeroClock(utc(before)).hour).toBe(hb)
    expect(vietnamHeroClock(utc(after)).hour).toBe(ha)
    expect(slotOf(hb)).not.toBe(slotOf(ha))
  })

  it('midnight VN turns the day of month and the slot, while UTC is still the previous evening', () => {
    const before = vietnamHeroClock(utc('2026-09-16T16:59:59Z')) // 23:59:59 VN, Wed 16
    const after = vietnamHeroClock(utc('2026-09-16T17:00:00Z')) // 00:00:00 VN, Thu 17
    expect(before).toEqual({ hour: 23, isWeekend: false, dayOfMonth: 16 })
    expect(after).toEqual({ hour: 0, isWeekend: false, dayOfMonth: 17 })
  })

  it('the weekend starts at Saturday 00:00 VN and ends at Monday 00:00 VN', () => {
    expect(vietnamHeroClock(utc('2026-09-18T16:59:59Z')).isWeekend).toBe(false) // Fri 23:59:59 VN
    expect(vietnamHeroClock(utc('2026-09-18T17:00:00Z')).isWeekend).toBe(true) // Sat 00:00 VN
    expect(vietnamHeroClock(utc('2026-09-20T10:00:00Z'))).toEqual({ hour: 17, isWeekend: true, dayOfMonth: 20 }) // Sun 17:00 VN
    expect(vietnamHeroClock(utc('2026-09-20T16:59:59Z')).isWeekend).toBe(true) // Sun 23:59:59 VN
    expect(vietnamHeroClock(utc('2026-09-20T17:00:00Z')).isWeekend).toBe(false) // Mon 00:00 VN
  })

  it('is UTC+7 with no daylight saving — the same offset in January and July', () => {
    expect(vietnamHeroClock(utc('2026-01-10T00:30:00Z')).hour).toBe(7)
    expect(vietnamHeroClock(utc('2026-07-10T00:30:00Z')).hour).toBe(7)
  })
})

describe('Android carries the same pools, byte for byte', () => {
  // The Kotlin file is checked out with CRLF on Windows: normalise before anchoring on newlines.
  const kt = readFileSync(join(__dirname, '..', '..', '..', 'android/app/src/main/java/com/tappyai/app/home/HomeGreeting.kt'), 'utf8').replace(/\r\n/g, '\n')

  /** The Kotlin file's slots, parsed: [range, {vi, viWeekend, en, enWeekend}]. */
  function kotlinSlots() {
    const blocks = kt.split(/\n\s{8}Slot\(\n/).slice(1)
    return blocks.map(block => {
      const range = block.match(/range = (\d+)\.\.(\d+)/)!
      const pools: Record<string, string[][] | undefined> = {}
      for (const m of block.matchAll(/(vi|viWeekend|en|enWeekend) = listOf\(([\s\S]*?)\n\s{12}\)/g)) {
        pools[m[1]] = Array.from(m[2].matchAll(/"([^"]*)"/g)).map(s => s[1].split('\\n'))
      }
      return { range: [Number(range[1]), Number(range[2]) + 1], pools }
    })
  }

  it('same slots, same ranges, same templates in the same order', () => {
    const slots = kotlinSlots()
    expect(slots).toHaveLength(HERO_SLOTS.length)
    slots.forEach((k, i) => {
      const w = HERO_SLOTS[i]
      expect(k.range).toEqual(w.range)
      expect(k.pools.vi).toEqual(w.vi.map(l => [...l]))
      expect(k.pools.en).toEqual(w.en.map(l => [...l]))
      expect(k.pools.viWeekend).toEqual(w.viWeekend?.map(l => [...l]))
      expect(k.pools.enWeekend).toEqual(w.enWeekend?.map(l => [...l]))
    })
  })

  it('same selection rule: day of month modulo the pool, unknown hour → the morning slot', () => {
    expect(kt).toContain('texts[Math.floorMod(dayOfMonth, texts.size)]')
    expect(kt).toContain('SLOTS.firstOrNull { hour in it.range } ?: SLOTS[1]')
  })
})
