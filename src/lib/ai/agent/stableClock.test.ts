// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { agentContext, agentCalendar, agentCalendarSplit } from './prompt'

// Prompt cache: the system block is part of the cached prefix. With the clock to the minute in it, the prefix changed every minute (live 2026-10-11).
// With `stableClock` (CONSULTATIVE_IN_AGENT) the system block changes once a day; the clock and the resolved phrases ride in the DATA block.

const base = { userText: 'cuối tuần này có gì vui', lang: 'vi', gps: false, state: {} }
const T1 = new Date('2026-10-11T14:34:00Z') // 21:34 Việt Nam
const T2 = new Date('2026-10-11T14:41:00Z') // 21:41 Việt Nam, same day

describe('stable clock', () => {
  it('flag off: agentContext is exactly as before (minute-level clock in the system block)', () => {
    const c = agentContext({ ...base, now: T1 })
    expect(c.system).toContain('Bây giờ: 21:34')
    expect(c.system).toBe(agentContext({ ...base, now: T1, stableClock: false }).system)
    expect(agentCalendar(T1, base.userText)).toContain('Bây giờ: 21:34, ')
  })
  it('flag on: two requests minutes apart have the IDENTICAL system block; the clock moved to the data block, the content is the same', () => {
    const a = agentContext({ ...base, now: T1, stableClock: true })
    const b = agentContext({ ...base, now: T2, stableClock: true })
    expect(a.system).toBe(b.system)
    expect(a.system).not.toMatch(/\d{2}:\d{2}/)
    expect(a.system).toContain('Hôm nay: ')
    expect(a.system).toContain('14 ngày tới:')
    expect(a.data).toContain('Giờ hiện tại: 21:34')
    expect(b.data).toContain('Giờ hiện tại: 21:41')
    expect(a.data).toContain('"cuoi tuan nay" = ') // the resolved phrase moved too
    expect(a.system).not.toContain('"cuoi tuan nay"')
  })
  it('the next day the system block does change (the date is in it)', () => {
    const next = agentContext({ ...base, now: new Date('2026-10-12T14:34:00Z'), stableClock: true })
    expect(next.system).not.toBe(agentContext({ ...base, now: T1, stableClock: true }).system)
  })
  it('split keeps every line of the calendar', () => {
    const s = agentCalendarSplit(T1, base.userText)
    const original = agentCalendar(T1, base.userText).split('\n')
    expect(1 + s.moving.length + 1).toBeGreaterThanOrEqual(original.length) // day line + clock + days (+ resolved phrases)
    expect(s.system.split('\n')).toHaveLength(2)
  })
})
