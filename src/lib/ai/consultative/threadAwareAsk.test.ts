import { describe, it, expect, afterEach } from 'vitest'
import { vi } from 'vitest'
import type { ConsultDecision } from './consultBrain'
import { compatibleTexts, reconcileAsk, type AskEvidenceInput } from './askReconcile'
import { routeConsult } from './consultRouter'
import { mergeIntentWithRules } from './luna'
import { consultThreadAwareAskOn } from '@/lib/config/consultFlags'

// Everything below is written for this test: the product names, the user's sentences and the thread are NOT taken from any benchmark file or run.
const ID = { line: 'line', budget: 'budget', must: 'must' }
const ASK = (ids: string[]): NonNullable<ConsultDecision['ask']> => ({ lead: 'Để chọn đúng ốp UAG cho bạn:', questions: ids.map(id => ({ id, q: `Q ${id}?`, options: ['a', 'b'] })) })
const askDecision = (ids: string[] = [ID.line, ID.budget, ID.must], extra: Partial<ConsultDecision> = {}): ConsultDecision => ({ domains: ['shopping'], turn: 'ask', known: { san_pham: 'ốp UAG' }, assumptions: [], ask: ASK(ids), ...extra })
const ev = (userTexts: string[], over: Partial<AskEvidenceInput> = {}): AskEvidenceInput => ({ userTexts, shownTitles: [], lunaKnown: {}, gps: false, ...over })

const PRODUCTS = [
  'Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe',
  'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor',
  'Ốp lưng iPhone 17 Pro Max UAG Plasma Magsafe Clear',
  'Ốp lưng iPhone 17 Pro Casetify Impact',
]
const PRODUCTS_3_UAG = [
  'Ốp lưng iPhone 17 Pro Max UAG Monarch Pro Magsafe',
  'Ốp lưng iPhone 17 Pro Max UAG Pathfinder Magsafe Clear',
  'Ốp lưng iPhone 17 Pro Max UAG Plyo Trong Suốt',
  'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor',
  'Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe',
  'Ốp lưng iPhone 17 Pro Casetify Impact',
]
const cardReply = (names: string[]) => `Mình đã tìm được vài mẫu. **Mình chọn: ${names[0]}**.\n[TAPPY_SHOPPING]${JSON.stringify({ v: 1, entities: names.map((name, i) => ({ key: `e${i}`, name, priceLow: 900000 + i * 50000 })) })}[/TAPPY_SHOPPING]\nBạn xem thử nhé.`
const thread = (shown: string[], last: string) => [
  { role: 'user', content: 'tìm ốp lưng iphone 17 pro max' },
  { role: 'assistant', content: cardReply(shown) },
  { role: 'user', content: last },
]

afterEach(() => { vi.unstubAllEnvs() })

describe('CONSULT_THREAD_AWARE_ASK flag: ON only for the exact "1" outside production', () => {
  it('exact value only; production reads it as OFF', () => {
    expect(consultThreadAwareAskOn({ CONSULT_THREAD_AWARE_ASK: '1' })).toBe(true)
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes']) expect(consultThreadAwareAskOn({ CONSULT_THREAD_AWARE_ASK: v }), JSON.stringify(v)).toBe(false)
    expect(consultThreadAwareAskOn({ CONSULT_THREAD_AWARE_ASK: '1', NODE_ENV: 'production' })).toBe(false)
    expect(consultThreadAwareAskOn({ CONSULT_THREAD_AWARE_ASK: '1', VERCEL_ENV: 'production' })).toBe(false)
    for (const k of ['CONSULT_THREAD_AWARE_AS', 'CONSULT_THREAD_AWARE_ASKS', 'CONSULT_THREAD_AWARE_ASK_ON', 'CONSULT_THREAD_ASK']) expect(consultThreadAwareAskOn({ [k]: '1' }), k).toBe(false)
  })
})

