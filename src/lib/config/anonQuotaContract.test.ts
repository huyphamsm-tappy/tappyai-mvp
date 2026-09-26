import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT } from './product'

// ── The anonymous AI allowance is LIFETIME, and every contract says so ─────
//
// 2026-09-15: the ONE shared AI question pool gives an anonymous identity 5 questions for its
// LIFETIME (one trial, once) and an account 15 per VN day. `GET /api/config` used to expose the
// anonymous figure as `anonDailyLimit`; with the new meaning that name would let any client render
// "5/day" for a value that is not daily. This pins the rename end to end: the constant, the API
// field, the iOS model that decodes it, the contract docs, and the absence of the old name.

const read = (p: string) => readFileSync(p, 'utf8')

describe('the values', () => {
  it('anonymous = 5 lifetime, registered = 15/day', () => {
    expect(ANON_LIFETIME_LIMIT).toBe(5)
    expect(FREE_DAILY_LIMIT).toBe(15)
  })
})

describe('GET /api/config exposes the anonymous allowance under its LIFETIME name', () => {
  const route = read('src/app/api/config/route.ts')

  it('serves freemium.anonLifetimeLimit from ANON_LIFETIME_LIMIT', () => {
    expect(route).toMatch(/freemium:\s*\{[\s\S]*?anonLifetimeLimit:\s*ANON_LIFETIME_LIMIT[\s\S]*?\}/)
    expect(route).toMatch(/freeDailyLimit:\s*FREE_DAILY_LIMIT/)
  })

  it('🚨 no longer serves anonDailyLimit, and never reads a "daily" anonymous constant', () => {
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/anonDailyLimit\s*:/)
    expect(code).not.toContain('ANON_DAILY_LIMIT')
  })
})

describe('no consumer can read the anonymous allowance as a daily figure', () => {
  it('web code has no reference to anonDailyLimit or ANON_DAILY_LIMIT', () => {
    // The whole web surface that could render or enforce it.
    for (const f of [
      'src/app/api/chat/route.ts',
      'src/app/api/subscription/route.ts',
      'src/app/(app)/subscription/page.tsx',
      'src/app/scam-shield/ScamShieldView.tsx',
      'src/app/scam-shield/ScamMessageResult.tsx',
      'src/lib/config/product.ts',
    ]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, f).not.toMatch(/anonDailyLimit|ANON_DAILY_LIMIT/)
    }
  })

  it('the iOS AppConfig model decodes anonLifetimeLimit, not anonDailyLimit', () => {
    const swift = read('ios/TappyAI/Core/Config/AppConfigService.swift')
    expect(swift).toMatch(/struct Freemium[\s\S]*?let anonLifetimeLimit: Int/)
    expect(swift).not.toMatch(/let anonDailyLimit/)
  })

  it('the contract docs name the lifetime field', () => {
    expect(read('docs/ios/04_API_CONTRACT.md')).toContain('anonLifetimeLimit')
    expect(read('docs/architecture/BACKEND_OWNERSHIP.md')).toContain('"anonLifetimeLimit": 5')
  })

  it('the refusal copy for a guest promises a sign-in, not "tomorrow"', () => {
    const messages = read('src/lib/i18n/serverMessages.ts')
    const block = messages.slice(messages.indexOf("'chat.anonLimit'"), messages.indexOf("'chat.freeLimit'"))
    expect(block).not.toMatch(/hôm nay|ngày mai|for today|tomorrow/)
    expect(block).toMatch(/dùng thử|trial/)
  })
})
