// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { composeFinal, withoutParaphrasedPrefaceParagraphs } from './agent/runtime/answerFirst'
import { stripOrphanSourceLabels } from './caveatDedupe'
import { guardPlanItems } from './planItemGuard'

// Snow Crash turn 2, live 2026-10-11 on 3018 with the audit trace (Round 21, verbatim). The answer-first check (no tools) asserted that Bill Gates
// recommended Snow Crash; the answer written AFTER the lookup said it found no reliable source for that. Both were shown, one after the other.
const PREFACE = 'À, bạn đang nói tới **Snow Crash** của Neal Stephenson — tiểu thuyết khoa học viễn tưởng lấy bối cảnh tương lai, nổi tiếng với hình dung về “Metaverse”. Mark Zuckerberg từng nhắc đến cuốn này như một tác phẩm có ảnh hưởng đến cách ông nghĩ về thực tế ảo và metaverse. Bill Gates cũng từng giới thiệu **Snow Crash** trong danh sách sách ông khuyên đọc. Vậy là họ đều có nhắc hoặc giới thiệu cùng một cuốn, chứ chưa có căn cứ cho thấy họ cùng đọc nó với nhau.'
const FINAL = 'Đúng là **Snow Crash** của Neal Stephenson. Nhưng mình cần đính chính: **Mark Zuckerberg có nhắc đến cuốn này khi nói về metaverse**, còn mình chưa tìm thấy nguồn đáng tin xác nhận **Bill Gates cũng giới thiệu chính cuốn này**; nguồn về sách cả hai từng cùng khuyên đọc không cho thấy đó là *Snow Crash*. [S2] Vậy có thể vài người nổi tiếng cùng quan tâm hoặc nhắc đến cuốn sách, nhưng chưa có căn cứ rằng họ cùng đọc nó với nhau.'

describe('a day must not lose its meals when the venues are used up (trace, Nha Trang day 3)', () => {
  const places = [
    { name: 'Nhà Hàng Chay Bụt Việt', address: '74 Đống Đa, Nha Trang', place_types: ['nhà hàng chay'] },
    { name: 'Nhà Hàng Chay Tuệ Nguyên', address: '12 Lê Thánh Tôn, Nha Trang', place_types: ['nhà hàng chay'] },
  ]
  const plan = { type: 'trip', days: [
    { label: 'Ngày 1', items: [{ time: '12:00', category: 'food', name: 'Nhà Hàng Chay Bụt Việt' }] },
    { label: 'Ngày 2', items: [{ time: '12:00', category: 'food', name: 'Nhà Hàng Chay Tuệ Nguyên' }] },
    { label: 'Ngày 3', items: [
      { time: '08:00', category: 'food', name: 'Nhà Hàng Chay Bụt Việt' },
      { time: '11:00', category: 'food', name: 'Nhà Hàng Chay Tuệ Nguyên' },
      { time: '09:30', category: 'attraction', name: 'Tháp Bà Ponagar' },
    ] },
  ] }
  const text = `[TAPPY_PLAN]${JSON.stringify(plan)}[/TAPPY_PLAN]`
  const items = (t: string) => (JSON.parse(t.slice(12, t.indexOf('[/TAPPY_PLAN]'))) as { days: Array<{ items: Array<{ name: string; category: string }> }> }).days[2].items
  it('flag on: the repeated restaurant becomes a plain meal slot (no venue invented), the sight stays', () => {
    const r = guardPlanItems(text, places, { destination: 'Nha Trang', keepSights: true })
    expect(items(r.text).map(i => i.name)).toEqual(['Ăn sáng gần chỗ ở', 'Ăn trưa gần chỗ ở', 'Tháp Bà Ponagar'])
    expect(items(r.text)[0].category).toBe('rest')
    expect(r.mealSlots).toBe(2)
  })
  it('flag off (control): the old behaviour — the repeated venues are kept as they were', () => {
    const r = guardPlanItems(text, places, { destination: 'Nha Trang' })
    expect(items(r.text).map(i => i.name)).toContain('Nhà Hàng Chay Bụt Việt')
  })
})

describe('orphan "([Source name])" left after a citation marker (trace, Snow Crash turn 1)', () => {
  it('is removed; links, markers and normal parentheses stay', () => {
    const live = 'có vẻ là hai người cùng đề xuất một cuốn ([en.wikipedia.org](https://en.wikipedia.org/wiki/Mark_Zuckerberg_book_club)). ([The Guardian]) Zuckerberg từng tổ chức câu lạc bộ.'
    expect(stripOrphanSourceLabels(live)).toBe('có vẻ là hai người cùng đề xuất một cuốn ([en.wikipedia.org](https://en.wikipedia.org/wiki/Mark_Zuckerberg_book_club)). Zuckerberg từng tổ chức câu lạc bộ.')
    expect(stripOrphanSourceLabels('Xem [S2] và (ghi chú) và [Trip.com](https://trip.com).')).toBe('Xem [S2] và (ghi chú) và [Trip.com](https://trip.com).')
    expect(stripOrphanSourceLabels('Nguồn ([S1]) đây.')).toBe('Nguồn ([S1]) đây.')
  })
})

describe('answer-first claim that the researched answer corrects (Snow Crash turn 2, trace 2026-10-11)', () => {
  it('flag off (control): both are shown, the contradiction included', () => {
    const out = composeFinal([PREFACE], FINAL)
    expect(out).toContain('Bill Gates cũng từng giới thiệu **Snow Crash**')
    expect(out).toContain('cần đính chính')
  })
  it('flag on: the preface paragraph the answer corrects is dropped; the corrected answer is shown once', () => {
    const out = composeFinal([PREFACE], FINAL, { dedupeParaphrase: true })
    expect(out).not.toContain('Bill Gates cũng từng giới thiệu **Snow Crash**')
    expect(out).toContain('cần đính chính')
    expect(out.match(/Snow Crash/g)).toHaveLength(2) // "Đúng là **Snow Crash**" + "không cho thấy đó là *Snow Crash*"
  })
  it('flag on: a preface the answer does NOT correct (no correction cue) is kept', () => {
    const calm = 'Snow Crash là tiểu thuyết khoa học viễn tưởng năm 1992 của Neal Stephenson, nơi thế giới ảo song song với đời thực và một loại virus lan qua cả hai.'
    const fin = 'Theo Wikipedia, Snow Crash xuất bản năm 1992 và đặt ra thuật ngữ metaverse. [S1] Cuốn này thuộc dòng cyberpunk.'
    expect(withoutParaphrasedPrefaceParagraphs([calm], fin)).toHaveLength(1)
  })
  it('flag on: a correction cue next to unrelated preface text keeps the preface', () => {
    const unrelated = 'Hà Nội tháng mười se lạnh, nhiều người thích đi dạo hồ Gươm buổi sáng sớm và uống cà phê trứng ở phố cổ rồi ăn phở.'
    expect(withoutParaphrasedPrefaceParagraphs([unrelated], FINAL)).toHaveLength(1)
  })
})
