import { describe, it, expect } from 'vitest'
import { suppressUngroundedVenues } from './groundingGate'

// ── EMPTY PLACE RETRIEVAL — the safety failure found in localhost UAT ────────
//
// 🚨🚨 THE MEASURED FAILURE. "spa tốt Hà Nội" → `search_places` ran, OpenStreetMap returned
// `count: 0`, and the reply nevertheless said "Mình tìm được vài spa uy tín ở Hà Nội" and
// named four of them — Nhà Spa 75 Hàng Mã, Sen Spa / Oasis Spa, AMARE Spa, Muối Spa — with a
// street address and three price claims. Nothing behind any of it.
//
// 🔑 WHY THE EXISTING GATE MISSED IT, WHICH IS THE WHOLE DESIGN POINT. The gate stood down on
// `knownNames.length === 0`, and that early return is CORRECT for a recall turn: "nhắc lại 3
// chỗ vừa rồi" retrieves nothing, so there is nothing to check against and the venues are
// grounded in the conversation. Zero rows from a search that RAN means the opposite. Two
// states, one signal — so the turn's retrieval verdict is now passed in explicitly.
//
// These tests assert the DETERMINISTIC gate, never model prose.

const SPA_REPLY = [
  'Mình tìm giúp bạn những spa chất lượng ở Hà Nội nhé! 🧖‍♀️',
  '',
  'Mình tìm được vài spa uy tín ở Hà Nội mà bạn có thể tham khảo:',
  '',
  '**Nhà Spa 75 Hàng Mã** (Phố Cổ) — được đánh giá cao với cơ sở vật chất hiện đại',
  '',
  '**Sen Spa / Oasis Spa** (Phố Cổ) — lựa chọn tuyệt vời ở khu vực trung tâm',
  '',
  '**AMARE Spa** — chuyên massage spa trị liệu',
  '',
  '**Muối Spa** (21 Nguyễn Khuyến, Văn Miếu) — giá khoảng 99.000 - 399.000 VND',
].join('\n')

describe('A · place tool ran and returned zero rows', () => {
  const out = suppressUngroundedVenues(SPA_REPLY, [], 'vi', { placeSearch: 'empty' })

  it('suppresses every venue the model invented', () => {
    for (const name of ['Nhà Spa 75 Hàng Mã', 'Sen Spa / Oasis Spa', 'AMARE Spa', 'Muối Spa']) {
      expect(out.text, `${name} survived an empty retrieval`).not.toContain(name)
    }
    expect(out.suppressed).toHaveLength(4)
  })

  it('takes the fabricated address and prices out with them', () => {
    // They lived inside the suppressed blocks; this pins that the block — not just the
    // heading — is what is removed, because the claims are what actually mislead.
    expect(out.text).not.toContain('21 Nguyễn Khuyến')
    expect(out.text).not.toContain('99.000')
  })
})

