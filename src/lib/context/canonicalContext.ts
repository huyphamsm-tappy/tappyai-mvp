// R13 §3.3 Context resolution precedence + §3.5 Canonical Context Contract. Pure and deterministic: no model, no network, no clock, no Node import (browser-safe).
//
//   resolveCanonicalContext(input) -> the service target, the ROLE of the current location, the intent class, the four language layers, a confidence and an `ambiguity` list
//   (what a clarifying question would NEED). It never asks anything itself and it never blocks anything: CROSS_BORDER is a PROPERTY derived from the relation between the current
//   location, the user/service market and the target (R13 §3.3), not an intent and not a refusal.
//
// Rules that matter (each is mutation-checked in canonicalContext.rules.test.ts):
//   · a location fact is never read from the language ("我是中国人" says nothing about where the person is);
//   · an IP estimate is a weak source: it never beats GPS or an area the person chose, and it alone never settles a "near me" question;
//   · GPS without consent is not evidence;
//   · the person's explicit "answer in <language>" wins the response locale; a chosen locale beats detection;
//   · several reasonable places = an ambiguity with candidates; nothing is guessed.

import { DEFAULT_REGISTRY } from '@/lib/market/marketGate'
import { detectPlanningIntent, detectTripLength } from '@/lib/ai/intent'
import { COUNTRIES, findGeoMentions, foldText, geoEntityById, locateByCoords, type GeoEntity, type GeoMention } from './geoGazetteer'
import { resolveLanguageLayers, type LanguageLayers, type LocaleTag } from './languageLayers'
import { noTranslateEntities, type NoTranslateEntity } from './noTranslate'

// ---------------------------------------------------------------- R13 §3.5 types, as R13 writes them
export type { LocaleTag }
export type CountryCode = string      // ISO 3166-1 alpha-2
export type MarketId = string         // internal market identifier
export type Confidence = number       // 0..1, calibrated by source policy

export interface LocationEvidence {
  countryCode?: CountryCode
  regionId?: string
  cityId?: string
  latitude?: number
  longitude?: number
  source: 'GPS' | 'USER_SELECTED' | 'IP_ESTIMATE' | 'PROFILE' | 'UNKNOWN'
  confidence?: Confidence
  observedAt?: string
  consentGranted?: boolean
}

export interface ServiceTarget {
  marketId?: MarketId
  countryCode?: CountryCode
  regionId?: string
  cityId?: string
  placeEntityId?: string
  displayNameOriginal?: string
  resolution: 'EXPLICIT' | 'RESOLVED' | 'INFERRED' | 'UNRESOLVED'
  confidence?: Confidence
}

export type IntentCategory =
  | 'NEARBY_DISCOVERY'
  | 'EXPLICIT_DESTINATION'
  | 'TRAVEL_PLANNING'
  | 'GENERAL_INFORMATION'
  | 'CURRENT_INFORMATION'
  | 'UNKNOWN'

export interface ResolvedContext {
  requestId: string
  userId?: string // derived from verified auth context, never trusted from body
  installationCountry?: CountryCode
  homeMarketId?: MarketId // loaded from trusted profile if available
  currentLocation: LocationEvidence
  preferredLocale: LocaleTag
  detectedQueryLocale?: LocaleTag
  sourceLocaleHints: LocaleTag[]
  serviceTarget: ServiceTarget
  intentHint: IntentCategory
  contextResolutionStatus: 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'UNRESOLVED'
  contextVersion: string
  targetResolutionEvidenceIds: string[]
  travelContext?: {
    origin?: ServiceTarget
    destinations: ServiceTarget[]
    startDate?: string
    endDate?: string
  }
  backendProcessingRegion: string
  resolvedAt: string
}

// ---------------------------------------------------------------- this module's own types
export const CONTEXT_VERSION = 'r13-canonical-context-1'

/** R13 §3.3 "Current Location role" column, plus ELIGIBILITY for the legal/eligibility checks of a cross-border question. */
export type LocationRole = 'PRIMARY_RADIUS' | 'SECONDARY' | 'ORIGIN' | 'ELIGIBILITY' | 'NOT_USED'

export interface Ambiguity {
  code: 'AMBIGUOUS_PLACE' | 'NEEDS_PRECISE_LOCATION' | 'LOCATION_ESTIMATE_ONLY' | 'DESTINATION_MISSING' | 'TRAVEL_DURATION_MISSING'
  /** what a clarifying question would need, in words */
  need: string
  candidates?: string[]
  /** true = the intent cannot be served without it; false = the answer can proceed and may ask */
  blocking: boolean
}

