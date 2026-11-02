// @vitest-environment node
// Wave 2B · question file format v2: the judge's notes live on their OWN lines (`@note|conversation|turn|text`), recognised by STRUCTURE, never by what the text inside says.
// MOCK-ONLY: no network, no key, no spend. Every sentence here is written for this test; none comes from the acceptance set or the extension set.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseDevQuestions, sha256OfText } from './devQuestions'

const SYN = ['alpha beta gamma delta epsilon zeta eta theta']
const V2 = (...lines: string[]) => ['@format|2', ...lines].join('\n')

describe('format v1 (no directive line) is read exactly as before', () => {
  it('gives the same turns, formatVersion 1 and no notes', () => {
    const r = parseDevQuestions('A1|A1|1|hỏi một câu khác hẳn\r\nA1|A1|2|(một câu có ngoặc ở cuối)   (và một phần trong ngoặc)\n\nB1|B1|1|câu thứ ba khác', SYN)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formatVersion).toBe(1)
    expect(r.notes).toEqual([])
    // a parenthetical in a v1 line stays part of the text (nothing is guessed from the brackets)
    expect(r.turns).toEqual([
      { id: 'A1', conversation: 'A1', turn: 1, text: 'hỏi một câu khác hẳn' },
      { id: 'A1', conversation: 'A1', turn: 2, text: '(một câu có ngoặc ở cuối)   (và một phần trong ngoặc)' },
      { id: 'B1', conversation: 'B1', turn: 1, text: 'câu thứ ba khác' },
    ])
  })
  it('the real v1 extension file parses to the SAME 30 turns as the parser before this change (golden hash of the old parser output)', () => {
    const f = 'D:/TappyAI-review-artifacts/consultative-round3n/ext25-questions.txt'
    if (!existsSync(f)) return
    const r = parseDevQuestions(readFileSync(f, 'utf8'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.turns).toHaveLength(30)
    expect(createHash('sha256').update(JSON.stringify(r.turns)).digest('hex')).toBe('6bd4ecb3a974ec1b21c9832767a895ce793d43a7fe3444077c1e5277e5f27d52')
    expect(r.formatVersion).toBe(1)
    expect(r.notes).toEqual([])
  })
})

