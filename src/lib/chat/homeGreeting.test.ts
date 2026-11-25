import { describe, it, expect } from 'vitest'
import { dayPartOf, greetingKey, givenNameOf, lineWithName, GREETING_KEYS, GREETING_VARIANTS } from './homeGreeting'
import { translate } from '@/lib/i18n/useTranslation'

describe('dayPartOf', () => {
  it('splits the day into morning, midday, afternoon, evening and night', () => {
    expect([5, 10, 11, 13, 14, 17, 18, 22, 23, 0, 4].map(dayPartOf)).toEqual(['dawn', 'dawn', 'noon', 'noon', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night', 'night'])
  })
})

describe('given name and the line with it', () => {
  // owner 20/11 (second ruling): a Vietnamese is called by the given name, which is the LAST word of the full name ("Nguyễn Văn An" -> "An"); the first-word rule it replaces greeted "Nguyễn ơi"
  it('the last word of the profile name; nothing for an empty name, an address, digits or a very long word', () => {
    expect(givenNameOf('Nguyễn Văn An')).toBe('An')
    expect(givenNameOf('Phạm Quang Huy')).toBe('Huy')
    expect(givenNameOf('  Lan  ')).toBe('Lan')
    for (const bad of [undefined, null, '', '   ', 'a@b.com', 'user123', 'x'.repeat(30), 42]) expect(givenNameOf(bad)).toBeNull()
  })
  it('puts the name in front and lowers the first letter of the line; no name leaves the line alone', () => {
    expect(lineWithName('Cà phê sáng cùng Tappy nhé?', 'Huy', '{name} ơi, {line}')).toBe('Huy ơi, cà phê sáng cùng Tappy nhé?')
    expect(lineWithName('Good morning!', 'Huy', '{name}, {line}')).toBe('Huy, good morning!')
    expect(lineWithName('Chào buổi sáng!', null, '{name} ơi, {line}')).toBe('Chào buổi sáng!')
  })
  it('the template exists in both languages', () => {
    expect(translate('vi', 'home.greet.withName')).toContain('{name}')
    expect(translate('en', 'home.greet.withName')).toContain('{line}')
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
