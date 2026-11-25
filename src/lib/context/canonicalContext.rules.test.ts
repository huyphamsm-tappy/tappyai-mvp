import { describe, it, expect } from 'vitest'
import { chooseCurrentLocation, resolveCanonicalContext, toResolvedContext, type LocationEvidence } from './canonicalContext'
import { canonicalSystemLine, canonicalTrace, canonicalTurn } from './routeBridge'
import { findGeoMentions, locateByCoords } from './geoGazetteer'
import { explicitLanguageRequest, resolveLanguageLayers, stripLanguageInstruction } from './languageLayers'
import { noTranslateEntities } from './noTranslate'
import { formatMoney, isValidLocaleTag, isValidTimeZone, marketFormat, presentConversion } from './localeFormat'

const gps = (lat: number, lng: number, extra: Partial<LocationEvidence> = {}): LocationEvidence => ({ source: 'GPS', latitude: lat, longitude: lng, consentGranted: true, ...extra })
const ip = (lat: number, lng: number): LocationEvidence => ({ source: 'IP_ESTIMATE', latitude: lat, longitude: lng })
const HANOI = gps(21.03, 105.85)
const TOKYO = gps(35.66, 139.7)

describe('rule: an IP estimate is weak and never beats GPS or a chosen area', () => {
  it('GPS beats IP whatever the order', () => {
    expect(chooseCurrentLocation([ip(35.66, 139.7), HANOI]).source).toBe('GPS')
    expect(chooseCurrentLocation([HANOI, ip(35.66, 139.7)]).source).toBe('GPS')
    expect(chooseCurrentLocation([ip(35.66, 139.7), HANOI]).cityId).toBe('vn-hanoi')
  })
  it('a profile and an IP estimate are capped: they never read as a fix', () => {
    expect(chooseCurrentLocation([{ source: 'IP_ESTIMATE', countryCode: 'VN', confidence: 0.99 }]).confidence).toBeLessThanOrEqual(0.4)
    expect(chooseCurrentLocation([{ source: 'PROFILE', countryCode: 'VN', confidence: 0.99 }]).confidence).toBeLessThanOrEqual(0.6)
  })
  it('an area the person STATES beats a GPS fix in another city; the same city keeps the fix', () => {
    const other = resolveCanonicalContext({ text: 'Tôi đang ở Đà Nẵng, quán nào ngon gần đây?', locations: [HANOI] })
    expect(other.currentLocation.source).toBe('USER_SELECTED')
    expect(other.serviceTarget.cityId).toBe('vn-danang')
    const same = resolveCanonicalContext({ text: 'Tôi đang ở Hà Nội, quán nào ngon gần đây?', locations: [HANOI] })
    expect(same.currentLocation.source).toBe('GPS')
  })
  it('an IP estimate alone never settles a "near me" question: no resolved target, a question is needed', () => {
    const c = resolveCanonicalContext({ text: 'Quán phở nào gần đây?', locations: [ip(21.03, 105.85)] })
    expect(['EXPLICIT', 'RESOLVED']).not.toContain(c.serviceTarget.resolution)
    expect(c.ambiguity.map(a => a.code)).toContain('NEEDS_PRECISE_LOCATION')
    expect(c.status).toBe('UNRESOLVED')
  })
  it('GPS the person did not consent to is not evidence', () => {
    expect(chooseCurrentLocation([gps(21.03, 105.85, { consentGranted: false })]).source).toBe('UNKNOWN')
  })
})

describe('rule: a location is never guessed from the language', () => {
  it.each([
    '我是中国人，附近有什么好吃的？', 'I am Chinese, where is good pho nearby?', 'Tôi là người Nhật, quán nào gần đây?', '私は日本人です。近くのレストランは？', '나는 한국인입니다. 근처 식당?',
  ])('%s: no location, no target', text => {
    const c = resolveCanonicalContext({ text })
    expect(c.currentLocation).toEqual({ source: 'UNKNOWN' })
    expect(c.serviceTarget.resolution).toBe('UNRESOLVED')
    expect(c.serviceTarget.countryCode).toBeUndefined()
  })
  it('a nationality, a cuisine or a language is not a place ("中国人", "越南菜", "người Hà Nội")', () => {
    for (const t of ['我是中国人', '我想吃越南菜', '我会说越南语', 'Tôi là người Hà Nội', 'a citizen of Japan']) expect(findGeoMentions(t).every(m => m.role === 'NONLOCATIVE'), t).toBe(true)
  })
  it('the language layers carry no place at all', () => {
    expect(Object.keys(resolveLanguageLayers({ text: '你好' })).sort()).toEqual(['processingLanguage', 'queryLanguage', 'responseLocale', 'sourceLanguages'])
  })
})

