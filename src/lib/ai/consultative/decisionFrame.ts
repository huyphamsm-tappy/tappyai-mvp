// ── The decision frame: what the user is trying to accomplish ───────────────
//
// The need profile (`needProfile.ts`) models what the user wants FROM THE
// PRODUCT — budget, must-haves, priorities — and the ranker orders candidates
// against it. Nothing, until now, modelled what the user is trying to DO, and so
// nothing told the model why a search was being run, what evidence would settle
// the decision, or what to say when that evidence did not come back.
//
// Measured 2026-09-15 ("trưa nay ăn gì cho ngon" → "quận 1"): the model echoed
// the sentence as a query, the shortlist filled to three with two rows that
// carried no attribute at all, and the reply described them anyway, then asked
// "bạn muốn ăn loại gì?". Every step was mechanically correct and none of it was
// consultation.
//
// This module is the shared, deterministic answer for every domain:
//
//   deriveDecisionFrame   the goal, the occasion, the criteria and — from those —
//                         the evidence a recommendation NEEDS, decided BEFORE the
//                         search so the query and the judgement serve the goal;
//   qualifiesFor          whether a ranked candidate carries evidence for that
//                         decision (a name is a search result, not a recommendation);
//   evidenceGap           what to do when too few do — recommend what qualifies,
//                         search once more, or say so honestly;
//   buildDecisionFrameBlock  the frame as a prompt block, so the model reasons
//                         over the SAME frame the engine applied.
//
// Deterministic, model-free, clock-aware only through `now`. One AI.stream() per
// turn stays one; the frame costs a few hundred prompt tokens, never a call.

import { normalizeVN } from '../intent'
import type { NeedProfile } from './needProfile'
import type { RankedEntry } from './rank'
import type { CandidateAttrs } from './candidate'

/** The five product domains, plus the utility answers that are not a decision. */
export type FrameDomain = 'food' | 'shopping' | 'entertainment' | 'travel' | 'spa' | 'utility'

export type FrameGoal = 'inform' | 'recommend' | 'compare' | 'decide' | 'plan'

/** What the user is choosing ON — the decision criteria, best first. */
export type Criterion = 'quality' | 'distance' | 'price' | 'openNow' | 'atmosphere' | 'speed' | 'cuisine'

/** Evidence keys a candidate row can carry; the ranker scores the first four. */
export type EvidenceKey = 'rating' | 'reviewCount' | 'distance' | 'price' | 'openingHours' | 'cuisine' | 'snippet'

export interface DecisionFrame {
  goal: FrameGoal
  /** Every domain the request touches — a request may span several. */
  domains: FrameDomain[]
  occasion: {
    meal: 'breakfast' | 'lunch' | 'dinner' | 'late' | null
    when: 'now' | 'tonight' | 'weekend' | 'trip' | null
    partySize: number | null
  }
  criteria: Array<{ key: Criterion; source: 'stated' | 'inferred' | 'preference' }>
  /** The evidence a candidate must carry for the recommendation to rest on something. */
  informationNeeded: EvidenceKey[]
  /** The one question worth asking before searching — or none. */
  clarify: { about: 'location' | 'subject' } | null
  /** True when the turn is a place decision (food / spa / entertainment / travel venues). */
  placeDecision: boolean
}

export interface FrameInput {
  messages: Array<{ role: string; content: unknown }>
  need: NeedProfile
  planningIntent: 'trip' | 'evening' | null
  forcedTool: string | null
  hasGps: boolean
  storedPreferences?: { cuisine_likes?: string[] | null; dietary_restrictions?: string | null; budget_level?: string | null } | null
  /** Vietnam wall clock, for the meal a time-of-day request implies. */
  now?: Date
}

const text = (m: { role: string; content: unknown }): string =>
  typeof m.content === 'string'
    ? m.content
    : Array.isArray(m.content)
      ? (m.content as Array<{ type?: string; text?: string }>).map(c => (c?.type === 'text' ? c.text || '' : '')).join(' ')
      : ''

