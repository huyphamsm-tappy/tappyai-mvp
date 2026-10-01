import { describe, it, expect } from 'vitest'
import { gatePlacesByActivity } from './placeTypeGate'
import type { Candidate } from './candidate'

const place = (name: string, place_types: string[] = []): Candidate => ({ id: name, name, domain: 'places', attrs: {}, link: '', raw: { name, place_types } } as unknown as Candidate)

describe('(c) «Tìm quận 3 á» while looking for karaoke: the card must be a karaoke venue', () => {
  const rows = [place('Bảo tàng Địa chất', ['Bảo tàng']), place('Karaoke MEI', ['Karaoke']), place('Nhà hàng Ngon', ['Nhà hàng']), place('Cherry KTV Quận 3', [])]
  it('keeps only karaoke venues for a karaoke search', () => {
    const g = gatePlacesByActivity('karaoke', rows, 'karaoke quận 3')
    expect(g.kept.map(c => c.name)).toEqual(['Karaoke MEI', 'Cherry KTV Quận 3'])
    expect(g.rejected.map(c => c.name)).toEqual(['Bảo tàng Địa chất', 'Nhà hàng Ngon'])
  })
  it('only museums found → nothing kept', () => {
    expect(gatePlacesByActivity('karaoke', [place('Bảo tàng Địa chất', ['Bảo tàng'])], 'karaoke quận 3').kept).toEqual([])
  })
  it('a food search in the same thread is not judged by the karaoke noun', () => {
    expect(gatePlacesByActivity('karaoke', rows, 'quán ăn ngon quận 3').gated).toBe(false)
  })
  it('an activity without an unambiguous venue noun is never gated', () => {
    expect(gatePlacesByActivity('rooftop bar', rows, 'rooftop quận 1').gated).toBe(false)
  })
})