describe('compatibleTexts: an earlier text belongs with the last one only when it is about the same product family (or about none)', () => {
  it('a budget follows "ốp UAG"; a laptop text does not', () => {
    expect(compatibleTexts(['mua ốp lưng iphone 17', '500k đến 1 triệu', 'lấy UAG nhé'], 'shopping')).toEqual(['mua ốp lưng iphone 17', '500k đến 1 triệu', 'lấy UAG nhé'])
    expect(compatibleTexts(['laptop dell dưới 20 triệu', 'mua ốp UAG cho iphone 17'], 'shopping')).toEqual(['mua ốp UAG cho iphone 17'])
  })
  it('other domains keep every text; an empty list stays empty', () => {
    expect(compatibleTexts(['a', 'b'], 'food')).toEqual(['a', 'b'])
    expect(compatibleTexts([], 'shopping')).toEqual([])
  })
})

describe('reconcileAsk: a question is dropped only when the evidence answers it, through the question\'s own detector', () => {
  it('(iii) a budget the user gave an earlier turn still counts: only the open questions stay', () => {
    const r = reconcileAsk(askDecision(), ev(['mua ốp lưng UAG cho iphone 17', 'dưới 1 triệu', 'lấy UAG nhé']))
    expect(r.report).toMatchObject({ outcome: 'trimmed', kept: ['line', 'must'], resolved: { budget: 'user_thread' } })
    expect(r.decision.ask?.questions.map(q => q.id)).toEqual(['line', 'must'])
  })
  it('every question answered by the user\'s words → the card becomes a pick that carries the answers and a query', () => {
    const r = reconcileAsk(askDecision(), ev(['mua ốp lưng UAG Monarch cho iphone 17', 'dưới 1 triệu', 'cần có magsafe', 'lấy luôn nhé']))
    expect(r.report.outcome).toBe('to_pick')
    expect(r.decision.turn).toBe('pick')
    expect(r.decision.ask).toBeUndefined()
    expect(r.decision.known.ngan_sach).toBeTruthy()
    expect(r.decision.query).toMatch(/UAG/i)
  })
  it('nothing answered → the card is returned untouched', () => {
    const d = askDecision()
    const r = reconcileAsk(d, ev(['mua ốp UAG']))
    expect(r.report.outcome).toBe('unchanged')
    expect(r.decision).toBe(d)
  })
  it('an earlier text about ANOTHER product family does not answer: a laptop budget never answers an "ốp UAG" card', () => {
    const r = reconcileAsk(askDecision(), ev(['laptop dell dưới 20 triệu', 'mua ốp UAG cho iphone 17']))
    expect(r.report.resolved).toEqual({})
    expect(r.report.kept).toEqual(['line', 'budget', 'must'])
  })
  it('(vi) an intent-layer value that the user\'s words do not carry is not an answer; a brand is not a line even when the user said it', () => {
    const ungrounded = reconcileAsk(askDecision(), ev(['mua ốp UAG cho iphone 17'], { lunaKnown: { dong: 'Plyo', ngan_sach: '300k' } }))
    expect(ungrounded.report).toMatchObject({ lunaCounted: 0, lunaNotGrounded: 2, outcome: 'unchanged' })
    // "UAG Monarch" adds a word ("Monarch") the user never wrote: the whole value is a guess, even though "UAG" is theirs
    const extraWord = reconcileAsk(askDecision(), ev(['mua ốp UAG cho iphone 17'], { lunaKnown: { dong: 'UAG Monarch' } }))
    expect(extraWord.report.resolved).toEqual({})
    // a grounded value goes through the question's own detector: the brand "UAG" does not answer "which LINE?"
    const brand = reconcileAsk(askDecision(), ev(['mua ốp UAG cho iphone 17'], { lunaKnown: { dong: 'UAG' } }))
    expect(brand.report.lunaCounted).toBe(1)
    expect(brand.report.resolved).toEqual({})
  })
  it('ids the router does not manage for the domain are never judged', () => {
    const d = askDecision(['activity', 'budget'])
    const r = reconcileAsk(d, ev(['mua ốp UAG', 'dưới 1 triệu']))
    expect(r.report.kept).toEqual(['activity'])
    expect(r.report.resolved).toEqual({ budget: 'user_thread' })
  })
  it('not applicable: a pick, the domain question, no domain, no texts, and a card read from the shown product itself', () => {
    expect(reconcileAsk({ ...askDecision(), turn: 'pick', ask: undefined }, ev(['x'])).report.outcome).toBe('not_applicable')
    expect(reconcileAsk(askDecision(['domain']), ev(['dưới 1 triệu'])).report.outcome).toBe('not_applicable')
    expect(reconcileAsk(askDecision([], { domains: [] }), ev(['x'])).report.outcome).toBe('not_applicable')
    expect(reconcileAsk(askDecision(), ev([])).report.outcome).toBe('not_applicable')
    expect(reconcileAsk(askDecision(['line'], { evidence: 'shown_card' }), ev(['mua ốp UAG Monarch'])).report.outcome).toBe('not_applicable')
  })
  it('the ONE product the message points at answers the questions its own name answers (line, magsafe) - the budget stays with the thread', () => {
    const r = reconcileAsk(askDecision(), ev(['tìm ốp lưng iphone 17 pro max', 'dưới 1 triệu', 'lấy cái UAG đó đi'], { shownTitles: PRODUCTS }))
    expect(r.report.reference).toBe('one')
    expect(r.report.resolved).toEqual({ line: 'shown_card', budget: 'user_thread', must: 'shown_card' })
    expect(r.report.outcome).toBe('to_pick')
  })
  it('several shown products matching (MANY) are not evidence for a slot', () => {
    const r = reconcileAsk(askDecision(), ev(['tìm ốp lưng iphone 17 pro max', 'lấy cái UAG đó đi'], { shownTitles: PRODUCTS_3_UAG }))
    expect(r.report.reference).toBe('many')
    expect(r.report.resolved.line).toBeUndefined()
    expect(r.report.kept).toContain('line')
  })
  it('a title the message does not point at is not the user\'s choice, so it grounds no value either', () => {
    const r = reconcileAsk(askDecision(), ev(['mua ốp UAG cho iphone 17'], { shownTitles: PRODUCTS_3_UAG, lunaKnown: { dong: 'Pathfinder' } }))
    expect(r.report.lunaCounted).toBe(0)
    expect(r.report.kept).toContain('line')
  })
})