// 🚨 "quận" (district) normalizes to "quan", the same as "quán" (eatery) — so a bare
// "quan" is never a food cue; only "quán ăn / quán cafe / quán nhậu…" are.
const FOOD_RE = /\ban\b|\bquan (?:an|nhau|com|pho|bun|cafe|ca phe|nuong|lau|oc|chay)\b|nha hang|\bcafe\b|ca phe|\bcoffee\b|tra sua|\bbua\b|\bmon\b|\bpho\b|\bbun\b|\bcom\b|\blau\b|\bnuong\b|hai san|\bbuffet\b|\bpizza\b|\bsushi\b|\bfood\b|\beat\b|\bdinner\b|\blunch\b|\bbreakfast\b|\brestaurant\b|\bdrink\b/
const SHOPPING_RE = /(?<!nhay )\bmua\b|san pham|\bshopee\b|\btiki\b|\blazada\b|\blaptop\b|dien thoai|\biphone\b|\btai nghe\b|\bproduct\b|\bbuy\b|\bshop\b|\bgia bao nhieu\b/
const ENTERTAINMENT_RE = /\bbar\b|\bpub\b|\bclub\b|nhay mua|\bkaraoke\b|xem phim|rap phim|\bcinema\b|\bmovie\b|nightlife|night out|\bconcert\b|\bshow\b|giai tri|vui choi|di choi|an choi|\bgame\b|bida|\bbilliard/
const TRAVEL_RE = /du lich|khach san|\bhotel\b|\bresort\b|ve may bay|chuyen bay|\bflight\b|\btrip\b|lich trinh|itinerary|\bxe khach\b|\btau\b|\btrain\b|tham quan|thang canh|diem du lich|\bhomestay\b|\btour\b|\bcheck-?in\b/
const SPA_RE = /\bspa\b|\bmassage\b|\bnail\b|lam dep|\bsalon\b|toc\b|\bbeauty\b|\bfacial\b|goi dau|cham soc da|\bxong hoi\b/
const UTILITY_RE = /thoi tiet|du bao|gia vang|ty gia|tin tuc|\bnews\b|\bweather\b|gold price|la gi\b|\bwhat is\b|\bnghia la\b|\bwhy\b|tai sao|\bvi sao\b|may gio/

const COMPARE_RE = /so sanh|\bvs\.?\b|\bhay la\b|\bhay\b.*\bhon\b|\bor\b.*\bbetter\b|\bcompare\b|nen chon (cai|con|quan|chiec) nao|cai nao (tot|hon)|\bwhich (one|is better)\b/
const DECIDE_RE = /chon giup|chon dum|nen (di|an|mua|chon|o|dat) (dau|gi|nao|cai nao|quan nao)|quyet dinh (giup|dum)|\bdecide for me\b|\bpick (one|for me)\b|nen chon/
const RECOMMEND_RE = /goi y|de xuat|\brecommend\b|\bsuggest\b|\btim\b|\bfind\b|\bo dau\b|\bdi dau\b|\ban gi\b|\bmua gi\b|\bnao ngon\b|\bnao tot\b|\bnao hay\b|\bwhere\b|\bwhat should i\b|\bgan day\b|\bnearby\b|\bcho minh\b|\bcho toi\b/

const MEAL: ReadonlyArray<[RegExp, DecisionFrame['occasion']['meal']]> = [
  [/\bsang\b|\bbreakfast\b|an sang/, 'breakfast'],
  [/\btrua\b|\blunch\b|an trua/, 'lunch'],
  [/\btoi\b|\bdinner\b|an toi|bua toi|\btonight\b|\bevening\b/, 'dinner'],
  [/\bkhuya\b|\bdem\b|\blate night\b|an dem/, 'late'],
]
const WHEN: ReadonlyArray<[RegExp, DecisionFrame['occasion']['when']]> = [
  [/cuoi tuan|\bweekend\b/, 'weekend'],
  [/\btoi nay\b|\btonight\b|\bdem nay\b|\bthis evening\b/, 'tonight'],
  [/\bbay gio\b|\bngay bay gio\b|\bright now\b|\bnow\b|\bhien tai\b|\bdang\b.*\bmo\b|\bsang nay\b|\btrua nay\b|\bchieu nay\b/, 'now'],
]

