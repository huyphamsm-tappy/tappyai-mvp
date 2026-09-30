import { describe, it, expect } from 'vitest'
import { checkIntent, consultLunaEnabled, intentToDecision, isLunaAnswerTurn, mergeIntentWithRules, moneyAmounts, runLunaIntent, splitPickSentence, type LunaIntent } from './luna'
import { buildLeanConsultSystem, LEAN_CORE } from './leanConsultPrompt'

const base = (o: Partial<LunaIntent> = {}): LunaIntent => ({
  domains: ['food'], turn: 'pick', goal: 'ăn tối', known: [], party: null, budget_vnd_max: null, difficulty: 'easy',
  missing: [], assumptions: [], ask: null, query: 'quán lẩu', area: null, refers: [], reject_reason: null, ...o,
})

describe('CONSULT_LUNA flag', () => {
  it('is OFF unless explicitly on', () => {
    expect(consultLunaEnabled({})).toBe(false)
    expect(consultLunaEnabled({ CONSULT_LUNA: '0' })).toBe(false)
    expect(consultLunaEnabled({ CONSULT_LUNA: '1' })).toBe(true)
    expect(consultLunaEnabled({ CONSULT_LUNA: 'on' })).toBe(true)
  })
  it('answer turns only: the detailed plan (and an area-less chat) stays on the Phase 7 model', () => {
    for (const t of ['pick', 'followup', 'compare', 'more', 'reject', 'chat'] as const) expect(isLunaAnswerTurn({ turn: t, domains: ['food'] }, false)).toBe(true)
    expect(isLunaAnswerTurn({ turn: 'plan', domains: ['food'] }, false)).toBe(false)
    expect(isLunaAnswerTurn({ turn: 'pick', domains: ['travel'] }, true)).toBe(false)
    expect(isLunaAnswerTurn({ turn: 'chat', domains: [] }, false)).toBe(false)
    expect(isLunaAnswerTurn(null, false)).toBe(false)
  })
})

