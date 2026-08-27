// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parsePlan, parseCTA, parseFollowups } from './ChatInterface'

// ── P0 REGRESSION: the raw [CTA_BUTTONS] block reached the user ─────────────
//
// Found on Android first, in a live production reply: `[CTA_BUTTONS]{…}` rendered as visible
// text and stayed there after the stream finished. Web's parseCTA carries the same
// end-of-content anchor (`\[CTA_BUTTONS\](\{[\s\S]*\})\s*$`), so these tests establish whether
// Web leaks the same way before anything is changed.
//
// The mechanism under test: the model emits [FOLLOWUPS] AFTER the CTA block, and the render
// chain runs parsePlan → parseCTA → parseFollowups. At parseCTA time the followups line still
// trails the CTA block, so an end-anchored pattern cannot match; nothing is stripped; and once
// parseFollowups removes its own line the CTA JSON is left orphaned in the visible text.
//
// Both the streaming body (`lastAssistantRaw`, ChatInterface ~L789) and the settled body
// (~L1213-1215) run this identical chain, so a leak here is visible in both.

/** The visible text after the full client parse chain — what the user actually reads. */
const visible = (content: string) => parseFollowups(parseCTA(parsePlan(content).text).text).text

const CTA_JSON =
  '{"buttons":[{"label":"🛒 Shopee","type":"search","url":"https://shopee.vn/search?keyword=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax","primary":true},' +
  '{"label":"📦 Lazada","type":"search","url":"https://www.lazada.vn/catalog/?q=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax","primary":false},' +
  '{"label":"🛍️ Tiki","type":"search","url":"https://tiki.vn/search?q=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax","primary":false}]}'

/** Verbatim shape of the production reply that leaked on the SM-A127F (2026-08-27). */
const PRODUCTION_REPLY =
  "I'll search for iPhone 17 ProMax cases for you.\n" +
  'Both are MagSafe-compatible, which is handy. 👍\n' +
  `[CTA_BUTTONS]${CTA_JSON}\n` +
  '[FOLLOWUPS]Ốp nào chống sốc tốt?|Có ốp trong suốt không?|Giá rẻ hơn ở đâu?'