const CRITERIA: ReadonlyArray<[RegExp, Criterion]> = [
  [/\bngon\b|ngon nhat|chat luong|\btot nhat\b|danh gia (cao|tot)|nhieu review|highly rated|\bbest\b|\bdelicious\b|\btasty\b|\bgood food\b|uy tin|\bquality\b/, 'quality'],
  // "gần" means near ME only when it is near me: "gần đây / gần tôi / gần nhà"
  // or a bare "gần". "gần biển", "gần trung tâm" name a place attribute the need
  // profile already models (beach, central), not a distance from the user.
  [/\bgan (?:day|toi|minh|nha|cho minh|cho toi)\b|\bgan\b(?=\s*(?:[,.!?]|$))|quanh day|\bnear me\b|\bnearby\b|\bclose by\b|tien duong|\bwalking distance\b/, 'distance'],
  [/\bre\b|gia re|tiet kiem|binh dan|\bcheap\b|\baffordable\b|\bbudget\b|ngan sach|\btrieu\b|\btr\b|\bk\b/, 'price'],
  [/dang mo|con mo|mo cua|\bopen now\b|\bopen\b|gio mo|\bbay gio\b|\bright now\b/, 'openNow'],
  [/khong gian|\bview\b|\bchill\b|lang man|yen tinh|soi dong|\bvibe\b|\bdate\b|hen ho|\bcozy\b|\batmosphere\b|\bromantic\b|sang trong|\bfancy\b/, 'atmosphere'],
  [/\bnhanh\b|\bgap\b|\bquick\b|\bfast\b|\bvoi\b/, 'speed'],
]

/** The evidence each criterion needs, in the row vocabulary the ranker reads. */
const NEEDS: Record<Criterion, EvidenceKey[]> = {
  quality: ['rating', 'reviewCount'],
  distance: ['distance'],
  price: ['price'],
  openNow: ['openingHours'],
  atmosphere: ['snippet'],
  speed: ['distance', 'openingHours'],
  cuisine: ['cuisine'],
}

function detectDomains(t: string, need: NeedProfile, forcedTool: string | null): FrameDomain[] {
  const out: FrameDomain[] = []
  if (SPA_RE.test(t) || need.subject === 'spa') out.push('spa')
  if (ENTERTAINMENT_RE.test(t)) out.push('entertainment')
  if (TRAVEL_RE.test(t) || need.domain === 'hotel' || need.domain === 'transport') out.push('travel')
  if (SHOPPING_RE.test(t) || need.domain === 'shopping' || forcedTool === 'search_products') out.push('shopping')
  if (FOOD_RE.test(t)) out.push('food')
  if (out.length === 0 && need.domain === 'places') out.push('food')
  if (out.length === 0 && UTILITY_RE.test(t)) out.push('utility')
  return out
}

function detectGoal(t: string, planningIntent: FrameInput['planningIntent'], domains: FrameDomain[]): FrameGoal {
  if (planningIntent) return 'plan'
  if (COMPARE_RE.test(t)) return 'compare'
  if (DECIDE_RE.test(t)) return 'decide'
  if (RECOMMEND_RE.test(t)) return 'recommend'
  if (domains.length > 0 && !domains.includes('utility')) return 'recommend'
  return 'inform'
}

function mealFromClock(now: Date): DecisionFrame['occasion']['meal'] {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(now))
  if (hour >= 5 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 14) return 'lunch'
  if (hour >= 17 && hour < 22) return 'dinner'
  if (hour >= 22 || hour < 5) return 'late'
  return null
}

/**
 * Derive the frame from the whole conversation — the goal is set by the latest
 * user turn, the situation by everything said so far (a "quận 1" follow-up
 * inherits "trưa nay ăn gì cho ngon"), and the criteria by both plus the stored
 * preferences and the need profile the ranker already uses.
 */
