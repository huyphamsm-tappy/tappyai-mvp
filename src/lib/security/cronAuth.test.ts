/**
 * security-audit L6 — the account-deletion cron checks CRON_SECRET in constant time (the other crons on main keep their own inline check; this hotfix does not touch them).
 */
import { describe, it, expect, vi } from 'vitest'
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
