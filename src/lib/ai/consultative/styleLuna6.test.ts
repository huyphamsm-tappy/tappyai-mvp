import { describe, it, expect, afterEach } from 'vitest'
import { voiceLayerBlock, STYLE_LUNA6_BLOCK, styleLuna6On, ASK_TAIL_VI_LUNA6, evidenceGapLine, remainingLine } from './styleLuna6'
import { buildAskReply, consultRemainingLine, wasAskReply, ASK_TAIL_VI } from './consultBrain'

const ask = { lead: 'Để chọn đúng quán cho bạn:', questions: [{ id: 'party', q: 'Mấy người?', options: ['1', '2'] }, { id: 'budget', q: 'Ngân sách?', options: ['a', 'b'] }] }
afterEach(() => { delete process.env.STYLE_LUNA6 })

describe('D0: STYLE_LUNA6 is OFF by default and OFF means today’s text, byte for byte', () => {
  it('flag unset', () => {
    expect(styleLuna6On()).toBe(false)
    expect(voiceLayerBlock()).toBe('')
    expect(remainingLine(3, 'vi')).toBeNull()
    expect(evidenceGapLine('vi', null)).toBeNull()
    expect(buildAskReply(ask, { lang: 'vi', structured: true })).toContain(ASK_TAIL_VI)
  })
  it('only the exact value «1» turns it on', () => {
    process.env.STYLE_LUNA6 = 'true'; expect(styleLuna6On()).toBe(false)
    process.env.STYLE_LUNA6 = '1'; expect(styleLuna6On()).toBe(true)
  })
})

describe('D6: the fixed phrases change wording, never structure', () => {
  it('ask reply: same lead, same [TAPPY_ASK] block, only the tail differs — and both tails are recognised as an ask', () => {
    const off = buildAskReply(ask, { lang: 'vi', structured: true })
    process.env.STYLE_LUNA6 = '1'
    const on = buildAskReply(ask, { lang: 'vi', structured: true })
    const strip = (s: string) => s.replace(ASK_TAIL_VI, '').replace(ASK_TAIL_VI_LUNA6, '')
    expect(strip(on)).toBe(strip(off))
    expect(on).toContain(ASK_TAIL_VI_LUNA6); expect(on).not.toBe(off)
    expect(wasAskReply(on)).toBe(true); expect(wasAskReply(off)).toBe(true)
    // the unstructured form (clients without the card) is recognised too
    expect(wasAskReply(buildAskReply(ask, { lang: 'vi', structured: false }))).toBe(true)
  })
  it('remaining line: same N, same position, the model’s own count line is still replaced (not doubled)', () => {
    const text = 'Mình hiểu bạn cần quán phở.\n**Mình chọn: Phở A** — ngon.\n\nMình còn 9 lựa chọn nữa, muốn xem thêm không?'
    const names = ['Phở A', 'Phở B', 'Phở C']
    const off = consultRemainingLine(text, names, 'vi')
    process.env.STYLE_LUNA6 = '1'
    const on = consultRemainingLine(text, names, 'vi')
    expect(off).toMatch(/Mình còn 2 lựa chọn nữa/)
    expect(on).toMatch(/Còn 2 lựa chọn nữa/)
    expect((on.match(/lựa chọn/g) ?? []).length).toBe(1)
    // running the ON text through again changes nothing more (idempotent, not doubled)
    expect(consultRemainingLine(on, names, 'vi')).toBe(on)
  })
})

describe('D1/D3/D4/D5: the block says what it must and nothing structural', () => {
  const b = STYLE_LUNA6_BLOCK
  it('forms of address: mirror, never guess, never open a hierarchy pair or mày/tao', () => {
    expect(b).toMatch(/KHONG doan tuoi\/gioi tinh/)
    expect(b).toMatch(/KHONG tu mo cap thu bac/)
    expect(b).toMatch(/"mày\/tao" chi khi user dung truoc/)
    expect(b).toMatch(/mac dinh "mình"\/"bạn"/)
  })
  it('humour: capped, 😄 only, switched off in the serious contexts', () => {
    expect(b).toMatch(/khoang 1/3/); expect(b).toMatch(/chi 😄/)
    for (const k of ['lua dao', 'nan nhan', 'suc khoe', 'khan cap', 'chua co du lieu']) expect(b).toContain(k)
  })
  it('keeps the assumptions (does not delete them) and forbids the dead phrases', () => {
    expect(b).toMatch(/VAN noi du/)
    for (const k of ['Chắc chắn rồi', 'Hy vọng thông tin hữu ích', 'Rất vui được hỗ trợ']) expect(b).toContain(k)
  })
  it('touches no structure: no marker, no tool, no number rule', () => {
    expect(b).not.toMatch(/TAPPY_|CTA_BUTTONS|FOLLOWUPS|search_|get_/)
  })
})
