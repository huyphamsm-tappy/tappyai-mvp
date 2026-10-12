// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { CoreMessage } from 'ai'
import { runAgentRuntime, type RuntimeInput, type RuntimeStep } from './loop'
import { AgentRunTrace } from './trace'
import { isKnowQuestion, isThin, isThinPreface, afterClarification, needsContent, proseOf } from './contentFloor'

// Round 30, part 1 — a conversational turn that was answered must carry content. The cases run through the runtime loop and its REAL composition (composeFinal): the text asserted is the
// text the runtime hands on (what the settle step then receives). Each case prints one line `CASE {…}` (input, final text, verdict) for the report.
// Scripted model: it plays the shapes seen live — an acknowledgement next to a lookup, "Biết chứ." as the whole answer — and the test says what the system makes of them.

const step = (text: string, calls: Array<[string, Record<string, unknown>]> = []): RuntimeStep => ({
  text, finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 }, providerMetadata: { tappy: { cost: { usd: 0.0001 } } },
  toolCalls: calls.map(([toolName, args], i) => ({ toolCallId: `c${i}`, toolName, args })),
})
const U = (content: string): CoreMessage => ({ role: 'user', content })
const A = (content: string): CoreMessage => ({ role: 'assistant', content })
const Q1 = 'Biết chứ. Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?'
const TESLA_FACTS = 'Nikola Tesla (1856–1943) là nhà phát minh và kỹ sư điện người Mỹ gốc Serbia. Ông nổi tiếng với hệ thống điện xoay chiều, động cơ cảm ứng và cuộn dây Tesla. Nhiều phát minh của ông là nền tảng của lưới điện hiện đại.'
const IPHONE_FACTS = 'iPhone là dòng điện thoại thông minh của Apple, ra mắt năm 2007. Nó nổi tiếng với màn hình cảm ứng đa điểm và hệ điều hành iOS. Mỗi năm Apple ra một thế hệ mới.'

async function run(messages: CoreMessage[], script: RuntimeStep[], o: { flag: boolean; check?: string | null; model?: Array<{ system: string; messages: CoreMessage[]; final: boolean }> } ) {
  const s = [...script]
  const input: RuntimeInput = {
    system: 'SYS', messages, schemas: { web_search: {}, ask_user: {} },
    tools: { web_search: { execute: async () => ({ results: [{ title: 'Nikola Tesla', link: 'https://vi.wikipedia.org/wiki/Nikola_Tesla', snippet: 'Nikola Tesla (1856–1943), nhà phát minh, kỹ sư điện. Hệ thống điện xoay chiều.' }] }) } },
    callModel: async (c) => { o.model?.push({ system: c.system, messages: c.messages as CoreMessage[], final: c.final === true }); return s.shift() ?? step('xong') },
    ...(o.check !== undefined ? { answerFirstModel: async () => ({ text: o.check ?? 'NOTHING_YET' }) } : {}),
    deadlineAt: Date.now() + 85_000, lang: 'vi', trace: new AgentRunTrace({ messageCount: 1, provider: 'mock', serperLimit: 8, deadlineMs: 85_000, flag: 'TAPPY_AGENT=2' }),
    ...(o.flag ? { dedupeParaphrase: true, parallelAnswerFirst: true, cardRetry: true, contentRetry: true } : {}),
  }
  const r = await runAgentRuntime(input)
  return r
}
const log = (name: string, input: string, out: string, verdict: string) => console.log('CASE ' + JSON.stringify({ name, model_input: input, final: out, verdict }))
const thinFinal = (t: string) => expect(isThin(t)).toBe(true)
const hasContent = (t: string) => { expect(isThin(t)).toBe(false); expect(t.split(/(?<=[.!?…])\s+/).length).toBeGreaterThanOrEqual(2) }

