import { describe, it, expect } from 'vitest'
import { minutesOf, daysWithoutNight, NIGHT_RETRY_NOTE } from './planNight'

const day = (...times: string[]) => ({ items: times.map(time => ({ time })) })

describe('minutesOf', () => {
  it('reads 24-hour, 20h30 and pm times, and small-hours times as late', () => {
    expect(minutesOf('20:30')).toBe(1230)
    expect(minutesOf('20h30')).toBe(1230)
    expect(minutesOf('9 pm')).toBe(21 * 60)
    expect(minutesOf('00:30')).toBe(24 * 60 + 30)
  })
  it('a vague word says nothing, a late-night word counts', () => {
    expect(minutesOf('Evening')).toBeNull()
    expect(minutesOf('Toi')).toBeNull()
    expect(minutesOf('Late night')).toBe(22 * 60)
    expect(minutesOf(undefined)).toBeNull()
  })
})

describe('daysWithoutNight', () => {
  it('a day that closes at dinner is sent back; a day with a 20:30+ stop passes', () => {
    expect(daysWithoutNight([day('08:00', '12:00', '19:00'), day('08:00', '21:00'), day('09:00')])).toEqual([1])
  })
  it('the day of departure is exempt, a one-day plan is not', () => {
    expect(daysWithoutNight([day('09:00', '21:00'), day('08:00', '11:00')])).toEqual([])
    expect(daysWithoutNight([day('09:00', '19:00')])).toEqual([1])
  })
  it('a gentle plan is never sent back', () => {
    expect(daysWithoutNight([day('08:00', '19:00'), day('08:00')], { gentle: true })).toEqual([])
  })
  it('the note names the days and the way out', () => {
    expect(NIGHT_RETRY_NOTE([1, 2])).toMatch(/day 1, 2/)
    expect(NIGHT_RETRY_NOTE([1])).toMatch(/gentle: true/)
  })
})
