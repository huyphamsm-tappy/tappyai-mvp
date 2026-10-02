// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stripModelMedia, stripModelMediaInProse, isPhotoAddress } from './modelMedia'
import { releasableLiveText } from './streamEnrichment'

// A3 (owner 2026-10-02): a travel answer leaked the raw «gstatic.com/images?q=tbn:…» address with an embedded hotel image. The model copied
// a thumbnail out of a hotel / shopping tool result — a URL the tool really gave it, so the old «given URL» allow-list let it through.
const TBN = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3vFr0m2QeW2oQ1y6hD6x7nG5pZtq2s8L1Qw&s=10'
const SHOP_TBN = 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcSv0aalvstorNVUQ4pD-XLDLKHV9KuC5IYq1161fpYE4G9hWJHf5l2I4Qrb0kP1cmKI7bFck4BBjjptqHBakbdKwLLt0klKWY8z-TWQ0PHwl1AXJx6jyzIa'
const LH3 = 'https://lh3.googleusercontent.com/gps-cs-s/AB5caB8x_abc123=w408-h306-k-no'

describe('isPhotoAddress', () => {
  it('knows photo CDNs, Google thumbnail addresses and image files', () => {
    for (const u of [TBN, SHOP_TBN, LH3, 'https://scontent.fbcdn.net/v/t39/a.jpg', 'https://i.ytimg.com/vi/x/hq.jpg', 'https://cdn.site.vn/a/b/c.PNG?w=200', 'https://x.example/p.webp#a']) expect(isPhotoAddress(u), u).toBe(true)
  })
  it('does not call pages photo addresses (maps, search, booking, shops, TikTok videos)', () => {
    for (const u of ['https://www.google.com/maps/search/?api=1&query=Colline', 'https://www.google.com/search?q=tbn', 'https://www.booking.com/hotel/vn/colline.html', 'https://shopee.vn/search?keyword=kinh+cuong+luc', 'https://www.tiktok.com/@a/video/7536948899538373896', 'https://www.cgv.vn/default/movies/now-showing.html']) expect(isPhotoAddress(u), u).toBe(false)
  })
})

