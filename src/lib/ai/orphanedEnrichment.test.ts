import { describe, expect, it } from 'vitest'
import { dropOrphanedEnrichment, injectPlaceEnrichment } from './streamEnrichment'

// ── Phase 7 (2026-09-22): never an image without its name ────────────────────
//
// Owner screenshot 2 / golden set T1 turn 3: the guards removed the hotel's sentence, and its
// injected photo stayed under "mình cần biết:" with no hotel named anywhere near it. The
// injector places a block under its owner's mention; a block whose owner is no longer mentioned
// above it has lost its anchor and must go — links included.

const HOTEL = { name: 'M Hotel Đà Nẵng', photo_url: 'https://mhotel.vn/wp-content/uploads/2022/12/m-hotel-4-3-no-scaled.jpg' }
const KUTOM = {
  name: 'Hải Sản Ku Tom Đà Nẵng',
  photo_url: 'https://lh3.googleusercontent.com/gps-cs-s/AHRPTWlQ',
  order_links: [{ name: 'GrabFood', url: 'https://food.grab.com/vn/vi/restaurants?search=Ku%20Tom' }, { name: 'BeFood', url: 'https://be.com.vn/' }],
}

describe('dropOrphanedEnrichment', () => {
  it('🚨 the measured seam: a photo whose owner sentence the guard removed is dropped', () => {
    const text = [
      'Mình tìm được khách sạn gần biển và quán hải sản ngon rồi! Nhưng để hoàn thiện kế hoạch, mình cần biết:',
      '',
      `![Ảnh địa điểm](${HOTEL.photo_url})`,
      '',
      '**Hải Sản Ku Tom Đà Nẵng** (4.9⭐, 3.440 đánh giá) - quán nổi tiếng, mở từ 10h-2h sáng.',
      '',
      `![Ảnh địa điểm](${KUTOM.photo_url})`,
      '[GrabFood](https://food.grab.com/vn/vi/restaurants?search=Ku%20Tom) · [BeFood](https://be.com.vn/)',
    ].join('\n')
    const out = dropOrphanedEnrichment([HOTEL, KUTOM], text)
    expect(out.dropped).toBe(1)
    expect(out.text).not.toContain('mhotel.vn')
    // The named venue keeps its photo and its links.
    expect(out.text).toContain(KUTOM.photo_url)
    expect(out.text).toContain('[GrabFood]')
  })

  it('a block under its own named paragraph is untouched', () => {
    const text = [
      '**M Hotel Đà Nẵng** — 3 sao, ngay đường Võ Nguyên Giáp, sát biển.',
      `![Ảnh địa điểm](${HOTEL.photo_url})`,
    ].join('\n')
    expect(dropOrphanedEnrichment([HOTEL], text)).toEqual({ text, dropped: 0 })
  })

  it('links are orphaned together with the photo when the owner is gone', () => {
    const text = [
      'Mình gợi ý vài quán:',
      '',
      `![Ảnh địa điểm](${KUTOM.photo_url})`,
      '[GrabFood](https://food.grab.com/vn/vi/restaurants?search=Ku%20Tom) · [BeFood](https://be.com.vn/)',
    ].join('\n')
    const out = dropOrphanedEnrichment([KUTOM], text)
    expect(out.dropped).toBe(2)
    expect(out.text.trim()).toBe('Mình gợi ý vài quán:')
  })

  it("a photo the injector did not own (the model's own image) is left alone", () => {
    const text = '![Ảnh địa điểm](https://elsewhere.example/x.jpg)'
    expect(dropOrphanedEnrichment([HOTEL], text).dropped).toBe(0)
  })

  it('🚨 v1 placement (header-less clients): a block placed at the NEXT venue mention, paragraphs below its owner, is anchored', () => {
    // Measured 2026-09-22 on a header-less /api/chat probe: the fixed two-paragraph window called
    // every injected block an orphan (orphaned_enrichment dropped=4) — iOS / old builds lost all photos.
    const places = [
      { name: 'Phở Nhất Vị - Nguyễn Thị Minh Khai', photo_url: 'https://lh3.googleusercontent.com/a1', order_links: [{ name: 'GrabFood', url: 'https://food.grab.com/vn/vi/restaurants?search=Pho%20Nhat%20Vi' }] },
      { name: 'Quán Phở Con Bò Vàng', photo_url: 'https://lh3.googleusercontent.com/a2', order_links: [{ name: 'GrabFood', url: 'https://food.grab.com/vn/vi/restaurants?search=Con%20Bo%20Vang' }] },
      { name: 'Phở Hòa Pasteur', photo_url: 'https://lh3.googleusercontent.com/a3' },
    ]
    const prose = [
      'Mình tìm quán phở ngon ở Quận 1 cho bạn nhé! 🍲',
      '',
      'Mình chọn **Phở Nhất Vị - Nguyễn Thị Minh Khai** cho bạn! 🎯',
      '',
      '**4.9⭐ (1.103 đánh giá Google Maps)**',
      '',
      'Bạn có thể gọi qua GrabFood hoặc đến trực tiếp nhé.',
      '',
      'Ngoài ra, **Quán Phở Con Bò Vàng** (4.9⭐, 2km) cũng là lựa chọn tốt, hoặc **Phở Hòa Pasteur** nếu thích phở truyền thống.',
      '',
      'Bạn muốn đặt món không?',
    ].join('\n')
    const injected = injectPlaceEnrichment(places as never, prose, 'vi', { placement: 'v1' })
    expect((injected.match(/!\[/g) ?? []).length).toBe(3)
    expect(dropOrphanedEnrichment(places as never, injected)).toEqual({ text: injected, dropped: 0 })
  })

  it('a block whose owner is NOT the last venue named above it is an orphan', () => {
    const text = ['**Hải Sản Ku Tom Đà Nẵng** (4.9⭐) — quán nổi tiếng.', '', `![Ảnh địa điểm](${HOTEL.photo_url})`].join('\n')
    expect(dropOrphanedEnrichment([HOTEL, KUTOM], text).dropped).toBe(1)
  })

  it('no places → no-op', () => {
    expect(dropOrphanedEnrichment([], 'anything')).toEqual({ text: 'anything', dropped: 0 })
  })
})
