// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { notificationBrandMark, TAPPY_NOTIFICATION_MARK } from './inbox'

// Phase B.1 — the in-app notification mark.
//
// 🔑 WHY THE DECISION IS A PURE FUNCTION AND TESTED HERE. The row itself lives
// inside `src/app/reviews/page.tsx`, a 1,212-line client page with a router, a
// feed, a video player and an auth provider. Rendering all of that to assert one
// `<img src>` would test the mocking, not the choice. The choice is what matters,
// so it was extracted to `inbox.ts` — where the inbox's other presentation
// helpers already live and are already unit-tested — and asserted directly, with
// a narrow structural check below proving the page actually consumes it.

const PAGE = readFileSync('src/app/reviews/page.tsx', 'utf8')
const SEND = readFileSync('src/lib/notifications/send.ts', 'utf8')
const SW = readFileSync('public/push-sw.js', 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the platform mark is the official TappyAI otter', () => {
  it('a system notification gets the otter', () => {
    expect(notificationBrandMark('system')).toBe('/tappy/wave.png')
  })

  it('🔑 it is the SAME asset Web Push already sends — the two cannot drift', () => {
    // A notification and its inbox entry are one message. If someone changes the
    // push icon and not this, the phone and the app show different brands. Both
    // literals are asserted against each other rather than against a copy of the
    // string, so editing either alone fails here.
    expect(strip(SEND)).toContain(`?? '${TAPPY_NOTIFICATION_MARK}'`)
    expect(strip(SW)).toContain(`|| '${TAPPY_NOTIFICATION_MARK}'`)
  })

  it('🔑 is never the retired infinity mark', () => {
    // `/logo.png` and `/logo.svg` are named as retired in send.ts and push-sw.js.
    expect(TAPPY_NOTIFICATION_MARK).not.toMatch(/\/logo\.(png|svg)/)
    expect(notificationBrandMark('system')).not.toMatch(/\/logo\.(png|svg)/)
  })

  it('points at an asset that actually exists in /public', () => {
    // A mark that 404s is worse than the emoji it replaced.
    expect(() => readFileSync(`public${TAPPY_NOTIFICATION_MARK}`)).not.toThrow()
    expect(readFileSync(`public${TAPPY_NOTIFICATION_MARK}`).length).toBeGreaterThan(1000)
  })
})

describe('existing rows are untouched', () => {
  it.each(['deal', 'explore'])('%s keeps its category emoji, not the otter', (category) => {
    // These are product categories, not the platform speaking. This change is a
    // branding fix, not an inbox redesign.
    expect(notificationBrandMark(category)).toBeNull()
  })

  it('social rows are never given a platform mark', () => {
    // Social rows render the ACTOR's avatar stack. Returning a mark here would
    // replace a real person's face with a logo.
    expect(notificationBrandMark('social')).toBeNull()
  })

  it('an unknown category degrades to the emoji rather than guessing', () => {
    expect(notificationBrandMark('something_new')).toBeNull()
    expect(notificationBrandMark('')).toBeNull()
  })

  it('🔑 the social avatar-stack path is still in the page and still actor-driven', () => {
    // The narrow structural guard that the branding change did not reach into
    // the social branch.
    expect(PAGE).toContain('const actors = g.actors.slice(0, 3)')
    expect(PAGE).toContain('avatarStack')
  })
})

describe('Controller and Marketing are branded identically', () => {
  it('🔑 the decision keys on CATEGORY, never on the sender', () => {
    // Both callers reach the inbox through `dispatchNotification` with
    // `category: 'system'`, so both get the same mark by construction. There is
    // no source/actor/permission input to this function at all — which is what
    // makes divergence unexpressible rather than merely discouraged.
    expect(notificationBrandMark.length).toBe(1)
    const src = strip(readFileSync('src/lib/notifications/inbox.ts', 'utf8'))
    const fn = src.slice(src.indexOf('export function notificationBrandMark'))
    for (const forbidden of ['controller', 'marketing', 'source', 'actorId', 'email', 'permission']) {
      expect(fn.slice(0, 200), `branding branches on ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('no email-based branding logic anywhere in the mark path', () => {
    const inbox = strip(readFileSync('src/lib/notifications/inbox.ts', 'utf8'))
    expect(inbox).not.toContain('@tappyai.com')
    expect(inbox).not.toMatch(/actor\.email|\.email\s*===/)
  })
})

describe('the page consumes the helper (structural)', () => {
  const code = strip(PAGE)

  it('imports and calls it rather than re-deciding locally', () => {
    expect(code).toContain('notificationBrandMark')
    expect(code).toContain('const brandMark = notificationBrandMark(g.category)')
  })

  it('renders an image when a mark is returned, and the emoji otherwise', () => {
    expect(code).toContain('brandMark ? (')
    expect(code).toContain('src={brandMark}')
    expect(code).toContain('{cat.icon}')
  })

  it('🔑 the mark is decorative — hidden from assistive tech', () => {
    // The title and body sit beside it; an alt would be announced before every
    // message and say nothing the row does not already say.
    expect(code).toMatch(/src=\{brandMark\}[^>]*alt=""/)
    expect(code).toMatch(/src=\{brandMark\}[^>]*aria-hidden/)
  })

  it('hardcodes no asset path in the page — one source of truth', () => {
    expect(code).not.toContain('/tappy/wave.png')
  })
})
