/**
 * security-audit M4 — routes reachable without a real account use the DISTRIBUTED limiter.
 *
 * `rateLimit()` / `dailyRateLimit()` (lib/security/rateLimit.ts) keep their counters in a Map
 * inside one serverless instance, so on Vercel every instance grants its own allowance and a
 * flood spread across instances is never capped. `publicRateLimit()` / `publicDailyRateLimit()`
 * share one counter (Upstash / Vercel KV) and fall back to the in-process limiter only where no
 * store is configured. Each route below was moved to them.
 *
 * Two proofs per route: it CONSULTS the distributed limiter under its own key (the old code never
 * called it), and a refusal is honoured (429, or — for the two telemetry routes — a silent 200
 * that writes nothing).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ calls: [] as string[], deny: true, dbCalls: 0 }))

vi.mock('@/lib/security/publicRateLimit', () => ({
  publicRateLimit: vi.fn(async (key: string) => { h.calls.push(key); return { ok: !h.deny, retryAfter: 7, scope: 'distributed' } }),
  publicDailyRateLimit: vi.fn(async (key: string) => { h.calls.push(key); return { ok: !h.deny, retryAfter: 0, scope: 'distributed' } }),
}))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: { id: 'user-1', is_anonymous: false },
    supabase: new Proxy({}, { get: () => { h.dbCalls += 1; throw new Error('no database access expected once limited') } }),
  }),
}))

const req = (path: string, method = 'POST', body: unknown = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.9' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  })

type Case = {
  route: string
  call: () => Promise<Response>
  key: RegExp
  refused: 429 | 'silent'
}

const CASES: Case[] = [
  { route: 'age-declaration', key: /^age-declaration:/, refused: 429,
    call: async () => (await import('@/app/api/age-declaration/route')).POST(req('/api/age-declaration', 'POST', { confirm18: true })) },
  { route: 'auth/anonymous', key: /^anon-session:/, refused: 429,
    call: async () => (await import('@/app/api/auth/anonymous/route')).POST(req('/api/auth/anonymous')) },
  { route: 'commerce/handoff', key: /^commerce-handoff:/, refused: 429,
    call: async () => (await import('@/app/api/commerce/handoff/route')).POST(req('/api/commerce/handoff')) },
  { route: 'links/resolve', key: /^links-resolve:/, refused: 429,
    call: async () => (await import('@/app/api/links/resolve/route')).POST(req('/api/links/resolve', 'POST', { url: 'https://youtu.be/x' })) },
  { route: 'oembed', key: /^oembed:/, refused: 429,
    call: async () => (await import('@/app/api/oembed/route')).GET(req('/api/oembed?url=https://www.tappyai.com/r/AbCdEfGh12', 'GET')) },
  { route: 'qr/entry', key: /^qr-entry:/, refused: 429,
    call: async () => (await import('@/app/api/qr/entry/route')).GET(req('/api/qr/entry?path=/food', 'GET')) },
  { route: 'zalo/mini/verify', key: /^zalo-verify:/, refused: 429,
    call: async () => (await import('@/app/api/zalo/mini/verify/route')).POST(req('/api/zalo/mini/verify')) },
  { route: 'scam-shield/check', key: /^ss:/, refused: 429,
    call: async () => (await import('@/app/api/scam-shield/check/route')).POST(req('/api/scam-shield/check', 'POST', { url: 'https://example.com' })) },
  { route: 'scam-shield/qr', key: /^ss:/, refused: 429,
    call: async () => (await import('@/app/api/scam-shield/qr/route')).POST(req('/api/scam-shield/qr')) },
  { route: 'scam-shield/share', key: /^ss-share:/, refused: 429,
    call: async () => (await import('@/app/api/scam-shield/share/route')).POST(req('/api/scam-shield/share', 'POST', { url: 'https://example.com' })) },
  { route: 'shared-results/[slug] GET', key: /^share-get:/, refused: 429,
    call: async () => (await import('@/app/api/shared-results/[slug]/route')).GET(req('/api/shared-results/AbCdEfGh12', 'GET'), { params: { slug: 'AbCdEfGh12' } }) },
  { route: 'shared-results/[slug] DELETE', key: /^share-delete:/, refused: 429,
    call: async () => (await import('@/app/api/shared-results/[slug]/route')).DELETE(req('/api/shared-results/AbCdEfGh12', 'DELETE'), { params: { slug: 'AbCdEfGh12' } }) },
  { route: 'track', key: /^track:/, refused: 'silent',
    call: async () => (await import('@/app/api/track/route')).POST(req('/api/track', 'POST', { events: [] })) },
  { route: 'reviews/[id]/interact', key: /^interact:user-1$/, refused: 'silent',
    call: async () => (await import('@/app/api/reviews/[id]/interact/route')).POST(req('/api/reviews/r1/interact', 'POST', { watch_seconds: 3 }), { params: { id: 'r1' } }) },
]

beforeEach(() => {
  h.calls = []
  h.deny = true
  h.dbCalls = 0
})

describe('M4 — public routes are capped by the distributed limiter', () => {
  it.each(CASES.map((c) => [c.route, c] as const))('%s consults publicRateLimit and honours a refusal', async (_name, c) => {
    const res = await c.call()
    expect(h.calls.some((k) => c.key.test(k)), `expected a distributed-limiter key matching ${c.key}; got ${JSON.stringify(h.calls)}`).toBe(true)
    if (c.refused === 429) {
      expect(res.status).toBe(429)
    } else {
      expect(res.status).toBe(200)
      expect(h.dbCalls).toBe(0)
    }
  })
})

describe('guard — none of these routes imports the per-instance limiter again', () => {
  const FILES = [
    'age-declaration', 'auth/anonymous', 'commerce/handoff', 'links/resolve', 'oembed', 'qr/entry', 'zalo/mini/verify',
    'reviews/[id]/interact', 'scam-shield/check', 'scam-shield/qr', 'scam-shield/share', 'track', 'shared-results/[slug]',
  ].map((r) => `src/app/api/${r}/route.ts`)

  it.each(FILES)('%s', (file) => {
    const src = fs.readFileSync(file, 'utf8')
    const imported = src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/security\/rateLimit'/)?.[1] ?? ''
    expect(imported).not.toMatch(/\b(rateLimit|dailyRateLimit)\b/)
    expect(src).toMatch(/\bpublic(Daily)?RateLimit\(/)
  })
})
