import { describe, it, expect } from 'vitest'
import { countClarificationQuestions } from './clarification'

// The contract is "at most ONE clarification request per turn". Counting "?"
// does not measure that:
//
//   • CTA buttons and follow-up chips are machine-read blocks, not questions
//     asked of the user;
//   • every marketplace URL contains "?q=…";
//   • a parenthetical rephrasing is the SAME request asked twice —
//     "Bạn đi ngày nào?** (hoặc khoảng nào trong tháng 8?)" is one thing to
//     answer, and naive counting scored it 2, which is what produced the
//     original C2 failure.
//
// This counts distinct requests the user is expected to answer.

describe('countClarificationQuestions', () => {
  it('0 — an answer with no question at all', () => {
    expect(countClarificationQuestions(
      'Mình tìm được 3 khách sạn giá tốt ở Đà Nẵng: **A**, **B** và **C**. Giá từ 400k/đêm.',
    )).toBe(0)
    expect(countClarificationQuestions('Here are three good options in Da Nang.')).toBe(0)
  })

  it('1 — exactly one clarification', () => {
    expect(countClarificationQuestions('Mình gợi ý 3 chỗ nhé. Bạn đi ngày nào?')).toBe(1)
    expect(countClarificationQuestions('Here are three options. What dates are you travelling?')).toBe(1)
  })

  it('2 — two distinct clarifications is a FAILURE of the contract', () => {
    expect(countClarificationQuestions('Bạn ở khu vực nào? Bạn đi mấy người?')).toBe(2)
    expect(countClarificationQuestions('Which area are you in? How many people?')).toBe(2)
  })

  it('a parenthetical rephrasing is ONE request, not two', () => {
    // The exact shape that failed the original C2 probe.
    expect(countClarificationQuestions(
      'Để gợi ý chính xác hơn, mình cần biết thêm:\n\n**Bạn dự định check-in ngày nào và check-out ngày nào?** (hoặc khoảng thời gian nào trong tháng 8 này?)\n\nKhi biết ngày cụ thể mình sẽ tìm giúp bạn.',
    )).toBe(1)
    expect(countClarificationQuestions('What dates? (or roughly which week?)')).toBe(1)
  })

  it('a question mark inside a URL does not count', () => {
    expect(countClarificationQuestions(
      'Đây là link: [Tìm trên Shopee](https://shopee.vn/search?keyword=tai+nghe) nhé.',
    )).toBe(0)
    expect(countClarificationQuestions(
      'Xem thêm: https://www.google.com/maps/search/?api=1&query=pho+ga',
    )).toBe(0)
  })

  it('[FOLLOWUPS] chips are not clarification', () => {
    expect(countClarificationQuestions(
      'Mình gợi ý 3 quán nhé.\n[FOLLOWUPS]Quán nào rẻ hơn?|Có chỗ nào gần hơn?|Còn quán khác không?[/FOLLOWUPS]',
    )).toBe(0)
  })

  it('[CTA_BUTTONS] and [TAPPY_PLAN] blocks are not clarification', () => {
    expect(countClarificationQuestions(
      'Đây là gợi ý.\n[CTA_BUTTONS]{"buttons":[{"label":"Tìm","url":"https://shopee.vn/search?keyword=x"}]}[/CTA_BUTTONS]',
    )).toBe(0)
    expect(countClarificationQuestions(
      '[TAPPY_PLAN]\n{"type":"trip","share_text":"Đi đâu đây?"}\n[/TAPPY_PLAN]\nKế hoạch của bạn đây.',
    )).toBe(0)
  })

  it('quoted user text is not a new clarification', () => {
    expect(countClarificationQuestions(
      'Bạn vừa hỏi "quán nào rẻ hơn?" — đây là 3 lựa chọn rẻ hơn.',
    )).toBe(0)
    expect(countClarificationQuestions(
      'You asked "anything cheaper?" — here are three cheaper options.',
    )).toBe(0)
  })

  it('one clarification alongside real options still counts as one', () => {
    expect(countClarificationQuestions(
      'Mình gợi ý 3 chỗ: **A** (400k), **B** (550k), **C** (700k). Bạn muốn gần biển hay gần trung tâm?\n' +
      '[CTA_BUTTONS]{"buttons":[{"url":"https://booking.com/searchresults.html?ss=A"}]}[/CTA_BUTTONS]\n' +
      '[FOLLOWUPS]Rẻ hơn nữa?|Gần biển hơn?[/FOLLOWUPS]',
    )).toBe(1)
  })

  it('never throws on empty or odd input', () => {
    for (const s of ['', '   ', '???', '?', 'no punctuation at all']) {
      expect(() => countClarificationQuestions(s)).not.toThrow()
    }
  })
})
