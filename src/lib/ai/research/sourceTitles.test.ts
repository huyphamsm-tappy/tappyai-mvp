import { describe, it, expect } from 'vitest'
import { weakSourceTitle, titleFromUrl, sourcesBlock } from './deepResearch'

// UAT 18/11 (cases 56-58): the source list read "MỤC LỤC — thitruongnongsan.gov.vn", "NĂM 2025" and "environment.ec.europa.eu — environment.ec.europa.eu".
describe('a source title that says nothing about the page', () => {
  it('is recognised: the host, a bare domain, one or two words, all capitals; a real title is not', () => {
    expect(weakSourceTitle('MỤC LỤC', 'thitruongnongsan.gov.vn')).toBe(true)
    expect(weakSourceTitle('NĂM 2025', 'x.vn')).toBe(true)
    expect(weakSourceTitle('environment.ec.europa.eu', 'environment.ec.europa.eu')).toBe(true)
    expect(weakSourceTitle('', 'x.vn')).toBe(true)
    expect(weakSourceTitle('Xuất khẩu cà phê Việt Nam lập kỷ lục, đạt 8,5 tỷ USD', 'dantri.com.vn')).toBe(false)
  })
  it('the address gives the page its words back', () => {
    expect(titleFromUrl('https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en')).toBe('regulation deforestation free products en')
    expect(titleFromUrl('https://vneconomy.vn/gia-xang-dau-hom-nay-17-11.htm')).toBe('gia xang dau hom nay 17 11')
    expect(titleFromUrl('https://example.com/')).toBeNull()
    expect(titleFromUrl('https://example.com/a')).toBeNull() // too little to read
    expect(titleFromUrl('not a url')).toBeNull()
  })
  it('the list uses the words of the address for a weak title and keeps a real title as it is', () => {
    const ev = [
      { id: 1, title: 'MỤC LỤC', url: 'https://thitruongnongsan.gov.vn/vn/nguon-tin/xuat-khau-ca-phe-quy-i-2026-tang-manh', site: 'thitruongnongsan.gov.vn' },
      { id: 2, title: 'Xuất khẩu cà phê Việt Nam lập kỷ lục, đạt 8,5 tỷ USD Báo Dân trí', url: 'https://dantri.com.vn/a.htm', site: 'dantri.com.vn' },
    ] as never
    const out = sourcesBlock(ev, [{ step: 1, text: 't', source: 1 }, { step: 1, text: 't', source: 2 }], 'vi')
    expect(out).toContain('1. xuat khau ca phe quy i 2026 tang manh — thitruongnongsan.gov.vn')
    expect(out).toContain('2. Xuất khẩu cà phê Việt Nam lập kỷ lục, đạt 8,5 tỷ USD Báo Dân trí — dantri.com.vn')
    expect(out).not.toContain('MỤC LỤC')
  })
})
