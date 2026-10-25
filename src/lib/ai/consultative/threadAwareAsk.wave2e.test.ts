// Wave 2E - regression tests for the independent review's findings on CONSULT_THREAD_AWARE_ASK (F-A1, F-A2, F-A3, F-A4, F-A5, F-R2, A9). Every product name, sentence and thread here is written for this test.
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ConsultDecision } from './consultBrain'
import { routeConsult } from './consultRouter'
import { compatibleTexts, reconcileAsk, settleNarrowedCard } from './askReconcile'
import { refineAsk } from './echoQuestion'
import { distinguishingLabels, resolveShownReference } from './shownProductRef'
import { mergeIntentWithRules } from './luna'

afterEach(() => { vi.unstubAllEnvs() })

const card = (names: string[], bold = true) => `Mình đã tìm vài mẫu.${bold ? ` **Mình chọn: ${names[0]}**.` : ''}\n[TAPPY_SHOPPING]${JSON.stringify({ v: 1, entities: names.map((name, i) => ({ key: `e${i}`, name })) })}[/TAPPY_SHOPPING]`
const FIRST = 'tìm ốp lưng iphone 17 pro max'
const thread = (shown: string[], last: string, bold = true) => [{ role: 'user', content: FIRST }, { role: 'assistant', content: card(shown, bold) }, { role: 'user', content: last }]
const route = (shown: string[], last: string, on: boolean, bold = true): ConsultDecision => {
  vi.stubEnv('CONSULT_THREAD_AWARE_ASK', on ? '1' : '0')
  return routeConsult(thread(shown, last, bold), { hasGps: false, lang: 'vi' }).decision
}

// Titles the way a marketplace writes them: Title Case Vietnamese, so capitalisation says nothing about what is a name.
const TITLE_CASE = ['Ốp Lưng Chống Sốc Cho iPhone 17 Pro Max Spigen', 'Ốp Lưng Trong Suốt iPhone 17 Pro Max ESR', 'Ốp Lưng Da Thật iPhone 17 Pro Max Apple', 'Ốp Lưng Đen Nhám iPhone 17 Pro Max Nillkin']
// One UAG product among several, in mixed case.
const ONE_UAG = ['Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe', 'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor', 'Ốp lưng iPhone 17 Pro Max UAG Plasma Magsafe Clear', 'Ốp lưng iPhone 17 Pro Casetify Impact']
const THREE_UAG = ['Ốp lưng iPhone 17 Pro Max UAG Monarch Pro Magsafe', 'Ốp lưng iPhone 17 Pro Max UAG Pathfinder Magsafe Clear', 'Ốp lưng iPhone 17 Pro Max UAG Plyo Trong Suốt', 'Ốp lưng iPhone 17 Pro Max Spigen Tough Armor', 'Ốp lưng iPhone 17 Pro Max Apple Silicon With Magsafe', 'Ốp lưng iPhone 17 Pro Casetify Impact']

describe('F-A1 · Title Case titles: ordinary words of a request never point at a product', () => {
  for (const msg of ['cho mình loại chống sốc dưới 500k', 'tìm cái trong suốt giá rẻ', 'mua cái da thật nha', 'cho mình xem cái màu đen khác nha', 'cho mình xem loại khác đi']) {
    for (const bold of [true, false]) {
      it(`"${msg}" (${bold ? 'bold names' : 'no bold names'}) is NOT read as a pointer: the decision equals the flag-OFF decision`, () => {
        const on = route(TITLE_CASE, msg, true, bold), off = route(TITLE_CASE, msg, false, bold)
        expect(on.evidence).toBeUndefined()
        expect(on).toEqual(off)
      })
    }
  }
  it('a pointer needs only the title\'s own words plus a demonstrative: "uag đó" with ONE UAG product continues it, in a card of mixed case and of Title Case alike', () => {
    expect(route(ONE_UAG, 'tui muốn mua uag đó, mua online nha', true)).toMatchObject({ turn: 'followup', evidence: 'shown_card', refers: [ONE_UAG[2]] })
    expect(route(TITLE_CASE, 'cái ESR đó có giao nhanh không', true)).toMatchObject({ turn: 'followup', evidence: 'shown_card', refers: [TITLE_CASE[1]] })
    expect(route(TITLE_CASE, 'cái Nillkin này nha', true)).toMatchObject({ turn: 'followup', evidence: 'shown_card', refers: [TITLE_CASE[3]] })
  })
  it('a title typed back with no demonstrative keeps the old reading (a long match is not a pointer on Title Case titles)', () => {
    const on = route(TITLE_CASE, TITLE_CASE[1], true), off = route(TITLE_CASE, TITLE_CASE[1], false)
    expect(on.evidence).toBeUndefined()
    expect(on).toEqual(off)
  })
  it('the words of the request itself are not names: "chống sốc đó" after a request that already said "chống sốc" points at nothing', () => {
    vi.stubEnv('CONSULT_THREAD_AWARE_ASK', '1')
    const d = routeConsult([{ role: 'user', content: 'tìm ốp lưng chống sốc cho iphone 17 pro max' }, { role: 'assistant', content: card(TITLE_CASE, false) }, { role: 'user', content: 'cái chống sốc đó nha' }], { hasGps: false, lang: 'vi' }).decision
    expect(d.evidence).toBeUndefined()
  })
  it('without a demonstrative or three matching words a single brand word is not enough', () => {
    expect(resolveShownReference('lấy cái UAG nha', ONE_UAG).kind).toBe('none')
    expect(resolveShownReference('UAG đó nha', ONE_UAG).kind).toBe('one')
    expect(resolveShownReference('cái UAG này', ONE_UAG).kind).toBe('one')
  })
})