describe('format v2', () => {
  it('splits the note off: turn.text is the user words only, the note is kept apart', () => {
    const r = parseDevQuestions(V2('@doc|a documentation line is ignored', 'A1|A1|1|hỏi một câu khác hẳn', 'A1|A1|2|trả lời ngắn thôi', '@note|A1|2|ghi chú cho người chấm: không gửi cho mô hình', 'B1|B1|1|câu thứ ba khác'), SYN)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.formatVersion).toBe(2)
    expect(r.turns.map(t => t.text)).toEqual(['hỏi một câu khác hẳn', 'trả lời ngắn thôi', 'câu thứ ba khác'])
    expect(r.notes).toEqual([{ id: 'A1', conversation: 'A1', turn: 2, note: 'ghi chú cho người chấm: không gửi cho mô hình' }])
    for (const t of r.turns) expect(JSON.stringify(t)).not.toContain('người chấm')
  })
  it('CRLF and a BOM are tolerated as in v1', () => {
    const r = parseDevQuestions('\ufeff' + V2('A1|A1|1|hỏi một câu khác hẳn', '@note|A1|1|ghi chú').replace(/\n/g, '\r\n'), SYN)
    expect(r.ok).toBe(true)
  })
  it('a bracket inside a v2 question line is NOT a note: it stays in the text', () => {
    const r = parseDevQuestions(V2('A1|A1|1|hỏi một câu khác hẳn   (có ngoặc nhưng là lời người dùng)'), SYN)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.turns[0].text).toBe('hỏi một câu khác hẳn   (có ngoặc nhưng là lời người dùng)'); expect(r.notes).toEqual([]) }
  })
  const refuses = (name: string, text: string, why: RegExp) => it(`refuses ${name}`, () => {
    const r = parseDevQuestions(text, SYN)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reasons.join(' | ')).toMatch(why)
  })
  refuses('an empty note', V2('A1|A1|1|hỏi một câu khác hẳn', '@note|A1|1|   '), /note.*empty/i)
  refuses('two notes for one turn (two separators)', V2('A1|A1|1|hỏi một câu khác hẳn', '@note|A1|1|một', '@note|A1|1|hai'), /at most one note/i)
  refuses('a note for a turn that does not exist', V2('A1|A1|1|hỏi một câu khác hẳn', '@note|A1|7|ghi chú'), /not the question line above|does not exist/i)
  refuses('a note that is not directly under its question', V2('A1|A1|1|hỏi một câu khác hẳn', 'B1|B1|1|câu thứ hai khác', '@note|A1|1|ghi chú'), /not the question line above|does not exist/i)
  refuses('a note before any question', V2('@note|A1|1|ghi chú', 'A1|A1|1|hỏi một câu khác hẳn'), /before any question|not the question line above/i)
  refuses('a note with a separator inside its text', V2('A1|A1|1|hỏi một câu khác hẳn', '@note|A1|1|một|hai'), /note line must be/i)
  refuses('a note line in a file that does not declare format 2', 'A1|A1|1|hỏi một câu khác hẳn\n@note|A1|1|ghi chú', /@format\|2/)
  refuses('a format line that is not the first line', V2('A1|A1|1|hỏi một câu khác hẳn', '@format|2'), /first line/i)
  refuses('an unknown format number', '@format|3\nA1|A1|1|hỏi một câu khác hẳn', /format/i)
  refuses('an unknown directive', V2('@nope|x', 'A1|A1|1|hỏi một câu khác hẳn'), /unknown directive/i)
})

describe('the 70% / near-copy rule judges the USER WORDS only, in both directions', () => {
  const NOTE = 'one two three four five six seven eight nine ten'
  it('(i) a note can no longer let a near-copy through: the v1 form (note glued to the line) passes by dilution, the v2 form is refused', () => {
    const near = 'alpha beta gamma delta epsilon xx'
    expect(parseDevQuestions(`A1|A1|1|${near}   (${NOTE})`, SYN).ok, 'v1 form: the dilution hole that existed').toBe(true)
    const v2 = parseDevQuestions(V2(`A1|A1|1|${near}`, `@note|A1|1|${NOTE}`), SYN)
    expect(v2.ok).toBe(false)
    if (!v2.ok) expect(v2.reasons.join(' ')).toMatch(/near-copy/)
  })
  it('(ii) a note can no longer block a clean question: the v1 form is refused because the note overlaps the benchmark text, the v2 form passes', () => {
    const clean = 'kilo lima mike november'
    const overlap = 'alpha beta gamma delta epsilon zeta'
    expect(parseDevQuestions(`A1|A1|1|${clean}   (${overlap})`, SYN).ok, 'v1 form: wrongly blocked').toBe(false)
    expect(parseDevQuestions(V2(`A1|A1|1|${clean}`, `@note|A1|1|${overlap}`), SYN).ok).toBe(true)
  })
  it('a copy of a benchmark question is still refused in v2, with or without a note', () => {
    expect(parseDevQuestions(V2('A1|A1|1|alpha beta gamma delta epsilon zeta eta theta'), SYN).ok).toBe(false)
    expect(parseDevQuestions(V2('A1|A1|1|alpha beta gamma delta epsilon zeta eta theta', '@note|A1|1|ghi chú'), SYN).ok).toBe(false)
  })
})

describe('sha256OfText', () => {
  it('is the SHA-256 of the UTF-8 bytes', () => {
    expect(sha256OfText('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256OfText('Việt')).toBe(createHash('sha256').update(Buffer.from('Việt', 'utf8')).digest('hex'))
  })
})