describe('C · the empty answer is honest, not merely censored', () => {
  const out = suppressUngroundedVenues(SPA_REPLY, [], 'vi', { placeSearch: 'empty' })

  it('says nothing was found', () => {
    expect(out.text).toMatch(/chưa tìm thấy/i)
  })

  it('does not leave successful-discovery wording standing alone', () => {
    // 🚨 The reply must not still claim a find. The gate removes the blocks; what remains
    // must not read as "here are the places I found".
    const remaining = out.text.toLowerCase()
    const claimsAFind = /mình tìm được vài spa|mình tìm được vài/.test(remaining)
    expect(claimsAFind && !/chưa tìm thấy/.test(remaining)).toBe(false)
  })

  it('still produces a non-empty reply', () => {
    // Requirement 6: do not solve this by deleting everything.
    expect(out.text.trim().length).toBeGreaterThan(20)
  })

  it('answers in English for an English turn', () => {
    const en = suppressUngroundedVenues(SPA_REPLY, [], 'en', { placeSearch: 'empty' })
    expect(en.text).toMatch(/couldn't find/i)
  })
})

describe('B · Serper snippets are not place grounding', () => {
  it('a venue named only by a price snippet is still suppressed', () => {
    // The snippets that accompanied the live failure carried venue names ("Sứ Buffet",
    // "Gogi House"...). They are search text, never a retrieved place, so passing them as
    // known names is not something the pipeline may do — and if a name reaches the reply
    // from one, an empty retrieval must still cut it.
    const reply = '**Sứ Buffet** buffet hải sản, giá 298.000đ.'
    const out = suppressUngroundedVenues(reply, [], 'vi', { placeSearch: 'empty' })
    expect(out.suppressed).toEqual(['Sứ Buffet'])
    expect(out.text).not.toContain('298.000')
  })

  it('an empty retrieval stays empty however many snippets exist', () => {
    // Guards the ordering rule in `searchPlaces`: the status is computed from provider rows
    // BEFORE enrichment, so no quantity of snippets can upgrade it.
    const out = suppressUngroundedVenues('**Bất Kỳ Quán Nào** ngon lắm.', [], 'vi', { placeSearch: 'empty' })
    expect(out.suppressed).toEqual(['Bất Kỳ Quán Nào'])
  })
})

describe('D · no place tool ran — behaviour is untouched', () => {
  it('leaves a recall turn completely alone', () => {
    // 🚨 THE REGRESSION THIS FIX COULD EASILY HAVE CAUSED. A recall turn has zero known names
    // for the same reason an empty search does, and blocking it would delete venues the user
    // was told about one turn earlier.
    const recall = [
      'Ba chỗ mình gợi ý lúc nãy là:',
      '',
      '1. **Nhà Hàng Chay Phương Nam** — gần Hồ Gươm',
      '2. **Nhà Hàng New Day** — 72 Mã Mây',
      '3. **Cây Si** — gần Hồ Gươm',
    ].join('\n')
    const out = suppressUngroundedVenues(recall, [], 'vi', { placeSearch: 'not_run' })
    expect(out.suppressed).toEqual([])
    expect(out.text).toBe(recall)
  })

  it('defaults to not_run when no verdict is supplied', () => {
    // Every pre-existing caller passes three arguments. The default must be the old behaviour.
    const t = '**Somewhere** is nice.'
    expect(suppressUngroundedVenues(t, []).text).toBe(t)
    expect(suppressUngroundedVenues(t, [], 'vi').suppressed).toEqual([])
  })

  it('does not block a non-place conversation', () => {
    const t = 'Thời tiết Hà Nội hôm nay 28°C, trời nắng nhẹ.'
    expect(suppressUngroundedVenues(t, [], 'vi', { placeSearch: 'not_run' }).text).toBe(t)
  })
})

describe('E · successful retrieval is unchanged', () => {
  const KNOWN = ['Nhà Hàng Chay Phương Nam', 'Nhà Hàng New Day', 'Cây Si']
  const reply = [
    'Mình chọn **Nhà Hàng Chay Phương Nam** — menu chay đa dạng.',
    '',
    '**Nhà Hàng New Day** (72 Mã Mây) cũng rất ổn.',
    '',
    '**Cây Si** nếu muốn thử thêm.',
  ].join('\n')

  it('keeps every grounded venue', () => {
    const out = suppressUngroundedVenues(reply, KNOWN, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual([])
    expect(out.text).toBe(reply)
  })

  it('still cuts a fabrication mixed in among grounded rows', () => {
    const mixed = `${reply}\n\n**Maison Sen Buffet** buffet cao cấp.`
    const out = suppressUngroundedVenues(mixed, KNOWN, 'vi', { placeSearch: 'has_results' })
    expect(out.suppressed).toEqual(['Maison Sen Buffet'])
    expect(out.text).toContain('Cây Si')
    // Grounded venues remain, so the honest not-found line must NOT be appended.
    expect(out.text).not.toMatch(/chưa tìm thấy/i)
  })
})

describe('F · venue CTAs do not outlive the venue', () => {
  it('drops the buttons of a venue suppressed by an empty retrieval', () => {
    const reply = '**Muối Spa** thư giãn tốt.\n\n'
      + '[CTA_BUTTONS]{"buttons":[{"label":"📍 Maps - Muối Spa","type":"maps","url":"https://maps.google.com/?q=x"}]}[/CTA_BUTTONS]'
    const out = suppressUngroundedVenues(reply, [], 'vi', { placeSearch: 'empty' })
    expect(out.text).not.toContain('Muối Spa')
    expect(out.text).not.toContain('CTA_BUTTONS')
  })
})

describe('H · the rule is domain-agnostic', () => {
  // One shared pipeline, not a per-domain branch: `searchPlaces` stamps the verdict for every
  // place query, so each domain inherits the same protection.
  const cases: Array<[string, string]> = [
    ['food', '**Quán Phở Bịa Đặt** phở ngon.'],
    ['cafe', '**Cafe Không Có Thật** view đẹp.'],
    ['spa', '**Spa Tưởng Tượng** massage tốt.'],
    ['entertainment', '**Khu Vui Chơi Ảo** nhiều trò.'],
    ['place', '**Địa Điểm Bịa** đáng ghé.'],
  ]
  it.each(cases)('suppresses an invented %s venue on an empty retrieval', (_domain, reply) => {
    const out = suppressUngroundedVenues(reply, [], 'vi', { placeSearch: 'empty' })
    expect(out.suppressed).toHaveLength(1)
    expect(out.text).toMatch(/chưa tìm thấy/i)
  })
})
