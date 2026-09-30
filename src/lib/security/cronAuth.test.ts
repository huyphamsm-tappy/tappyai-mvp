/**
 * security-audit L6 — scheduler routes check CRON_SECRET in constant time, in one place.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { isAuthorizedCronRequest } from './cronAuth'

const tse = vi.hoisted(() => ({ calls: [] as Array<[Buffer, Buffer]> }))
vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:crypto')>()
  const timingSafeEqual = (a: Buffer, b: Buffer) => {
    tse.calls.push([a, b])
    return real.timingSafeEqual(a, b)
  }
  return { ...real, default: { ...real, timingSafeEqual }, timingSafeEqual }
})

const withAuth = (value: string | null) => ({ headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? value : null) } })
const ENV = { CRON_SECRET: 's3cr3t-value-for-tests' }

describe('isAuthorizedCronRequest', () => {
  it('accepts exactly "Bearer <CRON_SECRET>"', () => {
    expect(isAuthorizedCronRequest(withAuth(`Bearer ${ENV.CRON_SECRET}`), ENV)).toBe(true)
  })

  it('rejects everything else', () => {
    for (const h of [null, '', ENV.CRON_SECRET, `bearer ${ENV.CRON_SECRET}`, `Bearer ${ENV.CRON_SECRET} `,
      `Bearer ${ENV.CRON_SECRET}x`, `Bearer ${ENV.CRON_SECRET.slice(0, -1)}`, 'Bearer ', `Basic ${ENV.CRON_SECRET}`]) {
      expect(isAuthorizedCronRequest(withAuth(h), ENV), String(h)).toBe(false)
    }
  })

  it('fails closed without a configured secret — "Bearer undefined" included', () => {
    for (const env of [{}, { CRON_SECRET: '' }]) {
      expect(isAuthorizedCronRequest(withAuth('Bearer undefined'), env)).toBe(false)
      expect(isAuthorizedCronRequest(withAuth('Bearer '), env)).toBe(false)
    }
  })

  it('compares in constant time: timingSafeEqual on equal-length digests', () => {
    tse.calls.length = 0
    isAuthorizedCronRequest(withAuth('Bearer short'), ENV)
    isAuthorizedCronRequest(withAuth(`Bearer ${'x'.repeat(500)}`), ENV)
    expect(tse.calls).toHaveLength(2)
    for (const [a, b] of tse.calls) expect(a.length).toBe(b.length)
  })
})

describe('guard — every scheduler route uses it', () => {
  const routes = [
    ...fs.readdirSync('src/app/api/cron').map((d) => path.join('src/app/api/cron', d, 'route.ts')).filter((f) => fs.existsSync(f)),
    'src/app/api/notifications/backfill/route.ts',
  ]

  it('covers all 15 cron routes and the notifications backfill', () => {
    // 15 since the R21 click-attributions-sweep cron (rc, 2026-09-29) — added after L6 was written.
    expect(routes.length).toBe(16)
  })

  it.each(routes)('%s', (file) => {
    const src = fs.readFileSync(file, 'utf8')
    expect(src).toMatch(/import \{ isAuthorizedCronRequest \} from '@\/lib\/security\/cronAuth'/)
    expect(src).toMatch(/if \(!isAuthorizedCronRequest\(req\)\)/)
    expect(src).not.toMatch(/process\.env\.CRON_SECRET/)
    expect(src).not.toMatch(/!==\s*`Bearer/)
  })
})
