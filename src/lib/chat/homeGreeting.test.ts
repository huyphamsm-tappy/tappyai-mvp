import { describe, it, expect } from 'vitest'
import { dayPartOf, greetingKey, GREETING_KEYS, GREETING_VARIANTS } from './homeGreeting'
import { translate } from '@/lib/i18n/useTranslation'

describe('dayPartOf', () => {
  it('splits the day into morning, midday, afternoon, evening and night', () => {
    expect([5, 10, 11, 13, 14, 17, 18, 22, 23, 0, 4].map(dayPartOf)).toEqual(['dawn', 'dawn', 'noon', 'noon', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night', 'night'])
  })
})

describe('greetingKey', () => {
  it('a weekday morning uses a morning line; the weekend uses its own until the evening, then the evening and night lines', () => {
    expect(greetingKey(new Date(2026, 10, 18, 8, 0))).toMatch(/^home\.greet\.dawn\.[0-2]$/) // Wednesday
    expect(greetingKey(new Date(2026, 10, 21, 15, 0))).toMatch(/^home\.greet\.weekend\.[0-2]$/) // Saturday
    expect(greetingKey(new Date(2026, 10, 21, 20, 0))).toMatch(/^home\.greet\.evening\.[0-2]$/)
    expect(greetingKey(new Date(2026, 10, 22, 1, 0))).toMatch(/^home\.greet\.night\.[0-2]$/)
  })
  it('the same moment gives the same line (no flicker), another day may give another', () => {
    const a = greetingKey(new Date(2026, 10, 18, 8, 0)), b = greetingKey(new Date(2026, 10, 18, 8, 59))
    expect(a).toBe(b)
    const seen = new Set([18, 19, 20].map(d => greetingKey(new Date(2026, 10, d, 8, 0))))
    expect(seen.size).toBeGreaterThan(1)
  })
  it('every key exists in both languages, and there are three lines for each of the six parts', () => {
    expect(GREETING_KEYS).toHaveLength(6 * GREETING_VARIANTS)
    for (const k of GREETING_KEYS) {
      expect(translate('vi', k)).not.toBe(k)
      expect(translate('en', k)).not.toBe(k)
    }
  })
})
