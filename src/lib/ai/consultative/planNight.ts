// A trip plan must have a night (owner 19/11: "dinner at 19:00 and the day is over - no night market, no bar or pub?"). The first plan is the vivid one: every day except the day of departure has a stop
// that starts at 20:30 or later. The prompt says so; this is the check the code holds, so a plan that closes a day at dinner is sent back to the model once instead of reaching the person. Pure.

export interface NightItem { time?: unknown }
export interface NightDay { label?: unknown; items?: NightItem[] }

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(new RegExp(String.fromCharCode(0x111), 'g'), 'd').toLowerCase()

/** Minutes since midnight of a time written "20:30", "20h30", "8:30 pm", or a word that means late at night; null when it says nothing precise ("evening"). */
export function minutesOf(time: unknown): number | null {
  if (typeof time !== 'string') return null
  const t = fold(time).trim()
  const m = /(\d{1,2})\s*[:h]\s*(\d{2})?\s*(am|pm)?/.exec(t) ?? /(\d{1,2})()\s*(am|pm)\b/.exec(t)
  if (m) {
    let h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0
    if (m[3] === 'pm' && h < 12) h += 12
    if (m[3] === 'am' && h === 12) h = 0
    if (h > 24 || min > 59) return null
    // 00:00-04:59 written for the small hours of the same night counts as late
    return h < 5 ? (h + 24) * 60 + min : h * 60 + min
  }
  if (/khuya|dem\b|midnight|late night|night owl/.test(t)) return 22 * 60
  return null
}

export const NIGHT_START_MIN = 20 * 60 + 30

/** The days (1-based) that end before the night starts. The day of departure (the last of several) is exempt; so is every day when the person asked for a gentle plan. */
export function daysWithoutNight(days: readonly NightDay[], opts: { gentle?: boolean } = {}): number[] {
  if (opts.gentle) return []
  const out: number[] = []
  days.forEach((d, i) => {
    if (days.length > 1 && i === days.length - 1) return
    const times = (d.items ?? []).map(it => minutesOf(it.time)).filter((x): x is number => x !== null)
    if (!times.some(x => x >= NIGHT_START_MIN)) out.push(i + 1)
  })
  return out
}

export const NIGHT_RETRY_NOTE = (days: number[]): string =>
  `Not shown yet: day ${days.join(', ')} of this plan ends before the night starts. A first plan is the vivid one: add a stop that starts at 20:30 or later to each of those days (a night market, a bar or pub street, a rooftop, live music, a night show, a late supper or a night walk by the water - use what the lookups returned, or one more search_places for night spots), then call present_plan again with the whole plan. If the person asked for a slow or relaxed plan, or travels with elderly people or small children, call it again with gentle: true instead.`
