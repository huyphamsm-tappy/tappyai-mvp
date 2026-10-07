// @vitest-environment node
// Phase 7 closeout 8F/8G — default plan thumbnail + user-chosen picture (presets only, device-local).
import { describe, it, expect } from 'vitest'
import { PLAN_THUMB_DEFAULT, PLAN_THUMB_PRESETS, readPlanThumb, writePlanThumb, resolvePlanThumb } from './planThumb'
import { existsSync } from 'node:fs'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

describe('plan thumbnail', () => {
  it('order: user choice → real stop photo → default', () => {
    expect(resolvePlanThumb({ chosen: null, coverUrl: null })).toBe(PLAN_THUMB_DEFAULT)
    expect(resolvePlanThumb({ chosen: null, coverUrl: 'https://x/a.jpg' })).toBe('https://x/a.jpg')
    expect(resolvePlanThumb({ chosen: '/home/inspire/spa.webp', coverUrl: 'https://x/a.jpg' })).toBe('/home/inspire/spa.webp')
  })
  it('only a preset can be saved or read back; a tampered value is ignored', () => {
    const s = mem()
    expect(writePlanThumb('p1', 'https://evil.example/x.png', s)).toBe(false)
    expect(writePlanThumb('p1', '/home/inspire/spa.webp', s)).toBe(true)
    expect(readPlanThumb('p1', s)).toBe('/home/inspire/spa.webp')
    s.setItem('tappy.planThumb.p2', 'javascript:alert(1)')
    expect(readPlanThumb('p2', s)).toBeNull()
  })
  it('storage unavailable → no crash, no choice', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(readPlanThumb('p1', broken)).toBeNull()
    expect(writePlanThumb('p1', PLAN_THUMB_DEFAULT, broken)).toBe(false)
  })
  it('every preset is a real local asset', () => {
    for (const p of PLAN_THUMB_PRESETS) expect(existsSync('public' + p), p).toBe(true)
  })
})
