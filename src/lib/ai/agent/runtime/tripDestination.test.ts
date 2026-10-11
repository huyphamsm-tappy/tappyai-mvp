// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { tripSearchName, withTripSearchName } from './tripDestination'

describe('trip-data lookup uses the place name', () => {
  it('drops the province / qualifier after a comma', () => {
    expect(tripSearchName('Lý Sơn, Quảng Ngãi')).toBe('Lý Sơn')
    expect(tripSearchName('Quy Nhơn')).toBe('Quy Nhơn')
    expect(tripSearchName('Côn Đảo (Bà Rịa - Vũng Tàu)')).toBe('Côn Đảo')
    expect(tripSearchName(' , Huế')).toBe(', Huế'.trim()) // nothing before the comma: keep the whole
  })
  it('only the destination argument changes; the other arguments pass through', async () => {
    let seen: Record<string, unknown> = {}
    const exec = withTripSearchName(async a => { seen = a; return { ok: true } })
    await exec({ destination: 'Lý Sơn, Quảng Ngãi', interests: 'hải sản' }, {})
    expect(seen).toEqual({ destination: 'Lý Sơn', interests: 'hải sản' })
    await exec({ interests: 'x' }, {})
    expect(seen).toEqual({ interests: 'x' })
  })
})