describe('rule: the response locale - the explicit choice wins over detection unless the person asks otherwise', () => {
  it('explicit request > chosen locale > detected query language', () => {
    expect(resolveLanguageLayers({ text: 'Quán phở ngon ở Hà Nội', chosenLocale: 'en' }).responseLocale).toEqual({ code: 'en', source: 'USER_CHOICE' })
    expect(resolveLanguageLayers({ text: 'Answer in Vietnamese: best pho in Hanoi', chosenLocale: 'en' }).responseLocale).toEqual({ code: 'vi', source: 'EXPLICIT_REQUEST' })
    expect(resolveLanguageLayers({ text: 'Best pho in Hanoi' }).responseLocale).toEqual({ code: 'en', source: 'QUERY' })
  })
  it('a chosen locale beats detection of a different language in the question', () => {
    expect(resolveLanguageLayers({ text: '河内有什么好吃的', chosenLocale: 'vi' }).responseLocale.code).toBe('vi')
  })
  it('"answer in English" holds for the thread until the person asks otherwise; the nearest request wins', () => {
    expect(resolveLanguageLayers({ text: 'Quán phở nào ngon', priorUserTexts: ['Answer in English please'] }).responseLocale.code).toBe('en')
    expect(resolveLanguageLayers({ text: 'Quán phở nào ngon', priorUserTexts: ['Answer in English please', 'Trả lời bằng tiếng Việt'] }).responseLocale.code).toBe('vi')
  })
  it('a UI locale is only a hint: a clear question language beats it; with nothing clear it is used', () => {
    expect(resolveLanguageLayers({ text: 'Quán phở ngon ở Hà Nội', uiLocale: 'en-US' }).responseLocale.code).toBe('vi')
    expect(resolveLanguageLayers({ text: 'ok', uiLocale: 'en-US' }).responseLocale).toEqual({ code: 'en', source: 'CLIENT_HINT' })
  })
  it('Chinese, Vietnamese and English explicit requests are read; the instruction is cut out before the question language is read', () => {
    expect(explicitLanguageRequest('用中文回答：xin chào')?.code).toBe('zh')
    expect(explicitLanguageRequest('请用英文回复')?.code).toBe('en')
    expect(explicitLanguageRequest('Trả lời bằng tiếng Anh: abc')?.code).toBe('en')
    expect(explicitLanguageRequest('answer in English')?.code).toBe('en')
    expect(explicitLanguageRequest('Quán phở nào ngon?')).toBeNull()
    expect(stripLanguageInstruction('用中文回答：Phở Thìn Hà Nội có gì đặc biệt?')).toBe('Phở Thìn Hà Nội có gì đặc biệt?')
    expect(resolveLanguageLayers({ text: '用中文回答：Phở Thìn Hà Nội có gì đặc biệt?' }).queryLanguage?.code).toBe('vi')
  })
  it('the processing language is advisory and never claims to control the model', () => {
    const p = resolveLanguageLayers({ text: 'Best pho in Hanoi' }).processingLanguage
    expect(p.advisory).toBe(true)
    expect(p.controlsModel).toBe(false)
  })
  it('source languages are a hint from the target country', () => {
    expect(resolveLanguageLayers({ text: 'x', targetCountry: 'TH' }).sourceLanguages).toEqual(['th', 'en'])
    expect(resolveLanguageLayers({ text: 'x' }).sourceLanguages).toEqual([])
  })
})