describe('parseCTA — the marker must never reach the user', () => {
  // CASE 2 + the production repro: CTA followed by FOLLOWUPS.
  it('does not leak the CTA block when [FOLLOWUPS] follows it (production shape)', () => {
    const text = visible(PRODUCTION_REPLY)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).not.toContain('"buttons"')
    expect(text).not.toContain('shopee.vn/search')
    expect(text).toBe("I'll search for iPhone 17 ProMax cases for you.\nBoth are MagSafe-compatible, which is handy. 👍")
  })

  it('still decodes the buttons when [FOLLOWUPS] follows the block', () => {
    const { buttons } = parseCTA(parsePlan(PRODUCTION_REPLY).text)

    expect(buttons).toHaveLength(3)
    expect(buttons[0].label).toBe('🛒 Shopee')
    expect(buttons[0].url).toBe('https://shopee.vn/search?keyword=%E1%BB%91p+l%C6%B0ng+iPhone+17+ProMax')
    expect(buttons[0].primary).toBe(true)
  })

  it('still parses the followups that trail the block', () => {
    const { followups } = parseFollowups(parseCTA(parsePlan(PRODUCTION_REPLY).text).text)
    expect(followups).toEqual(['Ốp nào chống sốc tốt?', 'Có ốp trong suốt không?', 'Giá rẻ hơn ở đâu?'])
  })

  // CASE 1: the shape that already worked must keep working.
  it('handles a CTA block at the very end of the response', () => {
    const reply = `Đi thử nhé.\n[CTA_BUTTONS]{"buttons":[{"label":"Bản đồ","type":"maps","url":"https://maps.example","primary":true}]}`
    const { text, buttons } = parseCTA(reply)

    expect(text).toBe('Đi thử nhé.')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].label).toBe('Bản đồ')
  })

  // CASE 3: CTA followed by ordinary prose.
  it('handles a CTA block followed by ordinary prose, leaving the prose intact', () => {
    const reply = `Mở app nhé.\n[CTA_BUTTONS]{"buttons":[{"label":"Mở","type":"search","url":"https://x.example","primary":true}]}\nCòn gì nữa không?`
    const { text, buttons } = parseCTA(reply)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).toContain('Còn gì nữa không?')
    expect(buttons).toHaveLength(1)
  })

  // The closing-tag form is the documented primary shape.
  it('handles the closing-tag form with prose after it', () => {
    const reply = `Xong.\n[CTA_BUTTONS]{"buttons":[{"label":"Gọi","type":"call","url":"tel:123","primary":false}]}[/CTA_BUTTONS]\nCòn gì nữa không?`
    const { text, buttons } = parseCTA(reply)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).toContain('Còn gì nữa không?')
    expect(buttons).toHaveLength(1)
  })

  // CASE 7 + 8: a brace scanner must not be fooled by braces inside JSON strings or URLs,
  // and must stop at the block's own closing brace rather than the last one in the message.
  it('is not confused by braces inside JSON strings', () => {
    const reply = `Xem nhé.\n[CTA_BUTTONS]{"buttons":[{"label":"Giá {khuyến mãi}","type":"search","url":"https://x.example/a?q=%7Bid%7D","primary":true}]}\nGhi chú sau.`
    const { text, buttons } = parseCTA(reply)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).toContain('Ghi chú sau.')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].label).toBe('Giá {khuyến mãi}')
  })

  it('does not swallow trailing prose that itself contains braces', () => {
    const reply = `Mở app nhé.\n[CTA_BUTTONS]{"buttons":[{"label":"Mở","type":"search","url":"https://x.example","primary":true}]}\nCú pháp là {"key": "value"} nhé.`
    const { text } = parseCTA(reply)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).toContain('Cú pháp là {"key": "value"} nhé.')
  })

  it('handles an escaped quote inside a label', () => {
    const reply = `A\n[CTA_BUTTONS]{"buttons":[{"label":"Nói \\"xin chào\\"","type":"search","url":"https://x.example","primary":true}]}\nB`
    const { text, buttons } = parseCTA(reply)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).toContain('B')
    expect(buttons[0].label).toBe('Nói "xin chào"')
  })

  // CASE 5 + 6: streaming and malformed content must degrade to "no marker visible".
  it('never shows a half-arrived CTA block while streaming', () => {
    const midStream = 'Đang tìm…\n[CTA_BUTTONS]{"buttons":[{"label":"Sho'
    const { text } = parseCTA(midStream)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).not.toContain('"buttons"')
    expect(text).toBe('Đang tìm…')
  })

  it('strips a malformed CTA payload even though no buttons can be decoded', () => {
    const reply = 'Trước.\n[CTA_BUTTONS]{not valid json}\nSau.'
    const { text, buttons } = parseCTA(reply)

    expect(text).not.toContain('CTA_BUTTONS')
    expect(text).not.toContain('not valid json')
    expect(text).toContain('Sau.')
    expect(buttons).toEqual([])
  })

  it('never shows an orphan CTA tag', () => {
    expect(parseCTA('Xong. [CTA_BUTTONS]').text).not.toContain('CTA_BUTTONS')
    expect(parseCTA('Xong. [/CTA_BUTTONS]').text).not.toContain('CTA_BUTTONS')
  })

  // CASE 4: the block arrives progressively. At EVERY prefix the user must never see the
  // marker or any fragment of its JSON. This is the streaming contract, checked on the same
  // parse chain the streaming body uses (ChatInterface ~L789) — it is not a claim about
  // browser paint timing, which these tests cannot observe.
  it('leaks nothing at any prefix of the streamed response', () => {
    for (let i = 1; i <= PRODUCTION_REPLY.length; i++) {
      const partial = PRODUCTION_REPLY.slice(0, i)
      const text = visible(partial)
      expect(text, `leaked at prefix length ${i}`).not.toContain('CTA_BUTTONS')
      expect(text, `leaked JSON at prefix length ${i}`).not.toContain('"buttons"')
      expect(text, `leaked url at prefix length ${i}`).not.toContain('shopee.vn')
    }
  })

  it('leaves a reply with no CTA block untouched', () => {
    const prose = 'Mình chọn Quán hủ tiếu thả - Dì Ba — 4.6⭐ (57 đánh giá).'
    expect(parseCTA(prose).text).toBe(prose)
    expect(parseCTA(prose).buttons).toEqual([])
  })

  // CASE 12: the existing UI contract — button schema is untouched by this fix.
  it('preserves the button schema exactly', () => {
    const reply = `x\n[CTA_BUTTONS]{"buttons":[{"label":"Đặt bàn","type":"internal_booking","url":"/booking?placeId=abc","primary":true}]}`
    const { buttons } = parseCTA(reply)

    expect(buttons[0]).toEqual({
      label: 'Đặt bàn',
      type: 'internal_booking',
      url: '/booking?placeId=abc',
      primary: true,
    })
  })
})
