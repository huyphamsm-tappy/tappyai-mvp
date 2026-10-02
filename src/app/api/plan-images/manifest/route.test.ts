import { describe, it, expect } from 'vitest'
import { GET } from './route'
import { PLAN_IMAGE_MANIFEST } from '@/lib/plans/images/manifest'

describe('GET /api/plan-images/manifest (R22)', () => {
  it('answers the agreed shape, public and cacheable; a key with no picture is simply absent (clients show placeholders)', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toMatch(/public/)
    const body = await res.json()
    expect(body).toEqual({ version: PLAN_IMAGE_MANIFEST.version, images: PLAN_IMAGE_MANIFEST.images })
  })
  it('every entry, when added, is https or a replacement key', () => {
    for (const v of Object.values(PLAN_IMAGE_MANIFEST.images)) {
      if (v.status === 'active') expect(v.url).toMatch(/^https:\/\//)
      else expect(v.replacement).toMatch(/^[a-z0-9-]+$/)
    }
  })
})
