import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DELETION_READY_FAIL_TTL_MS, DELETION_READY_TTL_MS, __resetDeletionReadyCache, accountDeletionSchemaReady, selfDeleteAvailable,
} from './deletionReady'

// The readiness gate. ACCOUNT_SELF_DELETE_ENABLED was already `true` in Production before the clean-up existed, so the flag alone
// must not be able to turn deletion on: the database has to say its clean-up is installed (RPC account_deletion_ready()).
const ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-sentinel', ACCOUNT_SELF_DELETE_ENABLED: 'true' }
const rpc = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

beforeEach(() => __resetDeletionReadyCache())

describe('accountDeletionSchemaReady', () => {
  it('RPC says true -> true; calls exactly the one read-only RPC with the public key in headers only', async () => {
    const f = vi.fn().mockResolvedValue(rpc(true))
    expect(await accountDeletionSchemaReady({ env: ENV, fetchImpl: f })).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://proj.supabase.co/rest/v1/rpc/account_deletion_ready')
    expect(String(url)).not.toContain('public-anon-key-sentinel')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(init.redirect).toBe('error')
    expect(init.headers).toMatchObject({ apikey: 'public-anon-key-sentinel', Authorization: 'Bearer public-anon-key-sentinel' })
  })
  it('only the JSON literal true counts', async () => {
    for (const body of [false, null, '"true"', 1, { ready: true }, [true], '']) {
      __resetDeletionReadyCache()
      expect(await accountDeletionSchemaReady({ env: ENV, fetchImpl: vi.fn().mockResolvedValue(rpc(body)) }), JSON.stringify(body)).toBe(false)
    }
  })
  it('the function does not exist (migration not applied -> PostgREST 404) -> false', async () => {
    const f = vi.fn().mockResolvedValue(rpc({ code: 'PGRST202', message: 'Could not find the function public.account_deletion_ready' }, 404))
    expect(await accountDeletionSchemaReady({ env: ENV, fetchImpl: f })).toBe(false)
  })
  it('errors / malformed / oversized / network failure / refused redirect -> false, never throws', async () => {
    const bad: Array<() => Promise<Response>> = [
      async () => rpc('x', 500), async () => rpc('x', 401), async () => rpc('<html>'), async () => rpc('x'.repeat(500)),
      async () => { throw new TypeError('fetch failed') }, async () => { throw new TypeError('redirect mode is set to error') },
    ]
    for (const b of bad) {
      __resetDeletionReadyCache()
      expect(await accountDeletionSchemaReady({ env: ENV, fetchImpl: vi.fn(b) as unknown as typeof fetch })).toBe(false)
    }
  })
  it('timeout -> false', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))))
    expect(await accountDeletionSchemaReady({ env: ENV, fetchImpl: f as unknown as typeof fetch, timeoutMs: 20 })).toBe(false)
  })
  it('no Supabase env, or a non-https / credentialed URL -> false and NO network call', async () => {
    const f = vi.fn()
    for (const env of [{}, { NEXT_PUBLIC_SUPABASE_URL: ENV.NEXT_PUBLIC_SUPABASE_URL }, { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' },
      { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'http://proj.supabase.co' }, { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://u:p@proj.supabase.co' }, { ...ENV, NEXT_PUBLIC_SUPABASE_URL: 'nope' }]) {
      expect(await accountDeletionSchemaReady({ env, fetchImpl: f })).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('cached for the TTL, then it asks again and follows the change (the owner applies the migration -> it turns true)', async () => {
    let t = 1_000_000
    const f = vi.fn().mockResolvedValueOnce(rpc(false)).mockResolvedValueOnce(rpc(true))
    const d = { env: ENV, fetchImpl: f, now: () => t }
    expect(await accountDeletionSchemaReady(d)).toBe(false)
    t += DELETION_READY_TTL_MS - 1
    expect(await accountDeletionSchemaReady(d)).toBe(false)
    expect(f).toHaveBeenCalledTimes(1)
    t += 2
    expect(await accountDeletionSchemaReady(d)).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a failure is remembered only briefly', async () => {
    let t = 9_000_000
    const f = vi.fn().mockResolvedValueOnce(rpc('x', 503)).mockResolvedValueOnce(rpc(true))
    const d = { env: ENV, fetchImpl: f, now: () => t }
    expect(await accountDeletionSchemaReady(d)).toBe(false)
    t += DELETION_READY_FAIL_TTL_MS + 1
    expect(await accountDeletionSchemaReady(d)).toBe(true)
  })
})

describe('selfDeleteAvailable = the env flag AND the installed clean-up', () => {
  it('flag off -> false WITHOUT asking the database', async () => {
    const f = vi.fn()
    for (const flag of [undefined, '', 'false', '1', 'TRUE']) {
      expect(await selfDeleteAvailable({ env: { ...ENV, ACCOUNT_SELF_DELETE_ENABLED: flag }, fetchImpl: f })).toBe(false)
    }
    expect(f).not.toHaveBeenCalled()
  })
  it('flag on + clean-up installed -> true', async () => {
    expect(await selfDeleteAvailable({ env: ENV, fetchImpl: vi.fn().mockResolvedValue(rpc(true)) })).toBe(true)
  })
  it('🚨 flag on + clean-up NOT installed -> false (the Production situation before the migration is applied)', async () => {
    for (const r of [rpc(false), rpc({ code: 'PGRST202' }, 404), rpc('x', 500)]) {
      __resetDeletionReadyCache()
      expect(await selfDeleteAvailable({ env: ENV, fetchImpl: vi.fn().mockResolvedValue(r) })).toBe(false)
    }
  })
})
