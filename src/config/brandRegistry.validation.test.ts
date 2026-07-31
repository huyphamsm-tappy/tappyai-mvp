import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BRAND_REGISTRY, BRAND_IDS, normalizeBrandKey, type BrandDefinition } from './brandRegistry'

// Brand-registry validation — `npm run validate:brands` (also part of the
// full vitest suite, and enforced in CI by the Architecture Guard workflow).
// Guards the invariants the runtime silently depends on: an entry that
// violates one of these doesn't crash the app — it quietly renders a wrong or
// missing logo — so the gate lives here, at merge time, instead.

const PUBLIC_DIR = resolve(__dirname, '../../public')
const SUPPORTED_EXTENSIONS = ['svg', 'png'] as const
const entries = BRAND_IDS.map((id) => BRAND_REGISTRY[id] as BrandDefinition)

const isRemote = (logo: string) => /^https:\/\//.test(logo)

describe('brandRegistry — structural validation', () => {
  it('every id equals its registry key (no mismatched/duplicated ids)', () => {
    for (const id of BRAND_IDS) {
      expect(BRAND_REGISTRY[id].id).toBe(id)
    }
    // Object keys are inherently unique; the id===key rule is what makes
    // "duplicate id" impossible to express at all.
    expect(new Set(BRAND_IDS).size).toBe(BRAND_IDS.length)
  })

  it('ids are kebab-case', () => {
    for (const id of BRAND_IDS) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('no duplicate resolution keys across ids, display names, and aliases', () => {
    // Two brands claiming the same normalized key would make resolution
    // order-dependent — the exact bug class the normalized index exists to avoid.
    const seen = new Map<string, string>()
    for (const def of entries) {
      const keys = new Set([normalizeBrandKey(def.id), normalizeBrandKey(def.displayName), ...def.aliases.map(normalizeBrandKey)])
      for (const key of keys) {
        const owner = seen.get(key)
        expect(owner === undefined || owner === def.id, `key "${key}" claimed by both "${owner}" and "${def.id}"`).toBe(true)
        seen.set(key, def.id)
      }
    }
  })

  it('logo paths are valid (local /brands/ path or https:// CDN URL)', () => {
    for (const def of entries) {
      expect(
        isRemote(def.logo) || def.logo.startsWith('/brands/'),
        `${def.id}: logo must live under /brands/ or be an https:// URL, got "${def.logo}"`,
      ).toBe(true)
      expect(def.logo.includes('..'), `${def.id}: path traversal in logo path`).toBe(false)
    }
  })

  it('only supported extensions, matching the declared assetType', () => {
    for (const def of entries) {
      const ext = def.logo.split('.').pop()?.toLowerCase()
      expect(SUPPORTED_EXTENSIONS, `${def.id}: unsupported extension ".${ext}"`).toContain(ext)
      expect(ext, `${def.id}: assetType says "${def.assetType}" but file is ".${ext}"`).toBe(def.assetType)
    }
  })

  it('every LOCAL asset file exists and is non-empty', () => {
    for (const def of entries) {
      if (isRemote(def.logo)) continue // CDN assets are validated at review time, not build time
      const file = join(PUBLIC_DIR, def.logo)
      expect(existsSync(file), `${def.id}: missing asset file public${def.logo}`).toBe(true)
      expect(statSync(file).size, `${def.id}: asset file public${def.logo} is empty`).toBeGreaterThan(0)
    }
  })

  it('scale stays within the optical-correction band the renderer clamps to', () => {
    for (const def of entries) {
      expect(def.scale, `${def.id}: scale out of band`).toBeGreaterThanOrEqual(0.8)
      expect(def.scale, `${def.id}: scale out of band`).toBeLessThanOrEqual(1.15)
    }
  })

  it('required provenance/governance fields are filled', () => {
    for (const def of entries) {
      expect(def.displayName.trim().length, `${def.id}: empty displayName`).toBeGreaterThan(0)
      expect(def.source.trim().length, `${def.id}: empty source (licensing traceability is mandatory)`).toBeGreaterThan(10)
      expect(def.officialWebsite, `${def.id}: officialWebsite must be https`).toMatch(/^https:\/\//)
      expect(def.approvedSince, `${def.id}: approvedSince must be an ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