export function deriveDecisionFrame(input: FrameInput): DecisionFrame {
  const userTurns = (Array.isArray(input.messages) ? input.messages : []).filter(m => m && m.role === 'user').map(text)
  // The current task: the turns since the last one that changed subject are what
  // the need profile already folds; here the last three user turns are enough
  // for the occasion, and the last one names the goal.
  const recent = normalizeVN(userTurns.slice(-3).join(' \n ').toLowerCase())
  const last = normalizeVN((userTurns[userTurns.length - 1] ?? '').toLowerCase())

  const domains = detectDomains(recent, input.need, input.forcedTool)
  const goal = detectGoal(last, input.planningIntent, domains)
  const placeDecision = goal !== 'inform' && domains.some(d => d === 'food' || d === 'spa' || d === 'entertainment' || d === 'travel')

  let meal = MEAL.find(([re]) => re.test(recent))?.[1] ?? null
  const when = WHEN.find(([re]) => re.test(recent))?.[1] ?? (input.planningIntent === 'trip' ? 'trip' : null)
  // "trưa nay" / "tối nay" name the meal; a bare "ăn gì" at 12:30 is lunch too.
  if (!meal && domains.includes('food') && input.now) meal = mealFromClock(input.now)
  const party = /(\d+)\s*(nguoi|ng\b|people|pax|dua)/.exec(recent)
  const partySize = party ? Number(party[1]) : null

  const criteria: DecisionFrame['criteria'] = []
  const push = (key: Criterion, source: 'stated' | 'inferred' | 'preference') => {
    if (!criteria.some(c => c.key === key)) criteria.push({ key, source })
  }
  for (const [re, key] of CRITERIA) if (re.test(recent)) push(key, 'stated')
  for (const p of input.need.priorities) {
    if (p.key === 'rating') push('quality', p.source === 'preference' ? 'preference' : 'stated')
    // The need profile's lexicon reads every "gần" as distance ("gần biển" included);
    // the frame's own regex above is the stricter reading, so it decides here.
    if (p.key === 'distance' && CRITERIA.some(([re, key]) => key === 'distance' && re.test(recent))) push('distance', 'stated')
    if (p.key === 'price') push('price', 'stated')
  }
  if (input.need.budget || input.need.budgetStated) push('price', 'stated')
  if (input.storedPreferences?.cuisine_likes?.length && domains.includes('food')) push('cuisine', 'preference')
  // A recommendation with no stated criterion is still judged on something: for a
  // place it is how good it is; time-bound requests care whether it is open.
  if (placeDecision && criteria.length === 0) push('quality', 'inferred')
  if (placeDecision && (when === 'now' || when === 'tonight') && !criteria.some(c => c.key === 'openNow')) push('openNow', 'inferred')
  if (placeDecision && input.hasGps && !criteria.some(c => c.key === 'distance')) push('distance', 'inferred')

  const informationNeeded: EvidenceKey[] = []
  for (const c of criteria) for (const k of NEEDS[c.key]) if (!informationNeeded.includes(k)) informationNeeded.push(k)

  const hasLocation = !!input.need.location.text || input.hasGps
  const clarify: DecisionFrame['clarify'] =
    placeDecision && !hasLocation && goal !== 'plan' ? { about: 'location' }
      : domains.includes('shopping') && !input.need.subject && goal !== 'inform' && !placeDecision ? { about: 'subject' }
        : null

  return { goal, domains, occasion: { meal, when, partySize }, criteria, informationNeeded, clarify, placeDecision }
}

// ── Post-search: which candidates the decision may rest on ─────────────────

/** Ranker attribute keys the row can be judged on for a given evidence key. */
function hasEvidence(attrs: CandidateAttrs, key: EvidenceKey): boolean {
  switch (key) {
    case 'rating': return attrs.rating !== undefined
    case 'reviewCount': return attrs.reviewCount !== undefined
    case 'distance': return attrs.distanceKm !== undefined
    case 'price': return attrs.priceVnd !== undefined || attrs.priceHighVnd !== undefined
    case 'openingHours': return !!attrs.openingHours || attrs.openNow !== undefined
    case 'cuisine': return !!attrs.cuisine && attrs.cuisine.length > 0
    case 'snippet': return false // no place row carries free text the ranker can read
  }
}

/** The scoreable evidence keys — a candidate with none of them is a name, not a recommendation. */
const SCOREABLE_KEYS: EvidenceKey[] = ['rating', 'reviewCount', 'distance', 'price', 'cuisine', 'openingHours']

/**
 * Does this ranked candidate carry evidence the frame's decision needs?
 *
 * With named criteria: at least one of the evidence keys those criteria need.
 * Without: at least one scoreable attribute. A row that has a name, a map pin
 * and nothing else never qualifies — it can be LISTED, it cannot be RECOMMENDED.
 */
