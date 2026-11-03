// @vitest-environment node
// Finding 1 · MEASUREMENT of the baseline (no code is changed, no provider is called, no network): after Tappy asks a clarifying question, what does the
// deterministic router (routeConsult) make of different KINDS of reply? It is a CHARACTERIZATION: the matrix below is what the code does TODAY. A row
// marked KNOWN DEFECT records behaviour that is not wanted; the file pins it so that a change shows up, and it is NOT a decision about behaviour.
// The sentences are generic, written for this measurement; none is taken from the acceptance set or from the reference set.
//
// The reading rule behind the matrix (consultRouter.ts step 2, `wasAskReply`): when the previous Tappy turn asked, the next user turn is ALWAYS taken as
// its answer (turn 'pick', same domain, the thread's query), unless the reply names a DIFFERENT consultation domain strongly (`fresh`). Nothing checks
// whether the reply answers the question that was asked. The same assumption sits in enforceConsultRules (an 'ask' after an ask becomes 'pick', consultBrain.ts:177).
import { describe, it, expect } from 'vitest'
import { routeConsult } from './consultRouter'

const ASK = (lead: string, q: string, options: string[]) => `${lead}\n\n[TAPPY_ASK]${JSON.stringify({ v: 1, questions: [{ id: 'q1', q, options }] })}[/TAPPY_ASK]`
const CLARIFIES: Array<{ name: string; first: string; ask: string }> = [
  { name: 'shopping', first: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu', ask: ASK('Để chọn đúng tai nghe cho bạn:', 'Loại nào?', ['Nhét tai', 'Chụp tai']) },
  { name: 'food', first: 'tìm quán ăn tối ở quận 1', ask: ASK('Để mình chọn đúng quán cho bạn:', 'Đi mấy người?', ['1-2 người', '3-5 người', 'Nhóm đông']) },
  { name: 'travel', first: 'tìm khách sạn ở Đà Nẵng cuối tuần', ask: ASK('Để mình chọn đúng chỗ ở cho bạn:', 'Tầm bao nhiêu một đêm?', ['Dưới 500k', '500k-1 triệu', 'Trên 1 triệu']) },
]
type Kind = 'answer' | 'off_topic_question' | 'off_topic_request' | 'greeting' | 'other_domain'
const REPLIES: Array<{ kind: Kind; text: string; forDomain?: string }> = [
  // answers (should be a pick)
  { kind: 'answer', text: 'chụp tai', forDomain: 'shopping' },
  { kind: 'answer', text: 'mình hay nghe nhạc lúc đi làm, ngân sách 800k', forDomain: 'shopping' },
  { kind: 'answer', text: '3-5 người', forDomain: 'food' },
  { kind: 'answer', text: 'khoảng 700k một đêm', forDomain: 'travel' },
  // a question about something else (should NOT be a pick of the clarified search)
  { kind: 'off_topic_question', text: 'thủ đô của nước Pháp là thành phố nào?' },
  { kind: 'off_topic_question', text: 'giải thích ngắn gọn blockchain hoạt động thế nào?' },
  { kind: 'off_topic_question', text: 'hôm nay giá xăng RON95 bao nhiêu một lít?' },
  // a request about something else, no question mark
  { kind: 'off_topic_request', text: 'viết giúp mình lời chúc sinh nhật cho bạn thân' },
  { kind: 'off_topic_request', text: 'dịch câu này sang tiếng Anh: hẹn gặp lại vào tuần sau' },
  // greeting / closing
  { kind: 'greeting', text: 'cảm ơn bạn nhé' },
  { kind: 'greeting', text: 'thôi mình không cần nữa' },
  // a real request in ANOTHER consultation domain (the existing `fresh` rule is meant for this)
  { kind: 'other_domain', text: 'tìm giúp mình quán phở ngon ở quận 3', forDomain: 'shopping' },
  { kind: 'other_domain', text: 'mua giúp mình một cái ốp lưng điện thoại giá rẻ', forDomain: 'food' },
]

type Row = { clarify: string; kind: Kind; text: string; turn: string; domain: string | null; hasQuery: boolean; confidence: string }
const rows: Row[] = []
for (const c of CLARIFIES) {
  for (const r of REPLIES) {
    if (r.forDomain && r.forDomain !== c.name) continue
    const res = routeConsult([{ role: 'user', content: c.first }, { role: 'assistant', content: c.ask }, { role: 'user', content: r.text }], { hasGps: false, lang: 'vi' })
    rows.push({ clarify: c.name, kind: r.kind, text: r.text, turn: res.decision.turn, domain: res.decision.domains[0] ?? null, hasQuery: !!res.decision.query, confidence: res.confidence })
  }
}
const pickOf = (r: Row) => r.turn === 'pick'
const pickInClarifiedDomain = (r: Row) => pickOf(r) && r.domain === r.clarify

describe('Finding 1 · what the router does with a reply to a clarifying question (baseline, observed)', () => {
  it('prints the matrix (evidence for the report)', () => {
    process.stdout.write('F1_MATRIX ' + JSON.stringify(rows.map(r => [r.clarify, r.kind, r.text, r.turn, r.domain, r.hasQuery, r.confidence])) + '\n')
    // shopping 10 (2 answers + 7 off-topic + 1 other-domain), food 9 (1 + 7 + 1), travel 8 (1 + 7): written out, not derived from the tables above
    expect(rows.length).toBe(27)
  })

  it('answers to the question ARE read as a pick of the clarified domain (the wanted behaviour)', () => {
    const answers = rows.filter(r => r.kind === 'answer')
    expect(answers.length).toBe(4)
    for (const r of answers) expect(pickInClarifiedDomain(r), `${r.clarify}: "${r.text}" → ${r.turn}/${r.domain}`).toBe(true)
  })

  it('KNOWN DEFECT (current behaviour, not wanted): a reply about something ELSE is read as a pick of the clarified search too — every off-topic reply, in every clarified domain', () => {
    const off = rows.filter(r => r.kind === 'off_topic_question' || r.kind === 'off_topic_request' || r.kind === 'greeting')
    expect(off.length).toBe(3 * 7)
    const asPick = off.filter(pickInClarifiedDomain)
    process.stdout.write('F1_OFFTOPIC_AS_PICK ' + asPick.length + '/' + off.length + '\n')
    expect(asPick.length).toBe(off.length) // observed: 21 of 21
    // and the pick carries the thread's query, i.e. it would search the clarified product / place / hotel again
    expect(off.every(r => r.hasQuery)).toBe(true)
  })

  it('a real request in ANOTHER consultation domain is read as a new request, not as a pick of the clarified one (the `fresh` rule works for that case)', () => {
    const other = rows.filter(r => r.kind === 'other_domain')
    expect(other.length).toBe(2)
    for (const r of other) expect(r.domain, `${r.clarify}: "${r.text}"`).not.toBe(r.clarify)
  })

  it('the cause is one binary assumption: with NO clarifying question before it, the same off-topic replies are NOT read as a pick', () => {
    for (const r of REPLIES.filter(x => x.kind === 'off_topic_question' || x.kind === 'off_topic_request' || x.kind === 'greeting')) {
      const res = routeConsult([{ role: 'user', content: r.text }], { hasGps: false, lang: 'vi' })
      expect(res.decision.turn, r.text).not.toBe('pick')
    }
  })
})
