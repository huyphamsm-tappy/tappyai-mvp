import { describe, it, expect } from 'vitest'
import { isControllerLoginEntry } from '../controllerLoginEntry'

// WHICH sign-in card `/login` should show.
//
// 🔑 `/login` IS ONE PAGE SERVING TWO PRODUCTS. Sixteen call sites reach it, and
// the consumer app's real users sign in there with Google and Zalo. The
// Controller's sign-in is email-only and `@tappyai.com`-only. Deleting the
// consumer providers to satisfy the Controller would sign every real user out of
// the product, so the card is chosen by WHERE THE VISITOR IS HEADED.
//
// This module answers only that question. It is PRESENTATION ROUTING:
//   • it authenticates nobody,
//   • it authorizes nobody,
//   • it cannot admit anyone the server would refuse — `/admin` still runs the
//     Option B corporate boundary and the PDP, server-side, afterwards.
//
// Getting it wrong shows the wrong card. It cannot grant access.

describe('a /login visit that is headed for the Controller', () => {
  it.each([
    '?returnTo=%2Fadmin',
    '?returnTo=%2Fadmin%2Fusers',
    '?returnTo=%2Fadmin%2Fanalytics%2Fusers',
    '?returnTo=%2Fcontroller',
  ])('%s → the Controller card', (search) => {
    expect(isControllerLoginEntry(search)).toBe(true)
  })

  it('accepts the legacy `redirect` parameter too — stale links still exist', () => {
    // `returnTo.ts` reads the legacy name on purpose; if this module did not,
    // an old bookmark would land a Controller visitor on the consumer card.
    expect(isControllerLoginEntry('?redirect=%2Fadmin')).toBe(true)
  })

  it('works with or without the leading question mark', () => {
    expect(isControllerLoginEntry('returnTo=%2Fadmin')).toBe(true)
  })
})

describe('every other /login visit keeps the consumer card', () => {
  it.each([
    ['no query at all', ''],
    ['no destination', '?foo=bar'],
    ['the consumer home', '?returnTo=%2F'],
    ['a consumer screen', '?returnTo=%2Fexplore'],
    ['the profile', '?returnTo=%2Fprofile%2Fsettings'],
  ])('%s → the consumer card', (_label, search) => {
    expect(isControllerLoginEntry(search)).toBe(false)
  })

  it.each([null, undefined])('a missing search string (%s) → the consumer card', (search) => {
    expect(isControllerLoginEntry(search)).toBe(false)
  })
})

describe('the match cannot be talked into the Controller card', () => {
  it('a look-alike prefix is not the Controller', () => {
    // `/administrators` starts with `/admin`. A `startsWith('/admin')` test
    // would hand the Controller card to a consumer route added later.
    expect(isControllerLoginEntry('?returnTo=%2Fadministrators')).toBe(false)
    expect(isControllerLoginEntry('?returnTo=%2Fadmin-guide')).toBe(false)
    expect(isControllerLoginEntry('?returnTo=%2Fcontroller-guide')).toBe(false)
  })

  it('an off-site destination is rejected before it is classified', () => {
    // `safeReturnTo` refuses absolute URLs; this must not read the raw string
    // and see "/admin" inside somebody else's URL.
    expect(isControllerLoginEntry('?returnTo=https%3A%2F%2Fevil.com%2Fadmin')).toBe(false)
    expect(isControllerLoginEntry('?returnTo=%2F%2Fevil.com%2Fadmin')).toBe(false)
  })

  it('a query string that merely mentions /admin elsewhere does not count', () => {
    expect(isControllerLoginEntry('?returnTo=%2F&note=%2Fadmin')).toBe(false)
  })
})
