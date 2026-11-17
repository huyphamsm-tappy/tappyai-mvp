import { describe, it, expect } from 'vitest'
import { unverifiedWord } from './unverifiedLabel'
import { markUnverifiedClaims } from './answerV4/doseClaims'
import { headingNumberer } from './research/deepResearch'

// UAT 18/11: case 48 (a French answer carried "(chưa xác minh)") and case 58 (a Vietnamese report had a section named "What is doubtful").
describe('the unverified label is in the language of the text it labels', () => {
  const french = 'Soupe de nouilles emblématique, généralement servie avec du bœuf ou du poulet, un grand classique'
  it('a long text with no Vietnamese-only letter gets the English word; a Vietnamese one, a short one and an English app keep theirs', () => {
    expect(unverifiedWord(french, 'vi')).toBe('unverified')
    expect(unverifiedWord('Phở bò tái là món nước truyền thống, ăn sáng rất hợp', 'vi')).toBe('chưa xác minh')
    expect(unverifiedWord('Giá khoảng 50.000', 'vi')).toBe('chưa xác minh') // too short to tell: the app's language
    expect(unverifiedWord('Phở bò', 'en')).toBe('unverified')
  })
  it('a bold Vietnamese name inside a French line does not make the line Vietnamese', () => {
    expect(unverifiedWord(`**Phở** ${french}`, 'vi')).toBe('unverified')
  })
  it('markUnverifiedClaims follows the sentence: Vietnamese sentence in a Vietnamese app is labelled in Vietnamese, a French one in English', () => {
    expect(markUnverifiedClaims('Phở bò tái ở quán này giá 55.000 đồng một tô, ăn rất vừa miệng.', ['55.000'], 'vi', { sentenceEnd: true }).text).toContain('(chưa xác minh)')
    const fr = markUnverifiedClaims('Cette soupe de nouilles coûte environ 55.000 dong le bol dans ce restaurant du centre.', ['55.000'], 'vi', { sentenceEnd: true }).text
    expect(fr).toContain('(unverified)')
    expect(fr).not.toContain('chưa xác minh')
  })
})

describe('the doubts section of a Vietnamese report is named in Vietnamese', () => {
  const run = (src: string) => { const n = headingNumberer(); return n.push(src) + n.end() }
  it('"What is doubtful" becomes the Vietnamese name when the report is Vietnamese; an English report keeps it', () => {
    expect(run('# Thị trường xe máy điện Việt Nam\n\n## 4. Triển vọng\ntext\n\n## 5. What is doubtful\n- a\n')).toContain('## 2. Những điểm chưa chắc chắn')
    expect(run('# The electric motorbike market\n\n## 1. Outlook\ntext\n\n## 2. What is doubtful\n- a\n')).toContain('## 2. What is doubtful')
  })
})
