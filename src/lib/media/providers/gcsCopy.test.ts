import { describe, it, expect, vi } from 'vitest'
import { createGcsProvider } from './gcs'
import { MediaCredentialsUnavailableError, MediaStorageError } from '../types'

// Explore video: the server-side copy that promotes an approved video's HLS files from the private source bucket into the delivery bucket.
const OWNER = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const SRC = `vstg/${OWNER}/${ASSET}/manifest.m3u8`
const DEST = `vdel/${OWNER}/${ASSET}/manifest.m3u8`

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const make = (fetchImpl: typeof fetch, token: (() => Promise<string>) | null = async () => 'tok') =>
  createGcsProvider({ bucket: 'delivery-bucket', getAccessToken: token, fetchImpl, makeTimeoutSignal: () => new AbortController().signal })

describe('GcsProvider.copyObject', () => {
  it('rewrites from the SOURCE bucket into THIS (delivery) bucket, with the metadata the caller chose', async () => {
    const fetchImpl = vi.fn(async () => json({ done: true })) as unknown as typeof fetch
    await make(fetchImpl).copyObject!({ bucket: 'source-bucket', key: SRC }, DEST, { contentType: 'application/vnd.apple.mpegurl', cacheControl: 'public, max-age=60' })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `https://storage.googleapis.com/storage/v1/b/source-bucket/o/${encodeURIComponent(SRC)}/rewriteTo/b/delivery-bucket/o/${encodeURIComponent(DEST)}`,
    )
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init.body))).toEqual({ contentType: 'application/vnd.apple.mpegurl', cacheControl: 'public, max-age=60' })
  })

  it('follows a multi-step rewrite with the token until done, and gives up after a bounded number of calls', async () => {
    const steps = [json({ done: false, rewriteToken: 't1' }), json({ done: false, rewriteToken: 't2' }), json({ done: true })]
    const fetchImpl = vi.fn(async () => steps.shift()!) as unknown as typeof fetch
    await make(fetchImpl).copyObject!({ bucket: 'source-bucket', key: SRC }, DEST)
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0] as string)
    expect(urls[1]).toContain('?rewriteToken=t1')
    expect(urls[2]).toContain('?rewriteToken=t2')

    const forever = vi.fn(async () => json({ done: false, rewriteToken: 'again' })) as unknown as typeof fetch
    await expect(make(forever).copyObject!({ bucket: 'source-bucket', key: SRC }, DEST)).rejects.toBeInstanceOf(MediaStorageError)
    expect((forever as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(10)
  })

  it('a refusal (including a missing source) throws with the status only, never the body', async () => {
    const fetchImpl = (async () => json({ error: { message: `no such object ${SRC}` } }, 404)) as unknown as typeof fetch
    const err = await make(fetchImpl).copyObject!({ bucket: 'source-bucket', key: SRC }, DEST).catch(e => e as Error)
    expect(err).toBeInstanceOf(MediaStorageError)
    expect((err as Error).message).toContain('HTTP 404')
    expect((err as Error).message).not.toContain(OWNER)
  })

  it('refuses a bad key, a bad source bucket and a missing credential BEFORE any request', async () => {
    const fetchImpl = vi.fn(async () => json({ done: true })) as unknown as typeof fetch
    const p = make(fetchImpl)
    await expect(p.copyObject!({ bucket: 'source-bucket', key: `../${SRC}` }, DEST)).rejects.toThrow()
    await expect(p.copyObject!({ bucket: 'source-bucket', key: SRC }, 'vdel/../x')).rejects.toThrow()
    await expect(p.copyObject!({ bucket: 'Bad Bucket/..', key: SRC }, DEST)).rejects.toBeInstanceOf(MediaStorageError)
    await expect(make(fetchImpl, null).copyObject!({ bucket: 'source-bucket', key: SRC }, DEST)).rejects.toBeInstanceOf(MediaCredentialsUnavailableError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
