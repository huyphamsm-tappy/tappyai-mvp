import { describe, it, expect } from 'vitest'
import { maskStreetNames } from './streetNames'
import { routeConsult } from './consultative/consultRouter'
import { detectPlanningIntent } from './intent'

const EVENING = 'Lên kế hoạch tối nay ở Quận 1 cho 2 người: ăn tối món Việt, dạo phố đi bộ Nguyễn Huệ, rồi cà phê view đẹp'

describe('a street / dish named after a city is not that city (UAT 36d2941: "Nguyễn Huệ" planned an evening in Huế)', () => {
  it('masks streets and dishes, keeps the length, keeps real cities', () => {
    const f = 'dao pho di bo nguyen hue roi an bun bo hue, duong ha noi thu duc'
    const m = maskStreetNames(f)
    expect(m).toHaveLength(f.length)
    expect(m).not.toMatch(/\bhue\b|ha noi/)
    expect(maskStreetNames('di hue 3 ngay 2 dem')).toBe('di hue 3 ngay 2 dem')
  })
  it('the evening plan stays in Quận 1 and is not a trip', () => {
    expect(detectPlanningIntent(EVENING)).toBe('evening')
    const r = routeConsult([{ role: 'user', content: EVENING }], { hasGps: false, lang: 'vi' })
    expect(r.decision.domains).not.toContain('travel')
    expect(JSON.stringify(r.decision.known)).not.toMatch(/Huế/)
  })
  it('the situation location is the district, not Huế', async () => {
    const { deriveNeedProfile } = await import('./consultative/needProfile')
    expect(deriveNeedProfile([{ role: 'user', content: EVENING }]).location.text).toBe('quan 1')
    expect(deriveNeedProfile([{ role: 'user', content: 'bún bò Huế ngon ở Quận 3' }]).location.text).toBe('quan 3')
    expect(deriveNeedProfile([{ role: 'user', content: 'đi Huế ăn gì ngon' }]).location.text).toBe('hue')
  })
})
