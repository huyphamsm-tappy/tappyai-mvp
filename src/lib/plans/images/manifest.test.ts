import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { PLAN_IMAGE_MANIFEST, IMAGE_KEYS } from './manifest'
import { SPOT_IMAGE_KEY_RE, HERO_IMAGE_KEY_RE } from '@/lib/plans/share/planShare'

// Every picture the manifest promises must exist in public/, be a small WebP, use a key the three clients accept, and be https.
describe('plan image manifest', () => {
  it('every entry is https, has a file, and a key the clients accept', () => {
    expect(IMAGE_KEYS.length).toBeGreaterThan(0)
    for (const k of IMAGE_KEYS) {
      expect(SPOT_IMAGE_KEY_RE.test(k) || HERO_IMAGE_KEY_RE.test(k)).toBe(true)
      const e = PLAN_IMAGE_MANIFEST.images[k]
      expect(e.status).toBe('active')
      if (e.status === 'active') expect(e.url).toMatch(/^https:\/\/.+\/plan-images\/v1\/.+\.webp\?v=\d+$/)
      const f = `public/plan-images/v1/${k}.webp`
      expect(existsSync(f)).toBe(true)
      expect(statSync(f).size).toBeLessThan(150 * 1024)
    }
  })
})
