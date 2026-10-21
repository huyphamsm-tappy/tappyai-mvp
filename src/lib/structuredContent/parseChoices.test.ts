import { describe, it, expect } from 'vitest'
import { parseChoiceTail, composeChoiceAnswer, isOtherOption, otherPrefill } from './parseChoices'

describe('"other" options (UAT 17/10: "Nơi khác" could not be answered)', () => {
  it('recognises the "other" wordings and only them', () => {
    for (const o of ['Nơi khác', 'Mẫu khác — gửi tên nhé', 'Khác', '**Lựa chọn khác**', 'Other', 'Giải khác']) expect(isOtherOption(o)).toBe(true)
    for (const o of ['Hà Nội', 'Khách sạn trung tâm', 'Khác biệt lớn nhất', 'Không quan trọng', 'iPhone 17', 'Ngoại hạng Anh']) expect(isOtherOption(o)).toBe(false)
  })
  it('prefills the composer with the option name and a colon', () => {
    expect(otherPrefill('Nơi khác')).toBe('Nơi khác: ')
    expect(otherPrefill('Mẫu khác — gửi tên nhé')).toBe('Mẫu khác: ')
  })
})

describe('parseChoiceTail — the closing decision question(s) as a choice card (CONSULT_V3, view only)', () => {
  it('one bold question with numbered options at the end becomes one group; the prose above stays', () => {
    const r = parseChoiceTail('Lịch này ưu tiên biển.\n\n**Hai bạn thích kiểu nào hơn?**\n1. Resort sang chảnh\n2. Khách sạn trung tâm\n3. Homestay chill')
    expect(r.groups).toEqual([{ q: 'Hai bạn thích kiểu nào hơn?', options: ['Resort sang chảnh', 'Khách sạn trung tâm', 'Homestay chill'] }])
    expect(r.text).toBe('Lịch này ưu tiên biển.')
  })
  it('two consecutive groups are read in order (a plan confirmation)', () => {
    const r = parseChoiceTail('Xong nè.\n\n**Ngân sách 30 triệu đúng chưa?**\n1. Đúng\n2. Ít hơn\n\n**Đi bằng gì?**\n- Máy bay\n- Xe khách')
    expect(r.groups.map(g => g.q)).toEqual(['Ngân sách 30 triệu đúng chưa?', 'Đi bằng gì?'])
    expect(r.groups[1].options).toEqual(['Máy bay', 'Xe khách'])
    expect(r.text).toBe('Xong nè.')
  })
  it('a numbered list in the middle, or options with no question above them, stays prose', () => {
    expect(parseChoiceTail('Các bước:\n1. Mở app\n2. Đặt vé\n\nChúc vui!').groups).toEqual([])
    expect(parseChoiceTail('Gợi ý:\n1. Bida\n2. Karaoke').groups).toEqual([])
  })
  it('a question with a single option, or with too many options, stays prose', () => {
    expect(parseChoiceTail('**Ok không?**\n1. Ok').groups).toEqual([])
    expect(parseChoiceTail('**Chọn?**\n1. a\n2. b\n3. c\n4. d\n5. e\n6. f').groups).toEqual([])
  })
  it('the reply sent is the chosen options in order', () => {
    const groups = [{ q: 'A?', options: ['x', 'y'] }, { q: 'B?', options: ['m', 'n'] }]
    expect(composeChoiceAnswer(groups, { 0: 'y', 1: 'm' })).toBe('y · m')
    expect(composeChoiceAnswer(groups, { 1: 'n' })).toBe('n')
  })
})
