import { describe, it, expect } from 'vitest'
import { bubbleMetas, RUN_GAP_MS } from '../bubbles'
import type { ChatMessage } from '../types'

// Which bubbles of a conversation carry a sender name and a time (audit 04/11/2026: bubbles had neither, so in a group nobody could tell who said what).
// The rule is a pure function: a "run" is consecutive messages of one sender with less than RUN_GAP_MS between them; a run shows the name once at its start (group
// threads, other people's messages only) and the time once at its end.

const NOW = Date.parse('2026-11-05T08:00:00Z') // 15:00 in Ho Chi Minh
const at = (isoUtc: string) => isoUtc
const msg = (id: string, sender: string | null, createdAt: string): ChatMessage => ({ id, threadId: 't', senderId: sender, body: id, createdAt })
const nameOf = (id: string | null) => (id ? ({ u1: 'An', u2: 'Bình', me: 'Tôi' } as Record<string, string>)[id] ?? 'Người dùng' : 'Người dùng')
const run = (messages: ChatMessage[], over: Partial<Parameters<typeof bubbleMetas>[1]> = {}) =>
  bubbleMetas(messages, { meId: 'me', group: false, nameOf, now: NOW, ...over })

describe('bubbleMetas · runs', () => {
  it('an empty conversation has no bubbles', () => {
    expect(run([])).toEqual([])
  })

  it('consecutive messages of one sender are one run: the time is on its LAST message only', () => {
    const m = run([msg('a', 'u1', '2026-11-05T07:50:00Z'), msg('b', 'u1', '2026-11-05T07:51:00Z'), msg('c', 'u1', '2026-11-05T07:52:00Z')])
    expect(m.map(x => x.showTime)).toEqual([false, false, true])
  })

  it('a change of sender ends the run', () => {
    const m = run([msg('a', 'u1', '2026-11-05T07:50:00Z'), msg('b', 'me', '2026-11-05T07:51:00Z'), msg('c', 'me', '2026-11-05T07:52:00Z')])
    expect(m.map(x => x.showTime)).toEqual([true, false, true])
  })

  it('a gap of RUN_GAP_MS or more starts a new run even for the same sender', () => {
    const t0 = Date.parse('2026-11-05T07:00:00Z')
    const iso = (ms: number) => new Date(ms).toISOString()
    const m = run([msg('a', 'u1', iso(t0)), msg('b', 'u1', iso(t0 + RUN_GAP_MS - 1)), msg('c', 'u1', iso(t0 + RUN_GAP_MS - 1 + RUN_GAP_MS))])
    expect(m.map(x => x.showTime)).toEqual([false, true, true])
  })

  it('the last message of the conversation always shows its time', () => {
    expect(run([msg('a', 'u1', '2026-11-05T07:50:00Z')])[0]!.showTime).toBe(true)
  })

  it('a deleted account (null sender) is a sender of its own: it does not merge with a named one', () => {
    const m = run([msg('a', 'u1', '2026-11-05T07:50:00Z'), msg('b', null, '2026-11-05T07:51:00Z')])
    expect(m.map(x => x.showTime)).toEqual([true, true])
  })
})

describe('bubbleMetas · sender names (group threads)', () => {
  const g = (messages: ChatMessage[]) => run(messages, { group: true })

  it('a direct thread never shows a name (there is only one other person)', () => {
    expect(run([msg('a', 'u1', '2026-11-05T07:50:00Z')]).every(x => !x.showName)).toBe(true)
  })

  it('in a group the name is shown once at the START of each run of someone else', () => {
    const m = g([msg('a', 'u1', '2026-11-05T07:50:00Z'), msg('b', 'u1', '2026-11-05T07:51:00Z'), msg('c', 'u2', '2026-11-05T07:52:00Z')])
    expect(m.map(x => x.showName)).toEqual([true, false, true])
    expect(m.map(x => x.name)).toEqual(['An', 'An', 'Bình'])
  })

  it('my own messages never carry my name', () => {
    expect(g([msg('a', 'me', '2026-11-05T07:50:00Z')])[0]!.showName).toBe(false)
  })

  it('a long pause inside one person\'s messages repeats the name', () => {
    const m = g([msg('a', 'u1', '2026-11-05T07:00:00Z'), msg('b', 'u1', '2026-11-05T07:30:00Z')])
    expect(m.map(x => x.showName)).toEqual([true, true])
  })

  it('a sender with no name (a deleted account, an unknown id) is shown under the fallback, never blank', () => {
    const m = g([msg('a', null, '2026-11-05T07:50:00Z'), msg('b', 'zzz', '2026-11-05T07:51:00Z')])
    expect(m.map(x => x.name)).toEqual(['Người dùng', 'Người dùng'])
    expect(m.map(x => x.showName)).toEqual([true, true])
  })
})

describe('bubbleMetas · the time label', () => {
  it('today: just the time, in Vietnam time (07:50Z is 14:50 in Ho Chi Minh)', () => {
    expect(run([msg('a', 'u1', '2026-11-05T07:50:00Z')])[0]!.time).toBe('14:50')
  })

  it('another day: the date as well (day/month, then the time)', () => {
    expect(run([msg('a', 'u1', '2026-11-03T07:50:00Z')])[0]!.time).toBe('03/11 14:50')
  })

  it('the day is decided in Vietnam time, not UTC: 17:30Z yesterday is 00:30 TODAY in Ho Chi Minh', () => {
    // NOW is 2026-11-05 15:00 +07:00; 2026-11-04T17:30Z is 2026-11-05 00:30 +07:00 → the same Vietnamese day
    expect(run([msg('a', 'u1', '2026-11-04T17:30:00Z')])[0]!.time).toBe('00:30')
  })

  it('midnight is 00:xx, never 24:xx', () => {
    expect(run([msg('a', 'u1', '2026-11-04T17:05:00Z')])[0]!.time).toBe('00:05')
  })

  it('the label does not depend on the interface language (one format, built from parts, not from a locale pattern)', () => {
    expect(run([msg('a', 'u1', '2026-11-03T07:50:00Z')])[0]!.time).toBe('03/11 14:50')
  })

  it('a different year is told apart by the date, not shown as today', () => {
    expect(run([msg('a', 'u1', '2025-11-05T07:50:00Z')])[0]!.time).toBe('05/11 14:50')
  })

  it('an unreadable timestamp gives an empty label instead of throwing or printing "Invalid Date"', () => {
    const m = run([msg('a', 'u1', 'not-a-date')])
    expect(m[0]!.time).toBe('')
  })
})
