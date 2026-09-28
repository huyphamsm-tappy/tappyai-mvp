// Owner-approved 6-area frames (2026-09-29): ONE area's block + the small core per turn, short.
import { describe, it, expect } from 'vitest'
import { buildDomainFrame, frameDomainOf, FRAME_CORE, type FrameDomain } from './domainFrames'
import { buildConsultativeV1Block } from './consultativeV1Prompt'
import { deriveSituation } from './situationFrame'

const AREAS: FrameDomain[] = ['food', 'shopping', 'travel', 'entertainment', 'spa', 'main']
const HEADS: Record<FrameDomain, string> = {
  food: 'KHUNG TRA LOI — AN UONG', shopping: 'KHUNG TRA LOI — MUA SAM', travel: 'KHUNG TRA LOI — DU LICH',
  entertainment: 'KHUNG TRA LOI — GIAI TRI', spa: 'KHUNG TRA LOI — SPA / CHAM SOC', main: 'KHUNG TRA LOI — CHUNG',
}
const frame = deriveSituation(['quán phở ngon quận 3'], { budget: null, location: { text: 'quận 3' } } as never)

describe('frameDomainOf', () => {
  it('maps the turn area; a plan decides by its type; unknown → main', () => {
    expect(frameDomainOf('food')).toBe('food')
    expect(frameDomainOf('shopping')).toBe('shopping')
    expect(frameDomainOf('travel')).toBe('travel')
    expect(frameDomainOf('entertainment')).toBe('entertainment')
    expect(frameDomainOf('spa')).toBe('spa')
    expect(frameDomainOf(null)).toBe('main')
    expect(frameDomainOf('food', 'trip')).toBe('travel')
    expect(frameDomainOf(null, 'evening')).toBe('entertainment')
  })
})

describe('buildDomainFrame / V1 block', () => {
  it('loads ONLY the area of the turn, plus the core', () => {
    for (const d of AREAS) {
      const block = buildConsultativeV1Block({ frame, hardGaps: [], rendersCard: true, lang: 'vi', domain: d })
      expect(block).toContain(HEADS[d])
      for (const other of AREAS.filter(o => o !== d)) expect(block).not.toContain(HEADS[other])
      expect(block).toContain('LOI CHUNG (moi mang)')
      // the generic 3-sentence shape is replaced, not stacked
      expect(block).not.toContain('HINH DANG CAU TRA LOI (3-5 cau')
    }
  })

  it('no area → the previous generic shape, no frame', () => {
    const block = buildConsultativeV1Block({ frame, hardGaps: [], rendersCard: true, lang: 'vi' })
    expect(block).toContain('HINH DANG CAU TRA LOI (3-5 cau')
    for (const d of AREAS) expect(block).not.toContain(HEADS[d])
  })

  it('stays short: each frame + core ≤ ~500 tokens (chars/3.5; V1 generic shape was ~300)', () => {
    for (const d of AREAS) expect(buildDomainFrame(d).length / 3.5).toBeLessThan(500)
    expect(FRAME_CORE.length / 3.5).toBeLessThan(200)
  })

  it('carries the approved principles in the core', () => {
    expect(FRAME_CORE).toMatch(/KHONG xin thong tin ca nhan/)
    expect(FRAME_CORE).toMatch(/Link tim kiem thi ghi ro/)
    expect(FRAME_CORE).toMatch(/KHONG bia gio, gia, suat chieu, khuyen mai, con cho/)
    expect(FRAME_CORE).toMatch(/TRUNG PHEP TINH/)
    expect(FRAME_CORE).toMatch(/phù hợp", "giá hợp lý/)
    expect(FRAME_CORE).toMatch(/ten DAU TIEN ban nhac/)
  })
})
