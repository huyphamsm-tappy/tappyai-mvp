// C2 Phase 2/3 — the pure policies (c2Policy.ts): flags default OFF, the tool gate, the round cap with its exceptions, the plan sign, the
// continuation join and the fixed status copy. No model, no network.
import { describe, it, expect, afterEach } from 'vitest'
import {
  c2ToolGateOn, c2RoundCapOn, c2BatchNoteOn, c2LengthRecoveryOn, c2ProgressOn, c2ToolRoundEffort, c2SoftBudgetMs,
  toolGate, planTurn, roundDecision, joinContinuation, batchNote, continuationPrompt, incompleteNote, progressLabelForTool, thinkingLabel, writingLabel,
} from './c2Policy'
import { statusFrame, readProgress, PROGRESS_ANNOTATION_KIND } from '@/lib/recommendation/progressAnnotation'

const KEYS = ['C2_TOOL_GATE', 'C2_ROUND_CAP', 'C2_BATCH_NOTE', 'C2_LENGTH_RECOVERY', 'C2_PROGRESS', 'C2_TOOL_ROUND_EFFORT', 'C2_SOFT_BUDGET_MS']
afterEach(() => { for (const k of KEYS) delete process.env[k] })

describe('P0 · every lever is OFF unless its flag is exactly "1"', () => {
  it('unset → off; "1" → on; anything else → off', () => {
    for (const k of KEYS) delete process.env[k]
    expect([c2ToolGateOn(), c2RoundCapOn(), c2BatchNoteOn(), c2LengthRecoveryOn(), c2ProgressOn()]).toEqual([false, false, false, false, false])
    expect(c2ToolRoundEffort()).toBeNull()
    for (const v of ['true', 'on', 'yes', '0', '2', '']) {
      process.env.C2_TOOL_GATE = v; process.env.C2_ROUND_CAP = v
      expect(c2ToolGateOn(), v).toBe(false); expect(c2RoundCapOn(), v).toBe(false)
    }
    process.env.C2_TOOL_GATE = '1'; process.env.C2_ROUND_CAP = ' 1 '; process.env.C2_BATCH_NOTE = '1'; process.env.C2_LENGTH_RECOVERY = '1'; process.env.C2_PROGRESS = '1'
    expect([c2ToolGateOn(), c2RoundCapOn(), c2BatchNoteOn(), c2LengthRecoveryOn(), c2ProgressOn()]).toEqual([true, true, true, true, true])
  })
  it('tool-round effort accepts only none|low|medium|high (xhigh / junk → null)', () => {
    for (const v of ['none', 'low', 'medium', 'high']) { process.env.C2_TOOL_ROUND_EFFORT = v; expect(c2ToolRoundEffort()).toBe(v) }
    process.env.C2_TOOL_ROUND_EFFORT = 'LOW'; expect(c2ToolRoundEffort()).toBe('low')
    for (const v of ['xhigh', 'minimal', '1', '']) { process.env.C2_TOOL_ROUND_EFFORT = v; expect(c2ToolRoundEffort(), v).toBeNull() }
  })
  it('soft budget: default 20 s, plan at least 45 s, an env value overrides the base', () => {
    expect(c2SoftBudgetMs(false)).toBe(20_000); expect(c2SoftBudgetMs(true)).toBe(45_000)
    process.env.C2_SOFT_BUDGET_MS = '12000'; expect(c2SoftBudgetMs(false)).toBe(12_000); expect(c2SoftBudgetMs(true)).toBe(45_000)
    process.env.C2_SOFT_BUDGET_MS = '60000'; expect(c2SoftBudgetMs(true)).toBe(60_000)
    process.env.C2_SOFT_BUDGET_MS = 'abc'; expect(c2SoftBudgetMs(false)).toBe(20_000)
    process.env.C2_SOFT_BUDGET_MS = '-5'; expect(c2SoftBudgetMs(false)).toBe(20_000)
  })
})