export interface CanonicalContextInput {
  /** the person's current message */
  text: string
  /** the person's earlier messages, oldest first (a follow-up keeps the earlier target) */
  priorUserTexts?: readonly string[]
  /** every location evidence available (GPS, a chosen area, profile, IP estimate); the best one is chosen by source policy, never by order */
  locations?: readonly LocationEvidence[]
  /** the user/service market of the request (the MARKET_GATE input); default 'vn' */
  userMarketId?: MarketId | null
  /** the locale the person chose (a saved setting) */
  chosenLocale?: LocaleTag | null
  /** the client UI locale: a hint only */
  uiLocale?: LocaleTag | null
  defaultLocale?: LocaleTag
}

export interface CanonicalContext {
  version: typeof CONTEXT_VERSION
  intent: IntentCategory
  /** why the intent was chosen (cue names, never text) */
  signals: string[]
  currentLocation: LocationEvidence
  currentLocationRole: LocationRole
  serviceTarget: ServiceTarget
  travelContext?: { origin?: ServiceTarget; destinations: ServiceTarget[] }
  /** more than one place was asked about (a comparison or a multi-stop trip); serviceTarget is then the first one, INFERRED */
  multiTarget: boolean
  /** places named but not a service target (general knowledge about a place) */
  mentionedPlaceIds: string[]
  /** derived property, never a block */
  crossBorder: boolean
  crossBorderBasis: Array<'LOCATION_VS_TARGET' | 'MARKET_VS_TARGET'>
  /** the question is about entry / visa / legal eligibility */
  eligibilityCheck: boolean
  /** the target (or destinations) were carried from an earlier turn */
  inherited: boolean
  languages: LanguageLayers
  status: ResolvedContext['contextResolutionStatus']
  confidence: Confidence
  ambiguity: Ambiguity[]
  evidenceIds: string[]
  /** names that must not be translated (R13 §7.2) */
  noTranslate: NoTranslateEntity[]
}

// ---------------------------------------------------------------- current location (source policy)
const SOURCE_RANK: Record<LocationEvidence['source'], number> = { USER_SELECTED: 4, GPS: 3, PROFILE: 2, IP_ESTIMATE: 1, UNKNOWN: 0 }
const SOURCE_DEFAULT_CONF: Record<LocationEvidence['source'], number> = { USER_SELECTED: 0.9, GPS: 0.95, PROFILE: 0.5, IP_ESTIMATE: 0.3, UNKNOWN: 0 }
/** an IP estimate and a profile are CAPPED: no claim of theirs can read as a fix */
const SOURCE_CONF_CAP: Record<LocationEvidence['source'], number> = { USER_SELECTED: 1, GPS: 1, PROFILE: 0.6, IP_ESTIMATE: 0.4, UNKNOWN: 0 }
export const STRONG_LOCATION_SOURCES: ReadonlyArray<LocationEvidence['source']> = ['GPS', 'USER_SELECTED']

function usableEvidence(e: LocationEvidence): LocationEvidence | null {
  if (e.source === 'UNKNOWN') return null
  if (e.source === 'GPS' && e.consentGranted === false) return null // R13 §3.5: GPS requires consent
  const out: LocationEvidence = { ...e }
  if ((out.latitude !== undefined && out.longitude !== undefined) && (!out.countryCode || !out.cityId)) {
    const at = locateByCoords(out.latitude, out.longitude)
    if (!out.countryCode && at.countryCode) out.countryCode = at.countryCode
    if (!out.cityId && at.cityId) out.cityId = at.cityId
  }
  out.confidence = Math.min(out.confidence ?? SOURCE_DEFAULT_CONF[out.source], SOURCE_CONF_CAP[out.source])
  return out
}

/** Source policy: USER_SELECTED > GPS > PROFILE > IP_ESTIMATE; a stated area in the same city as a GPS fix keeps the fix (its coordinates serve the radius). Pure. */
export function chooseCurrentLocation(candidates: readonly LocationEvidence[]): LocationEvidence {
  const ok = candidates.map(usableEvidence).filter((e): e is LocationEvidence => e !== null)
  if (ok.length === 0) return { source: 'UNKNOWN' }
  ok.sort((a, b) => SOURCE_RANK[b.source] - SOURCE_RANK[a.source] || (b.confidence ?? 0) - (a.confidence ?? 0))
  const top = ok[0]
  if (top.source === 'USER_SELECTED') {
    const gps = ok.find(e => e.source === 'GPS' && (top.cityId ? e.cityId === top.cityId : !!top.countryCode && e.countryCode === top.countryCode))
    if (gps) return gps
  }
  return top
}

