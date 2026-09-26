import { describe, it, expect } from 'vitest'
import {
  REDACTED, buildPublicPayload, deriveTitle, extractImages, generalizeQuery, isStorableImageUrl,
  redactPii, sanitizeBody, sanitizeButtons, stripAllMarkers,
} from './publicSanitizer'
import { findForbiddenKey, validateSharedResultPayload } from './sharedResult'

// ─────────────────────────────────────────────────────────────────────────────
// The privacy boundary. Every case here is something that must NOT reach a
// public page. A failure in this file is a privacy incident, not a bug.
// ─────────────────────────────────────────────────────────────────────────────

const PRIVATE_QUERY = 'Lên kế hoạch cuối tuần cho vợ tôi và 2 con ở Sài Gòn, ngân sách 2.500.000 VND, gần nhà tôi ở 12 Nguyễn Trãi Q1, gọi tôi 0912 345 678, email huy@example.com'

const ASSISTANT = `Dựa trên sở thích của bạn đã chia sẻ, mình gợi ý:

## Sáng thứ Bảy
- **Thảo Cầm Viên** — vé 60.000đ, [Xem trên Maps](https://www.google.com/maps/search/?api=1&query=Thao+Cam+Vien)
- Liên hệ 028 3829 3728 để đặt trước.

![Ảnh](https://encrypted-tbn0.gstatic.com/images?q=abc)
![Ảnh](https://lh3.googleusercontent.com/places/AB123=s1600)
![Ảnh](https://cdn.shopee.vn/file/x.jpg)

[TAPPY_PLAN]{"type":"trip","title":"Cuối tuần gia đình","days":[{"label":"Ngày 1","items":[{"time":"09:00","emoji":"🌳","category":"entertainment","name":"Thảo Cầm Viên","address":"2 Nguyễn Bỉnh Khiêm, Q1","maps_link":"https://maps.app.goo.gl/abc","photo_url":"https://lh3.googleusercontent.com/places/AB123=s1600","description":"Gọi 0912345678 để hỏi"}]}]}[/TAPPY_PLAN]
[CTA_BUTTONS]{"buttons":[{"label":"📍 Xem trên Maps","type":"maps","url":"https://www.google.com/maps/search/?api=1&query=x","primary":true},{"label":"Đặt bàn","type":"internal_booking","url":"/bookings/new?placeId=1","primary":false},{"label":"Web","type":"website","url":"http://insecure.example","primary":false},{"label":"Gọi","type":"call","url":"tel:02838293728","primary":false}]}[/CTA_BUTTONS]
[FOLLOWUPS]Có chỗ nào cho trẻ nhỏ hơn không?|Chi phí ăn trưa gần đó?[/FOLLOWUPS]`

describe('redactPii', () => {
  it('redacts emails, VN phone numbers, national ids and long card numbers', () => {
    const out = redactPii('Liên hệ huy@example.com hoặc 0912 345 678 / +84 912345678, CCCD 079123456789, thẻ 4111 1111 1111 1111')
    expect(out).not.toContain('huy@example.com')
    expect(out).not.toContain('0912 345 678')
    expect(out).not.toContain('912345678')
    expect(out).not.toContain('079123456789')
    expect(out).not.toContain('4111 1111 1111 1111')
    expect(out.split(REDACTED).length).toBeGreaterThanOrEqual(5)
  })

  it('redacts a first-person address statement', () => {
    expect(redactPii('nhà tôi ở 12 Nguyễn Trãi, Quận 1. Gợi ý quán gần đó')).not.toContain('12 Nguyễn Trãi')
    expect(redactPii('I live at 45 Le Loi street, District 1')).not.toContain('45 Le Loi')
  })

  it('leaves ordinary prices and years alone', () => {
    const s = 'Vé 60.000đ, mở cửa từ 2019, khoảng 1.200 chỗ'
    expect(redactPii(s)).toBe(s)
  })
})

describe('generalizeQuery / deriveTitle', () => {
  it('keeps the ask and drops who, how much, and where the asker lives', () => {
    const q = generalizeQuery(PRIVATE_QUERY)
    expect(q).not.toMatch(/vợ|con|2\.500\.000|Nguyễn Trãi|0912|@example/)
    expect(q).toMatch(/kế hoạch cuối tuần/i)
    expect(q).toMatch(/Sài Gòn/)
  })
  it('handles English personal context too', () => {
    const q = generalizeQuery('Plan a dinner for my wife and kids near my office, budget $50')
    expect(q).not.toMatch(/wife|kids|office|\$50/)
    expect(q).toMatch(/dinner/i)
  })
  it('derives a capped, sentence-cased title', () => {
    expect(deriveTitle('quán cà phê yên tĩnh ở Đà Lạt. Có wifi không?', 'fb')).toBe('Quán cà phê yên tĩnh ở Đà Lạt')
    expect(deriveTitle('', 'Fallback')).toBe('Fallback')
    expect(deriveTitle('a'.repeat(300), 'fb').length).toBeLessThanOrEqual(120)
  })
})

