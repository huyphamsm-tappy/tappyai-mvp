// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { dropLoginWallRows, isLoginWallUrl } from './loginWallHosts'

const ROWS = {
  count: 4,
  search_results: [
    { title: 'Ấm Philips HD9350', link: 'https://shopee.vn/%E1%BA%A4m-i.516866694.27970873586' },
    { title: 'Bình đun Philips', link: 'https://www.lazada.vn/products/x.html' },
    { title: 'Ấm điện', link: 'https://dienmayxanh.com/may-xay/philips-hd9350' },
    { title: 'Ấm inox', url: 'https://shopee.vn/search?keyword=x' },
  ],
}

describe('login-wall rows (flag on: product rows on Shopee are not offered)', () => {
  it('hosts: Shopee yes; look-alikes and other shops no', () => {
    expect(isLoginWallUrl('https://shopee.vn/x-i.1.2')).toBe(true)
    expect(isLoginWallUrl('https://www.shopee.com.my/x')).toBe(true)
    for (const u of ['https://notshopee.vn/x', 'https://www.lazada.vn/x', 'https://dienmayxanh.com/x', 'not a url', undefined]) expect(isLoginWallUrl(u), String(u)).toBe(false)
  })
  it('drops them from a COPY, keeps the others, keeps count in step; the original (memoised) object is untouched', () => {
    const before = JSON.stringify(ROWS)
    const out = dropLoginWallRows(ROWS, 'search_results')
    expect(out.search_results.map(r => r.title)).toEqual(['Bình đun Philips', 'Ấm điện'])
    expect(out.count).toBe(2)
    expect(JSON.stringify(ROWS)).toBe(before)
  })
  it('nothing to drop: the same object comes back', () => {
    const clean = { count: 1, search_results: [{ title: 'a', link: 'https://www.lazada.vn/x' }] }
    expect(dropLoginWallRows(clean, 'search_results')).toBe(clean)
  })
})