// ---------------------------------------------------------------- intent cues (Vietnamese and English on folded text, Chinese on the raw text)
const rx = (s: string) => new RegExp(s, 'u')
const NEARBY_GENERIC_F = rx('\\b(?:gan day|gan toi|gan minh|gan cho (?:toi|minh)|quanh day|xung quanh day|khu vuc nay|gan nhat|near me|nearby|around here|close by|nearest|around me|near here|close to me|near my)\\b')
const NEARBY_GENERIC_ZH = /附近|周边|周围|最近的|这附近|身边|离我/u
const SERVICE_VENUE = rx('\\b(?:quan(?!\\s+\\d)|nha hang|nhahang|an gi|an uong|di an|an sang|an trua|an toi|an vat|do an|cafe|ca phe|khach san|nha nghi|homestay|resort|hostel|tour|mua sam|spa|bar|pub|karaoke|massage|tiem|cua hang|sieu thi|cho dem|diem tham quan|rap phim|restaurants?|food|eat|eating|dinner|lunch|breakfast|brunch|cafes?|coffee|hotels?|hostels?|bars?|pubs?|shops?|shopping|mall|market|bakery|attractions?|things to do|sightseeing|nightlife|street food|tours?)\\b')
const SERVICE_VENUE_ZH = /好吃|美食|餐厅|餐馆|饭店|咖啡|酒店|旅馆|民宿|景点|购物|小吃|按摩|夜生活|越南菜|吃的|吃什么|吃饭/u
const DISH_F = rx('\\b(?:pho|bun|banh mi|banh|com tam|com|mi quang|hu tieu|lau|ramen|sushi|noodles?|pizza|bbq|seafood|hai san)\\b')
const ASK_F = rx('\\b(?:nao|o dau|dau|ngon|goi y|de xuat|recommend|best|where|which|good)\\b')
const ASK_ZH = /哪|推荐|好吃|哪里|什么/u
// a knowledge question about the WORLD ("why", "history", "explain"): beats a venue word that merely names a product ("tại sao Việt Nam xuất khẩu nhiều cà phê")
const GENERAL_STRONG_F = rx('\\b(?:tai sao|vi sao|lich su|y nghia|giai thich|nguon goc|why|history of|explain|meaning of|origin of)\\b')
const GENERAL_STRONG_ZH = /为什么|历史|意思|解释|来历/u
// weaker ("what is X", "có gì đặc biệt"): "what is the best restaurant in Hanoi" is still a place request, so these lose to a venue ask
const GENERAL_F = rx('\\b(?:la gi|khac nhau|co gi dac biet|what is|what are|difference between|tell me about|is it true)\\b')
const GENERAL_ZH = /是什么|区别|有什么特别|有什么特色/u
const CURRENT_HARD_F = rx('\\b(?:gia|ty gia|thoi tiet|tin tuc|price|prices|rate|rates|weather|news|forecast|latest|moi nhat|how much|bao nhieu|cost)\\b')
const CURRENT_HARD_ZH = /汇率|价格|天气|新闻|最新|现价|多少钱|行情/u
const CURRENT_SOFT_F = rx('\\b(?:hien nay|hien tai|bay gio|hom nay|ngay mai|dem nay|tuan nay|today|tonight|now|currently|right now|this week|this weekend|open now|mo cua)\\b')
const CURRENT_SOFT_ZH = /现在|目前|今天|明天|今晚|本周|营业/u
const LOC_DEP_F = rx('\\b(?:thoi tiet|weather|forecast|traffic|ket xe|nhiet do|o nhiem|air quality|o day|tai day|here|where i am|open now|mo cua)\\b')
const LOC_DEP_ZH = /天气|这里|这儿|当地|营业|堵车/u
const STRONG_PLAN_F = rx('\\b(?:lich trinh|ke hoach (?:du lich|chuyen di|di choi|trip)|itinerary|plan (?:a|my|our|the) (?:trip|holiday|vacation|visit)|trip plan|city break|goi y lich|lap lich|travel plan|holiday plan)\\b')
const STRONG_PLAN_ZH = /行程|旅行计划|旅游计划|旅游攻略|攻略|玩几天|游玩|安排/u
const GO_F = rx('\\b(?:di|den|toi|ghe|bay|du lich|tham quan|chuyen di|travel|trip|visit|going to|go to|fly to|flying to|head to|heading to|vacation|holiday|getting to|get to|how to get|directions? to|chi duong|duong di|nhap canh|xuat canh|enter|entering|cross|crossing|arrive in|arriving in|moving to|move to|relocate to|land in|landing in)\\b')
const GO_ZH = /去|到|飞|旅游|旅行|游|出发|入境|出境|前往|怎么走|导航/u
const ELIGIBILITY_F = rx('\\b(?:visa|thu tuc|ho chieu|passport|nhap canh|xuat canh|entry requirements?|immigration|customs|border|cua khau|giay phep|mien visa|work permit|thi thuc)\\b')
const ELIGIBILITY_ZH = /签证|手续|入境|出境|护照|海关|边境|口岸|通关|免签|许可/u
const HERE_ORIGIN_F = rx('\\b(?:tu day|tu cho (?:toi|minh)|tu vi tri|from here|from my location|from where i am|from my place)\\b')
const HERE_ORIGIN_ZH = /从这里|从这儿|从我这|从当前/u
const ANAPHORA_F = rx('\\b(?:o do|tai do|thi sao|there|that place|what about|how about|and there|con (?:o|tai))\\b')
const ANAPHORA_ZH = /那里|那边|那儿|那呢|呢[?？]?$/u

