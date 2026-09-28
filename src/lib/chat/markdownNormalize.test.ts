import { describe, it, expect } from 'vitest'
import { balanceBold, balanceBoldPerLine, plainText, plainTextDeep, normalizeReplyMarkdown } from './markdownNormalize'

// Owner UAT 2026-09-28: a literal "**" in chat answers (travel first, every vertical). These are
// the shapes that reached the screen, each pinned at the shared layer.

describe('balanceBold — one line', () => {
  it('keeps a matched pair', () => {
    expect(balanceBold('Quán **Phở Gà** ngon')).toBe('Quán **Phở Gà** ngon')
  })
  it('drops an orphan at line end (a guard cut the sentence after the opener)', () => {
    expect(balanceBold('Giá tốt nhất **')).toBe('Giá tốt nhất ')
    expect(balanceBold('**Tổng ước tính')).toBe('Tổng ước tính')
  })
  it('drops the unmatched one and keeps the real pair', () => {
    expect(balanceBold('**a** và **b')).toBe('**a** và b')
    expect(balanceBold('a** b **c** d')).toBe('a b **c** d')
  })
  it('trims inner padding: "** text**" renders bold "text"', () => {
    expect(balanceBold('** text**')).toBe('**text**')
    expect(balanceBold('**text **')).toBe('**text**')
  })
  it('treats *** as one bold delimiter', () => {
    expect(balanceBold('***Đà Lạt***')).toBe('**Đà Lạt**')
    expect(balanceBold('**Lưu ý:*** abc')).toBe('**Lưu ý:** abc')
    expect(balanceBold('***')).toBe('')
  })
  it('removes empty pairs and 4+ runs', () => {
    expect(balanceBold('a **** b')).toBe('a b')
    expect(balanceBold('a ** ** b')).toBe('a b')
  })
  it('handles the card-field shape "**4.7⭐"', () => {
    expect(balanceBold('**4.7⭐')).toBe('4.7⭐')
    expect(balanceBold('**4.7⭐**')).toBe('**4.7⭐**')
  })
  it('nested / unbalanced never leaves a "**"', () => {
    for (const s of ['**a **b** c**', '**a **b', '****x', 'x**y**z**', '** ** **']) {
      const out = balanceBold(s)
      const runs = out.match(/\*\*/g) ?? []
      expect(runs.length % 2, `${s} → ${out}`).toBe(0)
    }
  })
  it('does not touch a single * or text without **', () => {
    expect(balanceBold('2*3 = 6')).toBe('2*3 = 6')
    expect(balanceBold('*nghiêng*')).toBe('*nghiêng*')
  })
})

describe('balanceBoldPerLine', () => {
  it('a pair split by a line break is not a pair: both halves drop', () => {
    expect(balanceBoldPerLine('**Ngày 1\nđi chơi**')).toBe('Ngày 1\nđi chơi')
  })
  it('each line balances on its own', () => {
    expect(balanceBoldPerLine('**A** ok\n**B')).toBe('**A** ok\nB')
  })
})

describe('plainText — card fields', () => {
  it('strips bold, code, headings, links and flanking emphasis', () => {
    expect(plainText('**4.7⭐**')).toBe('4.7⭐')
    expect(plainText('**4.7⭐')).toBe('4.7⭐')
    expect(plainText('Ăn **bún chả** ở `Hàng Mành`')).toBe('Ăn bún chả ở Hàng Mành')
    expect(plainText('## Ngày 1')).toBe('Ngày 1')
    expect(plainText('Xem [Booking](https://booking.com/x)')).toBe('Xem Booking')
    expect(plainText('*rất* đẹp, __ồn__')).toBe('rất đẹp, ồn')
    expect(plainText('***')).toBe('')
  })
  it('leaves arithmetic and snake_case alone', () => {
    expect(plainText('2*3 phòng')).toBe('2*3 phòng')
    expect(plainText('photo_url')).toBe('photo_url')
  })
})

describe('plainTextDeep', () => {
  it('strips prose values, never URLs / ids / enums, and keeps the reference when clean', () => {
    const plan = { title: '**Đà Lạt**', days: [{ label: 'Ngày 1', items: [{ name: '**Quán A**', description: '**4.7⭐', booking_link: 'https://x.vn/a**b', category: 'food' }] }], cost_breakdown: { '**Ăn uống**': '**500k**' } }
    const out = plainTextDeep(plan)
    expect(out.title).toBe('Đà Lạt')
    expect(out.days[0].items[0]).toEqual({ name: 'Quán A', description: '4.7⭐', booking_link: 'https://x.vn/a**b', category: 'food' })
    expect(out.cost_breakdown).toEqual({ 'Ăn uống': '500k' })
    const clean = { title: 'x' }
    expect(plainTextDeep(clean)).toBe(clean)
  })
})

describe('normalizeReplyMarkdown — the server final text', () => {
  it('balances prose and strips markdown inside marker JSON strings, markers intact', () => {
    const plan = JSON.stringify({ type: 'trip', title: '**Vũng Tàu**', days: [{ label: 'Ngày 1', items: [{ time: '9:00', name: 'Bãi Sau', description: '**4.7⭐', maps_link: 'https://maps.google.com/?q=a' }] }] })
    const text = `**Gợi ý** cho bạn **\n[TAPPY_PLAN]${plan}[/TAPPY_PLAN]\n[CTA_BUTTONS]{"buttons":[{"label":"**Đặt**","url":"https://x.vn/**"}]}[/CTA_BUTTONS]\n[FOLLOWUPS]**Giá**?|Còn quán khác?[/FOLLOWUPS]`
    const out = normalizeReplyMarkdown(text)
    expect(out.startsWith('**Gợi ý** cho bạn \n[TAPPY_PLAN]')).toBe(true)
    const body = JSON.parse(out.match(/\[TAPPY_PLAN\]([\s\S]*?)\[\/TAPPY_PLAN\]/)![1])
    expect(body.title).toBe('Vũng Tàu')
    expect(body.days[0].items[0].description).toBe('4.7⭐')
    expect(body.days[0].items[0].maps_link).toBe('https://maps.google.com/?q=a')
    const cta = JSON.parse(out.match(/\[CTA_BUTTONS\]([\s\S]*?)\[\/CTA_BUTTONS\]/)![1])
    expect(cta.buttons[0]).toEqual({ label: 'Đặt', url: 'https://x.vn/**' })
    expect(out).toContain('[FOLLOWUPS]Giá?|Còn quán khác?[/FOLLOWUPS]')
  })
  it('leaves a clean block byte-identical and never touches an unclosed block', () => {
    const block = '[TAPPY_PLAN]\n{"title": "x", "days": []}\n[/TAPPY_PLAN]'
    expect(normalizeReplyMarkdown(`ok ${block}`)).toBe(`ok ${block}`)
    const cut = 'Xin chào **\n[TAPPY_PLAN]{"title":"**x'
    expect(normalizeReplyMarkdown(cut)).toBe('Xin chào \n[TAPPY_PLAN]{"title":"**x')
  })
  it('leaves malformed JSON inside a closed block as it is', () => {
    const t = '[TAPPY_PLAN]{not json **[/TAPPY_PLAN]'
    expect(normalizeReplyMarkdown(t)).toBe(t)
  })
})
