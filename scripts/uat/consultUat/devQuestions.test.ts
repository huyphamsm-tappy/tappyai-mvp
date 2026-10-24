// @vitest-environment node
// Round 3c · Việc 2 (part): the dev question parser. MOCK-ONLY: no network, no key, no spend. Synthetic texts are used for every refusal branch.
// The real dev file is NOT checked here: it currently fails the near-copy rule (see report.md, Owner decision).
import { describe, expect, it } from 'vitest'
import { isNearCopy, NEAR_COPY_SHARE, parseDevQuestions } from './devQuestions'

const BOM = String.fromCharCode(0xfeff)
const SYN = ['alpha beta gamma delta epsilon zeta eta theta']

describe('parseDevQuestions refuses', () => {
  it('an empty file', () => { expect(parseDevQuestions('  \n\n').ok).toBe(false) })
  it('a malformed line (wrong field count)', () => {
    expect(parseDevQuestions('A1|A1|1', SYN).ok).toBe(false)
  })
  it('a turn number that is not a whole number from 1', () => {
    expect(parseDevQuestions('A1|A1|0|hỏi gì đó', SYN).ok).toBe(false)
    expect(parseDevQuestions('A1|A1|x|hỏi gì đó', SYN).ok).toBe(false)
  })
  it('an empty question text', () => { expect(parseDevQuestions('A1|A1|1|   ', SYN).ok).toBe(false) })
  it('the same conversation and turn twice', () => {
    expect(parseDevQuestions('A1|A1|1|một câu\nA2|A1|1|câu khác', SYN).ok).toBe(false)
  })
  it('a copy of a benchmark question (case and diacritics folded)', () => {
    expect(parseDevQuestions('A1|A1|1|ALPHA beta gamma delta epsilon zeta eta theta', SYN).ok).toBe(false)
  })
  it('a fullwidth copy of a benchmark question (the same letters in another code range) is refused as a copy', () => {
    const fullwidth = 'ａｌｐｈａ ｂｅｔａ ｇａｍｍａ ｄｅｌｔａ ｅｐｓｉｌｏｎ ｚｅｔａ ｅｔａ ｔｈｅｔａ'
    const r = parseDevQuestions('A1|A1|1|' + fullwidth, SYN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons.join(' ')).toMatch(/copy of a benchmark question/)
  })
  it('a copy with punctuation added is refused (near-copy by words)', () => {
    expect(parseDevQuestions('A1|A1|1|alpha, beta! gamma. delta; epsilon: zeta? eta, theta.', SYN).ok).toBe(false)
  })
  it('an id reused by another conversation is refused', () => {
    const r = parseDevQuestions('A1|A1|1|một câu khác hẳn\nA1|A2|1|câu khác nữa hẳn', SYN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons.join(' ')).toMatch(/id A1 belongs to two conversations/)
  })
  it('several turns of ONE conversation may share its id (D6 has two turns, both with id D6)', () => {
    const r = parseDevQuestions('D6|D6|1|một câu khác hẳn\nD6|D6|2|câu khác nữa hẳn', SYN)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.turns.map(t => t.turn)).toEqual([1, 2])
  })
  it('an id that appears under two different conversations is refused', () => {
    const r = parseDevQuestions('D6|D6|1|một câu khác hẳn\nD6|D7|1|câu khác nữa hẳn', SYN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons.join(' ')).toMatch(/id D6 belongs to two conversations/)
  })
  it('a conversation written with a trailing space is still the same conversation for the turn check', () => {
    const r = parseDevQuestions('A1|A1 |1|một câu khác hẳn\nA2|A1|1|câu khác nữa hẳn', SYN)
    expect(r.ok).toBe(false)
  })
  it('a near-copy: 6 of the 8 words shared (75%, at or above NEAR_COPY_SHARE)', () => {
    const r = parseDevQuestions('A1|A1|1|alpha beta gamma delta epsilon zeta xx yy', SYN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons.join(' ')).toMatch(/near-copy/)
  })
  it('a question that shares only 5 of 8 words (62.5%, below the share) is accepted', () => {
    expect(parseDevQuestions('A1|A1|1|alpha beta gamma delta epsilon xx yy zz', SYN).ok).toBe(true)
  })
  it('a BOM at the start is dropped, not counted as a character of the first question', () => {
    const r = parseDevQuestions(BOM + 'A1|A1|1|hỏi một câu khác hẳn', SYN)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.turns[0].id).toBe('A1')
  })
  it('a CRLF file is read line by line without a carriage return in the text', () => {
    const r = parseDevQuestions('A1|A1|1|hỏi một câu khác hẳn\r\nA2|A2|1|hỏi câu thứ hai khác', SYN)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.turns.map(t => t.text.includes('\r'))).toEqual([false, false])
  })
})

describe('the near-copy rule', () => {
  it('the smaller set decides: 6 of 8 shared is a near-copy', () => {
    expect(isNearCopy('alpha beta gamma delta epsilon zeta eta theta', 'alpha beta gamma delta epsilon zeta xx yy')).toBe(true)
    expect(NEAR_COPY_SHARE).toBe(0.7)
  })
  it('an empty question is never a near-copy', () => { expect(isNearCopy('', 'alpha')).toBe(false) })
})
