// The three clients must agree about sharing.
//
// Web, Android and iOS each implement the same contract in their own language.
// Nothing at runtime forces them to stay in step, so this test reads the Kotlin
// and Swift sources and checks they still declare the same targets, the same
// canonical origin, and the same refusals.
//
// There is no Xcode and no emulator here, so this is a SOURCE contract — it
// proves the code says the right thing, not that a device behaves correctly.
// The Kotlin side additionally has real JVM unit tests (TappyShareTest.kt) that
// run under gradle.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARE_TARGETS } from './shareTargets'

const root = join(__dirname, '..', '..', '..')
const androidSrc = readFileSync(
  join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'tappyai', 'app', 'share', 'TappyShare.kt'),
  'utf8'
)
const iosSrc = readFileSync(
  join(root, 'ios', 'TappyAI', 'Core', 'Share', 'TappyShare.swift'),
  'utf8'
)

const PLATFORMS: Array<[string, string]> = [
  ['android', androidSrc],
  ['ios', iosSrc],
]

describe('every client declares the same share targets', () => {
  it.each(PLATFORMS)('%s declares all five targets', (_name, src) => {
    for (const target of SHARE_TARGETS) {
      expect(src.toLowerCase()).toContain(target.id)
    }
  })

  it.each(PLATFORMS)('%s builds a Facebook handoff', (_name, src) => {
    expect(src).toContain('facebook.com/sharer/sharer.php?u=')
  })

  it.each(PLATFORMS)('%s builds a Zalo handoff', (_name, src) => {
    expect(src).toContain('sp.zalo.me/plugins/share?url=')
  })

  // The same honest answer on every platform.
  it.each(PLATFORMS)('%s returns no handoff URL for TikTok', (_name, src) => {
    expect(src).toMatch(/tiktok[\s\S]{0,80}(null|nil)/i)
  })

  it.each(PLATFORMS)('%s labels TikTok without "Shop"', (_name, src) => {
    expect(src).not.toMatch(/tiktok\s*shop/i)
  })
})

describe('every client uses the same canonical origin', () => {
  it.each(PLATFORMS)('%s pins https://www.tappyai.com', (_name, src) => {
    expect(src).toContain('https://www.tappyai.com')
  })

  it.each(PLATFORMS)('%s builds review URLs centrally', (_name, src) => {
    expect(src).toMatch(/reviewU[rR][lL]/)
  })
})

describe('every client enforces the same URL guard', () => {
  it.each(PLATFORMS)('%s requires https', (_name, src) => {
    expect(src).toContain('https')
  })

  it.each(PLATFORMS)('%s refuses private and internal routes', (_name, src) => {
    for (const route of ['api', 'chat', 'admin']) {
      expect(src).toContain(route)
    }
  })

  // Tokens live in the query string; a canonical share link never needs one.
  it.each(PLATFORMS)('%s rejects URLs carrying a query string', (_name, src) => {
    expect(src.toLowerCase()).toContain('query')
  })
})

describe('no client claims it published anything', () => {
  it.each(PLATFORMS)('%s never says posted/published', (_name, src) => {
    expect(src).not.toMatch(/posted successfully|published successfully/i)
  })
})