describe('rule: cross-border is a derived property, never a block', () => {
  it('Hanoi -> Bangkok is cross-border, with the basis, and is fully resolved (no refusal field, no unresolved status)', () => {
    const c = resolveCanonicalContext({ text: 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình', locations: [HANOI] })
    expect(c.crossBorder).toBe(true)
    expect(c.crossBorderBasis).toEqual(['LOCATION_VS_TARGET', 'MARKET_VS_TARGET'])
    expect(c.status).not.toBe('UNRESOLVED')
    expect(c.ambiguity.filter(a => a.blocking)).toEqual([])
    expect(Object.keys(c).some(k => /block|deny|refus|allowed/i.test(k))).toBe(false)
  })
  it('the same city is not cross-border; a missing market and a missing location mean "cannot derive", not true', () => {
    expect(resolveCanonicalContext({ text: 'Quán phở nào ngon ở Hà Nội', locations: [HANOI] }).crossBorder).toBe(false)
    expect(resolveCanonicalContext({ text: 'Cafe in Bangkok', userMarketId: null }).crossBorder).toBe(false)
  })
  it('it is derived from the relation, not from the language: Tokyo GPS asking about Tokyo in Vietnamese is cross-border only against the service market', () => {
    const c = resolveCanonicalContext({ text: 'Quán cà phê ở Shibuya', locations: [TOKYO] })
    expect(c.crossBorderBasis).toEqual(['MARKET_VS_TARGET'])
  })
  it('the contract has no field the gate could read: the service/user market is not replaced by the target', () => {
    const c = resolveCanonicalContext({ text: 'Best restaurants in Bangkok', userMarketId: 'vn' })
    expect(c.serviceTarget.marketId).toBeUndefined() // Bangkok has no served market in the registry: nothing is "switched"
    expect(c.serviceTarget.countryCode).toBe('TH')
  })
})

describe('Geo Entity Resolution (R13 3.4)', () => {
  it('is diacritic- and case-insensitive and finds vi / en / zh names of the same place', () => {
    for (const t of ['Hà Nội', 'ha noi', 'HÀ NỘI', 'Hanoi', '河内']) expect(findGeoMentions(`đi ${t} nhé`)[0]?.candidates[0].id, t).toBe('vn-hanoi')
    for (const t of ['Bangkok', 'bang kok', '曼谷']) expect(findGeoMentions(`trip to ${t}`)[0]?.candidates[0].id, t).toBe('th-bangkok')
  })
  it('an ordinary word that is a Vietnamese place without its tone marks is not matched ("hue"), the real one is ("Huế")', () => {
    expect(findGeoMentions('a soft hue of blue')).toEqual([])
    expect(findGeoMentions('đi Huế chơi')[0].candidates[0].id).toBe('vn-hue')
  })
  it('an ambiguous name returns every candidate and is not resolved', () => {
    const m = findGeoMentions('đi Victoria')[0]
    expect(m.candidates.length).toBeGreaterThan(2)
    expect(new Set(m.candidates.map(c => c.country)).size).toBeGreaterThan(2)
  })
  it('the original name is kept (Thai script for Bangkok) and a Latin form is shown beside it', () => {
    const c = resolveCanonicalContext({ text: 'Best restaurants in Bangkok' })
    expect(c.serviceTarget.displayNameOriginal).toBe('กรุงเทพมหานคร')
  })
  it('GPS to city: nearest city within its radius; a far point is unknown, a Vietnamese point outside every city is still Viet Nam', () => {
    expect(locateByCoords(35.66, 139.7).cityId).toBe('jp-tokyo')
    expect(locateByCoords(13.75, 100.5).countryCode).toBe('TH')
    expect(locateByCoords(21.5, 105.2).countryCode).toBe('VN')
    expect(locateByCoords(0, -30)).toEqual({})
    expect(locateByCoords(Number.NaN, 1)).toEqual({})
  })
})

describe('the route bridge: one trace line (counts only) and at most one fact line', () => {
  it('Hanoi -> Bangkok: the line states the target, the role of the current location and says it is not a refusal', () => {
    const t = canonicalTurn({ text: 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình', locations: [HANOI] })
    expect(t.systemLine).toContain('Bangkok')
    expect(t.systemLine).toContain('Thailand')
    expect(t.systemLine).toContain('Hà Nội')
    expect(t.systemLine).toContain("the person's own words override it")
    expect(t.systemLine).toContain('not a refusal')
    expect((t.systemLine ?? '').split('\n').length).toBe(1)
  })
  it('no line when the target is where the model already assumes (Hồ Gươm for a person in Hanoi; nearby with GPS; general knowledge; no place)', () => {
    for (const [text, loc] of [['Quán phở nào ngon gần Hồ Gươm?', [HANOI]], ['Quán cà phê nào gần đây?', [HANOI]], ['Phở có từ bao giờ? Giải thích giúp mình', []], ['Giá vàng hôm nay', []], ['Quán ăn ngon ở Hà Nội', []], ['Cafe in Shibuya', [TOKYO]]] as const) {
      expect(canonicalTurn({ text, locations: loc }).systemLine, text).toBeNull()
    }
  })
  it('a language line only when the person asked for a reply language that differs from the question language', () => {
    expect(canonicalTurn({ text: '用中文回答：Phở Thìn Hà Nội có gì đặc biệt?' }).systemLine).toContain('Reply language: Simplified Chinese')
    expect(canonicalTurn({ text: 'Trả lời bằng tiếng Anh: giá thuê mặt bằng ở quận 1 TP.HCM hiện nay' }).systemLine).toContain('Reply language: English')
    expect(canonicalTurn({ text: 'Best pho in Hanoi' }).systemLine).toBeNull()
    expect(canonicalTurn({ text: 'Answer in English: best pho in Hanoi' }).systemLine).toBeNull() // already English: nothing to tell
  })
  it('an ambiguous or low-confidence target is not told to the model', () => {
    expect(canonicalTurn({ text: 'Best cafes in Cambridge', locations: [HANOI] }).systemLine).toBeNull()
    expect(canonicalTurn({ text: 'Quán ăn nào gần đây?', locations: [ip(35.66, 139.7)] }).systemLine).toBeNull()
  })
  it('the trace carries codes and counts only, never the text or a place the person typed', () => {
    const text = 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình'
    const trace = canonicalTrace(resolveCanonicalContext({ text, locations: [HANOI] }))
    const json = JSON.stringify(trace)
    expect(trace.type).toBe('tappyai_canonical_context')
    expect(Object.keys(trace).sort()).toEqual(['ambiguity_count', 'cross_border', 'inherited', 'intent', 'location_role', 'location_source', 'query_lang', 'response_lang', 'response_source', 'status', 'target_country', 'target_resolved', 'type'])
    for (const needle of ['Bangkok', 'Hà Nội', 'ngày', '21.03', '105.85']) expect(json).not.toContain(needle)
    expect(trace).toMatchObject({ intent: 'TRAVEL_PLANNING', target_resolved: true, target_country: 'TH', location_source: 'GPS', cross_border: true, ambiguity_count: 0, query_lang: 'vi', response_lang: 'vi' })
  })
})

describe('no-translate entities (R13 7.2) and the contract shape (3.5)', () => {
  it('places, dishes, brands and addresses are listed as written', () => {
    const e = noTranslateEntities('Quán Phở Thìn ở 13 Lò Đúc, Hà Nội, gần Highlands Coffee, thử bún chả và cà phê trứng nhé')
    const by = (k: string) => e.filter(x => x.kind === k).map(x => x.text.toLowerCase())
    expect(by('DISH')).toEqual(expect.arrayContaining(['phở', 'bún chả', 'cà phê trứng']))
    expect(by('PLACE')).toContain('hà nội')
    expect(by('BRAND')).toContain('highlands coffee')
    expect(by('ADDRESS').some(a => a.startsWith('13 lò đúc'))).toBe(true)
  })
  it('toResolvedContext fills the R13 ResolvedContext fields', () => {
    const c = resolveCanonicalContext({ text: 'Mình ở Hà Nội, muốn đi Bangkok 5 ngày, gợi ý lịch trình', locations: [HANOI] })
    const r = toResolvedContext(c, { requestId: 'req-1', now: new Date('2026-11-12T00:00:00Z') })
    expect(r).toMatchObject({ requestId: 'req-1', intentHint: 'TRAVEL_PLANNING', preferredLocale: 'vi', detectedQueryLocale: 'vi', contextVersion: 'r13-canonical-context-1', resolvedAt: '2026-11-12T00:00:00.000Z' })
    expect(r.travelContext?.destinations[0].cityId).toBe('th-bangkok')
    expect(r.targetResolutionEvidenceIds).toContain('geo:th-bangkok')
    expect(r.sourceLocaleHints).toEqual(['th', 'en'])
  })
  it('the resolver is pure: the same input twice is the same output', () => {
    const input = { text: 'Compare Hanoi and Bangkok for a 3-day city break', locations: [HANOI] }
    expect(resolveCanonicalContext(input)).toEqual(resolveCanonicalContext(input))
  })
  it('the placeLabel of a non-Latin place shows a Latin form beside the original', () => {
    expect(canonicalSystemLine(resolveCanonicalContext({ text: 'Mình ở Hà Nội, muốn đi Tokyo 5 ngày, gợi ý lịch trình' }))).toContain('Tokyo (東京)')
  })
})

describe('locale formatting (R13 7.3)', () => {
  it('validates BCP 47 and IANA names; market defaults come from the registry', () => {
    expect(isValidLocaleTag('vi-VN')).toBe(true)
    expect(isValidLocaleTag('not a locale')).toBe(false)
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
    expect(marketFormat('vn')).toEqual({ locale: 'vi-VN', currency: 'VND', timeZone: 'Asia/Ho_Chi_Minh' })
    expect(marketFormat('xx')).toBeNull()
  })
  it('money keeps its own currency; VND has no minor unit', () => {
    expect(formatMoney(150000, 'VND', 'vi-VN')).toMatch(/150\.000/)
    expect(formatMoney(12.5, 'USD', 'en-US')).toBe('$12.50')
    expect(() => formatMoney(1, 'dong', 'vi-VN')).toThrow()
  })
  it('a conversion is only presentable with its rate, source and timestamp; the original stays untouched', () => {
    const p = presentConversion({ amount: 10, currency: 'USD' }, 'VND', { value: 25000, source: 'test-feed', asOf: '2026-11-12T00:00:00Z' })
    expect(p.original).toEqual({ amount: 10, currency: 'USD' })
    expect(p.converted).toEqual({ amount: 250000, currency: 'VND' })
    expect(p.rateSource).toBe('test-feed')
    expect(() => presentConversion({ amount: 10, currency: 'USD' }, 'VND', { value: 25000, source: '', asOf: '2026-11-12T00:00:00Z' })).toThrow()
    expect(() => presentConversion({ amount: 10, currency: 'USD' }, 'VND', { value: 25000, source: 's', asOf: 'yesterday' })).toThrow()
  })
})
