import { describe, it, expect } from 'vitest'
import { parseConsultDecision, enforceConsultRules, buildAskReply, wasAskReply, brainMessages, ASK_TAIL_VI, BRAIN_SYSTEM, consultRemainingLine } from './consultBrain'

const ASK_JSON = JSON.stringify({
  domains: ['shopping'], turn: 'ask', known: { san_pham: 'ốp UAG iPhone 17 Pro Max' }, assumptions: [],
  ask: { lead: 'Để mình chọn đúng mẫu cho bạn:', questions: [
    { id: 'line', q: 'Dòng nào?', options: ['Monarch', 'Pathfinder', 'Plyo', 'Chưa biết'] },
    { id: 'budget', q: 'Tầm giá?', options: ['Dưới 700k', '700k-1tr', 'Trên 1tr'] },
    { id: 'must', q: 'Cần MagSafe không?', options: ['Có', 'Không cần'] },
  ] },
})

describe('parseConsultDecision', () => {
  it('reads a valid ask with 3 questions and their options', () => {
    const d = parseConsultDecision('```json\n' + ASK_JSON + '\n```')!
    expect(d.turn).toBe('ask')
    expect(d.domains).toEqual(['shopping'])
    expect(d.ask!.questions.map(q => q.id)).toEqual(['line', 'budget', 'must'])
    expect(d.known.san_pham).toBe('ốp UAG iPhone 17 Pro Max')
  })
  it('drops unknown domains / questions without ≥2 options; rejects unknown turns and garbage', () => {
    const d = parseConsultDecision(JSON.stringify({ domains: ['food', 'weird'], turn: 'ask', ask: { questions: [{ q: 'X?', options: ['a'] }, { q: 'Y?', options: ['a', 'b'] }] } }))!
    expect(d.domains).toEqual(['food'])
    expect(d.ask!.questions).toHaveLength(1)
    expect(parseConsultDecision('{"turn":"search"}')).toBeNull()
    expect(parseConsultDecision('not json')).toBeNull()
  })
})

describe('enforceConsultRules', () => {
  const base = parseConsultDecision(ASK_JSON)!
  it('never asks twice in a row', () => {
    expect(enforceConsultRules(base, { previousWasAsk: true }).turn).toBe('pick')
    expect(enforceConsultRules(base, { previousWasAsk: false }).turn).toBe('ask')
  })
  it('an ask with fewer than 2 usable questions becomes a pick', () => {
    const one = { ...base, ask: { lead: '', questions: base.ask!.questions.slice(0, 1) } }
    expect(enforceConsultRules(one, { previousWasAsk: false }).turn).toBe('pick')
  })
  it('an everyday request the deterministic reader places in an area is never "chat"', () => {
    const chat = { ...base, domains: [], turn: 'chat' as const, ask: undefined }
    const r = enforceConsultRules(chat, { previousWasAsk: false, deterministicDomain: 'entertainment' })
    expect(r.domains).toEqual(['entertainment'])
    expect(r.turn).toBe('chat') // the area is set; a direct answer stays a direct answer (the MAIN frame never refuses)
  })
})

describe('buildAskReply / wasAskReply', () => {
  const ask = parseConsultDecision(ASK_JSON)!.ask!
  it('structured: lead + [TAPPY_ASK] JSON + tail; recognised as an ask next turn', () => {
    const r = buildAskReply(ask, { lang: 'vi', structured: true })
    expect(r).toContain('[TAPPY_ASK]{"v":1,"questions":[')
    expect(r).toContain(ASK_TAIL_VI)
    expect(r).not.toContain('[FOLLOWUPS]')
    expect(wasAskReply(r)).toBe(true)
  })
  it('legacy clients: questions as readable lines + the first question as chips', () => {
    const r = buildAskReply(ask, { lang: 'vi', structured: false })
    expect(r).toContain('• Dòng nào? (Monarch / Pathfinder / Plyo / Chưa biết)')
    expect(r).toContain('[FOLLOWUPS]Monarch|Pathfinder|Plyo[/FOLLOWUPS]')
    expect(r).not.toContain('[TAPPY_ASK]')
    expect(wasAskReply(r)).toBe(true)
  })
})

describe('brainMessages', () => {
  it('keeps the last turns as text, strips marker blocks, states GPS', () => {
    const m = brainMessages([
      { role: 'user', content: 'tìm karaoke quận 1' },
      { role: 'assistant', content: 'Để mình chọn:\n[TAPPY_ASK]{"v":1}[/TAPPY_ASK]\n' + ASK_TAIL_VI },
      { role: 'user', content: '8 người, 9h tối' },
    ], { hasGps: true })
    const c = m[0].content as string
    expect(c).toContain('vi_tri_thiet_bi: co')
    expect(c).toContain('USER: tìm karaoke quận 1')
    expect(c).not.toContain('[TAPPY_ASK]')
    expect(c.trim().endsWith('Tra ve JSON cho luot USER cuoi cung.')).toBe(true)
  })
})

describe('BRAIN_SYSTEM', () => {
  it('names the everyday scope the owner listed, incl. karaoke / bida / nail / gội đầu / ăn khuya', () => {
    for (const w of ['karaoke', 'bida', 'nail', 'goi dau duong sinh', 'an khuya', 'barber', 'escape room', 'board game'])
      expect(BRAIN_SYSTEM).toContain(w)
    expect(BRAIN_SYSTEM).toMatch(/TUYET DOI KHONG coi la ngoai pham vi/)
  })
})

describe('consultRemainingLine — the count line is the code\'s, never the model\'s (replay SHOP-3 29/09)', () => {
  const text = ['**Mình chọn: Laptop A**', '', '- **Laptop B**, nhẹ hơn.', '- **Laptop C**, rẻ hơn.'].join('\n')
  it('counts the candidates the reply does not name', () => {
    expect(consultRemainingLine(text, ['Laptop A', 'Laptop B', 'Laptop C', 'Laptop D', 'Laptop E'], 'vi')).toContain('Mình còn 2 lựa chọn nữa')
  })
  it("replaces the model's own 'Còn N lựa chọn khác' line, never doubles it (replay SHOP-3)", () => {
    const out = consultRemainingLine(`${text}\n\nCòn 6 lựa chọn khác nữa, muốn xem thêm không?`, ['Laptop A', 'Laptop B', 'Laptop C', 'Laptop D', 'Laptop E', 'Laptop F'], 'vi')
    expect(out.match(/lựa chọn/g)).toHaveLength(1)
    expect(out).toContain('Mình còn 3 lựa chọn nữa')
  })
  it('no extras and everything shown → no line', () => {
    expect(consultRemainingLine(text, ['Laptop A', 'Laptop B', 'Laptop C'], 'vi')).not.toContain('Mình còn')
  })
})