describe('P1 · tool gate (conservative: unsure → tools)', () => {
  it.each([
    ['Giải thích định luật Ohm cho học sinh lớp 9', 'stable_task'],
    ['Viết giúp mình một email xin nghỉ phép', 'stable_task'],
    ['Tại sao bầu trời có màu xanh?', 'stable_task'],
    ['Dịch câu này sang tiếng Anh: chúc mừng sinh nhật', 'stable_task'],
    ['Explain recursion with an example', 'stable_task'],
    ['How do I reverse a list in Python?', 'stable_task'],
  ])('no_tools: %s', (q, reason) => { expect(toolGate(q)).toEqual({ gate: 'no_tools', reason }) })

  it.each([
    ['Giá vàng hôm nay bao nhiêu?', 'needs_data_sign'],
    ['Tại sao giá xăng tuần này tăng?', 'needs_data_sign'],
    ['Giải thích vì sao thời tiết Đà Nẵng mưa nhiều', 'needs_data_sign'],
    ['Quán phở nào ngon ở quận 1?', 'needs_data_sign'],
    ['Explain the latest iPhone launch', 'needs_data_sign'],
    ['Viết lịch trình Đà Lạt 3 ngày', 'needs_data_sign'],
    ['So sánh giá iPhone 17 và Galaxy S26', 'needs_data_sign'],
    ['Tóm tắt bài này https://example.com/a', 'url_in_message'],
    ['tóm tắt www.example.com', 'url_in_message'],
    ['这个怎么做？请解释一下', 'script_not_folded'],
    ['อธิบายหน่อย', 'script_not_folded'],
    ['Messi', 'no_stable_sign'],
    ['   ', 'empty'],
  ])('tools: %s', (q, reason) => { expect(toolGate(q)).toEqual({ gate: 'tools', reason }) })

  it('a short follow-up belongs to its conversation: earlier shopping / price / place words keep the tools', () => {
    expect(toolGate('Chủ yếu để code')).toEqual({ gate: 'no_tools', reason: 'stable_task' })
    expect(toolGate('Chủ yếu để code', { earlierUserTexts: ['Mình muốn mua MacBook', 'Tầm 25 triệu'] })).toEqual({ gate: 'tools', reason: 'conversation_needs_data' })
    expect(toolGate('Giải thích thêm giúp mình', { earlierUserTexts: ['Giá vàng hôm nay?'] })).toEqual({ gate: 'tools', reason: 'conversation_needs_data' })
    expect(toolGate('Tóm tắt lại nhé', { earlierUserTexts: ['đọc giúp https://example.com/a'] })).toEqual({ gate: 'tools', reason: 'conversation_needs_data' })
    expect(toolGate('Giải thích định luật Ohm', { earlierUserTexts: ['Tại sao bầu trời màu xanh?'] })).toEqual({ gate: 'no_tools', reason: 'stable_task' })
  })
  it('an answer to a pending task question keeps the tools', () => {
    expect(toolGate('Chủ yếu để học', { pendingQuestion: true })).toEqual({ gate: 'tools', reason: 'answers_pending_question' })
  })
  it('shopping and money words are fresh-data signs; "bạn" is not', () => {
    for (const q of ['Nên mua laptop nào để học lập trình?', 'Giải thích vì sao iPhone đắt', 'Ngân sách 20tr thì viết code bằng máy nào', 'Với 500k thì nên chọn tai nghe nào?']) expect(toolGate(q).gate, q).toBe('tools')
    expect(toolGate('Giải thích giúp bạn mình định luật Ohm').gate).toBe('no_tools')
  })

  it('diacritics never change the decision (folded text)', () => {
    expect(toolGate('giai thich dinh luat Ohm').gate).toBe('no_tools')
    expect(toolGate('gia vang hom nay').gate).toBe('tools')
  })

  // Benchmark A2 (19/10): two fresh-news questions were gated to NO tools and answered "chưa tra được" (q036, q046).
  it('news, incidents and what is trending keep the tools, even with an explain / summarize word', () => {
    for (const q of [
      'Ê bro, vụ cháy nhà máy ở Hà Nội mới xảy ra sao rồi, có ai bị gì ko? Tóm tắt lẹ giúp tui.',
      'Phim Việt nào đang hot trên Netflix ấy nhỉ, xem cuốn cuốn tí chứ đừng sến quá :))',
      'Giải thích vụ tai nạn trên cao tốc sáng qua',
      'Tóm tắt giúp mình sự cố mất điện vừa rồi',
      'Bài hát nào đang trending trên TikTok?',
      'What happened in the breaking story about the earthquake?',
      // one sign each — so every word of the list is held by a test
      'Chuyện gì xảy ra ở Hội An? Giải thích giúp mình',
      'Giải thích giúp mình phim nào hay trên Netflix',
    ]) expect(toolGate(q), q).toEqual({ gate: 'tools', reason: 'needs_data_sign' })
  })
  it('"viết" is a writing request only with what follows it; "Việt" folds to the same letters and is not', () => {
    expect(toolGate('Viết giúp mình một email xin nghỉ phép')).toEqual({ gate: 'no_tools', reason: 'stable_task' })
    expect(toolGate('Viết cho mình bài thơ về tình bạn')).toEqual({ gate: 'no_tools', reason: 'stable_task' })
    expect(toolGate('viet email xin nghi phep')).toEqual({ gate: 'no_tools', reason: 'stable_task' })
    expect(toolGate('Phim Việt nào cảm động?')).toEqual({ gate: 'tools', reason: 'no_stable_sign' })
    expect(toolGate('Người Việt ăn Tết ra sao?')).toEqual({ gate: 'tools', reason: 'no_stable_sign' })
  })
})

