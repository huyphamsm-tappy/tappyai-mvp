import { describe, it, expect } from 'vitest'
import { OWNER, memoryBucket } from './__fixtures__/memoryDeliveryStore'
import type { CdnInvalidator } from './cdnInvalidate'
import { createVideoDeliveryDeleter } from './deliveryDeletion'

const OTHER = '99999999-9999-4999-8999-999999999999'
const A1 = '22222222-2222-4222-8222-222222222222'
const A2 = '44444444-4444-4444-8444-444444444444'
const cdn = () => { const paths: string[] = []; const c: CdnInvalidator = { async invalidate(p) { paths.push(p) } }; return { c, paths } }

describe('createVideoDeliveryDeleter (account deletion)', () => {
  it('removes ALL of one owner\'s delivery copies, verifies by listing again, and invalidates that owner\'s CDN path; another user is untouched', async () => {
    const b = memoryBucket('d', [`vdel/${OWNER}/${A1}/manifest.m3u8`, `vdel/${OWNER}/${A1}/s0.ts`, `vdel/${OWNER}/${A2}/manifest.m3u8`, `vdel/${OTHER}/${A1}/manifest.m3u8`])
    const { c, paths } = cdn()
    expect(await createVideoDeliveryDeleter(b.provider, c).deleteForUser(OWNER)).toBe(3)
    expect([...b.objects.keys()]).toEqual([`vdel/${OTHER}/${A1}/manifest.m3u8`])
    expect(paths).toEqual([`/vdel/${OWNER}/*`])
  })

  it('🚨 THROWS when an object is still there after the delete (the job stays pending; "done" is never reported)', async () => {
    const b = memoryBucket('d', [`vdel/${OWNER}/${A1}/manifest.m3u8`])
    b.opts.stuck.add(`vdel/${OWNER}/${A1}/manifest.m3u8`)
    await expect(createVideoDeliveryDeleter(b.provider, cdn().c).deleteForUser(OWNER)).rejects.toThrow(/remain/)
  })

  it('THROWS when a delete fails, when the list fails, or when the CDN call fails', async () => {
    const del = memoryBucket('d', [`vdel/${OWNER}/${A1}/manifest.m3u8`]); del.opts.failDelete.add(`vdel/${OWNER}/${A1}/manifest.m3u8`)
    await expect(createVideoDeliveryDeleter(del.provider, cdn().c).deleteForUser(OWNER)).rejects.toThrow()
    const list = memoryBucket('d'); list.opts.failList = true
    await expect(createVideoDeliveryDeleter(list.provider, cdn().c).deleteForUser(OWNER)).rejects.toThrow()
    const bad: CdnInvalidator = { async invalidate() { throw new Error('cdn down') } }
    await expect(createVideoDeliveryDeleter(memoryBucket('d', [`vdel/${OWNER}/${A1}/m.m3u8`]).provider, bad).deleteForUser(OWNER)).rejects.toThrow()
  })

  it('with no delivery bucket configured (the feature was never switched on) there is nothing to delete: 0, and no CDN call', async () => {
    const { c, paths } = cdn()
    expect(await createVideoDeliveryDeleter(null, c).deleteForUser(OWNER)).toBe(0)
    expect(paths).toEqual([])
  })

  it('an owner with nothing stored costs no CDN call', async () => {
    const { c, paths } = cdn()
    expect(await createVideoDeliveryDeleter(memoryBucket('d').provider, c).deleteForUser(OWNER)).toBe(0)
    expect(paths).toEqual([])
  })

  it('a malformed user id is refused before anything is asked of storage', async () => {
    const b = memoryBucket('d', [`vdel/${OWNER}/${A1}/manifest.m3u8`])
    await expect(createVideoDeliveryDeleter(b.provider, null).deleteForUser('x/../y')).rejects.toThrow()
    expect(b.log.deletes).toEqual([])
  })

  it('objects were removed but the CDN is not configured: THROWS (cached copies may still be served), so the job retries', async () => {
    const b = memoryBucket('d', [`vdel/${OWNER}/${A1}/manifest.m3u8`])
    await expect(createVideoDeliveryDeleter(b.provider, null).deleteForUser(OWNER)).rejects.toThrow(/cdn/i)
  })
})
