import { describe, it, expect } from 'vitest'
import { scrubUnsuppliedMarketplaces as scrub } from './marketplaceGuard'

describe('(d) a shop the code did not hand over is not recommended by the model', () => {
  const reply = 'Mình hiểu bạn cần kính cường lực cho iPhone 17. Kết quả tìm được hiện chỉ có điện thoại, chưa có kính cường lực. Bạn có thể tìm kính cường lực iPhone 17 trên Shopee hoặc Lazada. Bạn muốn mình lọc theo loại kính nào?'
  it('drops the «tìm trên Shopee» sentence and keeps the truthful ones', () => {
    const r = scrub(reply, [])
    expect(r.text).not.toMatch(/Shopee|Lazada/)
    expect(r.text).toMatch(/chưa có kính cường lực/)
    expect(r.text).toMatch(/lọc theo loại kính/)
    expect(r.removed).toHaveLength(1)
  })
  it('keeps a shop that IS one of this turn’s verified links', () => {
    expect(scrub(reply, ['https://shopee.vn/search?keyword=x', 'https://lazada.vn/x']).text).toBe(reply)
  })
  it('does not touch a sentence that carries a real link or a plain fact', () => {
    const t = 'Giá tham khảo trên Shopee khoảng 89.000đ. Xem tại [Shopee](https://shopee.vn/x).'
    expect(scrub(t, []).text).toBe(t)
  })
  it('English too', () => {
    expect(scrub('Nothing matched. You can search for it on Shopee.', []).text).toBe('Nothing matched.')
  })
})

import { stripBarePhotoUrls } from './marketplaceGuard'
describe('(e) a bare photo address is never printed as text', () => {
  it('removes it, keeps markdown images and ordinary links', () => {
    const t = 'MeyResort Bãi Lữ https://lh3.googleusercontent.com/gps-cs-s/AB12cd34=w400 đẹp\n![Ảnh địa điểm](https://lh3.googleusercontent.com/p/x) [Maps](https://maps.google.com/?cid=1)'
    const r = stripBarePhotoUrls(t)
    expect(r).not.toMatch(/gps-cs-s/)
    expect(r).toContain('![Ảnh địa điểm](https://lh3.googleusercontent.com/p/x)')
    expect(r).toContain('[Maps](https://maps.google.com/?cid=1)')
  })
})
