// Wave 2E - regression tests for the independent review's findings on CONSULT_THREAD_AWARE_ASK (F-A1, F-A2, F-A3, F-A4, F-A5, F-R2, A9). Every product name, sentence and thread here is written for this test.
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ConsultDecision } from './consultBrain'
import { routeConsult, titleConflictsWithMessage } from './consultRouter'
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

// Fixtures outside the phone-case family, in Title Case as a marketplace writes them: laptop, headphones, phone, charger.
const FAMILIES: Array<{ name: string; first: string; shown: string[]; request: string; pointer: string; refers: number; negated: string; plain: string }> = [
  { name: 'laptop', first: 'tìm laptop mỏng nhẹ cho sinh viên', shown: ['Laptop Mỏng Nhẹ Asus Vivobook 15 Core i5', 'Laptop Mỏng Nhẹ Acer Aspire 5 Ryzen 5', 'Laptop Mỏng Nhẹ Lenovo Ideapad Slim 3', 'Laptop Mỏng Nhẹ HP Pavilion 14 Core i7'], request: 'cho mình laptop mỏng nhẹ dưới 20 triệu', pointer: 'cái Lenovo đó pin trâu không', refers: 2, negated: 'không lấy cái Lenovo đó đâu', plain: 'laptop Lenovo đó' },
  { name: 'headphones', first: 'tìm tai nghe chống ồn', shown: ['Tai Nghe Chống Ồn Sony WH-1000XM5 Đen', 'Tai Nghe Chống Ồn Bose QuietComfort Trắng', 'Tai Nghe Chống Ồn JBL Tour One Xanh', 'Tai Nghe Chống Ồn Marshall Major Kem'], request: 'tìm tai nghe chống ồn màu đen giá rẻ', pointer: 'lấy cái Bose này nha', refers: 1, negated: 'đừng mua cái Bose đó nha', plain: 'Bose này tốt không' },
  { name: 'phone', first: 'tìm điện thoại chụp ảnh đẹp', shown: ['Điện Thoại Chụp Ảnh Đẹp Samsung Galaxy S25 Ultra', 'Điện Thoại Chụp Ảnh Đẹp Xiaomi 15 Ultra', 'Điện Thoại Chụp Ảnh Đẹp Oppo Find X8 Pro', 'Điện Thoại Chụp Ảnh Đẹp Vivo X200 Pro'], request: 'cho mình điện thoại chụp ảnh đẹp dưới 15 triệu', pointer: 'cái Oppo đó chụp đêm có tốt không', refers: 2, negated: 'bỏ cái Oppo đó đi', plain: 'Oppo đó nha' },
  { name: 'charger', first: 'tìm củ sạc nhanh cho iphone', shown: ['Củ Sạc Nhanh Anker Nano 30W Trắng', 'Củ Sạc Nhanh Baseus GaN 65W Đen', 'Củ Sạc Nhanh Ugreen Nexode 45W Xám', 'Củ Sạc Nhanh Belkin BoostCharge 25W'], request: 'tìm củ sạc nhanh giá rẻ cho iphone 15', pointer: 'lấy cái Ugreen đó', refers: 2, negated: 'tui không thích Ugreen đó', plain: 'Ugreen đó nhé' },
]
describe('F-A1/F-A2 across families (laptop, headphones, phone, charger; Title Case): requests are not pointers, demonstratives are, refusals are not', () => {
  const run = (f: typeof FAMILIES[number], last: string, on: boolean) => {
    vi.stubEnv('CONSULT_THREAD_AWARE_ASK', on ? '1' : '0')
    return routeConsult([{ role: 'user', content: f.first }, { role: 'assistant', content: card(f.shown, false) }, { role: 'user', content: last }], { hasGps: false, lang: 'vi' }).decision
  }
  for (const f of FAMILIES) {
    it(`${f.name}: a new request that reuses the title's words reads like OFF`, () => {
      const on = run(f, f.request, true)
      expect(on.evidence).toBeUndefined(); expect(on).toEqual(run(f, f.request, false))
    })
    it(`${f.name}: "${f.pointer}" continues exactly the product it names`, () => {
      expect(run(f, f.pointer, true)).toMatchObject({ turn: 'followup', evidence: 'shown_card', refers: [f.shown[f.refers]] })
    })
    it(`${f.name}: a refusal ("${f.negated}") does not select it`, () => {
      const d = run(f, f.negated, true)
      expect(d.evidence).toBeUndefined(); expect(d.turn === 'followup' && (d.refers ?? []).length > 0).toBe(false)
    })
    it(`${f.name}: "${f.plain}" with the product named and a demonstrative is a pointer too`, () => {
      expect(run(f, f.plain, true).evidence).toBe('shown_card')
    })
  }
})

