import { describe, it, expect } from 'vitest'
import { compactRequestMessages, looksLikeReport, reportDigest, REQUEST_HISTORY_BUDGET, REPORT_DIGEST_CHARS } from './requestHistory'

const section = (n: number, filler = 3000) => `## ${n}. Mục số ${n}\nĐoạn mở đầu của mục ${n} nói về điều quan trọng nhất của mục này.\n\n${'Nội dung chi tiết dài. '.repeat(filler / 22)}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`
const REPORT = `# Xu hướng thị trường trà sữa Hà Nội\n\n${[1, 2, 3, 4, 5, 6, 7].map(n => section(n)).join('\n')}\n## Nguồn\n1. A https://a.vn\n2. B https://b.vn\n`

describe('looksLikeReport', () => {
  it('a long message with several sections is a report; a short one, or a long one without sections, is not', () => {
    expect(REPORT.length).toBeGreaterThan(REQUEST_HISTORY_BUDGET)
    expect(looksLikeReport(REPORT)).toBe(true)
    expect(looksLikeReport('## a\n## b\n## c\n## d\nngắn')).toBe(false)
    expect(looksLikeReport('x'.repeat(20_000))).toBe(false)
  })
})

describe('reportDigest', () => {
  const d = reportDigest(REPORT)
  it('keeps the title, every section heading and its opening paragraph, within the cap, and says it is only a digest', () => {
    expect(d.length).toBeLessThanOrEqual(REPORT_DIGEST_CHARS + 2)
    expect(d).toContain('Digest of the research report'); expect(d).toContain('# Xu hướng thị trường trà sữa Hà Nội')
    for (const n of [1, 2, 3]) { expect(d).toContain(`## ${n}. Mục số ${n}`); expect(d).toContain(`Đoạn mở đầu của mục ${n}`) }
  })
  it('does not repeat the body, the tables or the sources list', () => {
    expect(d).not.toContain('Nội dung chi tiết dài'); expect(d).not.toContain('| A | B |'); expect(d).not.toContain('https://a.vn')
    expect(d).toContain('lines of sources')
  })
  it('is deterministic and never throws on odd input', () => {
    expect(reportDigest(REPORT)).toBe(d)
    expect(() => reportDigest('')).not.toThrow(); expect(() => reportDigest('## only\n')).not.toThrow()
  })
})

describe('compactRequestMessages keeps a report as its digest instead of dropping it', () => {
  const thread = [
    { role: 'user', content: 'Xu hướng thị trường trà sữa tại Hà Nội' },
    { role: 'assistant', content: REPORT },
    { role: 'user', content: 'báo cáo vừa làm xuất ra pdf giúp mình' },
  ]
  it('the report stays in the request as a digest, in order, and the thread now fits', () => {
    const out = compactRequestMessages(thread)
    expect(out.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    const rep = String(out[1].content)
    expect(rep).toContain('Digest of the research report'); expect(rep).toContain('Mục số 4')
    expect(out.reduce((n, m) => n + String(m.content).length, 0)).toBeLessThan(REQUEST_HISTORY_BUDGET)
  })
  it('a thread that fits is untouched, and a long non-report is handled as before (no digest)', () => {
    const short = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'chào' }, { role: 'user', content: 'ok' }]
    expect(compactRequestMessages(short)).toEqual(short)
    const longProse = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'x '.repeat(15_000) }, { role: 'user', content: 'b' }]
    expect(String(compactRequestMessages(longProse).map(m => m.content).join(''))).not.toContain('Digest of the research report')
  })
})
