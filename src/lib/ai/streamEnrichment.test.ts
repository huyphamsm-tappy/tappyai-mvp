// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { injectPlaceEnrichment, applyPlaceEnrichmentStreamFilter } from './streamEnrichment'

const IMG = 'https://img.test'
// index of the Nth (1-based) occurrence of `sub` in `s`
const idx = (s: string, sub: string) => s.indexOf(sub)
const count = (s: string, sub: string) => s.split(sub).length - 1

const TEXT_3 = [
  'Đây là 3 quán phở ngon ở Hà Nội:',
  '',
  '**1. Phở Gà Huyền Hương**',
  '4.7⭐ — phở gà thanh ngọt.',
  '',
  '**2. Phở Bát Đàn**',
  'Phở bò truyền thống, xếp hàng tự phục vụ.',
  '',
  '**3. Phở Thìn Lò Đúc**',
  'Phở tái lăn đậm đà.',
].join('\n')

describe('injectPlaceEnrichment — position-aware grouping', () => {
  it('puts each place\'s photo AFTER its own name and BEFORE the next place (multiple places)', () => {
    const places = [
      { name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` },
      { name: 'Phở Bát Đàn', photo_url: `${IMG}/bd.jpg` },
      { name: 'Phở Thìn Lò Đúc', photo_url: `${IMG}/thin.jpg` },
    ]
    const out = injectPlaceEnrichment(places, TEXT_3)
    // ga.jpg sits between place 1 and place 2
    expect(idx(out, 'ga.jpg')).toBeGreaterThan(idx(out, 'Phở Gà Huyền Hương'))
    expect(idx(out, 'ga.jpg')).toBeLessThan(idx(out, 'Phở Bát Đàn'))
    // bd.jpg between place 2 and place 3
    expect(idx(out, 'bd.jpg')).toBeGreaterThan(idx(out, 'Phở Bát Đàn'))
    expect(idx(out, 'bd.jpg')).toBeLessThan(idx(out, 'Phở Thìn Lò Đúc'))
    // thin.jpg after place 3 (last place → toward the end)
    expect(idx(out, 'thin.jpg')).toBeGreaterThan(idx(out, 'Phở Thìn Lò Đúc'))
    // headers never split
    expect(out).toContain('**2. Phở Bát Đàn**')
    expect(out).toContain('**3. Phở Thìn Lò Đúc**')
  })

  it('emits a place\'s multiple photos as CONSECUTIVE image lines (carousel input)', () => {
    const places = [
      { name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` },
      { name: 'Phở Bát Đàn', photo_urls: [`${IMG}/bd1.jpg`, `${IMG}/bd2.jpg`, `${IMG}/bd3.jpg`] },
      { name: 'Phở Thìn Lò Đúc', photo_url: `${IMG}/thin.jpg` },
    ]
    const out = injectPlaceEnrichment(places, TEXT_3)
    const carousel = `![Ảnh địa điểm](${IMG}/bd1.jpg)\n![Ảnh địa điểm](${IMG}/bd2.jpg)\n![Ảnh địa điểm](${IMG}/bd3.jpg)`
    expect(out).toContain(carousel)
    // all three still inside place 2's window
    expect(idx(out, 'bd3.jpg')).toBeLessThan(idx(out, 'Phở Thìn Lò Đúc'))
  })

  it('strips an LLM-written TikTok review line — TikTok is not a review source in V1', () => {
    const places = [{ name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` }]
    const text = [
      '**1. Phở Gà Huyền Hương**', 'ngon.', '🎵 [Xem review TikTok](https://www.tiktok.com/@phogahh)',
    ].join('\n')
    const out = injectPlaceEnrichment(places, text)
    expect(out).not.toContain('tiktok.com')
    expect(out).toContain(`${IMG}/ga.jpg`) // the place's own photo is still grouped under it
  })

  it('matches places by diacritic-insensitive name (tool "Pho Ga", text "Phở Gà")', () => {
    const places = [{ name: 'Pho Ga Huyen Huong', photo_url: `${IMG}/ga.jpg` }]
    const text = '**Phở Gà Huyền Hương**\n4.7⭐ quán ngon.'
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/ga.jpg)`)
    expect(idx(out, 'ga.jpg')).toBeGreaterThan(idx(out, 'Phở Gà Huyền Hương'))
  })

  it('does NOT duplicate a photo the text already shows inline', () => {
    const places = [{ name: 'Phở Gà Huyền Hương', photo_url: `${IMG}/ga.jpg` }]
    const text = `**Phở Gà Huyền Hương**\n![Ảnh](${IMG}/ga.jpg)\nngon.`
    const out = injectPlaceEnrichment(places, text)
    expect(count(out, 'ga.jpg')).toBe(1)
  })

  it('does NOT duplicate an order link whose domain is already near the place', () => {
    const places = [{
      name: 'Phở Gà Huyền Hương',
      photo_url: `${IMG}/ga.jpg`,
      order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/search?q=pho-ga' }],
    }]
    const text = '**Phở Gà Huyền Hương**\n[ShopeeFood](https://shopeefood.vn/search?q=pho-ga)\nngon.'
    const out = injectPlaceEnrichment(places, text)
    expect(count(out, 'shopeefood.vn')).toBe(1) // link not re-added
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/ga.jpg)`) // photo still injected
  })

  it('injects a MISSING photo when the text omitted it', () => {
    const places = [{ name: 'Phở Bát Đàn', photo_url: `${IMG}/bd.jpg` }]
    const text = '**Phở Bát Đàn**\nPhở bò truyền thống.'
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/bd.jpg)`)
  })

  it('inserts a last place\'s photos BEFORE a trailing CTA_BUTTONS block', () => {
    const places = [{ name: 'Phở Thìn Lò Đúc', photo_url: `${IMG}/thin.jpg` }]
    const text = '**Phở Thìn Lò Đúc**\nđậm đà.\n\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]'
    const out = injectPlaceEnrichment(places, text)
    expect(idx(out, 'thin.jpg')).toBeLessThan(idx(out, '[CTA_BUTTONS]'))
    expect(idx(out, 'thin.jpg')).toBeGreaterThan(idx(out, 'Phở Thìn Lò Đúc'))
  })

  it('injects image + order links when the LLM wrote PROSE ONLY (Phase-2 A+B)', () => {
    // Under the Phase-2 prompt the model writes only name/rating/desc — no image
    // or order-link markdown. Enrichment must supply all of them per place. TikTok
    // is not a review source in V1, so no TikTok line is ever injected.
    const places = [{
      name: 'Phở Gà Huyền Hương',
      photo_url: `${IMG}/ga.jpg`,
      order_links: [
        { name: 'ShopeeFood', url: 'https://shopeefood.vn/search?q=pho-ga' },
        { name: 'GrabFood', url: 'https://food.grab.com/vn/s?q=pho-ga' },
        { name: 'BeFood', url: 'https://be.com.vn' },
      ],
    }]
    const text = '**Phở Gà Huyền Hương**\n4.7⭐ (4.943 đánh giá Google Maps) — phở gà thanh ngọt. Địa chỉ: 20 P. Báo Khánh.'
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/ga.jpg)`)
    expect(out).not.toContain('tiktok.com')
    expect(out).toContain('[ShopeeFood](https://shopeefood.vn/search?q=pho-ga)')
    expect(out).toContain('[GrabFood]')
    expect(out).toContain('[BeFood]')
    expect(out.indexOf('ga.jpg')).toBeGreaterThan(out.indexOf('Phở Gà Huyền Hương'))
  })

  it('returns the text unchanged when there are no usable places', () => {
    expect(injectPlaceEnrichment([], 'xin chào')).toBe('xin chào')
    expect(injectPlaceEnrichment([{ name: 'X' }], 'không có ảnh')).toBe('không có ảnh')
  })

  it('adds a per-item photo INSIDE the [TAPPY_PLAN] JSON (thumbnail), keeps JSON parseable, NO trailing block', () => {
    const planJson = JSON.stringify({
      type: 'trip', title: 'Đà Nẵng 2 ngày', people: 2,
      days: [{ label: 'Ngày 1', items: [
        { time: '08:00', name: 'Bà Nà Hills', category: 'attraction' },
        { time: '12:00', name: 'Bánh xèo Bà Dưỡng', category: 'food' },
        { time: '18:00', name: 'Vé máy bay về', category: 'transport' }, // no place match
      ] }],
    })
    const text = `Đây là kế hoạch nhé!\n\n[TAPPY_PLAN]\n${planJson}\n[/TAPPY_PLAN]\n\nMình giả định 2 người nha.\n\n[CTA_BUTTONS]{"buttons":[]}[/CTA_BUTTONS]`
    const places = [
      { name: 'Bà Nà Hills', photo_url: `${IMG}/bana.jpg` },
      { name: 'Bánh xèo Bà Dưỡng', photo_url: `${IMG}/banhxeo.jpg` },
    ]
    const out = injectPlaceEnrichment(places, text)
    const planBlock = out.slice(out.indexOf('[TAPPY_PLAN]'), out.indexOf('[/TAPPY_PLAN]') + '[/TAPPY_PLAN]'.length)
    // No markdown image spliced into the block; JSON still parses.
    expect(planBlock).not.toContain('![')
    const parsed = JSON.parse(planBlock.replace('[TAPPY_PLAN]', '').replace('[/TAPPY_PLAN]', '').trim())
    const items = parsed.days[0].items as Array<{ name: string; photo_url?: string }>
    // Matched items carry photo_url INSIDE the JSON; the unmatched transport item does not.
    expect(items.find(i => i.name === 'Bà Nà Hills')?.photo_url).toContain('bana.jpg')
    expect(items.find(i => i.name === 'Bánh xèo Bà Dưỡng')?.photo_url).toContain('banhxeo.jpg')
    expect(items.find(i => i.name === 'Vé máy bay về')?.photo_url).toBeUndefined()
    // Photos live INSIDE the plan block; there is NO trailing 📸 block.
    expect(out.indexOf('bana.jpg')).toBeLessThan(out.indexOf('[/TAPPY_PLAN]'))
    expect(out).not.toContain('📸')
  })

  it('leaves the [TAPPY_PLAN] text unchanged when no plan item matches a place with a photo', () => {
    const planJson = JSON.stringify({
      type: 'trip', title: 'X', days: [{ label: 'Ngày 1', items: [{ time: '08:00', name: 'Chỗ lạ', category: 'attraction' }] }],
    })
    const text = `[TAPPY_PLAN]\n${planJson}\n[/TAPPY_PLAN]`
    const out = injectPlaceEnrichment([{ name: 'Quán khác hẳn', photo_url: `${IMG}/x.jpg` }], text)
    expect(out).toBe(text) // untouched, JSON not corrupted
  })

  it('does not inject into a [FOLLOWUPS] block — photo lands in the prose before it', () => {
    const text = '**Phở Gà**\nquán ngon.\n\n[FOLLOWUPS]Tìm quán khác|Chỗ gần hơn[/FOLLOWUPS]'
    const out = injectPlaceEnrichment([{ name: 'Phở Gà', photo_url: `${IMG}/ga.jpg` }], text)
    const f = out.indexOf('[FOLLOWUPS]')
    expect(out.slice(f)).not.toContain('![') // nothing injected inside/after followups
    expect(out.indexOf('ga.jpg')).toBeLessThan(f) // photo grouped with the place, before followups
  })

  // ── Regression: per-place layout when neighbours have NO photos, and when the
  //    LLM writes its own trailing enrichment (root-cause + strip fixes). ────────
  it('keeps the FIRST place\'s gallery under IT even when the next places have NO photos', () => {
    // The reported bug: only place 1 had photos; its images ran past photo-less
    // places 2 & 3 to the very end of the message. Boundary must be the next
    // MENTIONED place, not the next enriched one.
    const places = [
      {
        name: 'Bún Bò Huế O Lạc CN 2',
        photo_urls: [`${IMG}/olac1.jpg`, `${IMG}/olac2.jpg`, `${IMG}/olac3.jpg`],
        order_links: [
          { name: 'ShopeeFood', url: 'https://shopeefood.vn/olac' },
          { name: 'GrabFood', url: 'https://food.grab.com/vn/olac' },
          { name: 'BeFood', url: 'https://be.com.vn/olac' },
        ],
      },
      { name: 'GÓC HUẾ - Nguyễn Thái Bình' }, // no photos
      { name: 'Bún Bò Huế 175 Cô Giang' },     // no photos
    ]
    const text = [
      'Mình tìm được vài quán bún bò Huế ngon ở TP.HCM cho bạn! 🍜',
      '',
      '**Bún Bò Huế O Lạc CN 2** (Phú Nhuận)',
      '4.9⭐ (635 đánh giá Google Maps) — nước dùng đậm đà.',
      '',
      '**GÓC HUẾ - Nguyễn Thái Bình** (Quận 1)',
      '4.7⭐ (864 đánh giá Google Maps) — vị chuẩn Huế.',
      '',
      '**Bún Bò Huế 175 Cô Giang** (Quận 1)',
      '4.8⭐ (58 đánh giá Google Maps) — quán nhỏ, review tích cực.',
      '',
      'Bạn muốn đặt online hay đi trực tiếp? 😊',
    ].join('\n')
    const out = injectPlaceEnrichment(places, text)
    // O Lạc's whole gallery + review + order sits BEFORE the next place, not trailing.
    expect(idx(out, 'olac1.jpg')).toBeGreaterThan(idx(out, 'Bún Bò Huế O Lạc CN 2'))
    expect(idx(out, 'olac1.jpg')).toBeLessThan(idx(out, 'GÓC HUẾ'))
    expect(idx(out, 'olac3.jpg')).toBeLessThan(idx(out, 'GÓC HUẾ'))
    expect(idx(out, 'shopeefood.vn/olac')).toBeLessThan(idx(out, 'GÓC HUẾ'))
    // NOT dumped after the closing line.
    expect(idx(out, 'olac1.jpg')).toBeLessThan(idx(out, 'Bạn muốn đặt'))
    // 3 consecutive image lines → carousel input.
    expect(out).toContain(`![Ảnh địa điểm](${IMG}/olac1.jpg)\n![Ảnh địa điểm](${IMG}/olac2.jpg)\n![Ảnh địa điểm](${IMG}/olac3.jpg)`)
  })

  it('STRIPS the LLM\'s own trailing enrichment and re-places it under the place (system owns layout)', () => {
    const places = [
      {
        name: 'Bún Bò Huế O Lạc CN 2',
        photo_urls: [`${IMG}/olac1.jpg`, `${IMG}/olac2.jpg`],
        order_links: [{ name: 'ShopeeFood', url: 'https://shopeefood.vn/olac' }],
      },
      { name: 'GÓC HUẾ - Nguyễn Thái Bình' },
    ]
    // The model disobeyed the prose-only prompt and dumped enrichment at the end.
    const text = [
      '**Bún Bò Huế O Lạc CN 2** (Phú Nhuận)',
      '4.9⭐ nước dùng đậm đà.',
      '',
      '**GÓC HUẾ - Nguyễn Thái Bình** (Quận 1)',
      '4.7⭐ vị chuẩn Huế.',
      '',
      'Chúc bạn ngon miệng! 😊',
      '',
      `![Ảnh](${IMG}/olac1.jpg)`,
      `![Ảnh](${IMG}/olac2.jpg)`,
      '🎵 [Xem review TikTok](https://www.tiktok.com/@olac)',
      '[ShopeeFood](https://shopeefood.vn/olac)',
    ].join('\n')
    const out = injectPlaceEnrichment(places, text)
    // No duplication — each owned URL appears exactly once.
    expect(count(out, 'olac1.jpg')).toBe(1)
    expect(count(out, 'olac2.jpg')).toBe(1)
    // TikTok is unsupported in V1: the LLM's TikTok line is STRIPPED, not re-placed.
    expect(count(out, 'tiktok.com/@olac')).toBe(0)
    expect(count(out, 'shopeefood.vn/olac')).toBe(1)
    // Relocated UNDER O Lạc (before GÓC HUẾ), not left trailing after the closing line.
    expect(idx(out, 'olac1.jpg')).toBeGreaterThan(idx(out, 'Bún Bò Huế O Lạc CN 2'))
    expect(idx(out, 'olac1.jpg')).toBeLessThan(idx(out, 'GÓC HUẾ'))
    expect(idx(out, 'olac1.jpg')).toBeLessThan(idx(out, 'Chúc bạn ngon miệng'))
  })
})

describe('injectPlaceEnrichment — legacy trailing block language', () => {
  // A place with a photo but whose name never appears in the text can't be placed
  // positionally, so it falls back to the legacy trailing "📸" block — that label
  // must follow the response's detected language (lang), not always Vietnamese.
  const text = 'Mình gợi ý vài chỗ ăn ngon quanh đây nhé!'
  const places = [{ name: 'Quán Không Nhắc Tên', photo_url: `${IMG}/x.jpg` }]

  it('defaults to the Vietnamese trailing-block label when no lang is passed', () => {
    const out = injectPlaceEnrichment(places, text)
    expect(out).toContain('📸 _Hình ảnh & link review:_')
  })

  it('uses the Vietnamese trailing-block label for lang "vi"', () => {
    const out = injectPlaceEnrichment(places, text, 'vi')
    expect(out).toContain('📸 _Hình ảnh & link review:_')
  })

  it('uses the English trailing-block label for lang "en"', () => {
    const out = injectPlaceEnrichment(places, text, 'en')
    expect(out).toContain('📸 _Images & review links:_')
    expect(out).not.toContain('Hình ảnh & link review')
  })
})

describe('applyPlaceEnrichmentStreamFilter — stream transform', () => {
  const line0 = (s: string) => '0:' + JSON.stringify(s)

  async function runFilter(inputLines: string[]): Promise<string> {
    const input = inputLines.join('\n') + '\n'
    const filtered = applyPlaceEnrichmentStreamFilter(new Response(input))
    return await new Response(filtered.body).text()
  }

  it('streams pre-tool intro live, then re-emits the buffered place text with the photo grouped', async () => {
    const place = { name: 'Phở Gà', photo_url: `${IMG}/ga.jpg` }
    const out = await runFilter([
      'f:{"messageId":"m1"}',
      line0('Mình tìm nhé. '),
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":{"results":[${JSON.stringify(place)}]}}`,
      line0('**Phở Gà**\n4.7 sao ngon.'),
      'd:{"finishReason":"stop"}',
    ])
    // intro streamed live, BEFORE the tool-call line
    expect(out).toContain('Mình tìm nhé. ')
    expect(out.indexOf('Mình tìm nhé. ')).toBeLessThan(out.indexOf('9:'))
    // photo injected into the buffered place text, after the place name
    expect(out).toContain('ga.jpg')
    expect(out.indexOf('Phở Gà')).toBeLessThan(out.lastIndexOf('ga.jpg'))
    // finish frame preserved
    expect(out).toContain('d:{"finishReason":"stop"}')
  })

  it('passes plain chitchat through unchanged (no place tool → no buffering)', async () => {
    const out = await runFilter([line0('Chào bạn! '), line0('Mình là Tappy.'), 'd:{"finishReason":"stop"}'])
    expect(out).toContain(line0('Chào bạn! '))
    expect(out).toContain(line0('Mình là Tappy.'))
    expect(out).not.toContain('Ảnh địa điểm')
  })

  it('ACCUMULATES places across MULTIPLE tool calls so a plan photographs items from every search', async () => {
    // A trip plan runs several searches; each plan item must match a photo from its OWN search,
    // not only the last one. hotel comes from call #1, food from call #2 — both must land.
    const hotel = { name: 'San San Hotel', photo_url: `${IMG}/hotel.jpg` }
    const food = { name: 'Hải Sản Mộc', photo_url: `${IMG}/food.jpg` }
    const planJson = JSON.stringify({
      type: 'trip', title: 'Đà Nẵng', days: [{ label: 'Ngày 1', items: [
        { time: '14:00', name: 'San San Hotel', category: 'hotel' },
        { time: '18:00', name: 'Hải Sản Mộc', category: 'food' },
      ] }],
    })
    const out = await runFilter([
      '9:{"toolCallId":"t1","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t1","result":{"results":[${JSON.stringify(hotel)}]}}`,
      '9:{"toolCallId":"t2","toolName":"search_places","args":{}}',
      `a:{"toolCallId":"t2","result":{"results":[${JSON.stringify(food)}]}}`,
      line0(`[TAPPY_PLAN]\n${planJson}\n[/TAPPY_PLAN]`),
      'd:{"finishReason":"stop"}',
    ])
    const full = out.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2))).sort((a, b) => b.length - a.length)[0]
    const plan = JSON.parse(full.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)![1].trim())
    const items = plan.days[0].items as Array<{ name: string; photo_url?: string }>
    // Both items got their photo even though they came from DIFFERENT searches (accumulation).
    expect(items.find(i => i.name === 'San San Hotel')?.photo_url).toContain('hotel.jpg')
    expect(items.find(i => i.name === 'Hải Sản Mộc')?.photo_url).toContain('food.jpg')
  })
})