describe('contentFloor (pure)', () => {
  it.each([['biết tesla ko', true], ['đúng rồi, cha, có biết ko', true], ['biết iphone ko', true], ['bạn có biết Nikola Tesla không?', true], ['có biết gì về Đà Lạt hok', true], ['Do you know Tesla?', true], ['tôi biết rồi', false], ['giá iphone bao nhiêu', false], ['hôm nay trời sao', false]])('isKnowQuestion(%s) = %s', (t, v) => expect(isKnowQuestion(t)).toBe(v))
  it('thin answers: little to read, no figure, not a question', () => {
    for (const t of ['Biết chứ.', 'À, Nikola Tesla chứ gì.', 'Ok.', 'Có.']) expect(isThin(t)).toBe(true)
    for (const t of ['Biết chứ. Bạn hỏi Nikola Tesla, nhà phát minh, hay Tesla, hãng xe điện?', 'Bạn muốn hỏi về điều gì vậy?', TESLA_FACTS, 'Năm 2007.', 'Nikola Tesla sinh năm 1856.']) expect(isThin(t)).toBe(false)
    expect(isThin('Biết chứ.\n\nNguồn: [vi.wikipedia.org](https://vi.wikipedia.org/wiki/Nikola_Tesla)')).toBe(true) // a source line is not content
  })
  it('thin preface: an acknowledgement, no figure, no structure', () => {
    for (const t of ['À, Nikola Tesla chứ gì.', 'Ừ, đúng rồi.', 'Mình hiểu rồi.']) expect(isThinPreface(t)).toBe(true)
    for (const t of ['Tiêu chí chọn: pin, camera, giá và độ bền; giá nên ưu tiên theo ngân sách của bạn.', '- pin\n- camera', 'Năm 2007 Apple ra iPhone.']) expect(isThinPreface(t)).toBe(false)
  })
  it('after a clarification: the last assistant message ends with a question and the user answered briefly', () => {
    expect(afterClarification([U('biết tesla ko'), A(Q1), U('nhà phát minh á')])).toBe(true)
    expect(afterClarification([U('biết tesla ko'), A('Nikola Tesla là nhà phát minh.'), U('ok')])).toBe(false)
    expect(afterClarification([U('xin chào')])).toBe(false)
    expect(afterClarification([U('a'), A('Bạn ở đâu?'), U('mình đang ở một thành phố khá xa nơi bạn nói tới lúc nãy đó nhé')])).toBe(false)
  })
  it('needsContent: both halves — a know/clarification turn AND a thin answer', () => {
    expect(needsContent({ messages: [U('biết iphone ko')], composed: 'Biết chứ.' })).toBe(true)
    expect(needsContent({ messages: [U('biết iphone ko')], composed: IPHONE_FACTS })).toBe(false)
    expect(needsContent({ messages: [U('tôi nên học gì')], composed: 'Học lập trình.' })).toBe(false)
    expect(needsContent({ messages: [U('biết tesla ko')], composed: Q1 })).toBe(false) // a clarifying question stays
    expect(proseOf('**Biết chứ.**\n\nNguồn: [a](https://a.example)')).toBe('Biết chứ.')
  })
})

describe('turn 2 of the live Tesla chat: "nhà phát minh á" (after our clarification)', () => {
  const msgs = [U('biết tesla ko'), A(Q1), U('nhà phát minh á')]
  it('an acknowledgement next to the lookup is not a preface; a thin answer after the lookup is retried once and the content reaches the user', async () => {
    const model: Array<{ system: string; messages: CoreMessage[]; final: boolean }> = []
    const r = await run(msgs, [step('À, Nikola Tesla chứ gì.', [['web_search', { queries: ['Nikola Tesla'] }]]), step('Nikola Tesla.'), step(TESLA_FACTS)], { flag: true, model })
    expect(r.text).toBe(TESLA_FACTS)
    hasContent(r.text)
    expect(r.text).not.toContain('chứ gì')
    expect(model.some(m => m.system.includes('ĐÃ đọc phần tư vấn'))).toBe(false) // no "already read" note was put on the steps
    expect(model.length).toBe(3) // lookup step, answer step, ONE content retry
    log('tesla_turn2_ack_then_thin', 'À, Nikola Tesla chứ gì. [+ web_search] → "Nikola Tesla."', r.text, 'CONTENT (ack dropped, thin answer retried once)')
  })
  it('the answer-first check writing the same acknowledgement is dropped as well', async () => {
    const r = await run(msgs, [step('', [['web_search', { queries: ['Nikola Tesla'] }]]), step(TESLA_FACTS)], { flag: true, check: 'À, Nikola Tesla chứ gì.' })
    expect(r.text).toBe(TESLA_FACTS)
    expect(r.answerFirst).toBe('nothing_yet')
    log('tesla_turn2_check_ack', 'check: "À, Nikola Tesla chứ gì." → answer: facts', r.text, 'CONTENT (ack not shown)')
  })
  it('CONTROL — flag OFF: the acknowledgement is kept as a preface and the thin answer stays thin', async () => {
    const r = await run(msgs, [step('À, Nikola Tesla chứ gì.', [['web_search', { queries: ['Nikola Tesla'] }]]), step('Nikola Tesla.')], { flag: false })
    expect(r.text).toContain('À, Nikola Tesla chứ gì.')
    expect(r.modelCalls).toBe(2)
    log('control_flag_off_turn2', 'À, Nikola Tesla chứ gì. [+ web_search] → "Nikola Tesla."', r.text, 'UNCHANGED (flag off)')
  })
})