// ---------------------------------------------------------------- targets
const marketOfCountry = (cc: string | undefined): MarketId | undefined => cc ? DEFAULT_REGISTRY.markets.find(m => m.countryCode === cc)?.marketId : undefined
const countryOfMarket = (m: string | null | undefined): CountryCode | undefined => m ? DEFAULT_REGISTRY.markets.find(x => x.marketId === m)?.countryCode : undefined

/** the readable label of a place: its original name always; a Latin form beside it when the original script is not Latin (R13 §7.2: the original is never replaced). */
export function placeLabel(e: GeoEntity): string {
  if (/^[\p{Script=Latin}\d\s().,'/-]+$/u.test(e.name)) return e.name
  const latin = e.names.find(n => /^[a-z ]+$/.test(n) && n.length > 3)
  if (!latin) return e.name
  return `${latin.replace(/\b\p{L}/gu, c => c.toUpperCase())} (${e.name})`
}
export const countryName = (cc: string | undefined): string => (cc && COUNTRIES[cc]?.name) || cc || ''

function toTarget(e: GeoEntity, resolution: ServiceTarget['resolution'], confidence: number): ServiceTarget {
  return {
    ...(marketOfCountry(e.country) ? { marketId: marketOfCountry(e.country) } : {}),
    countryCode: e.country,
    ...(e.cityId ? { cityId: e.cityId } : {}),
    ...(e.kind === 'district' || e.kind === 'place' ? { placeEntityId: e.id } : {}),
    displayNameOriginal: e.name,
    resolution, confidence,
  }
}

interface ResolvedMention { entity: GeoEntity; mention: GeoMention; resolution: 'EXPLICIT' | 'RESOLVED'; confidence: number }

/** R13 §3.4 steps 1-3 and 5: exact alias; the same city; contextual country; else an ambiguity (the caller asks). */
function resolveMentions(mentions: GeoMention[], contextCountries: Set<string>): { resolved: ResolvedMention[]; ambiguous: Array<{ mention: GeoMention; candidates: GeoEntity[] }> } {
  const resolved: ResolvedMention[] = []
  const ambiguous: Array<{ mention: GeoMention; candidates: GeoEntity[] }> = []
  const exact = mentions.filter(m => m.candidates.length === 1)
  for (const m of exact) resolved.push({ entity: m.candidates[0], mention: m, resolution: 'EXPLICIT', confidence: m.candidates[0].kind === 'country' ? 0.9 : 0.95 })
  const known = new Set<string>([...contextCountries, ...exact.map(m => m.candidates[0].country)])
  for (const m of mentions.filter(x => x.candidates.length > 1)) {
    const cityIds = new Set(m.candidates.map(c => c.cityId))
    if (cityIds.size === 1 && [...cityIds][0]) {
      // every reading lies in one city ("Hoàn Kiếm": the lake or the district): the city is certain, the exact spot is not asked
      const city = geoEntityById([...cityIds][0] as string)
      if (city) { resolved.push({ entity: city, mention: m, resolution: 'RESOLVED', confidence: 0.85 }); continue }
    }
    const byCountry = m.candidates.filter(c => known.has(c.country))
    if (byCountry.length === 1) { resolved.push({ entity: byCountry[0], mention: m, resolution: 'RESOLVED', confidence: 0.75 }); continue }
    ambiguous.push({ mention: m, candidates: m.candidates })
  }
  // a container (a country, or a city whose district/place is also named) is context, not a second target
  const keep = resolved.filter(r => {
    if (r.entity.kind === 'country') return !resolved.some(o => o !== r && o.entity.kind !== 'country' && o.entity.country === r.entity.country) && !ambiguous.some(a => a.candidates.some(c => c.country === r.entity.country))
    if (r.entity.kind === 'city') return !resolved.some(o => o !== r && (o.entity.kind === 'district' || o.entity.kind === 'place') && o.entity.cityId === r.entity.id)
    return true
  })
  keep.sort((a, b) => a.mention.start - b.mention.start)
  return { resolved: keep, ambiguous }
}

const uniqueById = (rs: ResolvedMention[]): ResolvedMention[] => { const seen = new Set<string>(); return rs.filter(r => (seen.has(r.entity.id) ? false : (seen.add(r.entity.id), true))) }

const labelOfCandidate = (e: GeoEntity): string => `${e.name} (${countryName(e.country)})`

// ---------------------------------------------------------------- the resolver
interface Draft { intent: IntentCategory; signals: string[]; intentConfidence: number }

export function resolveCanonicalContext(input: CanonicalContextInput): CanonicalContext {
  const text = input.text ?? ''
  const prior = input.priorUserTexts ?? []
  const marketId = input.userMarketId === undefined ? 'vn' : input.userMarketId
  const marketCountry = countryOfMarket(marketId)

  const folded = foldText(text)
  const raw = text
  const has = (f: RegExp, zh?: RegExp) => f.test(folded) || (zh ? zh.test(raw) : false)

  // ---- places named in the message
  const mentions = findGeoMentions(text).filter(m => m.role !== 'NONLOCATIVE')
  const stated = mentions.filter(m => m.role === 'STATED_LOCATION')
  const origins = mentions.filter(m => m.role === 'ORIGIN')
  const nears = mentions.filter(m => m.role === 'NEAR')
  const targets = mentions.filter(m => m.role === 'TARGET')

  // ---- the current location: evidence the client/profile gave + a place the person stated about themselves (never the language)
  const givenLoc = chooseCurrentLocation(input.locations ?? [])
  const contextCountries = new Set<string>()
  if (givenLoc.countryCode && STRONG_LOCATION_SOURCES.includes(givenLoc.source)) contextCountries.add(givenLoc.countryCode)
  const statedRes = resolveMentions(stated, contextCountries).resolved[0]
  const statedEvidence: LocationEvidence | null = statedRes
    ? { source: 'USER_SELECTED', countryCode: statedRes.entity.country, ...(statedRes.entity.cityId ? { cityId: statedRes.entity.cityId } : {}), confidence: statedRes.confidence }
    : null
  // a place the person stated about themselves EARLIER in the thread still holds ("Tôi đang ở Seoul, định đi chơi 3 ngày" ... "gợi ý quán ăn khuya"), unless this message states another or a fresh GPS fix exists
  const hasGps = (input.locations ?? []).some(l => l.source === 'GPS' && l.consentGranted !== false)
  const earlierStated: LocationEvidence | null = statedEvidence || hasGps ? null : (() => {
    for (let i = prior.length - 1; i >= 0; i--) {
      const m = findGeoMentions(prior[i]).filter(x => x.role === 'STATED_LOCATION')
      const r = resolveMentions(m, new Set()).resolved[0]
      if (r) return { source: 'USER_SELECTED' as const, countryCode: r.entity.country, ...(r.entity.cityId ? { cityId: r.entity.cityId } : {}), confidence: 0.8 }
    }
    return null
  })()
  const currentLocation = chooseCurrentLocation([...(input.locations ?? []), ...(statedEvidence ? [statedEvidence] : []), ...(earlierStated ? [earlierStated] : [])])
  const strongLoc = STRONG_LOCATION_SOURCES.includes(currentLocation.source) && (!!currentLocation.countryCode || !!currentLocation.cityId)
  const locCountries = new Set(contextCountries); if (currentLocation.countryCode && strongLoc) locCountries.add(currentLocation.countryCode)

  // ---- intent
  const nearGeneric = has(NEARBY_GENERIC_F, NEARBY_GENERIC_ZH)
  const nearPlace = nears.length > 0
  const venue = has(SERVICE_VENUE, SERVICE_VENUE_ZH)
  const dishAsk = has(DISH_F) && has(ASK_F, ASK_ZH)
  const service = venue || dishAsk
  const goVerb = has(GO_F, GO_ZH)
  const hard = has(CURRENT_HARD_F, CURRENT_HARD_ZH)
  const soft = has(CURRENT_SOFT_F, CURRENT_SOFT_ZH)
  const eligibility = has(ELIGIBILITY_F, ELIGIBILITY_ZH)
  const hereOrigin = has(HERE_ORIGIN_F, HERE_ORIGIN_ZH)
  const anaphora = has(ANAPHORA_F, ANAPHORA_ZH)
  const placeInText = targets.length + nears.length + origins.length > 0
  const tripLen = detectTripLength(text) !== null || /\d+\s*(?:天|晚|日)/u.test(raw)
  const planWords = has(STRONG_PLAN_F, STRONG_PLAN_ZH) || detectPlanningIntent(text) === 'trip'
  const planCue = planWords || (tripLen && (goVerb || targets.length > 0))

  const draft = ((): Draft => {
    if (planCue) return { intent: 'TRAVEL_PLANNING', signals: ['plan'], intentConfidence: 0.9 }
    if (eligibility && goVerb && (targets.length > 0 || origins.length > 0)) return { intent: 'TRAVEL_PLANNING', signals: ['eligibility', 'go'], intentConfidence: 0.85 }
    if (goVerb && origins.length > 0 && targets.length > 0) return { intent: 'TRAVEL_PLANNING', signals: ['go', 'origin_to_target'], intentConfidence: 0.85 }
    if (hard && !nearPlace) return { intent: 'CURRENT_INFORMATION', signals: ['current_hard'], intentConfidence: 0.9 }
    if (nearGeneric || nearPlace) return { intent: 'NEARBY_DISCOVERY', signals: [nearPlace ? 'near_place' : 'near_generic'], intentConfidence: 0.9 }
    if (has(GENERAL_STRONG_F, GENERAL_STRONG_ZH)) return { intent: 'GENERAL_INFORMATION', signals: ['general_strong'], intentConfidence: 0.85 }
    if (service && targets.length > 0) return { intent: 'EXPLICIT_DESTINATION', signals: ['service', 'place'], intentConfidence: 0.9 }
    if (goVerb && targets.length > 0) return { intent: 'EXPLICIT_DESTINATION', signals: ['go', 'place'], intentConfidence: 0.85 }
    if (soft) return { intent: 'CURRENT_INFORMATION', signals: ['current_soft'], intentConfidence: 0.75 }
    if (has(GENERAL_F, GENERAL_ZH)) return { intent: 'GENERAL_INFORMATION', signals: ['general'], intentConfidence: 0.85 }
    if (eligibility) return { intent: 'CURRENT_INFORMATION', signals: ['eligibility'], intentConfidence: 0.8 }
    if (service) return { intent: 'NEARBY_DISCOVERY', signals: ['service_implicit'], intentConfidence: 0.6 }
    if (targets.length > 0) return { intent: 'EXPLICIT_DESTINATION', signals: ['place_only'], intentConfidence: 0.6 }
    return { intent: 'UNKNOWN', signals: [], intentConfidence: 0.2 }
  })()
  let { intent } = draft
  const signals = [...draft.signals]

  // ---- follow-up: no place of its own words -> the earlier turn's place (never from a GPS-derived target, never for pure knowledge)
  let inherited = false
  let carried: PriorTarget | null = null
  const wantsCarry = !placeInText && !nearGeneric && !hereOrigin
    && (intent === 'EXPLICIT_DESTINATION' || intent === 'TRAVEL_PLANNING' || intent === 'UNKNOWN' && anaphora
      || (intent === 'NEARBY_DISCOVERY' && draft.signals[0] === 'service_implicit')
      || (intent === 'CURRENT_INFORMATION' && anaphora))
  if (wantsCarry) {
    carried = priorTargetOf(prior, input)
    if (carried) {
      inherited = true; signals.push('carried_from_earlier_turn')
      if (intent === 'UNKNOWN') intent = carried.intent === 'TRAVEL_PLANNING' ? 'TRAVEL_PLANNING' : 'EXPLICIT_DESTINATION'
      if (intent === 'NEARBY_DISCOVERY') intent = 'EXPLICIT_DESTINATION'
    }
  }

  // ---- resolve the places
  const ambiguity: Ambiguity[] = []
  const { resolved: rAll, ambiguous } = resolveMentions(mentions.filter(m => m.role !== 'STATED_LOCATION'), locCountries)
  const rTargets = uniqueById(rAll.filter(r => r.mention.role === 'TARGET' || r.mention.role === 'NEAR'))
  const rOrigin = rAll.find(r => r.mention.role === 'ORIGIN') ?? (intent === 'TRAVEL_PLANNING' ? statedRes : undefined)
  const askAmbiguous = ambiguous.filter(a => a.mention.role === 'TARGET' || a.mention.role === 'NEAR')
  const targetUsed = intent === 'NEARBY_DISCOVERY' || intent === 'EXPLICIT_DESTINATION' || intent === 'TRAVEL_PLANNING'

  const evidenceIds: string[] = []
  let serviceTarget: ServiceTarget = { resolution: 'UNRESOLVED' }
  let destinations: ServiceTarget[] = []
  let origin: ServiceTarget | undefined
  let multiTarget = false
  let role: LocationRole = 'NOT_USED'
  let mentionedPlaceIds: string[] = []

  const fromResolved = (rs: ResolvedMention[]) => rs.map(r => { evidenceIds.push(`geo:${r.entity.id}`); return toTarget(r.entity, r.resolution, r.confidence) })
  const locationTarget = (): ServiceTarget => {
    const city = currentLocation.cityId ? geoEntityById(currentLocation.cityId) : undefined
    const base: ServiceTarget = {
      ...(marketOfCountry(currentLocation.countryCode) ? { marketId: marketOfCountry(currentLocation.countryCode) } : {}),
      ...(currentLocation.countryCode ? { countryCode: currentLocation.countryCode } : {}),
      ...(currentLocation.regionId ? { regionId: currentLocation.regionId } : {}),
      ...(currentLocation.cityId ? { cityId: currentLocation.cityId } : {}),
      ...(city ? { displayNameOriginal: city.name } : {}),
      resolution: 'RESOLVED', confidence: currentLocation.confidence ?? 0.5,
    }
    evidenceIds.push(`loc:${currentLocation.source}`)
    return base
  }

  if (intent === 'NEARBY_DISCOVERY') {
    const area = uniqueById(rAll.filter(r => r.mention.role === 'NEAR'))
    const fallbackTargets = area.length ? area : []
    if (fallbackTargets.length) {
      destinations = fromResolved(fallbackTargets); serviceTarget = destinations[0]; multiTarget = destinations.length > 1
      role = strongLoc ? 'SECONDARY' : 'NOT_USED'
    } else if (askAmbiguous.some(a => a.mention.role === 'NEAR')) {
      role = strongLoc ? 'SECONDARY' : 'NOT_USED'
    } else if (strongLoc) {
      serviceTarget = locationTarget(); role = 'PRIMARY_RADIUS'
    } else {
      // IP estimate / profile / nothing: a weak source never settles a "near me" question (R13 §3.3: ask the person or ask for a location)
      const weak = currentLocation.source === 'IP_ESTIMATE' || currentLocation.source === 'PROFILE'
      if (weak && (currentLocation.countryCode || currentLocation.cityId)) { serviceTarget = { ...locationTarget(), resolution: 'INFERRED' }; role = 'PRIMARY_RADIUS' }
      ambiguity.push({ code: 'NEEDS_PRECISE_LOCATION', need: 'a precise current location (share GPS) or an area to search around', blocking: true })
      if (currentLocation.source === 'IP_ESTIMATE') ambiguity.push({ code: 'LOCATION_ESTIMATE_ONLY', need: 'the only location known is an IP estimate', blocking: false })
    }
  } else if (intent === 'EXPLICIT_DESTINATION' || intent === 'TRAVEL_PLANNING') {
    let list = rTargets
    if (carried && list.length === 0) {
      destinations = carried.destinations.map(d => ({ ...d, resolution: 'INFERRED' as const, confidence: Math.min(d.confidence ?? 0.7, 0.7) }))
      if (carried.origin && intent === 'TRAVEL_PLANNING') origin = carried.origin
    } else destinations = fromResolved(list)
    multiTarget = destinations.length > 1
    if (destinations.length) serviceTarget = multiTarget ? { ...destinations[0], resolution: 'INFERRED', confidence: Math.min(destinations[0].confidence ?? 0.6, 0.6) } : destinations[0]
    if (intent === 'TRAVEL_PLANNING') {
      if (rOrigin && !origin) { origin = toTarget(rOrigin.entity, 'EXPLICIT', rOrigin.confidence); evidenceIds.push(`geo:${rOrigin.entity.id}`) }
      if (!origin && hereOrigin && strongLoc) origin = locationTarget()
      role = eligibility ? 'ELIGIBILITY' : (origin && hereOrigin) ? 'ORIGIN' : strongLoc ? 'SECONDARY' : 'NOT_USED'
      if (!destinations.length && askAmbiguous.length === 0) ambiguity.push({ code: 'DESTINATION_MISSING', need: 'where the trip goes', blocking: true })
      if (!tripLen && !/\d/.test(raw) && planCue) ambiguity.push({ code: 'TRAVEL_DURATION_MISSING', need: 'how many days (or the dates)', blocking: false })
    } else role = strongLoc ? 'SECONDARY' : 'NOT_USED'
  } else if (intent === 'CURRENT_INFORMATION') {
    const list = uniqueById(rAll.filter(r => r.mention.role === 'TARGET' || r.mention.role === 'NEAR'))
    if (list.length) { destinations = fromResolved(list); serviceTarget = destinations[0]; multiTarget = destinations.length > 1; role = eligibility ? 'ELIGIBILITY' : 'NOT_USED' }
    else if (carried) { destinations = carried.destinations.map(d => ({ ...d, resolution: 'INFERRED' as const, confidence: Math.min(d.confidence ?? 0.7, 0.7) })); serviceTarget = destinations[0] ?? serviceTarget; multiTarget = destinations.length > 1 }
    else if (has(LOC_DEP_F, LOC_DEP_ZH) && strongLoc) { serviceTarget = locationTarget(); role = 'PRIMARY_RADIUS' }
    // no named scope and nothing location-bound: global / unspecified; the location is NOT made the target (R13 §3.3)
  } else if (intent === 'GENERAL_INFORMATION') {
    mentionedPlaceIds = uniqueById(rAll).map(r => r.entity.id)
  }
  if (askAmbiguous.length > 0 && (targetUsed || intent === 'CURRENT_INFORMATION')) {
    for (const a of askAmbiguous) ambiguity.push({ code: 'AMBIGUOUS_PLACE', need: 'which of these places is meant', candidates: a.candidates.map(labelOfCandidate), blocking: !serviceTarget.countryCode })
  }

  // ---- cross-border: a PROPERTY of (location, market, target); it blocks nothing
  const targetCountries = new Set<string>()
  for (const d of destinations.length ? destinations : (serviceTarget.countryCode ? [serviceTarget] : [])) if (d.countryCode) targetCountries.add(d.countryCode)
  const refCountry = (origin?.countryCode) ?? (strongLoc ? currentLocation.countryCode : undefined) ?? (currentLocation.source !== 'UNKNOWN' ? currentLocation.countryCode : undefined)
  const basis: CanonicalContext['crossBorderBasis'] = []
  if (targetUsed || intent === 'CURRENT_INFORMATION') {
    if (refCountry && [...targetCountries].some(c => c !== refCountry)) basis.push('LOCATION_VS_TARGET')
    if (marketCountry && [...targetCountries].some(c => c !== marketCountry)) basis.push('MARKET_VS_TARGET')
  }

  // ---- the language layers
  const languages = resolveLanguageLayers({
    text, priorUserTexts: prior, chosenLocale: input.chosenLocale, uiLocale: input.uiLocale, defaultLocale: input.defaultLocale,
    targetCountry: serviceTarget.countryCode ?? currentLocation.countryCode ?? null,
  })

  // ---- status and confidence
  const blocking = ambiguity.some(a => a.blocking)
  const resolvedTarget = serviceTarget.resolution === 'EXPLICIT' || serviceTarget.resolution === 'RESOLVED'
  let status: CanonicalContext['status']
  let confidence: number
  if (targetUsed) {
    confidence = Math.min(draft.intentConfidence, serviceTarget.confidence ?? 0)
    status = blocking || serviceTarget.resolution === 'UNRESOLVED' ? 'UNRESOLVED' : resolvedTarget && !multiTarget && !ambiguity.length ? 'RESOLVED' : 'PARTIALLY_RESOLVED'
    if (ambiguity.length && !blocking && resolvedTarget) status = 'PARTIALLY_RESOLVED'
  } else if (intent === 'UNKNOWN') { confidence = draft.intentConfidence; status = 'UNRESOLVED' }
  else { confidence = serviceTarget.resolution === 'UNRESOLVED' ? draft.intentConfidence : Math.min(draft.intentConfidence, serviceTarget.confidence ?? 0.7); status = ambiguity.length ? 'PARTIALLY_RESOLVED' : 'RESOLVED' }

  return {
    version: CONTEXT_VERSION,
    intent, signals,
    currentLocation, currentLocationRole: role,
    serviceTarget,
    ...(intent === 'TRAVEL_PLANNING' ? { travelContext: { ...(origin ? { origin } : {}), destinations } } : {}),
    multiTarget, mentionedPlaceIds,
    crossBorder: basis.length > 0, crossBorderBasis: basis,
    eligibilityCheck: eligibility && (intent === 'TRAVEL_PLANNING' || intent === 'CURRENT_INFORMATION'),
    inherited, languages, status, confidence: Math.round(confidence * 100) / 100,
    ambiguity, evidenceIds,
    noTranslate: noTranslateEntities(text, [...destinations, ...(origin ? [origin] : [])]),
  }
}

// ---------------------------------------------------------------- follow-ups
interface PriorTarget { intent: IntentCategory; destinations: ServiceTarget[]; origin?: ServiceTarget }

/** The most recent earlier turn that NAMED a place as a service target (not a GPS-derived one, not a knowledge question). Each earlier turn is read on its own words. */
function priorTargetOf(prior: readonly string[], input: CanonicalContextInput): PriorTarget | null {
  for (let i = prior.length - 1; i >= 0; i--) {
    const c = resolveCanonicalContext({ text: prior[i], priorUserTexts: [], locations: input.locations, userMarketId: input.userMarketId })
    if (c.intent === 'GENERAL_INFORMATION' || c.intent === 'UNKNOWN') continue
    const list = c.travelContext?.destinations?.length ? c.travelContext.destinations : (c.serviceTarget.resolution === 'EXPLICIT' || c.serviceTarget.resolution === 'RESOLVED') && c.evidenceIds.some(e => e.startsWith('geo:')) ? [c.serviceTarget] : []
    if (list.length) return { intent: c.intent, destinations: list, ...(c.travelContext?.origin ? { origin: c.travelContext.origin } : {}) }
  }
  return null
}

// ---------------------------------------------------------------- R13 ResolvedContext (the contract's own shape) from the resolved context
export function toResolvedContext(c: CanonicalContext, meta: { requestId: string; userId?: string; installationCountry?: CountryCode; homeMarketId?: MarketId; backendProcessingRegion?: string; now: Date }): ResolvedContext {
  const q = c.languages.queryLanguage?.code
  return {
    requestId: meta.requestId,
    ...(meta.userId ? { userId: meta.userId } : {}),
    ...(meta.installationCountry ? { installationCountry: meta.installationCountry } : {}),
    ...(meta.homeMarketId ? { homeMarketId: meta.homeMarketId } : {}),
    currentLocation: c.currentLocation,
    preferredLocale: c.languages.responseLocale.code,
    ...(q ? { detectedQueryLocale: q } : {}),
    sourceLocaleHints: c.languages.sourceLanguages,
    serviceTarget: c.serviceTarget,
    intentHint: c.intent,
    contextResolutionStatus: c.status,
    contextVersion: c.version,
    targetResolutionEvidenceIds: c.evidenceIds,
    ...(c.travelContext ? { travelContext: c.travelContext } : {}),
    backendProcessingRegion: meta.backendProcessingRegion ?? 'unknown',
    resolvedAt: meta.now.toISOString(),
  }
}
