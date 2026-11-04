import type { ChatMessage } from './types'

/**
 * Which bubbles of a conversation carry a sender name and a time.
 *
 * Before this, a bubble was only text: its side (right = mine) was the whole identity, so in a group nobody could tell who said what, and no
 * message said when. A pure function so the rule is tested without a browser.
 *
 * A "run" is consecutive messages of ONE sender with less than {@link RUN_GAP_MS} between neighbours. A run shows the sender's name ONCE at its
 * start (group threads, other people's messages only — a direct thread has one other person, and your own side needs no name) and the time ONCE
 * at its end, so a burst of five messages is one time, not five.
 */
export const RUN_GAP_MS = 5 * 60_000

export interface BubbleMeta {
  /** Show the sender's name above this bubble. */
  showName: boolean
  /** Show the time under this bubble. */
  showTime: boolean
  /** The sender's name (fallback applied), or null for my own messages. */
  name: string | null
  /** "14:50" today, "03/11 14:50" on another day (Vietnam time, like the Inbox). Empty if the timestamp is unreadable. */
  time: string
}

const TZ = 'Asia/Ho_Chi_Minh'

/**
 * The calendar parts of an instant in Vietnam time. Built from `formatToParts` (not from a locale's own date pattern, which differs between ICU
 * versions: vi-VN may print 03-11, en-GB 03/11), so the label is the same everywhere and for both languages. `h23`: midnight is 00, never 24.
 */
function partsOf(ms: number): { day: string; month: string; year: string; hour: string; minute: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ })
      .formatToParts(new Date(ms)).map(x => [x.type, x.value]),
  ) as Record<string, string>
  return { day: p.day!, month: p.month!, year: p.year!, hour: p.hour!, minute: p.minute! }
}

function timeLabel(iso: string, now: number): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const a = partsOf(ms)
  const b = partsOf(now)
  const clock = `${a.hour}:${a.minute}`
  return a.year === b.year && a.month === b.month && a.day === b.day ? clock : `${a.day}/${a.month} ${clock}`
}

export function bubbleMetas(
  messages: readonly ChatMessage[],
  opts: { meId: string | null; group: boolean; nameOf: (senderId: string | null) => string; now?: number },
): BubbleMeta[] {
  const now = opts.now ?? Date.now()
  const sameRun = (a: ChatMessage | undefined, b: ChatMessage | undefined) => {
    if (!a || !b) return false
    if (a.senderId !== b.senderId) return false
    const gap = Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt))
    return Number.isFinite(gap) && gap < RUN_GAP_MS
  }
  return messages.map((m, i) => {
    const mine = opts.meId !== null && m.senderId === opts.meId
    const startsRun = !sameRun(messages[i - 1], m)
    const endsRun = !sameRun(m, messages[i + 1])
    return {
      showName: opts.group && !mine && startsRun,
      showTime: endsRun,
      name: mine ? null : opts.nameOf(m.senderId),
      time: timeLabel(m.createdAt, now),
    }
  })
}