describe('P2 · plan sign', () => {
  it.each(['Lên lịch trình Đà Lạt 3 ngày 2 đêm', 'kế hoạch đi Phú Quốc', 'plan a 5 days trip to Japan', 'đi Huế 3n2d', 'itinerary for Hanoi'])('plan: %s', q => { expect(planTurn(q)).toBe(true) })
  it.each(['Giá vàng hôm nay', 'Giải thích định luật Ohm', 'quán phở ngon'])('not a plan: %s', q => { expect(planTurn(q)).toBe(false) })
})

describe('P3 · round cap with logged exceptions', () => {
  const d = (o: Partial<Parameters<typeof roundDecision>[0]>) => roundDecision({ toolRounds: 1, lastRoundStates: ['SUCCESS'], plan: false, elapsedMs: 1_000, softBudgetMs: 20_000, ...o })
  it('no lookup yet → not final', () => { expect(d({ toolRounds: 0 })).toEqual({ final: false, reason: 'no_lookup_yet' }) })
  it('one good lookup round → the next round answers (round_cap)', () => { expect(d({})).toEqual({ final: true, reason: 'round_cap' }) })
  it('every lookup of the round failed / empty → ONE more lookup round (evidence_missing), then the cap', () => {
    expect(d({ lastRoundStates: ['EMPTY', 'ERROR'] })).toEqual({ final: false, reason: 'evidence_missing' })
    expect(d({ lastRoundStates: ['TIMEOUT'] })).toEqual({ final: false, reason: 'evidence_missing' })
    expect(d({ toolRounds: 2, lastRoundStates: ['EMPTY'] })).toEqual({ final: true, reason: 'round_cap' })
  })
  it('one success among failures is evidence → the cap applies', () => { expect(d({ lastRoundStates: ['EMPTY', 'SUCCESS'] })).toEqual({ final: true, reason: 'round_cap' }) })
  it('no recorded state (only control calls) is not "missing evidence"', () => { expect(d({ lastRoundStates: [] })).toEqual({ final: true, reason: 'round_cap' }) })
  it('a plan may run up to 3 lookup rounds (plan_task), a 4th only when the 3rd found nothing', () => {
    expect(d({ plan: true, toolRounds: 1 })).toEqual({ final: false, reason: 'plan_task' })
    expect(d({ plan: true, toolRounds: 2 })).toEqual({ final: false, reason: 'plan_task' })
    expect(d({ plan: true, toolRounds: 3 })).toEqual({ final: true, reason: 'round_cap' })
    expect(d({ plan: true, toolRounds: 3, lastRoundStates: ['EMPTY'] })).toEqual({ final: false, reason: 'evidence_missing' })
    expect(d({ plan: true, toolRounds: 4, lastRoundStates: ['EMPTY'] })).toEqual({ final: true, reason: 'round_cap' })
  })
  it('the soft time budget wins over every exception', () => {
    expect(d({ elapsedMs: 20_000 })).toEqual({ final: true, reason: 'soft_time_budget' })
    expect(d({ elapsedMs: 25_000, lastRoundStates: ['EMPTY'] })).toEqual({ final: true, reason: 'soft_time_budget' })
    expect(d({ plan: true, elapsedMs: 50_000, softBudgetMs: 45_000 })).toEqual({ final: true, reason: 'soft_time_budget' })
    expect(d({ elapsedMs: 19_999, lastRoundStates: ['EMPTY'] })).toEqual({ final: false, reason: 'evidence_missing' })
  })
})

