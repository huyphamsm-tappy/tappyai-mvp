import { describe, it, expect, vi } from 'vitest'
import { buildIndexNowBody, indexNowKey, indexNowKeyPath, submitIndexNow, notifyIndexNow, isNeverSubmittedPath, INDEXNOW_ENDPOINT } from './indexNow'
import { GET } from '@/app/.well-known/indexnow/[key]/route'

const ON = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com', INDEXNOW_KEY: 'A1B2C3D4E5F6A7B8' } as unknown as NodeJS.ProcessEnv
const OFF = { NEXT_PUBLIC_SITE_URL: 'https://www.tappyai.com' } as unknown as NodeJS.ProcessEnv

describe('IndexNow — env-gated, same-host, never on the request path', () => {
  it('is off without a valid key (a malformed key is off, not partly on)', () => {
    expect(indexNowKey(OFF)).toBeNull()
    expect(indexNowKey({ ...OFF, INDEXNOW_KEY: 'short' } as NodeJS.ProcessEnv)).toBeNull()
    expect(indexNowKey({ ...OFF, INDEXNOW_KEY: 'zz-not-hex-zz-not-hex' } as NodeJS.ProcessEnv)).toBeNull()
    expect(indexNowKey(ON)).toBe('a1b2c3d4e5f6a7b8')
    expect(buildIndexNowBody(['/food'], OFF)).toBeNull()
  })

  it('builds the protocol body: host, key, keyLocation under .well-known, absolute same-host URLs only, de-duplicated', () => {
    const body = buildIndexNowBody(['/scam-shield', '/scam-shield', 'https://evil.example/x', '/food'], ON)!
    expect(body.host).toBe('www.tappyai.com')
    expect(body.key).toBe('a1b2c3d4e5f6a7b8')
    expect(body.keyLocation).toBe('https://www.tappyai.com/.well-known/indexnow/a1b2c3d4e5f6a7b8.txt')
    expect(body.urlList).toEqual(['https://www.tappyai.com/scam-shield', 'https://www.tappyai.com/food'])
    expect(indexNowKeyPath('k')).toBe('/.well-known/indexnow/k.txt')
  })

  it('POSTs JSON to api.indexnow.org and reports the status; a network failure is reported, never thrown', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 202 })) as unknown as typeof fetch
    const r = await submitIndexNow(['/food'], ON, fetchImpl)
    expect(r).toEqual({ sent: true, status: 202, count: 1 })
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe(INDEXNOW_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body)).urlList).toEqual(['https://www.tappyai.com/food'])
    const boom = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await submitIndexNow(['/food'], ON, boom)).toEqual({ sent: false, reason: 'error' })
    expect(await submitIndexNow(['/food'], OFF, fetchImpl)).toEqual({ sent: false, reason: 'disabled' })
    expect(await submitIndexNow(['https://evil.example/x'], ON, fetchImpl)).toEqual({ sent: false, reason: 'nothing' })
  })

  // A5 (PRIVACY-REVIEW-G1): user share pages are noindex and never pushed, whoever calls.
  it('never submits a public share page: /r/<slug> and /plan/<id> are filtered out', async () => {
    expect(isNeverSubmittedPath('/r/AbCdEfGh12')).toBe(true)
    expect(isNeverSubmittedPath('https://www.tappyai.com/plan/Ab12Cd34Ef56')).toBe(true)
    expect(isNeverSubmittedPath('/reviews')).toBe(false)
    expect(isNeverSubmittedPath('/food')).toBe(false)
    expect(buildIndexNowBody(['/r/AbCdEfGh12', '/plan/Ab12Cd34Ef56'], ON)).toBeNull()
    expect(buildIndexNowBody(['/r/AbCdEfGh12', '/food'], ON)!.urlList).toEqual(['https://www.tappyai.com/food'])
    const fetchImpl = vi.fn(async () => new Response('', { status: 202 })) as unknown as typeof fetch
    expect(await submitIndexNow(['/r/AbCdEfGh12'], ON, fetchImpl)).toEqual({ sent: false, reason: 'nothing' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('notifyIndexNow is a no-op when disabled and never throws', () => {
    expect(() => notifyIndexNow(['/r/AbCdEfGh12'], OFF)).not.toThrow()
  })

  it('the key file answers only the configured key and is noindex; anything else is 404', () => {
    const prev = process.env.INDEXNOW_KEY
    process.env.INDEXNOW_KEY = 'a1b2c3d4e5f6a7b8'
    try {
      expect(GET(new Request('https://x'), { params: { key: 'a1b2c3d4e5f6a7b8.txt' } }).status).toBe(200)
      expect(GET(new Request('https://x'), { params: { key: 'a1b2c3d4e5f6a7b8' } }).status).toBe(404)
      expect(GET(new Request('https://x'), { params: { key: 'ffffffffffffffff.txt' } }).status).toBe(404)
      expect(GET(new Request('https://x'), { params: { key: 'a1b2c3d4e5f6a7b8.txt' } }).headers.get('x-robots-tag')).toBe('noindex')
      delete process.env.INDEXNOW_KEY
      expect(GET(new Request('https://x'), { params: { key: 'a1b2c3d4e5f6a7b8.txt' } }).status).toBe(404)
    } finally {
      if (prev === undefined) delete process.env.INDEXNOW_KEY; else process.env.INDEXNOW_KEY = prev
    }
  })
})
