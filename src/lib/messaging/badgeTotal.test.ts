import { describe, it, expect } from 'vitest'
import { badgeTotal } from './useMessageUnread'

/** A message is counted once: as a message, never also as a message notification. */
describe('badgeTotal', () => {
  it('flag off (no message notifications): other notifications + messages', () => {
    expect(badgeTotal(3, { messages: 4, messageNotifications: 0 })).toBe(7)
  })
  it('flag on: the message notifications inside the notification count are swapped for the message count', () => {
    expect(badgeTotal(5, { messages: 9, messageNotifications: 2 })).toBe(3 + 9)
  })
  it('never negative when the two reads disagree for a moment', () => {
    expect(badgeTotal(1, { messages: 0, messageNotifications: 4 })).toBe(0)
  })
  it('nothing at all is 0', () => {
    expect(badgeTotal(0, { messages: 0, messageNotifications: 0 })).toBe(0)
  })
})