export function qualifiesFor(frame: DecisionFrame, entry: RankedEntry): boolean {
  const needed = frame.informationNeeded.filter(k => k !== 'snippet')
  const keys = needed.length > 0 ? needed : SCOREABLE_KEYS
  return keys.some(k => hasEvidence(entry.candidate.attrs, k))
}

/** The evidence keys the frame needs that this candidate does not carry. */
export function missingFor(frame: DecisionFrame, entry: RankedEntry): EvidenceKey[] {
  return frame.informationNeeded.filter(k => k !== 'snippet' && !hasEvidence(entry.candidate.attrs, k))
}

export interface EvidenceGap {
  qualified: number
  total: number
  needed: EvidenceKey[]
  /**
   * recommend     ≥1 candidate qualifies — recommend those, and only those
   * search_again  none qualifies but the provider can return evidence — one more search
   * insufficient  none qualifies and another search cannot help — say so
   */
  action: 'recommend' | 'search_again' | 'insufficient'
}

/**
 * Decide what the reply may do with this evidence. `providerCanImprove` is false
 * for the OpenStreetMap fallback (no rating, price, hours or reviews anywhere in
 * that source) and for an empty result; a repeat search there costs a call and
 * changes nothing.
 */
export function evidenceGap(frame: DecisionFrame, ranked: readonly RankedEntry[], providerCanImprove: boolean): EvidenceGap {
  const qualified = ranked.filter(e => qualifiesFor(frame, e)).length
  const needed = frame.informationNeeded.filter(k => k !== 'snippet')
  const action: EvidenceGap['action'] = qualified > 0 ? 'recommend' : providerCanImprove && ranked.length > 0 ? 'search_again' : 'insufficient'
  return { qualified, total: ranked.length, needed, action }
}

/** A compact, model-facing view of one shortlisted candidate's evidence — real fields only. */
export function evidenceSummary(attrs: CandidateAttrs): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {}
  if (attrs.rating !== undefined) out.rating = attrs.rating
  if (attrs.reviewCount !== undefined) out.reviews = attrs.reviewCount
  if (attrs.distanceKm !== undefined) out.distance_km = attrs.distanceKm
  if (attrs.priceVnd !== undefined) out.price_vnd = attrs.priceVnd
  if (attrs.priceHighVnd !== undefined) out.price_up_to_vnd = attrs.priceHighVnd
  if (attrs.openNow !== undefined) out.open_now = attrs.openNow
  if (attrs.stars !== undefined) out.stars = attrs.stars
  if (attrs.openingHours) out.opening_hours = attrs.openingHours
  if (attrs.cuisine && attrs.cuisine.length > 0) out.cuisine = attrs.cuisine
  if (attrs.wifi !== undefined) out.wifi = attrs.wifi
  if (attrs.outdoorSeating !== undefined) out.outdoor = attrs.outdoorSeating
  if (attrs.vegetarian !== undefined) out.vegetarian = attrs.vegetarian
  return out
}

// ── The frame as a prompt block ──────────────────────────────────────────────

const DOMAIN_VI: Record<FrameDomain, string> = {
  food: 'an uong', shopping: 'mua sam', entertainment: 'giai tri', travel: 'du lich', spa: 'spa/lam dep', utility: 'tra cuu',
}
const GOAL_VI: Record<FrameGoal, string> = {
  inform: 'TRA CUU thong tin', recommend: 'GOI Y de user chon', compare: 'SO SANH cac lua chon', decide: 'CHON GIUP user', plan: 'LAP KE HOACH',
}
const CRITERION_VI: Record<Criterion, string> = {
  quality: 'chat luong/ngon (rating + so danh gia)', distance: 'gan/tien duong (distance_km)', price: 'gia/ngan sach', openNow: 'dang mo cua luc nay (opening_hours/open_now)',
  atmosphere: 'khong gian/vibe (CHI khi co snippet/review that)', speed: 'nhanh/gap', cuisine: 'mon/loai am thuc (cuisine)',
}
const MEAL_VI = { breakfast: 'bua sang', lunch: 'bua trua', dinner: 'bua toi', late: 'an khuya' }
const WHEN_VI = { now: 'ngay bay gio', tonight: 'toi nay', weekend: 'cuoi tuan', trip: 'chuyen di' }