describe('mergeIntentWithRules with evidence: a rules / intent disagreement on ask vs pick is settled on the thread, not on "rules win"', () => {
  const rules = (ids: string[] = [ID.line, ID.budget, ID.must], extra: Partial<ConsultDecision> = {}) => ({ decision: askDecision(ids, extra), confidence: 'rule' as const })
  const lunaPick = (known: Record<string, string> = {}): ConsultDecision => ({ domains: ['shopping'], turn: 'pick', known: { san_pham: 'ốp UAG', ...known }, assumptions: [], query: 'ốp UAG iphone 17' })
  const proof = (texts: string[], over: Partial<Omit<AskEvidenceInput, 'lunaKnown'>> = {}) => ({ userTexts: texts, shownTitles: [] as string[], gps: false, ...over })

  it('OFF (no evidence): the old rule - the rules\' card stands, the merge reports no rule', () => {
    const m = mergeIntentWithRules(lunaPick(), rules(), {}, undefined)
    expect(m.decision.turn).toBe('ask'); expect(m.mode).toBe('merged'); expect(m.rule).toBeUndefined()
  })
  it('(iv) ON, rules ask, Luna pick, and the thread answers every question → Luna\'s pick', () => {
    const m = mergeIntentWithRules(lunaPick(), rules(), {}, proof(['mua ốp lưng UAG Monarch cho iphone 17', 'dưới 1 triệu', 'cần có magsafe', 'lấy luôn nhé']))
    expect(m).toMatchObject({ mode: 'luna-turn', rule: 'evidence_resolved' })
    expect(m.decision.turn).toBe('pick'); expect(m.decision.query).toBe('ốp UAG iphone 17')
  })
  it('(v) ON, Luna picked but one required slot is still open → the card keeps ONLY that question', () => {
    const m = mergeIntentWithRules(lunaPick(), rules(), {}, proof(['mua ốp lưng UAG Monarch cho iphone 17', 'dưới 1 triệu', 'lấy luôn nhé']))
    expect(m).toMatchObject({ mode: 'merged', rule: 'evidence_partial' })
    expect(m.decision.turn).toBe('ask')
    expect(m.decision.ask?.questions.map(q => q.id)).toEqual(['must'])
  })
  it('(vi) ON, the intent layer\'s value is not grounded in the user\'s words → it answers nothing: the rules\' card stands', () => {
    const m = mergeIntentWithRules(lunaPick({ dong: 'Plyo', yeu_cau: 'MagSafe', ngan_sach: '500k' }), rules(), {}, proof(['mua ốp UAG cho iphone 17']))
    expect(m).toMatchObject({ mode: 'merged', rule: 'evidence_open' })
    expect(m.decision.ask?.questions.map(q => q.id)).toEqual(['line', 'budget', 'must'])
  })
  it('not "Luna always wins": nothing answered → ask; not "rules always win": everything answered → pick', () => {
    const open = mergeIntentWithRules(lunaPick(), rules(), {}, proof(['mua ốp UAG']))
    const full = mergeIntentWithRules(lunaPick(), rules(), {}, proof(['mua ốp UAG Plyo', 'dưới 1 triệu', 'không cần magsafe']))
    expect(open.decision.turn).toBe('ask'); expect(full.decision.turn).toBe('pick')
  })
  it('a reading made from the shown product (evidence = shown_card) stands against another turn type, but not against an explicit action', () => {
    const followup = { decision: { ...askDecision([], { turn: 'followup', ask: undefined, refers: [PRODUCTS[2]], evidence: 'shown_card' as const }) }, confidence: 'rule' as const }
    expect(mergeIntentWithRules(lunaPick(), followup, {}, proof(['x']))).toMatchObject({ mode: 'merged', rule: 'shown_card' })
    expect(mergeIntentWithRules(lunaPick(), followup, {}, proof(['x'])).decision.turn).toBe('followup')
    // OFF: the old behaviour (the intent layer's different turn type wins over a non-explicit rules turn)
    expect(mergeIntentWithRules(lunaPick(), followup, {}, undefined)).toMatchObject({ mode: 'luna-turn' })
    // an explicit action of the intent layer is not overridden
    const plan: ConsultDecision = { ...lunaPick(), turn: 'plan' }
    expect(mergeIntentWithRules(plan, followup, {}, proof(['x'])).rule).not.toBe('shown_card')
  })
  it('the opposite disagreement (rules pick, Luna ask) and agreement are not touched', () => {
    const rulesPick = { decision: { domains: ['shopping'] as ConsultDecision['domains'], turn: 'pick' as const, known: {}, assumptions: [], query: 'q' }, confidence: 'rule' as const }
    const lunaAsk: ConsultDecision = { ...lunaPick(), turn: 'ask', ask: ASK(['line']) }
    expect(mergeIntentWithRules(lunaAsk, rulesPick, {}, proof(['x'])).decision.turn).toBe('pick')
    expect(mergeIntentWithRules(lunaPick(), rules(), {}, proof(['x'])).rule).toBeDefined()
  })
})

