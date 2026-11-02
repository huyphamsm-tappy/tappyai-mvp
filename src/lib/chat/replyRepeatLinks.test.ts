// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { cleanRepeats, dedupeSentences } from './replyRepeat'

// A3 (owner 2026-10-02) — found while proving the «only another model found» reply on screen: the client's repeat guard cut the SECOND
// marketplace link in the middle, because the «?q=» of a URL ended a «sentence» and the keyword tail of the Shopee link equals the one of
// the Lazada link. Any answer that offers one keyword on two marketplaces was affected.
const KW = 'k%C3%ADnh%20c%C6%B0%E1%BB%9Dng%20l%E1%BB%B1c%20iPhone%2017'
const TEXT = [
  'Mình chỉ thấy kính cho iPhone 15 Pro Max.',
  '',
  'Mình chỉ thấy hàng cho iPhone 15 Pro Max, chưa thấy loại đúng cho iPhone 17. Bạn tìm từ khóa “kính cường lực iPhone 17” trên:',
  '',
  `- [Shopee](https://shopee.vn/search?keyword=${KW})`,
  `- [Lazada](https://www.lazada.vn/catalog/?q=${KW})`,
  '',
  '[FOLLOWUPS]Xem thêm|Tìm quanh đây[/FOLLOWUPS]',
].join('\n')

describe('the repeat guard never cuts inside a URL', () => {
  it('two marketplace links for the same keyword both survive whole', () => {
    const out = cleanRepeats(TEXT)
    expect(out).toBe(TEXT)
    expect(out).toContain(`(https://www.lazada.vn/catalog/?q=${KW})`)
  })
  it('a real repeated sentence is still dropped', () => {
    const t = 'Mình chọn quán này vì gần bạn và đánh giá cao.\n\nMình chọn quán này vì gần bạn và đánh giá cao.'
    expect(dedupeSentences(t).match(/Mình chọn quán này/g)).toHaveLength(1)
  })
  it('the same link written twice is still collapsed', () => {
    const l = '- [Shopee](https://shopee.vn/search?keyword=kinh+cuong+luc+iphone+17+chong+nhin+trom)\n'
    expect(dedupeSentences(`Tìm trên:\n${l}${l}`).match(/shopee\.vn/g)).toHaveLength(1)
  })
})
