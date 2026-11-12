import { describe, it, expect } from 'vitest'
import { createAbuseMonitor } from './abuseGuard'

const clock = () => { let t = Date.UTC(2026, 10, 11, 3, 0, 0); return { now: () => new Date(t), tick: (ms: number) => { t += ms } } }
// HCMC districts, roughly 0.05-0.1 degrees apart
const D = { d1: [10.776, 106.7], d3: [10.78, 106.68], d5: [10.754, 106.66], d7: [10.73, 106.72], binhThanh: [10.81, 106.71] } as const

describe('spatial / temporal abuse monitor (placeholder thresholds, uncalibrated)', () => {
  it('ordinary discovery in one place is normal, however often it repeats', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    for (let i = 0; i < 60; i++) { expect(m.observe('p1', { lat: D.d1[0], lng: D.d1[1], tool: i % 2 ? 'search_restaurants' : 'search_places' }).level).toBe('normal'); c.tick(5_000) }
  })
  it('a legitimate multi-district tourist itinerary with several categories stays normal', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    const tools = ['search_places', 'search_restaurants', 'search_attractions', 'search_hotels']
    let worst = 'normal'
    for (const d of Object.values(D)) for (const t of tools) { const r = m.observe('tourist', { lat: d[0], lng: d[1], tool: t }); if (r.level !== 'normal') worst = r.level; c.tick(20_000) }
    expect(worst).toBe('normal')
  })
  it('coordinate walking with ONE category is suspicious first (no category rotation to boost it)', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) { seen.add(m.observe('walker', { lat: 10.0 + i * 0.05, lng: 106.0, tool: 'search_places' }).level); c.tick(3_000) }
    expect(seen.has('suspicious')).toBe(true); expect(seen.has('high')).toBe(false)
  })
  it('a systematic grid traversal with category rotation escalates to elevated (depth reduced) and then high', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    const seen = new Set<string>(); let depth = 1
    for (let i = 0; i < 40; i++) for (let j = 0; j < 3; j++) {
      const r = m.observe('scraper', { lat: 10.0 + i * 0.05, lng: 106.0 + j * 0.05, tool: ['search_places', 'search_restaurants', 'search_attractions', 'search_hotels', 'search_shopping'][(i + j) % 5] })
      seen.add(r.level); if (r.level === 'elevated') depth = Math.min(depth, r.depthFactor)
      c.tick(3_000)
    }
    expect(seen.has('elevated')).toBe(true); expect(seen.has('high')).toBe(true)
    expect(depth).toBeLessThan(1)
  })
  it('one principal being flagged does not affect another', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    for (let i = 0; i < 60; i++) { m.observe('scraper', { lat: 10 + i * 0.05, lng: 106 + (i % 7) * 0.05, tool: 'search_places' }); c.tick(1_000) }
    expect(m.observe('other', { lat: D.d1[0], lng: D.d1[1], tool: 'search_places' }).level).toBe('normal')
  })
  it('old observations leave the window, so a slow legitimate traveller recovers', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now, windowMs: 10 * 60_000 })
    for (let i = 0; i < 20; i++) { m.observe('p', { lat: 10 + i * 0.05, lng: 106, tool: 'search_places' }); c.tick(2_000) }
    c.tick(30 * 60_000)
    expect(m.observe('p', { lat: D.d1[0], lng: D.d1[1], tool: 'search_places' }).level).toBe('normal')
  })
  it('a call with no coordinates (shopping, text-only) carries no spatial signal and cannot raise the level', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    for (let i = 0; i < 100; i++) expect(m.observe('p', { tool: 'search_shopping' }).level).toBe('normal')
  })
  it('HARVESTING: handing out hundreds of DISTINCT results escalates even from one cell; re-reading the same results does not', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now })
    const tools = ['search_places', 'search_restaurants', 'search_attractions', 'search_hotels', 'search_shopping']
    const levels = new Set<string>()
    for (let i = 0; i < 70; i++) { levels.add(m.observe('h', { lat: D.d1[0], lng: D.d1[1], tool: tools[i % 5], query: `q${i}` }).level); m.recordResults!('h', Array.from({ length: 10 }, (_, j) => `r${i}-${j}`)); c.tick(2_000) }
    expect(levels.has('normal')).toBe(true); expect(levels.has('elevated')).toBe(true); expect(levels.has('high')).toBe(true)
    const same = createAbuseMonitor({ now: c.now })
    for (let i = 0; i < 200; i++) { expect(same.observe('s', { lat: D.d1[0], lng: D.d1[1], tool: 'search_places', query: 'pho' }).level).toBe('normal'); same.recordResults!('s', ['a', 'b', 'c', 'd', 'e']); c.tick(1_000) }
  })
  it('a legitimate tourist session (20 calls, 5 results each, 5 districts, 4 categories) stays normal even counting its results', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now }); let n = 0; let worst = 'normal'
    for (const d of Object.values(D)) for (const t of ['search_places', 'search_restaurants', 'search_attractions', 'search_hotels']) {
      const v = m.observe('t', { lat: d[0], lng: d[1], tool: t, query: `${t} nice` }); if (v.level !== 'normal') worst = v.level
      m.recordResults!('t', Array.from({ length: 5 }, (_, j) => `r${n++}-${j}`)); c.tick(15_000)
    }
    expect(worst).toBe('normal')
  })
  it('TEMPLATE: one query walked over many cells is at least suspicious even before the cell count alone would say so', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now }); const seen = new Set<string>()
    for (let i = 0; i < 9; i++) { seen.add(m.observe('w', { lat: 10 + i * 0.05, lng: 106, tool: 'search_places', query: i % 2 ? '  Phở   BÒ ' : 'phở bò' }).level); c.tick(3_000) }
    expect(seen.has('suspicious')).toBe(true)
    const diff = createAbuseMonitor({ now: c.now })
    for (let i = 0; i < 9; i++) expect(diff.observe('d', { lat: 10 + i * 0.05, lng: 106, tool: 'search_places', query: `different ${i}` }).level).toBe('normal')
  })
  it('result ids age out of the window and the id table is bounded', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now, windowMs: 60_000, maxPrincipals: 50 })
    m.recordResults!('a', Array.from({ length: 400 }, (_, i) => `r${i}`)); c.tick(120_000)
    expect(m.observe('a', { lat: 10, lng: 106, tool: 'search_places' }).level).toBe('normal')
    for (let i = 0; i < 500; i++) m.recordResults!(`p${i}`, ['x'])
    expect(m.size()).toBeLessThanOrEqual(50)
  })
  it('is bounded in memory: a flood of distinct principals does not grow without limit', () => {
    const c = clock(); const m = createAbuseMonitor({ now: c.now, maxPrincipals: 100 })
    for (let i = 0; i < 1000; i++) m.observe(`p${i}`, { lat: 10, lng: 106, tool: 'search_places' })
    expect(m.size()).toBeLessThanOrEqual(100)
  })
})