describe('code checks the facts the model extracted', () => {
  it('reads money the way people type it', () => {
    expect(moneyAmounts('tầm 300k/người')).toEqual([300_000])
    expect(moneyAmounts('duoi 1tr5')).toEqual([1_500_000])
    expect(moneyAmounts('2 củ thôi')).toEqual([2_000_000])
    expect(moneyAmounts('ngân sách 8.000.000đ')).toEqual([8_000_000])
  })

  it('an area the user never wrote is dropped (not guessed)', () => {
    const { intent, check } = checkIntent(base({ area: 'Quận 3', known: [{ key: 'khu_vuc', value: 'Quận 3' }] }), ['tìm quán lẩu ngon'], { hasGps: false })
    expect(intent.area).toBeNull()
    expect(intent.known.find(k => k.key === 'khu_vuc')).toBeUndefined()
    expect(check.dropped.join(' ')).toContain('Quận 3')
  })

  it('an area written without accents / abbreviated is kept', () => {
    const { intent } = checkIntent(base({ area: 'Bình Thạnh', known: [{ key: 'khu_vuc', value: 'Bình Thạnh' }] }), ['lau nhat o binh thanh'], { hasGps: false })
    expect(intent.area).toBe('Bình Thạnh')
    expect(intent.known).toContainEqual({ key: 'khu_vuc', value: 'Bình Thạnh' })
  })

  it('"q1" / "quận 1" keeps the district slot (replay 30/09: it was dropped)', () => {
    for (const text of ['toi nay an j ngon q1', 'tối nay ăn gì ngon quận 1']) {
      const { intent, check } = checkIntent(base({ area: 'Quận 1', known: [{ key: 'khu_vuc', value: 'Quận 1' }] }), [text], { hasGps: false })
      expect(intent.area).toBe('Quận 1')
      expect(intent.known).toContainEqual({ key: 'khu_vuc', value: 'Quận 1' })
      expect(check.dropped).toEqual([])
    }
    expect(checkIntent(base({ known: [{ key: 'khu_vuc', value: 'Quận 3' }] }), ['an toi q1'], { hasGps: false }).intent.known).toEqual([])
  })

  it('a mis-normalised area is corrected to the place the text names', () => {
    const { intent, check } = checkIntent(base({ area: 'Quận Nhất' }), ['an toi q1 nhe'], { hasGps: false })
    expect(intent.area).toBe('quận 1')
    expect(check.corrected[0]).toContain('quận 1')
  })

  it('"gần đây" with a device location is kept', () => {
    const { intent } = checkIntent(base({ area: 'gần bạn' }), ['quán cafe gần đây'], { hasGps: true })
    expect(intent.area).toBe('gần bạn')
  })

  it('party size must be a number the user wrote', () => {
    expect(checkIntent(base({ party: 4 }), ['nhóm mình đi ăn tối'], { hasGps: false }).intent.party).toBeNull()
    expect(checkIntent(base({ party: 4 }), ['4 người đi ăn lẩu'], { hasGps: false }).intent.party).toBe(4)
    // the model misread 4 → 5: the code's literal reading wins
    expect(checkIntent(base({ party: 5 }), ['4 người đi ăn lẩu'], { hasGps: false }).intent.party).toBe(4)
  })

  it('a budget the text does not carry is dropped; a misread one is corrected', () => {
    expect(checkIntent(base({ budget_vnd_max: 500_000 }), ['lẩu nhật ngon'], { hasGps: false }).intent.budget_vnd_max).toBeNull()
    expect(checkIntent(base({ budget_vnd_max: 300_000 }), ['tầm 300k/người'], { hasGps: false }).intent.budget_vnd_max).toBe(300_000)
    expect(checkIntent(base({ budget_vnd_max: 3_000_000 }), ['tầm 300k/người'], { hasGps: false }).intent.budget_vnd_max).toBe(300_000)
  })

  it('a preference must share a word with the text; stated slots the model missed are added by code', () => {
    const { intent } = checkIntent(base({ known: [{ key: 'mon', value: 'lẩu Nhật' }, { key: 'khong_khi', value: 'yên tĩnh' }] }), ['lau nhat 2 nguoi tam 300k'], { hasGps: false })
    expect(intent.known).toContainEqual({ key: 'mon', value: 'lẩu Nhật' })
    expect(intent.known.find(k => k.key === 'khong_khi')).toBeUndefined()
    expect(intent.known.find(k => k.key === 'so_nguoi')?.value).toBe('2 người')
    expect(intent.known.find(k => k.key === 'ngan_sach')?.value).toContain('300k')
  })

  it('maps to the decision shape; an ask with < 2 usable questions is not an ask', () => {
    const d = intentToDecision(base({ turn: 'ask', ask: { lead: 'Để mình chọn đúng:', questions: [{ id: 'p', q: 'Mấy người?', options: ['1', '2'] }, { id: 'b', q: 'Tầm giá?', options: ['Dưới 100k'] }] } }))
    expect(d.ask?.questions).toHaveLength(1)
  })
})

describe('runLunaIntent', () => {
  it('validates the extracted intent and fails open (null) on an error', async () => {
    const run = await runLunaIntent(async () => ({ object: base({ area: 'Quận 7', party: 9 }), usage: { promptTokens: 100, completionTokens: 20 }, providerMetadata: { tappy: { cost: { usd: 0.00002, provider: 'openai', effort: 'none' } } } }),
      [{ role: 'user', content: 'lẩu ngon 2 người' }], { hasGps: false, previousWasAsk: false, userTexts: ['lẩu ngon 2 người'] })
    expect(run?.decision.area).toBeUndefined()
    expect(run?.decision.known.so_nguoi).toBe('2 người')
    expect(run?.costUsd).toBe(0.00002)
    expect(run?.served).toBe('openai:none')
    const warn = console.warn; console.warn = () => {}
    try {
      expect(await runLunaIntent(async () => { throw new Error('boom') }, [], { hasGps: false, previousWasAsk: false, userTexts: [] })).toBeNull()
    } finally { console.warn = warn }
  })

  it('never two asks in a row (code rule survives the model)', async () => {
    const run = await runLunaIntent(async () => ({ object: base({ turn: 'ask', ask: { lead: 'x', questions: [{ id: 'a', q: 'A?', options: ['1', '2'] }, { id: 'b', q: 'B?', options: ['1', '2'] }] } }) }),
      [], { hasGps: false, previousWasAsk: true, userTexts: ['lẩu'] })
    expect(run?.decision.turn).toBe('pick')
  })
})