describe('router step 3b: a message that points at a product the thread showed (flag ON)', () => {
  const route = (shown: string[], last: string, on = true) => {
    vi.stubEnv('CONSULT_THREAD_AWARE_ASK', on ? '1' : undefined as unknown as string)
    return routeConsult(thread(shown, last), { hasGps: false, lang: 'vi' })
  }
  it('(i) exactly ONE shown product matches → a follow-up on it, no ask card, no question about what the thread already answered', () => {
    const r = route(PRODUCTS, 'lấy cái UAG đó đi, đặt online cho nhanh')
    expect(r.confidence).toBe('rule')
    expect(r.decision).toMatchObject({ turn: 'followup', evidence: 'shown_card', domains: ['shopping'] })
    expect(r.decision.refers).toEqual([PRODUCTS[2]])
    expect(r.decision.ask).toBeUndefined()
  })
  it('a statement that names the product without a refinement verb gets the same reading (the message that used to come back as the brand\'s card)', () => {
    const r = route(PRODUCTS, 'tui chọn cái UAG đó nha, mua online cho tiện')
    expect(r.decision).toMatchObject({ turn: 'followup', evidence: 'shown_card' })
    expect(r.decision.refers).toEqual([PRODUCTS[2]])
  })
  it('OFF (flag unset): the same messages are read as before - a refinement of the shown picks, or a new request with the brand\'s ask card', () => {
    const imperative = route(PRODUCTS, 'lấy cái UAG đi, đặt online cho nhanh', false)
    expect(imperative.decision.evidence).toBeUndefined()
    expect(imperative.decision.turn).toBe('reject')
    // ON reads the same imperative WITHOUT a demonstrative as before too (Wave 2E: a pointer needs "đó"/"này")
    expect(route(PRODUCTS, 'lấy cái UAG đi, đặt online cho nhanh', true).decision).toEqual(imperative.decision)
    const statement = route(PRODUCTS, 'tui chọn cái UAG nha, mua online cho tiện', false)
    expect(statement.decision.evidence).toBeUndefined()
    expect(statement.decision.turn).toBe('ask')
    expect(statement.decision.ask?.questions.map(q => q.id)).toContain('line')
  })
  it('(ii) several shown products of the brand match → ask ONLY what tells them apart, with options taken from the card; nothing already answered is asked again', () => {
    const r = route(PRODUCTS_3_UAG, 'lấy cái UAG đó đi, đặt online cho nhanh')
    expect(r.decision).toMatchObject({ turn: 'ask', evidence: 'shown_card' })
    const qs = r.decision.ask?.questions ?? []
    expect(qs.map(q => q.id)).toEqual(['line'])
    const options = qs[0].options.join(' | ')
    for (const w of ['Monarch', 'Pathfinder', 'Plyo']) expect(options).toContain(w)
    expect(options).toContain('Chưa biết')
    expect(options).not.toMatch(/Spigen|Tough/)
  })
  it('the user names ANOTHER line than the shown product\'s → not a reference to it (the old reading stands)', () => {
    const r = route(PRODUCTS, 'lấy UAG Monarch đi')
    expect(r.decision.evidence).toBeUndefined()
    expect(r.decision.turn).not.toBe('followup')
  })
  it('no shown product matches, or the match is too broad, or the words are only the category → the old reading (identical with the flag ON and OFF)', () => {
    for (const msg of ['lấy cái rẻ nhất đi', 'ốp lưng iphone 17 pro max nào bền nhất']) {
      const on = route(PRODUCTS, msg, true), off = route(PRODUCTS, msg, false)
      expect(on.decision, msg).toEqual(off.decision)
      expect(on.decision.evidence, msg).toBeUndefined()
    }
  })
  it('only inside a shopping thread that showed a card: a first message, another domain, or a thread with a single product is untouched', () => {
    vi.stubEnv('CONSULT_THREAD_AWARE_ASK', '1')
    const first = routeConsult([{ role: 'user', content: 'lấy cái UAG đi' }], { hasGps: false, lang: 'vi' })
    expect(first.decision.evidence).toBeUndefined()
    const food = route(PRODUCTS, 'tìm quán phở ngon ở quận 3')
    expect(food.decision.evidence).toBeUndefined(); expect(food.decision.domains).not.toContain('shopping')
    const single = route([PRODUCTS[2]], 'lấy cái UAG đó đi')
    expect(single.decision.evidence).toBeUndefined()
  })
  it('earlier steps still win: "xem thêm", a plan phrase, a comparison keep their turn (flag ON)', () => {
    expect(route(PRODUCTS, 'xem thêm').decision.turn).toBe('more')
    expect(route(PRODUCTS, 'chốt, lên kế hoạch chi tiết').decision.turn).toBe('plan')
  })
  it('the router reports what it decided under CONSULT_TRACE_DIAGNOSTICS-style tracing (counts only, no text)', () => {
    vi.stubEnv('CONSULT_THREAD_AWARE_ASK', '1')
    const events: Array<Record<string, unknown>> = []
    routeConsult(thread(PRODUCTS, 'lấy cái UAG đó đi'), { hasGps: false, lang: 'vi', trace: e => events.push(e) })
    const e = events.find(x => x.ev === 'shown_reference')
    expect(e).toMatchObject({ shownProducts: 4, result: 'one', candidates: 1 })
    expect(JSON.stringify(e)).not.toMatch(/UAG|Plasma|Ốp/)
  })
})
