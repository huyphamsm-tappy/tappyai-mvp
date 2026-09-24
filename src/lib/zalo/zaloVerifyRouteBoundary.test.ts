import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// G1 Guard — the classification of POST /api/zalo/mini/verify, locked.
//
//   PRIVATE API · POST only · not crawlable · not Tappy-authenticated (pre-identity)
//   · authorized by SERVER-SIDE Zalo token verification · Mini-App-only by purpose
//   · emits no identity material · never part of the GEO surface.
//
// Each property below is something a future edit could silently undo (adding a
// GET, dropping the noindex header, echoing the hash). This file is where that
// becomes a red test instead of a quiet regression.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..', '..')
const ROUTE = 'src/app/api/zalo/mini/verify/route.ts'
const src = () => readFileSync(join(ROOT, ROUTE), 'utf8')

const SECRET = 'z'.repeat(48)

async function post(body: unknown, env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  vi.resetModules()
  const { POST } = await import('@/app/api/zalo/mini/verify/route')
  const req = new NextRequest(new Request('https://www.tappyai.com/api/zalo/mini/verify', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body),
  }))
  return POST(req)
}

describe('POST /api/zalo/mini/verify — classification', () => {
  const saved = { ...process.env }
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { process.env = { ...saved } })

  it('exports POST and nothing a crawler could fetch (no GET/HEAD), and opts out of static rendering', () => {
    const s = src()
    expect(s).toMatch(/export async function POST\(/)
    expect(s).not.toMatch(/export (async )?function (GET|HEAD)\b/)
    expect(s).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(s).not.toMatch(/export const revalidate/)
  })

  it('lives under /api/, which robots.txt disallows, and is never a sitemap entry', () => {
    const robots = readFileSync(join(ROOT, 'src/app/robots.ts'), 'utf8')
    expect(robots).toMatch(/'\/api\/'/)
    const sitemap = readFileSync(join(ROOT, 'src/app/sitemap.ts'), 'utf8')
    expect(sitemap).not.toMatch(/api\//)
  })

  it('is not a shared-result surface and cannot reach the AI pipeline', () => {
    const s = src()
    expect(s).not.toMatch(/sharedResultStore|@\/lib\/ai\/|streamText|generateText/)
  })

  it('is not Tappy-authenticated by design: its authorization is server-side Zalo verification', () => {
    const s = src()
    expect(s).not.toMatch(/getRequestUser/)
    expect(s).toMatch(/resolveVerifier\(\)\.verify\(token\)/)
    // The mock verifier is opt-in and refused in production builds.
    expect(s).toMatch(/env\.ZALO_VERIFIER === 'mock' && env\.NODE_ENV !== 'production'/)
  })

  it('refuses to operate without the server secret (503) and sets no cookie', async () => {
    const res = await post({ access_token: 'mock:123456789' }, { ZALO_IDENTITY_SECRET: undefined, ZALO_VERIFIER: 'mock' })
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('rejects a bad token (401) without leaking anything, and validates the body (400)', async () => {
    const bad = await post({ access_token: 'not-a-mock-token' }, { ZALO_IDENTITY_SECRET: SECRET, ZALO_VERIFIER: 'mock' })
    expect(bad.status).toBe(401)
    expect(bad.headers.get('set-cookie')).toBeNull()
    const body = await bad.json()
    expect(Object.keys(body).sort()).toEqual(['error', 'message'])
    expect(JSON.stringify(body)).not.toMatch(new RegExp(SECRET.slice(0, 8)))
    const malformed = await post({}, { ZALO_IDENTITY_SECRET: SECRET, ZALO_VERIFIER: 'mock' })
    expect(malformed.status).toBe(400)
  })

  it('on success emits exactly {ok:true}; the HMAC is only in an httpOnly cookie; secret never leaves', async () => {
    const res = await post({ access_token: 'mock:123456789' }, { ZALO_IDENTITY_SECRET: SECRET, ZALO_VERIFIER: 'mock' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^tappy_zalo=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+;/)
    expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/)
    expect(cookie).not.toContain('123456789')
    expect(cookie).not.toContain(SECRET.slice(0, 8))
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('the anonymous-write guard classifies it explicitly (not silently exempt)', () => {
    const guard = readFileSync(join(ROOT, 'src/lib/auth/anonymousWriteBoundary.test.ts'), 'utf8')
    expect(guard).toMatch(/'zalo\/mini\/verify': '.{12,}'/)
  })
})
