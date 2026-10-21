// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { parseAskUser } from './controlTools'

// Live 2026-10-11: an ask_user question the model ended with a full stop was shown as "…nhiều.?".
afterEach(() => { delete process.env.CONSULTATIVE_IN_AGENT; delete process.env.TAPPY_AGENT })
const flagOn = () => { process.env.CONSULTATIVE_IN_AGENT = '1'; process.env.TAPPY_AGENT = '2' }
const q = (question: string) => parseAskUser({ question })?.question

describe('ask_user question mark', () => {
  it('flag on: a trailing "." / "…" / "!" is replaced by "?", never followed by it', () => {
    flagOn()
    expect(q('Bạn có thể cho mình biết ngân sách khoảng bao nhiêu.')).toBe('Bạn có thể cho mình biết ngân sách khoảng bao nhiêu?')
    expect(q('Bạn đi mấy người…')).toBe('Bạn đi mấy người?')
    expect(q('Bạn muốn đi đâu!')).toBe('Bạn muốn đi đâu?')
  })
  it('flag on: a question already ending in "?" and one without any end are unchanged / closed once', () => {
    flagOn()
    expect(q('Bạn đi mấy người?')).toBe('Bạn đi mấy người?')
    expect(q('Bạn đi mấy người')).toBe('Bạn đi mấy người?')
    expect(q('Ngân sách 2.5 triệu hay hơn?')).toBe('Ngân sách 2.5 triệu hay hơn?')
  })
  it('CONTROL — flag off: the old behaviour (the full stop is kept)', () => {
    expect(q('Bạn đi mấy người.')).toBe('Bạn đi mấy người.?')
  })
})