describe('images — storage policy', () => {
  it('refuses Google Places photo shapes and keeps storable providers', () => {
    expect(isStorableImageUrl('https://lh3.googleusercontent.com/places/AB123=s1600')).toBe(false)
    expect(isStorableImageUrl('https://maps.googleapis.com/maps/api/place/photo?photoreference=x')).toBe(false)
    expect(isStorableImageUrl('https://lh3.ggpht.com/p/x')).toBe(false)
    expect(isStorableImageUrl('https://x.public.blob.vercel-storage.com/a.jpg')).toBe(false)
    expect(isStorableImageUrl('http://cdn.shopee.vn/x.jpg')).toBe(false)
    expect(isStorableImageUrl('https://encrypted-tbn0.gstatic.com/images?q=abc')).toBe(true)
    expect(isStorableImageUrl('https://cdn.shopee.vn/file/x.jpg')).toBe(true)
  })
  it('lifts image markdown out of the prose', () => {
    const { text, images } = extractImages('a\n![x](https://cdn.shopee.vn/1.jpg)\n![y](https://lh3.googleusercontent.com/places/z)\nb')
    expect(images).toEqual(['https://cdn.shopee.vn/1.jpg'])
    expect(text).not.toContain('![')
  })
})

describe('buttons / body / markers', () => {
  it('drops private routes, http, and app-only handoffs; keeps maps/website/booking/call', () => {
    const out = sanitizeButtons([
      { label: 'Maps', type: 'maps', url: 'https://maps.app.goo.gl/x', primary: true },
      { label: 'Book', type: 'internal_booking', url: '/bookings/new', primary: false },
      { label: 'Web', type: 'website', url: 'http://x.example', primary: false },
      { label: 'Zalo', type: 'zalo', url: 'https://zalo.me/x', primary: false },
      { label: 'Chat', type: 'website', url: 'https://www.tappyai.com/chat/abc', primary: false },
      { label: 'Call', type: 'call', url: 'tel:02838293728', primary: false },
    ])
    expect(out.map(b => b.type)).toEqual(['maps', 'call'])
  })
  it('strips every marker, closed, orphaned or unknown', () => {
    const s = stripAllMarkers('x [TAPPY_FUTURE]{"a":1}[/TAPPY_FUTURE] y [CTA_BUTTONS]{ z [/FOLLOWUPS]')
    expect(s).not.toMatch(/\[\/?[A-Z_]+\]/)
  })
  it('removes memory-addressed lines from the body', () => {
    const body = sanitizeBody('Dựa trên sở thích của bạn đã chia sẻ, mình gợi ý:\n\nQuán A rất ngon.\nBased on what you told me, B is better.')
    expect(body).not.toMatch(/sở thích của bạn|what you told me/)
    expect(body).toContain('Quán A rất ngon.')
  })
})

describe('buildPublicPayload — end to end', () => {
  const payload = buildPublicPayload({ userQuery: PRIVATE_QUERY, assistantContent: ASSISTANT, domain: 'travel', locale: 'vi', createdAt: new Date('2026-09-13T00:00:00Z') })

  it('produces a payload the validator accepts', () => {
    expect(validateSharedResultPayload(payload)).toBeNull()
  })

  it('carries no PII anywhere in the serialized form', () => {
    const json = JSON.stringify(payload)
    expect(json).not.toMatch(/huy@example\.com|0912\s?345\s?678|0912345678|Nguyễn Trãi|2\.500\.000/)
    expect(json).not.toMatch(/vợ tôi|2 con/)
  })

  it('strips every marker from the body and lifts structured blocks out', () => {
    expect(payload.body).not.toMatch(/\[\/?(TAPPY_|CTA_|FOLLOWUPS)/)
    expect(payload.plan?.title).toBe('Cuối tuần gia đình')
    expect(payload.suggestedQuestions).toEqual(['Có chỗ nào cho trẻ nhỏ hơn không?', 'Chi phí ăn trưa gần đó?'])
  })

  it('keeps the useful result: prose, maps button, storable images', () => {
    expect(payload.body).toContain('Thảo Cầm Viên')
    expect(payload.buttons.map(b => b.type)).toEqual(['maps', 'call'])
    expect(payload.images).toEqual(['https://encrypted-tbn0.gstatic.com/images?q=abc', 'https://cdn.shopee.vn/file/x.jpg'])
  })

  it('never stores a Google Places photo, even inside the plan', () => {
    expect(JSON.stringify(payload)).not.toContain('googleusercontent.com/places')
    expect(payload.plan?.days[0].items[0].photo_url).toBeUndefined()
  })

  it('redacts PII inside plan items but keeps venue addresses', () => {
    const item = payload.plan!.days[0].items[0]
    expect(item.description).not.toContain('0912345678')
    expect(item.address).toBe('2 Nguyễn Bỉnh Khiêm, Q1')
    expect(item.maps_link).toBe('https://maps.app.goo.gl/abc')
  })

  it('drops memory-addressed prose', () => {
    expect(payload.body).not.toMatch(/sở thích của bạn/)
  })

  it('is deterministic and never calls a model', () => {
    const again = buildPublicPayload({ userQuery: PRIVATE_QUERY, assistantContent: ASSISTANT, domain: 'travel', locale: 'vi', createdAt: new Date('2026-09-13T00:00:00Z') })
    expect(again).toEqual(payload)
  })

  it('honours a user-provided title but still redacts it', () => {
    const p = buildPublicPayload({ userQuery: 'x', assistantContent: 'y', title: 'Gọi tôi 0912345678 nhé', locale: 'vi' })
    expect(p.title).not.toContain('0912345678')
  })

  it('falls back to general/vi for unknown domain and locale, and survives garbage input', () => {
    const p = buildPublicPayload({ userQuery: '', assistantContent: '[TAPPY_PLAN]{broken', domain: 'weird', locale: 'xx' })
    expect(p.domain).toBe('general')
    expect(p.locale).toBe('vi')
    expect(validateSharedResultPayload(p)).toBeNull()
  })

  it('has no forbidden key anywhere in its tree', () => {
    expect(findForbiddenKey(payload)).toBeNull()
  })
})
