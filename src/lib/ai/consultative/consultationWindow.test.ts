import { describe, it, expect } from 'vitest'
import { currentConsultationTexts, isClarifyingQuestion, subjectAssistantTexts } from './consultationWindow'
import { AREA_ASK_EN, AREA_ASK_VI } from './areaAsk'

// Wave 3 (W5, review finding X2): the area question is a clarifying question. Mutation measured in Wave 2E/2F: removing that branch from isClarifyingQuestion left every test green, so
// nothing protected "answering the area question does not lose the evidence of the first request".
const STYLE_ASK = 'Để chọn đúng ốp lưng cho bạn:\n\n[TAPPY_ASK]{"v":1,"questions":[{"id":"line","q":"Kiểu ốp nào?","options":["Chống sốc","Trong suốt"]}]}[/TAPPY_ASK]'

describe('isClarifyingQuestion', () => {
  it('the ask card and the code\'s area question (Vietnamese and English) keep the consultation open; a plain reply does not', () => {
    expect(isClarifyingQuestion(STYLE_ASK)).toBe(true)
    expect(isClarifyingQuestion(`Bạn đang ở khu nào? ${AREA_ASK_VI}`)).toBe(true)
    expect(isClarifyingQuestion(`Which area? ${AREA_ASK_EN}`)).toBe(true)
    expect(isClarifyingQuestion('Mình chọn: **Cà phê Mây** — gần bạn.')).toBe(false)
    expect(isClarifyingQuestion('')).toBe(false)
  })
})

describe('currentConsultationTexts', () => {
  it('answering the AREA question keeps the first request in the consultation (the evidence of the first request is not lost)', () => {
    const msgs = [
      { role: 'user', content: 'quán cà phê yên tĩnh để làm việc' },
      { role: 'assistant', content: `Bạn đang ở khu nào? ${AREA_ASK_VI}` },
      { role: 'user', content: 'quận 3' },
    ]
    expect(currentConsultationTexts(msgs, 2)).toEqual(['quán cà phê yên tĩnh để làm việc', 'quận 3'])
  })
  it('the same with an ask card between the two user messages', () => {
    const msgs = [{ role: 'user', content: 'tìm ốp lưng' }, { role: 'assistant', content: STYLE_ASK }, { role: 'user', content: 'chống sốc' }]
    expect(currentConsultationTexts(msgs, 2)).toEqual(['tìm ốp lưng', 'chống sốc'])
  })
  it('a reply that is not a clarifying question closes the consultation: the next request starts a new one', () => {
    const msgs = [
      { role: 'user', content: 'quán cà phê yên tĩnh' },
      { role: 'assistant', content: 'Mình chọn: **Cà phê Mây**.' },
      { role: 'user', content: 'giờ tìm quán nhậu' },
    ]
    expect(currentConsultationTexts(msgs, 2)).toEqual(['giờ tìm quán nhậu'])
  })
  it('an area question AFTER a closing reply opens the new consultation, not the old one', () => {
    const msgs = [
      { role: 'user', content: 'quán cà phê' },
      { role: 'assistant', content: 'Mình chọn: **Cà phê Mây**.' },
      { role: 'user', content: 'quán nhậu gần đây' },
      { role: 'assistant', content: `Bạn đang ở khu nào? ${AREA_ASK_VI}` },
      { role: 'user', content: 'quận 1' },
    ]
    expect(currentConsultationTexts(msgs, 3)).toEqual(['quán nhậu gần đây', 'quận 1'])
  })
  it('never more than the subject\'s own user count, at least one, and an empty assistant message does not close', () => {
    const msgs = [{ role: 'user', content: 'a' }, { role: 'assistant', content: '   ' }, { role: 'user', content: 'b' }, { role: 'user', content: 'c' }]
    expect(currentConsultationTexts(msgs, 2)).toEqual(['b', 'c'])
    expect(currentConsultationTexts(msgs, 0)).toEqual(['c'])
    expect(currentConsultationTexts([], 3)).toEqual([])
  })
  it('content may be an array of parts', () => {
    const msgs = [{ role: 'user', content: [{ type: 'text', text: 'quán cà phê' }] }, { role: 'assistant', content: [{ type: 'text', text: `Hỏi khu: ${AREA_ASK_VI}` }] }, { role: 'user', content: [{ type: 'text', text: 'quận 3' }] }]
    expect(currentConsultationTexts(msgs, 2)).toEqual(['quán cà phê', 'quận 3'])
  })
})

describe('subjectAssistantTexts', () => {
  it('the assistant texts after the first user message of the subject', () => {
    const msgs = [{ role: 'user', content: 'old' }, { role: 'assistant', content: 'old reply' }, { role: 'user', content: 'new' }, { role: 'assistant', content: 'card' }, { role: 'user', content: 'point' }]
    expect(subjectAssistantTexts(msgs, 2)).toEqual(['card'])
    expect(subjectAssistantTexts(msgs, 3)).toEqual(['old reply', 'card'])
  })
})