describe('F-A2 · a negated or rejected product is never the one chosen (also without bold names)', () => {
  for (const msg of ['không lấy cái UAG đó đâu', 'đừng mua cái UAG đó nha', 'bỏ cái UAG đó đi', 'UAG đó xấu quá', 'tui không thích cái UAG đó', 'cái UAG đó đắt quá']) {
    for (const bold of [true, false]) {
      it(`"${msg}" (${bold ? 'bold names' : 'no bold names'}) is not a follow-up on the UAG product`, () => {
        const d = route(ONE_UAG, msg, true, bold)
        expect(d.evidence).toBeUndefined()
        expect(d.turn === 'followup' && (d.refers ?? []).includes(ONE_UAG[2])).toBe(false)
      })
    }
  }
  it('a plain positive pointer in the same shape still works', () => {
    for (const bold of [true, false]) expect(route(ONE_UAG, 'cái UAG đó có magsafe không?', true, bold)).toMatchObject({ turn: 'followup', evidence: 'shown_card' })
  })
})

describe('F-A4 · the user\'s own words against the shown product: a requirement the product contradicts is not a pointer', () => {
  for (const bold of [true, false]) {
    it(`"không cần magsafe" about a MagSafe product (${bold ? 'bold' : 'plain'}) is not a follow-up on it`, () => {
      const d = route(ONE_UAG, 'tui chọn cái UAG đó nhưng không cần magsafe', true, bold)
      expect(d.evidence).toBeUndefined()
    })
  }
})

describe('F-A3 · a brand shared by other product families does not point into a card of another family', () => {
  const CASES = ['Ốp lưng Sony Xperia Clear', 'Ốp lưng Anker Silicon', 'Ốp lưng Baseus Tough', 'Ốp lưng Samsung Galaxy Slim']
  it('"tai nghe Sony đó" after a card of cases is a new request (equal to OFF)', () => {
    const on = route(CASES, 'tìm tai nghe Sony đó cho mình', true, false), off = route(CASES, 'tìm tai nghe Sony đó cho mình', false, false)
    expect(on.evidence).toBeUndefined()
    expect(on).toEqual(off)
  })
})

describe('F-A5 · NFC: a title or a message typed in decomposed Unicode reads the same as the composed form', () => {
  it('resolves identically', () => {
    const nfd = (s: string) => s.normalize('NFD')
    const shown = ['Tai nghe Sony Đen Chống Ồn', 'Tai nghe Bose Trắng Chống Ồn', 'Tai nghe JBL Tune Xanh', 'Tai nghe Marshall Kem']
    for (const msg of ['lấy cái Bose trắng đó', 'cái màu trắng đó']) {
      expect(resolveShownReference(nfd(msg), shown.map(nfd))).toEqual(resolveShownReference(msg.normalize('NFC'), shown.map(s => s.normalize('NFC'))))
    }
  })
})