describe('stripModelMedia — captured shapes', () => {
  it('an embedded hotel image on its own line goes; a real caption stays as text', () => {
    const t = `Mình chọn **Colline Dalat**.\n\n![Colline Dalat](${TBN})\n\nGiá chưa có dữ liệu.`
    const out = stripModelMedia(t)
    expect(out).not.toMatch(/gstatic|!\[|tbn/)
    expect(out).toContain('Colline Dalat')
    expect(out).toContain('Giá chưa có dữ liệu.')
    expect(out).not.toMatch(/\n{3,}/)
  })
  it('a generic alt («Ảnh địa điểm», empty) leaves nothing behind', () => {
    expect(stripModelMedia(`A\n![Ảnh địa điểm](${LH3})\nB`)).toBe('A\n\nB'.replace('\n\n', '\n\n'))
    expect(stripModelMedia(`![](${SHOP_TBN})`)).toBe('')
  })
  it('the raw printed address (bare, in brackets, after bold) is removed whole; sentence punctuation survives', () => {
    expect(stripModelMedia(`Xem ảnh: ${TBN}.`)).toBe('Xem ảnh: .')
    expect(stripModelMedia(`Ảnh **${TBN}** đây`)).not.toContain('gstatic')
    expect(stripModelMedia(`(${TBN})`)).not.toContain('gstatic')
  })
  it('a link whose TARGET is a photo is dropped (label kept only when it says something)', () => {
    expect(stripModelMedia(`[Ảnh địa điểm](${LH3}) xong`)).toBe(' xong')
    expect(stripModelMedia(`[Hình khách sạn Colline](${TBN})`)).toBe('')
    expect(stripModelMedia(`[Colline Dalat](${TBN}) đẹp`)).toBe('Colline Dalat đẹp')
  })
  it('<img> tags go', () => {
    expect(stripModelMedia(`a <img src="${TBN}" alt="x"> b`)).toBe('a  b')
  })
  it('links to PAGES are untouched: maps, shops, booking, cinema pages, commerce redirects', () => {
    const t = [
      '[Xem bản đồ](https://www.google.com/maps/search/?api=1&query=Colline%20Dalat)',
      '- [CGV](https://www.cgv.vn/default/movies/now-showing.html)',
      '- [Galaxy Cinema](https://www.galaxycine.vn/phim-dang-chieu/)',
      '[Tìm trên Lazada](https://www.tappyai.com/go/at?u=https%3A%2F%2Fgo.isclix.com%2Fdeep_link%2F1%3Furl%3Dhttps%253A%252F%252Fwww.lazada.vn%252Fcatalog%252F%253Fq%253Dkinh)',
      '[Shopee](https://shopee.vn/search?keyword=k%C3%ADnh+c%C6%B0%E1%BB%9Dng+l%E1%BB%B1c+iPhone+17)',
      'https://www.booking.com/hotel/vn/colline.html',
    ].join('\n')
    expect(stripModelMedia(t)).toBe(t)
  })
  it('is idempotent and returns the very same string when nothing matched', () => {
    const t = 'Chỉ có chữ, **đậm**, và [một link](https://shopee.vn/search?keyword=a).'
    expect(stripModelMedia(t)).toBe(t)
    const once = stripModelMedia(`x ![a b](${TBN}) y`)
    expect(stripModelMedia(once)).toBe(once)
  })
})

describe('stripModelMediaInProse — structured blocks are never touched', () => {
  it('the image field of a [TAPPY_SHOPPING] marker and a [TAPPY_PLAN] photo survive; only prose is filtered', () => {
    const marker = `[TAPPY_SHOPPING]{"v":1,"entities":[{"key":"k","name":"Kính","image":"${SHOP_TBN}"}]}[/TAPPY_SHOPPING]`
    const prose = `Mình chọn kính này. ![k](${SHOP_TBN})\n\n`
    const cut = prose.length
    const out = stripModelMediaInProse(prose + marker, cut)
    expect(out.endsWith(marker)).toBe(true)
    expect(out.slice(0, out.indexOf('[TAPPY_SHOPPING]'))).not.toMatch(/gstatic|!\[/)
  })
})

describe('the LIVE (progressive) path applies the same rule, so a released prefix stays a prefix of the final text', () => {
  it('releasableLiveText drops the thumbnail image and the bare address', () => {
    const t = `Mình chọn Colline.\n![Colline](${TBN})\nẢnh: ${TBN}\nHết.`
    const live = releasableLiveText(t, true)
    expect(live).not.toMatch(/gstatic|!\[|tbn/)
    expect(live).toContain('Mình chọn Colline.')
    expect(live).toContain('Hết.')
  })
  it('a half-arrived image token is held back, never released as visible text', () => {
    const t = `Mình chọn Colline.\n![Colline](https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9G`
    expect(releasableLiveText(t, false)).toBe('Mình chọn Colline.\n')
  })
})

import { dropEmptyMediaBlocks } from './modelMedia'
describe('dropEmptyMediaBlocks — what the legacy «📸» block leaves once its pictures are gone (captured local reply)', () => {
  it('a block that is only a label and a bare name disappears with the label; the rest of the reply stays', () => {
    const t = 'Mình chọn: Apple iPhone 16e.\n📸 _Hình ảnh & link review:_\n\n**Apple iPhone 16e 128GB Chính hãng VN/A**\n\nKết quả chưa có mức giá.\n\n[FOLLOWUPS]Xem thêm[/FOLLOWUPS]'
    const out = dropEmptyMediaBlocks(t)
    expect(out).not.toContain('📸')
    expect(out).not.toContain('Chính hãng VN/A')
    expect(out).toContain('Kết quả chưa có mức giá.')
    expect(out).toContain('[FOLLOWUPS]')
  })
  it('an entry that still has its link keeps the label and the entry', () => {
    const t = 'A.\n\n📸 _Hình ảnh & link review:_\n\n**Quán X**\n[ShopeeFood](https://shopeefood.vn/x)\n\n**Quán Y**'
    const out = dropEmptyMediaBlocks(t)
    expect(out).toContain('📸')
    expect(out).toContain('[ShopeeFood](https://shopeefood.vn/x)')
    expect(out).not.toContain('Quán Y')
  })
  it('text without the block is returned unchanged', () => {
    expect(dropEmptyMediaBlocks('Chỉ có chữ.')).toBe('Chỉ có chữ.')
  })
})
