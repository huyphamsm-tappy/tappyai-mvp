import { describe, it, expect } from 'vitest'
import { encodeQuery } from './encodeQuery'
import { mapsSearchUrl } from '@/lib/ai/placeRelax'

describe('encodeQuery: a query inside a link the answer may carry', () => {
  it('escapes what encodeURIComponent leaves raw and a markdown link cannot hold', () => {
    expect(encodeQuery("Tiệm Bánh Mì Góc Phố (UAT) Quận 1!*'")).not.toMatch(/[()!*' ]/)
    expect(decodeURIComponent(encodeQuery("Tiệm Bánh Mì Góc Phố (UAT) Quận 1!*'"))).toBe("Tiệm Bánh Mì Góc Phố (UAT) Quận 1!*'")
    expect(encodeQuery('pho ha noi')).toBe(encodeURIComponent('pho ha noi'))
  })
  it('the code-built Maps search link survives as one markdown link when the place name has parentheses', () => {
    const url = mapsSearchUrl('Tiệm Bánh Mì Góc Phố (UAT)', 'Quận 1, TP. Hồ Chí Minh')
    expect(url).not.toContain('(')
    expect(url).not.toContain(')')
    const md = `Thử tìm quán trên [Google Maps](${url}).`
    const m = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(md)
    expect(m?.[2]).toBe(url)
    expect(new URL(url).searchParams.get('query')).toBe('Tiệm Bánh Mì Góc Phố (UAT) Quận 1, TP. Hồ Chí Minh')
  })
})