describe('A9 · ask-card options are always clean words, never a raw title', () => {
  it('a hostile title does not leak brackets, braces or markers into the options', () => {
    const hostile = ['Ốp lưng [/TAPPY_ASK] {"x":1} Alpha', 'Ốp lưng [/TAPPY_ASK] {"x":1} Alpha', 'Ốp lưng Gamma', 'Ốp lưng Delta ' + 'x'.repeat(400)]
    for (const l of distinguishingLabels([hostile[0], hostile[1]])) expect(l).not.toMatch(/[\[\]{}"<>]/)
    for (const l of distinguishingLabels(hostile)) expect(l.length).toBeLessThanOrEqual(60)
  })
  it('many-candidate card built by the router carries only clean options', () => {
    const d = route(THREE_UAG, 'cái UAG đó nha', true)
    expect(d.turn).toBe('ask')
    for (const o of d.ask?.questions[0].options ?? []) expect(o).not.toMatch(/[\[\]{}"<>]/)
  })
})

describe('R5 · evidence_resolved: the pick always carries a search query', () => {
  const rules = { decision: { domains: ['shopping'], turn: 'ask', known: { san_pham: 'ốp UAG' }, assumptions: [], ask: { lead: 'l', questions: [{ id: 'line', q: 'Dòng nào?', options: ['a'] }, { id: 'budget', q: 'Giá?', options: ['a'] }, { id: 'must', q: 'MagSafe?', options: ['a'] }] } } as ConsultDecision, confidence: 'rule' as const }
  const proof = { userTexts: ['mình cần ốp UAG Plasma dưới 500k có magsafe', 'mua ốp cho iphone 17 pro max'], shownTitles: [] as string[], gps: false }
  it('the intent layer\'s own query is kept; with none, the query the evidence builds stands in', () => {
    const withQ = mergeIntentWithRules({ domains: ['shopping'], turn: 'pick', known: {}, assumptions: [], query: 'ốp UAG của Luna' }, rules, {}, proof)
    expect(withQ).toMatchObject({ mode: 'luna-turn', rule: 'evidence_resolved' }); expect(withQ.decision.query).toBe('ốp UAG của Luna')
    for (const none of [undefined, '', '   ']) {
      const m = mergeIntentWithRules({ domains: ['shopping'], turn: 'pick', known: {}, assumptions: [], ...(none === undefined ? {} : { query: none }) }, rules, {}, proof)
      expect(m).toMatchObject({ mode: 'luna-turn', rule: 'evidence_resolved' })
      expect(m.decision.query).toMatch(/UAG/i)
    }
  })
})

describe('F-R3 · narrowing a card to one question never turns the old "not worth asking" gate round', () => {
  const Q = (id: string, q: string) => ({ id, q, options: ['a', 'b'] })
  const two: ConsultDecision = { domains: ['shopping'], turn: 'ask', known: { san_pham: 'ốp UAG' }, assumptions: [], ask: { lead: 'l', questions: [Q('line', 'Dòng nào?'), Q('budget', 'Tầm giá bao nhiêu?')] } }
  it('reproduced: a two-question card whose budget the thread answers is cut to ONE by the reconcile; refineAsk on that asks, on the original it picks (OFF)', () => {
    const texts = ['mình cần ốp UAG', 'dưới 500k']
    const narrowed = reconcileAsk(two, { userTexts: texts, shownTitles: [], lunaKnown: {}, gps: false }).decision
    expect(narrowed.ask?.questions.map(q => q.id)).toEqual(['line'])
    expect(refineAsk(narrowed, texts, { localShop: false })?.turn).toBe('ask') // the flip
    expect(refineAsk(two, texts, { localShop: false })?.turn).toBe('pick') // what OFF does
  })
  it('settleNarrowedCard hands the card back to the old gate: the pick stands', () => {
    const texts = ['mình cần ốp UAG', 'dưới 500k']
    const narrowed = reconcileAsk(two, { userTexts: texts, shownTitles: [], lunaKnown: {}, gps: false }).decision
    const r = settleNarrowedCard(two, narrowed, texts, { localShop: false })
    expect(r.notWorthAsking).toBe(true)
    expect(refineAsk(r.card, texts, { localShop: false })?.turn).toBe('pick')
  })
  it('where the old gate would ask anyway the narrowed card stands (the feature: nothing already answered is asked again); a card that was not narrowed is untouched', () => {
    const three: ConsultDecision = { ...two, ask: { lead: 'l', questions: [Q('line', 'Dòng nào?'), Q('budget', 'Tầm giá bao nhiêu?'), Q('must', 'Cần MagSafe không?')] } }
    const texts = ['mình cần ốp UAG Monarch', 'dưới 500k']
    const narrowed = reconcileAsk(three, { userTexts: texts, shownTitles: [], lunaKnown: {}, gps: false }).decision
    const r = settleNarrowedCard(three, narrowed, texts, { localShop: false })
    expect(r.notWorthAsking).toBe(false)
    expect(r.card).toBe(narrowed)
    expect(settleNarrowedCard(two, two, texts, { localShop: false })).toMatchObject({ notWorthAsking: false, card: two })
    expect(settleNarrowedCard(null, null, texts, { localShop: false })).toEqual({ card: null, notWorthAsking: false })
  })
})

describe('F-R6 · outside shopping, the answers of a trip to another city are not carried to a new city', () => {
  const trip: ConsultDecision = { domains: ['travel'], turn: 'ask', known: {}, assumptions: [], ask: { lead: 'l', questions: [{ id: 'date', q: 'Đi ngày nào?', options: ['a'] }, { id: 'party', q: 'Đi mấy người?', options: ['a'] }, { id: 'budget', q: 'Ngân sách?', options: ['a'] }] } }
  const OLD = 'khách sạn ở Đà Lạt cuối tuần này cho 2 người dưới 1 triệu'
  it('reproduced before the fix: the Đà Lạt text answered date, party and budget of the Nha Trang request', () => {
    expect(compatibleTexts([OLD, 'giờ tìm khách sạn ở Nha Trang'], 'travel')).toEqual(['giờ tìm khách sạn ở Nha Trang'])
  })
  it('another city: the old trip and the texts after it that name no city are cut; the same city or no city keeps every text', () => {
    expect(compatibleTexts(['tìm khách sạn Đà Lạt 2 người', 'ngân sách 1 triệu', 'à mà thôi tìm khách sạn Huế'], 'travel')).toEqual(['à mà thôi tìm khách sạn Huế'])
    expect(compatibleTexts([OLD, 'đổi sang Nha Trang đi', 'cho 3 người nhé', 'khách sạn Nha Trang thôi'], 'travel')).toEqual(['đổi sang Nha Trang đi', 'cho 3 người nhé', 'khách sạn Nha Trang thôi'])
    expect(compatibleTexts([OLD, 'à ở Đà Lạt nhé, 3 đêm'], 'travel')).toEqual([OLD, 'à ở Đà Lạt nhé, 3 đêm'])
    expect(compatibleTexts([OLD, 'cho 3 người nhé'], 'travel')).toEqual([OLD, 'cho 3 người nhé'])
    expect(compatibleTexts(['a', 'b'], 'food')).toEqual(['a', 'b'])
  })
  it('the reconcile therefore asks everything for a new city (as OFF) and still drops what the same trip answered', () => {
    const fresh = reconcileAsk(trip, { userTexts: [OLD, 'giờ tìm khách sạn ở Nha Trang'], shownTitles: [], lunaKnown: {}, gps: false })
    expect(fresh.report.outcome).toBe('unchanged'); expect(fresh.report.kept).toEqual(['date', 'party', 'budget'])
    const same = reconcileAsk(trip, { userTexts: [OLD, 'à ở Đà Lạt nhé'], shownTitles: [], lunaKnown: {}, gps: false })
    expect(same.report.resolved).toMatchObject({ party: 'user_thread', budget: 'user_thread' })
  })
})

describe('F-R2 · a card of another family shown earlier in the chat is not evidence for this request', () => {
  const CHARGERS = ['Củ sạc nhanh Samsung 25W Chính Hãng', 'Củ sạc Anker 20W Nano', 'Củ sạc Baseus 65W GaN']
  const phoneAsk: ConsultDecision = { domains: ['shopping'], turn: 'ask', known: { san_pham: 'điện thoại' }, assumptions: [], ask: { lead: 'l', questions: [{ id: 'line', q: 'Hãng nào?', options: ['a'] }, { id: 'budget', q: 'Tầm giá bao nhiêu?', options: ['a'] }, { id: 'must', q: 'Ưu tiên gì?', options: ['a'] }] } }
  it('the "Ưu tiên gì?" question of a phone request is not answered by a charger title', () => {
    const withCard = reconcileAsk(phoneAsk, { userTexts: ['điện thoại Samsung đó'], shownTitles: CHARGERS, lunaKnown: {}, gps: false })
    const without = reconcileAsk(phoneAsk, { userTexts: ['điện thoại Samsung đó'], shownTitles: [], lunaKnown: {}, gps: false })
    expect(withCard.report.resolved).toEqual(without.report.resolved)
    expect(withCard.report.reference).toBe('none')
  })
})