describe('KNOWN LIMIT (characterisation): a pointer whose message names ANOTHER product family falls back to the old reading', () => {
  it('"cái Oppo đó có sạc nhanh không" after a card of phones: "sạc" makes the message a charger message, so the phone card is not evidence - the flag-ON turn equals OFF (safe side: nothing is assumed)', () => {
    const phones = ['Điện Thoại Chụp Ảnh Đẹp Samsung Galaxy S25 Ultra', 'Điện Thoại Chụp Ảnh Đẹp Xiaomi 15 Ultra', 'Điện Thoại Chụp Ảnh Đẹp Oppo Find X8 Pro', 'Điện Thoại Chụp Ảnh Đẹp Vivo X200 Pro']
    const on = route(phones, 'cái Oppo đó có sạc nhanh không', true, false), off = route(phones, 'cái Oppo đó có sạc nhanh không', false, false)
    expect(on.evidence).toBeUndefined(); expect(on).toEqual(off)
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
  // (no refusal word here: the conflict check is the ONLY thing that can stop these)
  for (const msg of ['cái UAG đó nhưng mình muốn dòng Monarch', 'cái UAG đó nhưng mình cần loại Pathfinder']) {
    for (const bold of [true, false]) {
      it(`"${msg}" (${bold ? 'bold' : 'plain'}): the user names another line than the shown product's - not a pointer to it`, () => {
        const d = route(ONE_UAG, msg, true, bold)
        expect(d.evidence).toBeUndefined()
        expect(d.turn === 'followup' && (d.refers ?? []).includes(ONE_UAG[2])).toBe(false)
      })
    }
  }
  it('titleConflictsWithMessage: another line, a negated requirement the product carries; not a plain question about it', () => {
    expect(titleConflictsWithMessage('cái UAG đó nhưng mình muốn dòng Monarch', ONE_UAG[2], false)).toBe(true)
    expect(titleConflictsWithMessage('cái UAG đó nhưng không có magsafe', ONE_UAG[2], false)).toBe(true)
    expect(titleConflictsWithMessage('cái UAG đó có magsafe không', ONE_UAG[2], false)).toBe(false)
    expect(titleConflictsWithMessage('cái UAG đó', ONE_UAG[2], false)).toBe(false)
  })
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

describe('F-A4b · a plan, "xem thêm" or a comparison that names a shown product keeps its own turn at the second call site (never a pointer)', () => {
  for (const msg of ['chốt cái UAG đó, lên kế hoạch chi tiết', 'xem thêm mẫu như cái UAG đó', 'so sánh cái UAG đó với cái Spigen kia']) {
    it(`"${msg}": the same decision as OFF, no shown_card evidence`, () => {
      const on = route(ONE_UAG, msg, true, false), off = route(ONE_UAG, msg, false, false)
      expect(on.evidence).toBeUndefined()
      expect(on).toEqual(off)
    })
  }
})

describe('F-A5 · NFC: a title or a message typed in decomposed Unicode reads the same as the composed form', () => {
  it('resolves identically, and to the product (not to "none" on both sides)', () => {
    const nfd = (s: string) => s.normalize('NFD')
    const shown = ['Tai nghe Sony Đen Chống Ồn', 'Tai nghe Bose Trắng Chống Ồn', 'Tai nghe JBL Tune Xanh', 'Tai nghe Marshall Kem']
    for (const msg of ['lấy cái Bose trắng đó', 'cái màu trắng đó']) {
      const a = resolveShownReference(nfd(msg), shown.map(nfd)), b = resolveShownReference(msg.normalize('NFC'), shown.map(s => s.normalize('NFC')))
      expect(a).toEqual(b)
      expect(a.kind, msg).not.toBe('none')
    }
    expect(resolveShownReference(nfd('lấy cái Bose đó'), shown.map(nfd))).toMatchObject({ kind: 'one', titles: [shown[1]] })
    // the diacritics of a demonstrative typed decomposed ("đó" = d-stroke + o + acute) still points
    expect(resolveShownReference(nfd('JBL đó'), shown.map(nfd)).kind).toBe('one')
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
    for (const msg of ['điện thoại Samsung đó', 'điện thoại Anker này', 'tìm điện thoại Baseus đó']) {
      const withCard = reconcileAsk(phoneAsk, { userTexts: [msg], shownTitles: CHARGERS, lunaKnown: {}, gps: false })
      const without = reconcileAsk(phoneAsk, { userTexts: [msg], shownTitles: [], lunaKnown: {}, gps: false })
      expect(withCard.report.resolved, msg).toEqual(without.report.resolved)
      expect(withCard.report.reference, msg).toBe('none')
    }
  })
  it('the same card IS evidence for a message of its own family (so the test above is not vacuous)', () => {
    const chargerAsk: ConsultDecision = { ...phoneAsk, known: { san_pham: 'củ sạc' } }
    const r = reconcileAsk(chargerAsk, { userTexts: ['củ sạc Anker này'], shownTitles: CHARGERS, lunaKnown: {}, gps: false })
    expect(r.report.reference).toBe('one')
  })
})