describe('P4 · continuation join', () => {
  it('drops the overlap when the continuation repeats the tail it was given', () => {
    const head = 'Ngày 1: tham quan hồ Xuân Hương, ăn bánh căn'
    expect(joinContinuation(head, 'hồ Xuân Hương, ăn bánh căn ở chợ Đà Lạt.')).toBe('Ngày 1: tham quan hồ Xuân Hương, ăn bánh căn ở chợ Đà Lạt.')
  })
  it('a mid-word cut continues with a space; a finished sentence starts a new paragraph; punctuation sticks', () => {
    expect(joinContinuation('Bạn nên mang', 'áo ấm.')).toBe('Bạn nên mang áo ấm.')
    expect(joinContinuation('Ngày 1 xong.', 'Ngày 2: đi Langbiang.')).toBe('Ngày 1 xong.\n\nNgày 2: đi Langbiang.')
    expect(joinContinuation('Giá khoảng 200k', ', tuỳ mùa.')).toBe('Giá khoảng 200k, tuỳ mùa.')
    expect(joinContinuation('Dòng 1\n', 'Dòng 2')).toBe('Dòng 1\nDòng 2')
  })
  it('an empty continuation leaves the head untouched; a short accidental match (<12 chars) is not treated as overlap', () => {
    expect(joinContinuation('abc', '   ')).toBe('abc')
    expect(joinContinuation('Đi chợ Đà Lạt', 'Lạt rất vui')).toBe('Đi chợ Đà Lạt Lạt rất vui')
  })
})

describe('P6 · status frames on the wire (progressAnnotation)', () => {
  it('statusFrame is one `8:` line with the progress kind; the client reads the new stages; an unknown stage is still ignored', () => {
    const line = statusFrame('researching', 'vi', progressLabelForTool('web_search', 'vi'))
    expect(line.startsWith('8:')).toBe(true); expect(line.endsWith('\n')).toBe(true)
    const [a] = JSON.parse(line.slice(2))
    expect(a).toEqual({ kind: PROGRESS_ANNOTATION_KIND, v: 1, stage: 'researching', text: 'Đang tìm trên web…' })
    expect(JSON.parse(statusFrame('thinking', 'en').slice(2))[0].text).toBe('Tappy is thinking…')
    expect(readProgress([a])?.stage).toBe('researching')
    expect(readProgress([{ kind: PROGRESS_ANNOTATION_KIND, v: 1, stage: 'thinking', text: 'x' }, a])?.text).toBe('Đang tìm trên web…')
    expect(readProgress([{ kind: PROGRESS_ANNOTATION_KIND, v: 1, stage: 'nope', text: 'x' }])).toBeNull()
  })
})

describe('P5 · fixed copy (never user text)', () => {
  it('status labels are fixed per tool kind and language; unknown tools get the generic label', () => {
    expect(progressLabelForTool('web_search', 'vi')).toBe('Đang tìm trên web…')
    expect(progressLabelForTool('web_search', 'en')).toBe('Searching the web…')
    expect(progressLabelForTool('get_weather', 'vi')).toBe('Đang xem thời tiết…')
    expect(progressLabelForTool('search_places', 'vi')).toBe('Đang tìm địa điểm…')
    expect(progressLabelForTool('some_new_tool', 'vi')).toBe('Đang tra cứu…')
    expect(progressLabelForTool('some_new_tool', 'en')).toBe('Looking things up…')
    expect(thinkingLabel('vi')).toBe('Tappy đang suy nghĩ…'); expect(writingLabel('en')).toBe('Writing the answer…')
  })
  it('notes are bilingual and say what they must: batch in ONE step, continue without repeating, may be incomplete', () => {
    expect(batchNote('vi')).toMatch(/cùng bước này/); expect(batchNote('en')).toMatch(/same step/)
    expect(continuationPrompt('vi')).toMatch(/không lặp lại/); expect(continuationPrompt('en')).toMatch(/do not repeat/)
    expect(incompleteNote('vi')).toMatch(/có thể chưa đầy đủ/); expect(incompleteNote('en')).toMatch(/may be incomplete/)
  })
})