/**
 * The frame, stated to the model in the same terms the engine applied. Placed in
 * the per-request block (never in the cached rulebook). Says what the goal is,
 * what to optimise the search for, what evidence settles it, and whether a
 * question is worth asking — so "search" is done FOR the decision, not instead
 * of it.
 */
export function buildDecisionFrameBlock(frame: DecisionFrame, need: NeedProfile): string {
  if (frame.goal === 'inform' && frame.domains.every(d => d === 'utility')) return ''
  const lines: string[] = []
  lines.push(`===== KHUNG QUYET DINH (he thong suy ra tu hoi thoai — dung de TU VAN, khong doc lai cho user) =====`)
  lines.push(`MUC TIEU: ${GOAL_VI[frame.goal]}${frame.domains.length ? ` · linh vuc: ${frame.domains.map(d => DOMAIN_VI[d]).join(' + ')}` : ''}`)
  const situation: string[] = []
  if (frame.occasion.meal) situation.push(MEAL_VI[frame.occasion.meal])
  if (frame.occasion.when) situation.push(WHEN_VI[frame.occasion.when])
  if (frame.occasion.partySize) situation.push(`${frame.occasion.partySize} nguoi`)
  if (need.location.text) situation.push(`khu vuc: ${need.location.text}`)
  else if (need.location.gps) situation.push('co GPS cua user')
  if (need.budget) situation.push(`ngan sach: ${need.budget.min > 0 ? need.budget.min.toLocaleString('vi-VN') + '-' : 'toi da '}${need.budget.max.toLocaleString('vi-VN')} VND`)
  if (situation.length) lines.push(`TINH HUONG: ${situation.join(' · ')}`)
  if (frame.criteria.length) {
    lines.push(`TIEU CHI (uu tien theo thu tu): ${frame.criteria.map(c => `${CRITERION_VI[c.key]}${c.source === 'inferred' ? ' [suy ra]' : c.source === 'preference' ? ' [so thich da luu]' : ''}`).join(' > ')}`)
  }
  if (need.mustHave.length) lines.push(`BAT BUOC: ${need.mustHave.join(', ')}`)
  if (need.avoid.length) lines.push(`TRANH: ${need.avoid.join(', ')}`)
  if (frame.goal !== 'inform') {
    if (frame.clarify) {
      lines.push(frame.clarify.about === 'location'
        ? 'THIEU: khu vuc/vi tri — day la thong tin QUYET DINH cho goi y dia diem. Hoi DUNG MOT cau ngan ve khu vuc, KHONG tim kiem truoc khi biet.'
        : 'THIEU: user chua noi muon mua GI — hoi DUNG MOT cau ngan ve mon do, KHONG tim kiem truoc khi biet.')
    } else {
      lines.push('DU DE GOI Y: KHONG hoi truoc, tim va goi y ngay. Cau hoi (neu co) chi o CUOI, chi MOT, va chi khi cau tra loi thay doi khuyen nghi.')
      if (frame.placeDecision) {
        const example = [frame.occasion.meal ? MEAL_VI[frame.occasion.meal] : '', frame.domains.includes('food') ? 'nha hang/quan an' : 'dia diem', need.location.text ?? ''].filter(Boolean).join(' ')
        lines.push(`TIM KIEM: dat query theo MUC TIEU (vd "${example}"), KHONG chep nguyen cau cua user. Chon 'type' dung linh vuc.`)
      }
      if (frame.informationNeeded.length) {
        lines.push(`BANG CHUNG CAN DE QUYET DINH: ${frame.informationNeeded.filter(k => k !== 'snippet').join(', ')}. Ung vien khong co bang chung nay chi la KET QUA TIM KIEM, KHONG PHAI goi y — khong mo ta, khong khen.`)
      }
      lines.push('SAU KHI TIM: so sanh ung vien theo TIEU CHI tren bang so lieu that; neu du bang chung thi CHON MOT va noi vi sao no hop tinh huong nay; neu chi mot ung vien du bang chung thi goi y mot; neu khong ung vien nao du thi lam theo _tappy_evidence_gap.')
    }
  }
  lines.push('=====')
  return `\n\n${lines.join('\n')}`
}
