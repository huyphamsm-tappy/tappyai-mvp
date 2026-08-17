// The notification classification, and the backward compatibility it must not break.
//
// The riskiest property is the boring one: a payload with NO kind must keep working exactly as it
// does today. Every notification currently in flight, every cron that was written before this
// existed, and every older client all depend on that. A classification that broke them would be a
// far worse outcome than not having one.

import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_KINDS,
  DEFAULT_NOTIFICATION_KIND,
  notificationKindFrom,
  wantsTappyIdentity,
} from './kind'

describe('the kind set', () => {
  it('is exactly normal and tappy_identity', () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual(['normal', 'tappy_identity'])
  })

  it('defaults to normal, so the identity sound is opt-in per notification', () => {
    // A sound that plays for everything is just a notification sound, not an identity.
    expect(DEFAULT_NOTIFICATION_KIND).toBe('normal')
  })
})

describe('backward compatibility — a payload without a kind still works', () => {
  it.each([
    ['no data at all', undefined],
    ['null data', null],
    ['empty data', {}],
    ['data with other fields', { url: '/deals' }],
  ])('%s reads as normal', (_label, data) => {
    expect(notificationKindFrom(data)).toBe('normal')
    expect(wantsTappyIdentity(data)).toBe(false)
  })
})

describe('reading the kind', () => {
  it('recognises tappy_identity', () => {
    expect(notificationKindFrom({ kind: 'tappy_identity' })).toBe('tappy_identity')
    expect(wantsTappyIdentity({ kind: 'tappy_identity' })).toBe(true)
  })

  it('recognises an explicit normal', () => {
    expect(notificationKindFrom({ kind: 'normal' })).toBe('normal')
  })
})

describe('anything the wire can produce degrades to normal, never throws', () => {
  // A notification arriving with an unknown kind must still be SHOWN. Refusing it would let a
  // future backend release stop older clients from displaying notifications at all.
  it.each([
    ['an unknown kind', { kind: 'urgent_shouting' }],
    ['a non-string kind', { kind: 42 }],
    ['a null kind', { kind: null }],
    ['an object kind', { kind: { nested: true } }],
    ['a string instead of an object', 'tappy_identity'],
    ['an array', ['tappy_identity']],
    ['a number', 7],
  ])('%s reads as normal', (_label, data) => {
    expect(() => notificationKindFrom(data)).not.toThrow()
    expect(notificationKindFrom(data)).toBe('normal')
  })

  it('is not fooled by a kind that merely contains a known value', () => {
    expect(notificationKindFrom({ kind: 'not_tappy_identity' })).toBe('normal')
    expect(notificationKindFrom({ kind: 'tappy_identity_v2' })).toBe('normal')
  })

  it('does not treat a truthy non-matching value as identity', () => {
    // The bug this prevents: `if (data.kind)` somewhere instead of an equality check.
    expect(wantsTappyIdentity({ kind: 'anything' })).toBe(false)
  })
})

describe('classification is not an instruction', () => {
  it('carries no text, no voice and no synthesis parameters', () => {
    // tappy_identity says "play the identity sound". It can never say "speak this". A kind that
    // could carry text would reintroduce the content-to-speech path the guards exist to prevent.
    const identity = notificationKindFrom({ kind: 'tappy_identity', body: 'secret message' })
    expect(identity).toBe('tappy_identity')
    expect(typeof identity).toBe('string')
  })
})
