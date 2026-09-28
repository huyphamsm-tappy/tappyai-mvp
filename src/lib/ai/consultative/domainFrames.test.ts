// Owner 2026-09-29 ("LÀM LẠI AI TƯ VẤN"): one area block + the small core per turn, by turn type.
import { describe, it, expect } from 'vitest'
import { buildDomainFrame, frameDomainOf, FRAME_CORE, PLAN_HEADINGS, type FrameDomain } from './domainFrames'
import { buildConsultativeV1Block } from './consultativeV1Prompt'
import { deriveSituation } from './situationFrame'

const AREAS: FrameDomain[] = ['food', 'shopping', 'travel', 'entertainment', 'spa']
const frame = deriveSituation(['quán phở ngon quận 3'], { budget: null, location: { text: 'quận 3' } } as never)

describe('frameDomainOf', () => {
  it('maps the turn area; unknown → main', () => {
    expect(frameDomainOf('food')).toBe('food')
    expect(frameDomainOf('travel')).toBe('travel')
    expect(frameDomainOf('spa')).toBe('spa')
    expect(frameDomainOf(null)).toBe('main')
    expect(frameDomainOf(null, 'trip')).toBe('travel')
  })
})

describe('buildDomainFrame', () => {
  it('pick: the fixed pick shape (confirm → main pick → caution → ≤2 others → còn N) + ONLY that area', () => {
    for (const d of AREAS) {
      const f = buildDomainFrame(d, 'pick')
      expect(f).toContain(`KHUNG TU VAN — ${d.toUpperCase()} / PICK`)
      expect(f).toContain('**Mình chọn: <TEN>**')
      expect(f).toContain('Mình còn N lựa chọn nữa, muốn xem thêm không?')
      expect(f).toContain('Toi da 2 phuong an khac')
      for (const o of AREAS.filter(x => x !== d)) expect(f).not.toContain(`KHUNG TU VAN — ${o.toUpperCase()}`)
    }
  })
  it('plan: the area plan with every required heading', () => {
    for (const d of AREAS) {
      const f = buildDomainFrame(d, 'plan')
      for (const h of PLAN_HEADINGS[d as Exclude<FrameDomain, 'main'>]) expect(f).toContain(`"${h}"`)
      expect(f).toMatch(/It nhat 2 meo dia phuong CO CAN CU/)
    }
  })
  it('follow-up turns: no new search; compare must choose', () => {
    expect(buildDomainFrame('food', 'followup')).toMatch(/KHONG tim lai/)
    expect(buildDomainFrame('food', 'compare')).toContain('CAU DAU TIEN phai dung dang "**Mình chọn: <TEN>** vì')
    expect(buildDomainFrame('food', 'more')).toMatch(/KHAC cac cho da neu va da bi bac/)
    expect(buildDomainFrame('food', 'reject')).toMatch(/KHONG nhac lai cho da bac/)
  })
  it('the MAIN frame never tells the model to refuse everyday requests', () => {
    expect(buildDomainFrame('main')).not.toMatch(/KHONG gia lam cong cu dich vu dia phuong/)
    expect(FRAME_CORE).toMatch(/TUYET DOI KHONG noi "không có chức năng này"/)
  })
  it('the shared core keeps the principles', () => {
    expect(FRAME_CORE).toMatch(/KHONG xin thong tin ca nhan/)
    expect(FRAME_CORE).toMatch(/Link tim kiem ghi ro la tim kiem/)
    expect(FRAME_CORE).toMatch(/KHONG bia gio, gia, suat chieu, khuyen mai, con cho/)
    expect(FRAME_CORE).toMatch(/TRUNG PHEP TINH/)
    expect(FRAME_CORE).toMatch(/ten DAU TIEN ban nhac/)
  })
})

describe('V1 block', () => {
  it('loads the turn frame instead of the generic shape', () => {
    const b = buildConsultativeV1Block({ frame, hardGaps: [], rendersCard: true, lang: 'vi', domain: 'food', frameTurn: 'compare' })
    expect(b).toContain('KHUNG TU VAN — FOOD / COMPARE')
    expect(b).not.toContain('HINH DANG CAU TRA LOI (3-5 cau')
  })
})