describe('turn 3 of the live Tesla chat: "đúng rồi, cha, có biết ko"', () => {
  const msgs = [U('biết tesla ko'), A(Q1), U('nhà phát minh á'), A(TESLA_FACTS), U('đúng rồi, cha, có biết ko')]
  it('"Biết chứ." alone is retried once and the answer carries content', async () => {
    const r = await run(msgs, [step('Biết chứ.'), step('Biết chứ. ' + TESLA_FACTS)], { flag: true })
    expect(r.text).toBe('Biết chứ. ' + TESLA_FACTS)
    hasContent(r.text)
    expect(r.modelCalls).toBe(2)
    log('tesla_turn3_biet_chu', '"Biết chứ."', r.text, 'CONTENT (retried once)')
  })
  it('a retry that is still thin does not loop: one retry only, the thin text is what remains', async () => {
    const r = await run(msgs, [step('Biết chứ.'), step('Biết.'), step('không được gọi')], { flag: true })
    expect(r.modelCalls).toBe(2)
    expect(r.text).toBe('Biết chứ.')
    log('retry_still_thin', '"Biết chứ." → "Biết."', r.text, 'KEPT (one retry only)')
  })
  it('CONTROL — flag OFF: "Biết chứ." stays "Biết chứ."', async () => {
    const r = await run(msgs, [step('Biết chứ.')], { flag: false })
    expect(r.text).toBe('Biết chứ.')
    expect(r.modelCalls).toBe(1)
    log('control_flag_off_turn3', '"Biết chứ."', r.text, 'UNCHANGED (flag off)')
  })
})

describe('other wordings and cases', () => {
  it('"biết iphone ko" (not ambiguous): a good first answer is left alone (one model call)', async () => {
    const r = await run([U('biết iphone ko')], [step('Biết chứ. ' + IPHONE_FACTS)], { flag: true })
    expect(r.text).toBe('Biết chứ. ' + IPHONE_FACTS)
    expect(r.modelCalls).toBe(1)
    log('iphone_good_answer', 'Biết chứ. + 3 sentences', r.text, 'KEPT (no retry)')
  })
  it('"biết iphone ko" answered "Biết chứ." → content', async () => {
    const r = await run([U('biết iphone ko')], [step('Biết chứ.'), step('Biết chứ. ' + IPHONE_FACTS)], { flag: true })
    hasContent(r.text)
    expect(r.text).toContain('Apple')
    log('iphone_thin_then_content', '"Biết chứ."', r.text, 'CONTENT (retried once)')
  })
  it.each(['có biết Nikola Tesla ko', 'biết Tesla hok', 'bạn biết Tesla không?', 'Do you know Tesla?'])('wording: %s', async (q) => {
    const r = await run([U(q)], [step('Biết chứ.'), step(TESLA_FACTS)], { flag: true })
    expect(r.text).toBe(TESLA_FACTS)
    log('wording_' + q, '"Biết chứ."', r.text, 'CONTENT (retried once)')
  })
  it('the first turn still asks: a clarifying question is kept (not thin, no retry)', async () => {
    const r = await run([U('biết tesla ko')], [step(Q1)], { flag: true })
    expect(r.text).toBe(Q1)
    expect(r.modelCalls).toBe(1)
    log('first_turn_clarification', Q1, r.text, 'KEPT (question)')
  })
  it('not enough to go on: the retry may ask ONE question instead of guessing, and it is accepted', async () => {
    const r = await run([U('biết ko')], [step('Biết chứ.'), step('Bạn đang hỏi mình về điều gì vậy?')], { flag: true })
    expect(r.text).toBe('Bạn đang hỏi mình về điều gì vậy?')
    log('insufficient_data_asks', '"Biết chứ." → question', r.text, 'ASKS (no guess)')
  })
  it('advice and general knowledge turns are not touched, even when short', async () => {
    const r = await run([U('tôi nên học gì để dễ xin việc')], [step('Học lập trình.')], { flag: true })
    expect(r.text).toBe('Học lập trình.')
    expect(r.modelCalls).toBe(1)
    log('advice_untouched', '"Học lập trình."', r.text, 'KEPT (not a know/clarification turn)')
  })
  it('a proper name chosen after our question ("hãng xe điện á"): same floor', async () => {
    const r = await run([U('biết tesla ko'), A(Q1), U('hãng xe điện á')], [step('À, hãng xe điện Tesla.', [['web_search', { queries: ['Tesla Inc'] }]]), step('Tesla.'), step('Tesla, Inc. là hãng xe điện của Mỹ do Elon Musk dẫn dắt. Họ nổi tiếng với dòng Model S, Model 3 và pin năng lượng. Trụ sở đặt tại Texas.')], { flag: true })
    hasContent(r.text)
    expect(r.text).not.toContain('À, hãng xe điện Tesla.')
    log('tesla_ev_after_choice', 'À, hãng xe điện Tesla. [+ web_search] → "Tesla."', r.text, 'CONTENT')
  })
})
