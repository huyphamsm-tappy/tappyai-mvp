import { describe, it, expect, vi } from 'vitest'
import { accountMediaPrefixes, assertOwnerScopedPrefix, videoSourcePrefix, videoStagingPrefix, videoAssetStagingPrefix } from '../key'
import { createVideoSourceDeleter } from './sourceDeletion'
import type { MediaProvider } from '../types'

const U = '11111111-1111-4111-8111-111111111111'
const V = '22222222-2222-4222-8222-222222222222'

function bucket(names: string[], opts: { stuck?: string; failList?: boolean; failDelete?: boolean } = {}) {
  const store = new Set(names)
  const listed: string[] = []
  const deleted: string[] = []
  const provider = {
    id: 'gcs',
    listObjects: vi.fn(async (prefix: string) => {
      listed.push(prefix)
      if (opts.failList) throw new Error('Media provider "gcs" list failed (HTTP 403)')
      return [...store].filter(n => n.startsWith(prefix))
    }),
    deleteObject: vi.fn(async (key: string) => {
      if (opts.failDelete) throw new Error('Media provider "gcs" delete failed (HTTP 500)')
      deleted.push(key)
      if (key === opts.stuck) return true // claims success, the object stays: the re-list must catch it
      return store.delete(key)
    }),
  } as unknown as MediaProvider
  return { provider, store, listed, deleted }
}

describe('the source-bucket prefix of ONE owner', () => {
  it('is vsrc/<uuid>/ and passes the owner-scope guard (never a bucket-wide listing)', () => {
    expect(videoSourcePrefix(U)).toBe(`vsrc/${U}/`)
    expect(assertOwnerScopedPrefix(`vsrc/${U}/`)).toBe(`vsrc/${U}/`)
    for (const p of ['vsrc/', 'vsrc', `vsrc/${U}`, 'vsrc/not-a-uuid/', `vsrc/../`, 'vsrc/AAAAAAAA-0000-4000-8000-000000000001/']) {
      expect(() => assertOwnerScopedPrefix(p), p).toThrow()
    }
  })

  it('staging prefixes: one owner, or one video of one owner; nothing wider', () => {
    const A1 = '33333333-3333-4333-8333-333333333333'
    expect(videoStagingPrefix(U)).toBe(`vstg/${U}/`)
    expect(videoAssetStagingPrefix(U, A1)).toBe(`vstg/${U}/${A1}/`)
    for (const p of ['vstg/', 'vstg', `vstg/${U}`, `vstg/${U}/${A1}`, `vstg/${U}/${A1}/extra/`, `vstg/${U}/not-a-uuid/`, 'vstg/../']) {
      expect(() => assertOwnerScopedPrefix(p), p).toThrow()
    }
    expect(() => videoAssetStagingPrefix(U, 'x/../y')).toThrow()
    expect(accountMediaPrefixes(U).some(p => p.startsWith('vstg'))).toBe(false)
  })

  it('a malformed user id fails before any listing', () => {
    for (const bad of ['', 'x/../y', '*', U + '/', 'vsrc']) expect(() => videoSourcePrefix(bad), bad).toThrow()
  })

  it('is NOT in the public-bucket prefixes: the public listing must never be asked for the private source', () => {
    expect(accountMediaPrefixes(U)).not.toContain(`vsrc/${U}/`)
    expect(accountMediaPrefixes(U).some(p => p.startsWith('vsrc'))).toBe(false)
  })
})

describe('createVideoSourceDeleter', () => {
  it('deletes every object under the owner\'s prefix, lists again to prove it is empty, and returns the count', async () => {
    const b = bucket([`vsrc/${U}/a.mp4`, `vsrc/${U}/b.mov`, `vsrc/${V}/other.mp4`])
    const n = await createVideoSourceDeleter(b.provider).deleteForUser(U)
    expect(n).toBe(2)
    expect([...b.store]).toEqual([`vsrc/${V}/other.mp4`]) // somebody else's source is untouched
    expect(b.listed).toEqual([`vsrc/${U}/`, `vstg/${U}/`, `vdl/${U}/`, `vsrc/${U}/`, `vstg/${U}/`, `vdl/${U}/`]) // list + delete each prefix, then list each again
  })

  it('also removes ALL of the owner\'s transcoder output (private staging), and only theirs', async () => {
    const A1 = '33333333-3333-4333-8333-333333333333'
    const b = bucket([`vsrc/${U}/a.mp4`, `vstg/${U}/${A1}/manifest.m3u8`, `vstg/${U}/${A1}/hls720.ts`, `vstg/${V}/${A1}/manifest.m3u8`])
    expect(await createVideoSourceDeleter(b.provider).deleteForUser(U)).toBe(3)
    expect([...b.store]).toEqual([`vstg/${V}/${A1}/manifest.m3u8`])
  })

  it('🚨 staging that is still there after deletion THROWS', async () => {
    const stuck = `vstg/${U}/33333333-3333-4333-8333-333333333333/x.ts`
    await expect(createVideoSourceDeleter(bucket([stuck], { stuck }).provider).deleteForUser(U)).rejects.toThrow(/remain/)
  })

  it('an owner with nothing stored costs one list and zero deletes', async () => {
    const b = bucket([])
    expect(await createVideoSourceDeleter(b.provider).deleteForUser(U)).toBe(0)
    expect(b.deleted).toEqual([])
  })

  it('🚨 an object that is still there after deletion THROWS, so the job stays pending and is retried', async () => {
    const b = bucket([`vsrc/${U}/a.mp4`], { stuck: `vsrc/${U}/a.mp4` })
    await expect(createVideoSourceDeleter(b.provider).deleteForUser(U)).rejects.toThrow(/remain/)
  })

  it('a list or delete failure propagates (the job is retried, never reported done)', async () => {
    await expect(createVideoSourceDeleter(bucket([`vsrc/${U}/a.mp4`], { failList: true }).provider).deleteForUser(U)).rejects.toThrow()
    await expect(createVideoSourceDeleter(bucket([`vsrc/${U}/a.mp4`], { failDelete: true }).provider).deleteForUser(U)).rejects.toThrow()
  })

  it('🚨 a bad user id is refused before a single storage call', async () => {
    const b = bucket([`vsrc/${U}/a.mp4`])
    await expect(createVideoSourceDeleter(b.provider).deleteForUser('x/../y')).rejects.toThrow()
    expect(b.provider.listObjects).not.toHaveBeenCalled()
  })

  it('with no source bucket configured there is nothing to delete: 0, no error (the feature never ran)', async () => {
    expect(await createVideoSourceDeleter(null).deleteForUser(U)).toBe(0)
  })

  it('a provider that cannot list or delete is an error, never a silent "nothing to do"', async () => {
    const p = { id: 'gcs' } as unknown as MediaProvider
    await expect(createVideoSourceDeleter(p).deleteForUser(U)).rejects.toThrow()
  })
})
