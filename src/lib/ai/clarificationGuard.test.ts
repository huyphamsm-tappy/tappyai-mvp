import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerFirst } from './clarificationGuard'
import { endsWithQuestion } from './consultative/askAfter'

// Owner 2026-09-28 (c40 P2 on 526129a): answer first, ask after.
describe('answerFirst — c40 P2 verbatim', () => {
  const p2 = JSON.parse(readFileSync(join(process.cwd(), 'docs/uat/evidence/c40-ab-2026-09-27/head-526129a-FTP/P2.json'), 'utf8')) as { prose: string }
  // What left the guard chain: the client text minus the ask-after line appended after it.
  const guarded = p2.prose.replace(/\n\nBạn đi mấy người[^\n]*$/, '')

  it('the verbatim reply opens with the question (the defect)', () => {
    expect(guarded.startsWith('Để gợi ý đúng ý bạn, mình cần biết: **bạn muốn massage chân bao lâu**')).toBe(true)
  })

  it('the opening question moves to the end, without its lead-in; the spas come first', () => {
    const r = answerFirst(guarded)
    expect(r.moved).toBe('moved')
    expect(r.text.startsWith('Mình tìm được 10 spa massage chân ở Quận 1')).toBe(true)
    expect(r.text).not.toContain('Để gợi ý đúng ý bạn, mình cần biết')
    expect(r.text).toContain('Bạn muốn massage chân bao lâu (30 phút, 60 phút, hay không cụ thể)?')
    // It is the last prose line — so the ask-after step adds no second question.
    expect(endsWithQuestion(r.text)).toBe(true)
    const prose = r.text.replace(/\[(TAPPY_[A-Z_]+|FOLLOWUPS|CTA_BUTTONS)\][\s\S]*?\[\/\1\]/g, '')
    expect((prose.match(/\?/g) ?? []).length).toBe(1)
  })

  it('a reply that already ends asking drops the opening question; question-only and answer-first replies are untouched', () => {
    expect(answerFirst('Bạn muốn đi mấy giờ? Mình chọn **Quán A** — 4.5⭐. Bạn đi mấy người?'))
      .toEqual({ text: 'Mình chọn **Quán A** — 4.5⭐. Bạn đi mấy người?', moved: 'dropped' })
    expect(answerFirst('Bạn ở khu nào? Bạn đi mấy người?').moved).toBeNull()
    expect(answerFirst('Mình chọn **Quán A**. Bạn đi mấy người?').moved).toBeNull()
  })
})
