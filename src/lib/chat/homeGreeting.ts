// The one line the empty chat opens with (owner 20/11): a greeting by the time the person has, like the assistants people already know (a time-of-day line that changes, never a menu of moods or questions).
// Pure: the component gives it the device's clock. The words live in the dictionary (home.greet.*), three variants per part of the day, one chosen by the date so it does not flicker on every visit.

export type DayPart = 'dawn' | 'noon' | 'afternoon' | 'evening' | 'night'
export const GREETING_VARIANTS = 3

/** Morning 5-10, midday 11-13, afternoon 14-17, evening 18-22, night 23-4 (local hours). */
export function dayPartOf(hour: number): DayPart {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h >= 5 && h <= 10) return 'dawn'
  if (h >= 11 && h <= 13) return 'noon'
  if (h >= 14 && h <= 17) return 'afternoon'
  if (h >= 18 && h <= 22) return 'evening'
  return 'night'
}

const dayOfYear = (d: Date): number => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000)

/** The dictionary key of the greeting for this moment. Saturday and Sunday, until the evening, use the weekend lines. */
export function greetingKey(now: Date): string {
  const part = dayPartOf(now.getHours())
  const weekend = (now.getDay() === 0 || now.getDay() === 6) && part !== 'evening' && part !== 'night'
  const variant = (dayOfYear(now) + now.getHours()) % GREETING_VARIANTS
  return `home.greet.${weekend ? 'weekend' : part}.${variant}`
}

/**
 * The name to greet by: the LAST word of the name the person gave in their profile (owner 20/11: in Vietnam people are called by the given name, which comes last, "Nguyễn Văn An" -> "An").
 * Nothing when the profile has no name, when it looks like an address or contains digits or symbols, or when the word is very long.
 */
export function givenNameOf(full: unknown): string | null {
  if (typeof full !== 'string') return null
  const t = full.trim()
  if (!t || /[@\d_/\\<>{}[\]|]/.test(t)) return null
  const words = t.split(/\s+/)
  const last = words[words.length - 1]
  return last.length >= 1 && last.length <= 20 ? last : null
}

/** The line with the name in front ("Huy ơi, ..."): the first letter of the line goes to lower case after the name. */
export function lineWithName(line: string, name: string | null, template: string): string {
  if (!name || !line) return line
  const lower = line.charAt(0).toLowerCase() + line.slice(1)
  return template.replace('{name}', name).replace('{line}', lower)
}

export const GREETING_KEYS: readonly string[] = [...(['dawn', 'noon', 'afternoon', 'evening', 'night', 'weekend'] as const)].flatMap(p => Array.from({ length: GREETING_VARIANTS }, (_, i) => `home.greet.${p}.${i}`))