describe('lean prompt with the Luna core', () => {
  it('reused text first: core + area tool rules in the shared segment, per-turn blocks after', () => {
    const o = { lang: 'vi', langName: 'Vietnamese', vnDateTime: 'x', vnDateISO: '2026-09-30', domains: ['food'] as const, consultBlock: 'STATE' }
    const luna = buildLeanConsultSystem({ ...o, domains: [...o.domains], core: 'LUNA' })
    expect(luna.shared.startsWith('LUNA\n\n')).toBe(true)
    expect(luna.shared).toContain('search_places (type restaurant/cafe/bar)')
    expect(luna.dynamic).not.toContain('search_places (type restaurant/cafe/bar)')
    expect(luna.dynamic).toContain('STATE')
    // flag off → unchanged
    const old = buildLeanConsultSystem({ ...o, domains: [...o.domains] })
    expect(old.shared).toBe(LEAN_CORE)
    expect(old.dynamic).toContain('search_places (type restaurant/cafe/bar)')
  })
})

describe('the turn stays with code when the router is sure', () => {
  const rule = { decision: { domains: ['shopping' as const], turn: 'ask' as const, known: { san_pham: 'ốp' }, assumptions: [], ask: { lead: 'x', questions: [] }, query: 'op uag' }, confidence: 'rule' as const }
  it('same areas → router turn + ask + query, Luna facts merged over router slots', () => {
    const m = mergeIntentWithRules({ domains: ['shopping'], turn: 'pick', known: { dong: 'Monarch', san_pham: 'ốp UAG' }, assumptions: [], query: 'ốp uag monarch', area: undefined }, rule)
    expect(m.mode).toBe('merged')
    expect(m.decision.turn).toBe('ask')
    expect(m.decision.query).toBe('op uag')
    expect(m.decision.known).toEqual({ san_pham: 'ốp UAG', dong: 'Monarch' })
  })
  it('a follow-up the rules read as a new ask → the Luna turn (replay SHOP-2 t3); Luna pick vs rules ask → ask', () => {
    const m = mergeIntentWithRules({ domains: ['shopping'], turn: 'followup', known: {}, assumptions: [], refers: ['Hộp quà A'] }, rule)
    expect(m.mode).toBe('luna-turn')
    expect(m.decision.turn).toBe('followup')
    expect(m.decision.refers).toEqual(['Hộp quà A'])
    expect(mergeIntentWithRules({ domains: ['shopping'], turn: 'pick', known: {}, assumptions: [] }, rule).decision.turn).toBe('ask')
  })
  it('areas disagree, or the router is unsure → Luna decides', () => {
    expect(mergeIntentWithRules({ domains: ['food'], turn: 'pick', known: {}, assumptions: [] }, rule).mode).toBe('luna')
    expect(mergeIntentWithRules({ domains: ['shopping'], turn: 'pick', known: {}, assumptions: [] }, { ...rule, confidence: 'unsure' }).decision.turn).toBe('pick')
  })
})

describe('the pick sentence stands alone (a guard cutting the reason keeps the name)', () => {
  it('splits "vì" / "—" reasons into their own sentence, words unchanged', () => {
    expect(splitPickSentence('Ok. **Mình chọn: Miya Sushi** vì có **1.376 đánh giá**.')).toBe('Ok. **Mình chọn: Miya Sushi**. Vì có **1.376 đánh giá**.')
    expect(splitPickSentence('**Mình chọn: Nori** — 4,8⭐, gần bạn.\n\n[FOLLOWUPS]a[/FOLLOWUPS]')).toBe('**Mình chọn: Nori**. 4,8⭐, gần bạn.\n\n[FOLLOWUPS]a[/FOLLOWUPS]')
  })
  it('unbolds the model count line so the server count replaces it (replay SHOP-2 t2 showed two count lines)', () => {
    expect(splitPickSentence('Mình còn **34 lựa chọn** nữa, muốn xem thêm không?')).toBe('Mình còn 34 lựa chọn nữa, muốn xem thêm không?')
  })
  it('leaves a pick that already ends its sentence, and text without a pick', () => {
    expect(splitPickSentence('**Mình chọn: Nori**. Quán gần.')).toBe('**Mình chọn: Nori**. Quán gần.')
    expect(splitPickSentence('Không có lựa chọn.')).toBe('Không có lựa chọn.')
  })
})
