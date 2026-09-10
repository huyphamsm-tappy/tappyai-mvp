// ── Deterministic evidence boundary for PLACE QUALITY and DISTANCE ──────────
//
// The money guards answer "what does it cost". This answers the other two
// things a place reply asserts and the provider often never returned: HOW GOOD
// it is, and HOW FAR it is.
//
// 🚨 BOTH WERE MEASURED ON LOCALHOST, with the retrieval in front of them:
//
//   · "spa" (GPS, District 1) returned ten OSM rows carrying name + address and
//     NO rating field at all. The reply picked one and called it
//     "highly rated". The prompt already forbids inventing a rating; the model
//     did it anyway, so the rule needed teeth rather than another sentence.
//
//   · "spa cao cấp ở Mường Nhé Điện Biên" retrieved NOTHING, and the reply
//     offered to widen the search to "thành phố Điện Biên Phủ (cách Mường Nhé
//     khoảng 30-40km)". That distance is world knowledge, and it is wrong by
//     roughly a factor of five. No retrieved row, snippet or coordinate
//     contained it.
//
// The rule is the one the rest of the pipeline already uses: a claim must TRACE
// to retrieved evidence. Structured fields count; so does the retrieved TEXT,
// because a hotel snippet that says "chỗ nghỉ 3 sao" or "cách Bảo tàng Chăm 900
// m" is evidence for exactly those numbers. Anything tracing to neither is
// removed with the whole sentence, and nothing is ever written.

import { sentenceSpans } from './moneyGuard'
import { placeTokensFor, textNamesPlace } from '@/lib/links/placeAttribution'
import { isDirectEntityUrl } from '@/lib/links/directUrl'

/** What the turn actually retrieved, as the guard is allowed to read it. */
export interface PlaceClaimEvidence {
  /** Structured per-row ratings (Google `rating`). Empty ⇒ no rating was retrieved. */
  ratings: number[]
  /** Structured per-row distances in km (`distance_km`, computed from real coordinates). */
  distancesKm: number[]
  /** Retrieved prose — row snippets and price snippets. Numbers inside it are evidence. */
  texts: string[]
  /**
   * Retrieved prose that NAMED one specific place, keyed by that place's name.
   *
   * 🚨 `texts` CANNOT TELL "ABOUT THIS PLACE" FROM "ABOUT THIS DISTRICT", which
   * is how a listicle called "Danh sách quán bún bò Quận 1" ended up supporting
   * "Bún Bò Huế Đông Ba — được nhiều người yêu thích". Optional and additive:
   * omitted, the popularity rule below falls back to requiring a structured
   * rating, which is the strictest reading and never invents support.
   */
  entityTexts?: Map<string, string[]>
  /** Every retrieved place name — needed to tell that a sentence names one. */
  placeNames?: string[]
  /**
   * Places for which a DIRECT ordering page was actually retrieved.
   *
   * 🚨 THE INJECTED ORDER LINKS PROVE NOTHING. `buildFoodOrderLinks` builds
   * `shopeefood.vn/tim-kiem?q=<name>` — a SEARCH page, assembled from the
   * venue's name, that exists whether or not the venue sells online. The card
   * layer already says so honestly (`urlKind: 'search'`, and `actionLabel`
   * refuses to call it "Đặt món"); the PROSE had no such boundary.
   *
   * Only a direct page from `order_search_results`, attributed to a place by
   * the same matcher the price and TikTok paths use, belongs in this set.
   * Measured 2026-09-09: the one direct ShopeeFood link the bún bò turn
   * retrieved was for "Bún bò Na - Nguyễn Cảnh Chân", which was NOT one of the
   * six results — so the honest size of this set was zero.
   */
  orderablePlaces?: Set<string>
  /**
   * Structured ratings keyed by the place they belong to.
   *
   * 🚨 `ratings` IS BATCH-WIDE, AND A RATING IS NOT A PROPERTY OF A BATCH.
   * Measured 2026-09-09: with one row rated 4.5, the sentence "Bún Bò 5T được
   * 4.5 sao" passed even though 5T was a DIFFERENT restaurant with no rating at
   * all - the pool did not know whose number it was. Keyed here so a rating can
   * only support a claim about the venue it actually belongs to.
   */
  ratingsByEntity?: Map<string, number[]>
  /** Structured review counts (`rating_count`), keyed the same way. */
  reviewCountsByEntity?: Map<string, number[]>
  /** The venue's OWN phone number(s), keyed the same way. */
  phonesByEntity?: Map<string, string[]>
  /**
   * Venues with a DIRECT, entity-level ticket/booking URL.
   *
   * 🚨 A CHAIN HOMEPAGE OR A SEARCH PAGE IS NOT A MEMBER. Built from links that
   * were attributed to one venue AND pass `isDirectTicketUrl`. Empty means no
   * venue this turn can be said to sell tickets — which is the honest state of
   * every Entertainment turn measured so far.
   */
  ticketablePlaces?: Set<string>
}

/**
 * A qualitative verdict on how good a place is.
 *
 * These are the phrasings the audit actually produced plus their obvious
 * variants. A generic "tốt"/"good" is deliberately NOT here: it is a judgement
 * about fit, which the reply is supposed to make, not a claim about a rating.
 */
const QUALITY_RE = /(đánh giá cao|danh gia cao|đánh giá tốt|danh gia tot|được đánh giá|duoc danh gia|rating (?:tốt|cao|tot)|nhiều đánh giá tốt|highly[\s-]?rated|top[\s-]?rated|best[\s-]?rated|well[\s-]?reviewed|great reviews?|excellent reviews?)/iu

/**
 * A claim that a place is POPULAR, well-liked, busy or famous.
 *
 * 🚨 MEASURED ON LOCALHOST 2026-09-09. For "bún bò ở Quận 1" the reply said
 * "Bún Bò Huế Đông Ba ... được nhiều người yêu thích". There was no rating in
 * the turn at all — the rows are OSM and Google Places is down — and no snippet
 * said it about that restaurant. The phrase was licensed by the REVIEW SENTIMENT
 * prompt rule, which harvests positive words out of ANY retrieved text
 * (including the area-level price listicle) and appends them to a named place.
 *
 * 🔑 SEPARATE FROM `QUALITY_RE` ON PURPOSE. That one is about a RATING ("đánh
 * giá cao", "highly rated"). This is about POPULARITY, which sounds softer and
 * is exactly why it slipped through — but "many people love it" is a factual
 * claim about a business, not an opinion the assistant is entitled to hold.
 *
 * REVIEW SENTIMENT IS THE SAME CLAIM, WORDED AS WHAT CUSTOMERS SAID.
 * "được nhiều khách review" and "Khách thường khen ... thơm ngon" assert how
 * diners feel about ONE restaurant just as plainly as "được nhiều người yêu
 * thích" does. Measured on the review UAT 2026-09-09: all four such phrasings
 * survived with zero entity-level review evidence, while the rating beside them
 * was correctly removed. They are governed by the same rule, which needs a
 * retrieved rating or text that named this very venue.
 */
const POPULARITY_RE = /(được nhiều người|duoc nhieu nguoi|nhiều người (?:yêu thích|ưa chuộng|thích|lựa chọn)|nhieu nguoi (?:yeu thich|ua chuong|thich|lua chon)|được (?:yêu thích|ưa chuộng)|duoc (?:yeu thich|ua chuong)|đông khách|dong khach|nổi tiếng|noi tieng|quán ruột|quan ruot|được nhiều khách|duoc nhieu khach|nhiều khách|nhieu khach|(?:thực |thuc )?khách (?:hàng )?(?:thường )?(?:khen|nhận xét|đánh giá)|(?:thuc )?khach (?:hang )?(?:thuong )?(?:khen|nhan xet|danh gia)|được review tốt|duoc review tot|best[\s-]?sell|popular|well[\s-]?loved|crowd[\s-]?favou?rite|favou?rite|beloved|famous for|customers? (?:love|rave|praise)|diners? (?:love|praise))/iu

/**
 * A claim that a venue sells online / delivers.
 *
 * 🚨 MEASURED TWICE, AND THE PROMPT DID NOT STOP IT. The first bún bò UAT said
 * "có đặt online qua ShopeeFood/GrabFood"; after a prompt rule forbidding
 * exactly that, the next one said "cũng đều có giao hàng". Both were assertions
 * about restaurants whose only "ordering" evidence was a search URL built from
 * their own name. This is the lesson the project already recorded once: a rule
 * in the prompt does not bound the model — a deterministic guard does.
 */
const ORDERING_RE = /(giao hàng|giao hang|giao tận nhà|giao tan nha|giao tận nơi|giao tan noi|giao đến|giao den|đặt bàn|dat ban|đặt chỗ|dat cho|đặt món|dat mon|đặt online|dat online|đặt qua|dat qua|gọi món|goi mon|gọi về nhà|goi ve nha|nhận đơn|nhan don|mang về|mang ve|\bship\b|order online|online ordering|delivery available|offers? delivery|takeaway|take-away|book a table|reservation)/iu

/**
 * Wording that ASSERTS the venue has the service, as opposed to merely
 * mentioning it. "có giao hàng", "có đặt bàn", "nhận đơn online" are possession
 * claims whatever else the sentence says.
 */
const ORDERING_POSSESSION_RE = /(có (?:giao hàng|giao hang|đặt bàn|dat ban|đặt chỗ|dat cho|ship|nhận đơn|nhan don|dịch vụ giao|dich vu giao|đặt online|dat online)|nhận đơn online|nhan don online|dịch vụ giao hàng|dich vu giao hang|offers? delivery|delivery available|has delivery)/iu

/**
 * Wording that frames the platform as somewhere to LOOK, not as a service the
 * venue is confirmed to have.
 *
 * 🔑 THIS EXEMPTION EXISTS SO THE HONEST SENTENCE SURVIVES. The order links ARE
 * search pages, and the prompt teaches the model to say so — "bạn có thể tìm
 * trên ShopeeFood". Once the vocabulary widened to bare "giao hàng", that
 * correct sentence would have been deleted along with the false ones, which
 * would push the model back toward saying nothing useful at all.
 *
 * 🚨 POSSESSION WINS. A sentence that both looks-up AND asserts ("bạn có thể
 * tìm trên ShopeeFood và quán có giao hàng") is still a possession claim, so the
 * exemption is checked only when `ORDERING_POSSESSION_RE` does not match.
 */
const ORDERING_SEARCH_FRAMING_RE = /(có thể tìm|co the tim|kiểm tra|kiem tra|tìm trên|tim tren|tìm kiếm trên|tim kiem tren|xem trên|xem tren|tra trên|tra tren|vào website|vao website|vào app|vao app|trên website|tren website|trên app|tren app|truy cập|truy cap|xem lịch chiếu|xem lich chieu|search (?:on|for)|look (?:up|for)|check (?:on|out)|visit (?:the )?(?:website|site|app))/iu

/**
 * Does this sentence CLAIM the venue takes orders / delivers / books tables?
 *
 * 🔑 ONE PREDICATE, TWO CALLERS. `guardPlaceClaimsInText` enforces it and
 * `mayRedactPlaceClaim` holds the sentence back from early streaming. They must
 * agree exactly — a phrase the guard would remove but the flush released is the
 * leak that has already happened once — so neither re-derives the rule.
 *
 * A question is never a claim: "Bạn muốn đặt online hay ăn tại quán?" asks.
 */
export function isOrderingClaim(sentence: string): boolean {
  if (!ORDERING_RE.test(sentence)) return false
  if (/\?\s*$/.test(sentence.trim())) return false
  if (ORDERING_POSSESSION_RE.test(sentence)) return true
  return !ORDERING_SEARCH_FRAMING_RE.test(sentence)
}

// ── ENTERTAINMENT: TICKETS ───────────────────────────────────────────────────
//
// 🚨 MEASURED 2026-09-09, and the hole was total. Against an empty evidence set
// every one of these passed the guard AND streamed early:
//
//   "Rạp Phim Cinestar còn vé cho suất 20h tối nay."
//   "Bạn có thể mua vé online tại Galaxy Cinema."
//   "Rạp chiếu phim CGV có bán vé online."
//   "Galaxy Cinema đang chiếu suất 21h tối nay."
//   "Vé xem phim tại Galaxy Cinema đã bán hết."
//
// `ORDERING_RE` covers the FOOD verbs (đặt bàn / gọi món / giao hàng) and knows
// nothing about vé, so entertainment had no ticket boundary at all.
//
// 🔑 SAME SHAPE AS ORDERING, NOT A NEW SYSTEM: a claim surface, a possession
// set, the shared look-it-up exemption, one predicate used by both the guard and
// the streaming boundary, and an entity-level evidence set.

/** Anything that talks about tickets or showtimes. */
const TICKET_RE = /(đặt vé|dat ve|mua vé|mua ve|bán vé|ban ve|còn vé|con ve|hết vé|het ve|có vé|co ve|vé xem phim|ve xem phim|suất chiếu|suat chieu|lịch chiếu|lich chieu|đang chiếu|dang chieu|suất \d|suat \d|book(?:ing)? tickets?|buy tickets?|tickets? available|sold out|showtimes?)/iu

/**
 * A claim about CURRENT AVAILABILITY or a SPECIFIC SHOWTIME.
 *
 * 🚨 THESE CAN NEVER BE SUPPORTED, BY ANY EVIDENCE THIS PIPELINE HAS. Nothing
 * retrieves seat availability or a screening schedule — OSM has neither and no
 * showtime provider is wired. So unlike a ticket-sale claim, this is not gated
 * on a URL: it is unconditionally unsupported, the same fail-closed call
 * `redactScheduleAvailability` makes for travel schedules.
 */
const TICKET_AVAILABILITY_RE = /(còn vé|con ve|hết vé|het ve|đã bán hết|da ban het|còn chỗ|con cho|đang chiếu|dang chieu|suất \d{1,2}\s*h|suat \d{1,2}\s*h|chiếu lúc|chieu luc|sold out|tickets? available|now showing)/iu

/** Wording that asserts the venue SELLS tickets, as opposed to mentioning them. */
const TICKET_SALE_POSSESSION_RE = /(có bán vé|co ban ve|bán vé online|ban ve online|có vé|co ve|đặt vé (?:ngay|online|trực tuyến)|dat ve (?:ngay|online)|mua vé (?:online|trực tuyến)|mua ve online|sells? tickets?|tickets? on sale)/iu

/**
 * Is this a claim that the venue has tickets on sale?
 *
 * Gated on a DIRECT entity-level ticket URL. A chain homepage
 * (`https://cinestar.com.vn/`) and a search page are NOT that — see
 * `isDirectTicketUrl` — which is the distinction the whole rule exists to make.
 */
export function isTicketSaleClaim(sentence: string): boolean {
  if (!TICKET_RE.test(sentence)) return false
  if (/\?\s*$/.test(sentence.trim())) return false
  if (TICKET_AVAILABILITY_RE.test(sentence)) return false // handled by the stricter rule
  if (TICKET_SALE_POSSESSION_RE.test(sentence)) return true
  return !ORDERING_SEARCH_FRAMING_RE.test(sentence)
}

/** Is this a claim about seats being available, or about a specific showtime? */
export function isTicketAvailabilityClaim(sentence: string): boolean {
  if (!TICKET_AVAILABILITY_RE.test(sentence)) return false
  if (/\?\s*$/.test(sentence.trim())) return false
  return !ORDERING_SEARCH_FRAMING_RE.test(sentence)
}

/**
 * Does this text mention tickets or showtimes at all?
 *
 * 🚨 THIS IS A TURN TRIGGER, NOT A CLAIM TEST. It reads the USER'S message to
 * decide whether the turn must be guarded, so it deliberately has no possession
 * or framing logic — asking "mua vé ở đâu?" is not a claim, but it is exactly
 * the turn on which the model will make one.
 *
 * 🔑 WHY A TRIGGER IS NEEDED AT ALL. `emitReconstructed` returns early when
 * `bufferMode` is false, so on a live turn NO guard runs and the bytes are
 * already gone. Measured 2026-09-09: "cuối tuần này ở Quận 1 có sự kiện gì hay,
 * mua vé ở đâu?" was answered with `get_news` + `web_search`, so
 * `hadPlaceSearch || placeIntent` was false and the whole settle path — every
 * provenance guard — was skipped.
 */
export function mentionsTickets(text: string | null | undefined): boolean {
  return !!text && TICKET_RE.test(text)
}

/**
 * Is this URL a direct, entity-level destination rather than a front door?
 *
 * 🔑 THE TEST MOVED TO `links/directUrl` and is re-exported here under the name
 * the ticket rules use. The CTA validator needs the IDENTICAL judgement — a
 * homepage must not support a ticket claim in prose OR a "Mua vé" button — so
 * there is one definition, not two that can drift.
 */
export const isDirectTicketUrl = isDirectEntityUrl


/** A stated score: "4.8 sao", "4,8/5", "4.5 stars". */
const SCORE_RE = /\b\d(?:[.,]\d+)?\s*(?:\/\s*5|sao\b|stars?\b|điểm\b|diem\b)/iu

/**
 * A stated REVIEW COUNT: "1.200 đánh giá", "2,847 reviews", "hơn 500 nhận xét".
 *
 * 🚨 NOTHING CHECKED THIS AT ALL. Measured 2026-09-09 against an empty evidence
 * set: "Bún Bò Huế Đông Ba có 2.847 đánh giá trên Google Maps." survived
 * untouched. `SCORE_RE` does not match it (no "sao", no "/5"), so no rule ever
 * looked at it - a completely invented review count reached the user while the
 * rating beside it was correctly being removed.
 * 🚨 THE TRAILING BOUNDARY IS `(?!\p{L})`, NOT `\b`. `\b` after "giá" never matches:
 * `á` is not an ASCII word character, so the boundary does not exist and the whole
 * pattern silently fails. Same trap that has now bitten three times in this repo.
 */
const REVIEW_COUNT_RE = /\d[\d.,]*\s*(?:\+\s*)?(?:đánh giá|danh gia|nhận xét|nhan xet|lượt đánh giá|luot danh gia|reviews?|ratings?)(?!\p{L})/iu

/**
 * A Vietnamese phone number stated in prose.
 *
 * Deliberately narrow - a leading `0` or `+84` then 9-11 digits - so it cannot
 * mistake a price ("25.000"), a house number ("248 Bùi Viện") or a distance for
 * a phone. The CARD path never needed this: `tel:` is built from the venue's own
 * OSM/Places field and is entity-level by construction. Prose has no such tie,
 * and the retrieved snippets the model reads are full of OTHER restaurants'
 * numbers - measured, a number lifted from an area snippet survived.
 *
 * VN service hotlines (1900/1800) count too: "Gọi hotline 1900 1234" is a
 * number the user will dial, and inventing one is the same harm as inventing a
 * landline. Measured on the phone UAT - it was not matched before.
 */
const PHONE_RE = /(?:\+84|0)(?:[\s.-]?\d){8,10}|(?:1900|1800)(?:[\s.-]?\d){4,6}/u

/**
 * The review counts a sentence states, parsed as COUNTS rather than decimals.
 *
 * 🚨 `numbersIn` READS "2.847" AS 2.847. In Vietnamese that is two thousand
 * eight hundred and forty-seven reviews, and `parseFloat` turns it into a number
 * smaller than three — so a perfectly good count never matched the provider's
 * and was deleted. Scores keep the decimal reading (4.5 really is four and a
 * half); counts strip the separators. Two different quantities, two parsers.
 */
function statedReviewCounts(sentence: string): number[] {
  const out: number[] = []
  for (const m of sentence.matchAll(new RegExp(REVIEW_COUNT_RE, 'giu'))) {
    const digits = (m[0].match(/^[\d.,]+/) ?? [''])[0].replace(/[.,]/g, '')
    const n = parseInt(digits, 10)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/** A phone reduced to digits, so spacing and punctuation cannot hide a mismatch. */
const phoneDigits = (v: string): string => v.replace(/\D/g, '').replace(/^84/, '0')


/**
 * A stated distance in km or m.
 *
 * Minutes are deliberately excluded — "4 phút đi bộ" is a walking TIME that
 * providers really do return in their snippets, and it is caught by the
 * trace-to-text rule below like any other retrieved number, not by this one.
 */
const DISTANCE_RE = /(?:cách|cach|khoảng cách|khoang cach|~|approx\.?|about)?\s*\d+(?:[.,]\d+)?\s*(?:-|–|đến|den|to)?\s*(?:\d+(?:[.,]\d+)?)?\s*(?:km|kilomet(?:er|re)s?|mét|met\b|m)\b/iu

/** Every number that appears in retrieved text, as a bare numeric list. */
function numbersIn(texts: string[]): number[] {
  const out: number[] = []
  for (const t of texts) {
    for (const m of (t || '').matchAll(/\d+(?:[.,]\d+)?/g)) {
      const n = parseFloat(m[0].replace(',', '.'))
      if (Number.isFinite(n)) out.push(n)
    }
  }
  return out
}

const NEAR = 0.05
const near = (v: number, pool: number[]): boolean =>
  pool.some(p => Math.abs(v - p) <= Math.max(Math.abs(p) * NEAR, 0.05))

/** The numbers a sentence states, so each can be checked against the evidence. */
function numbersOf(sentence: string): number[] {
  return numbersIn([sentence])
}


/**
 * A sentence that refers to a venue by pointing at it rather than naming it.
 *
 * "Quán này …", "Nơi này …", "This place …". Such a sentence borrows its subject
 * from an earlier one; on its own it says nothing the reader can resolve.
 */
const ANAPHOR_RE = /^\s*[*_>\-\s]*(?:quán|quan|nơi|noi|chỗ|cho|địa điểm|dia diem|tiệm|tiem|nhà hàng|nha hang)\s+(?:này|nay|đó|do)\b|^\s*[*_>\-\s]*(?:this|the)\s+(?:place|spot|restaurant|venue|one)\b/iu

/**
 * Could `guardPlaceClaimsInText` remove this sentence, on SOME evidence?
 *
 * 🚨 THIS IS THE STREAMING BOUNDARY, AND IT IS DELIBERATELY EVIDENCE-BLIND.
 * `safeFlushPoint` asks it while the reply is still being generated, when the
 * retrieval may not have arrived yet — so "will the evidence support this?" is
 * unanswerable and the only safe question is "could this sentence ever be a
 * candidate?". Same fail-closed reasoning `progressiveFlush` already applies to
 * money claims, and the same reason it must not consult evidence.
 *
 * 🔑 ONE VOCABULARY, NOT TWO. It is built from the guard's OWN regexes, so a
 * phrase can never come to mean "a claim" in the guard and "not a claim" at the
 * flush boundary — which is precisely how a boundary like this rots. Adding a
 * rule above without adding it here would reopen the leak, so they are together.
 *
 * The question exemption mirrors rule 1c exactly: the guard never removes a
 * question, so holding one back would cost latency for no safety.
 */
export function mayRedactPlaceClaim(sentence: string): boolean {
  if (QUALITY_RE.test(sentence)) return true
  if (POPULARITY_RE.test(sentence)) return true
  if (isOrderingClaim(sentence)) return true
  if (isTicketSaleClaim(sentence)) return true
  if (isTicketAvailabilityClaim(sentence)) return true
  if (SCORE_RE.test(sentence)) return true
  if (REVIEW_COUNT_RE.test(sentence)) return true
  if (PHONE_RE.test(sentence)) return true
  if (DISTANCE_RE.test(sentence)) return true
  return false
}

/**
 * Clause boundaries INSIDE one sentence.
 *
 * Only connectives that genuinely join independent statements. A clause removed
 * here takes its LEADING connective with it, which is what stops the dangling
 * "và phù hợp…" output that made `redactUnsupportedClaims` choose whole-sentence
 * removal in the first place (POLICY R3) — the two rules agree rather than
 * compete.
 */
const CLAUSE_SPLIT = /(\s*[—–]\s*|\s+-\s+|\s*;\s*|\s*,\s+|\s+và\s+|\s+and\s+)/u

/**
 * Drop just the clauses that carry an unsupported claim, keeping the rest.
 *
 * 🚨 WHY THIS EXISTS — THE MEASURED ARTIFACT. Whole-sentence removal was
 * deleting the sentence that INTRODUCED the venue, because the model puts the
 * name and the unsupported claim in one breath:
 *
 *   "Mình chọn **Bún Bò Huế Đông Ba** cho bạn — quán này gần nhất và có giao hàng."
 *   "Quán này là lựa chọn tiện lợi nhất."
 *
 * Removing the first left the second with no antecedent: a reply that opens
 * "Quán này …" and never says which quán. Measured on localhost 2026-09-09.
 *
 * 🚨 IT NEVER WRITES A WORD. Every character of the result came from the input,
 * exactly like the sentence-level path. This is not a rewriter and there is no
 * softening: an unsupported claim is DELETED, never rephrased. When the claim
 * cannot be isolated to a clause, the caller falls back to removing the whole
 * sentence — provenance never yields to grammar.
 *
 * Returns null when clause-level removal is not possible or not safe, which
 * means "use the sentence-level path".
 */
function stripOffendingClauses(sentence: string, offenders: readonly RegExp[]): { text: string; headRemoved: boolean } | null {
  const tail = /([.!?]*\s*)$/.exec(sentence)?.[1] ?? ''
  const core = sentence.slice(0, sentence.length - tail.length)
  const parts = core.split(CLAUSE_SPLIT)
  // Fewer than 3 parts means one clause: there is nothing to isolate.
  if (parts.length < 3) return null

  const kept: string[] = []
  let removed = false
  let headRemoved = false
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i]
    if (offenders.some(re => re.test(clause))) {
      removed = true
      if (i === 0) headRemoved = true
      continue
    }
    // A kept clause brings the connective that introduced it — unless it is now
    // the first thing in the sentence, which is how a leading "và" is avoided.
    kept.push(kept.length === 0 ? clause : (parts[i - 1] ?? '') + clause)
  }
  if (!removed || kept.length === 0) return null

  const out = (kept.join('') + tail)
  // The survivor must still be prose, and must no longer make the claim.
  if (!/\p{L}/u.test(out)) return null
  if (offenders.some(re => re.test(out))) return null
  return { text: out, headRemoved }
}

/**
 * Is what survived a trim a sentence in its own right, or the tail of the claim?
 *
 * 🚨 MEASURED ON THE REVIEW UAT 2026-09-09. The model wrote
 *
 *   "Khách thường khen bún bò Huế ở đây thơm ngon, nước dùng đậm đà, topping đầy đủ."
 *
 * The leading clause carries the claim AND the subject, so trimming it left
 * "nước dùng đậm đà, topping đầy đủ." glued onto the previous sentence — a list
 * of qualities with nothing to attach them to.
 *
 * A trailing clause only stands alone when it still names the venue it is
 * about. So a trim that removes the HEAD clause is accepted only if the survivor
 * names a place; otherwise the whole sentence goes. A trim that keeps the head
 * is unaffected, which is the ordinary "… và có giao hàng" case.
 */
function trimStandsAlone(headRemoved: boolean, survivorNames: string | null): boolean {
  return !headRemoved || survivorNames !== null
}

/**
 * Remove sentences whose rating or distance claim the retrieval does not support.
 *
 * Writes nothing: every character of the output came from the input. If removal
 * would leave no prose at all, the original is kept — an empty reply is a worse
 * failure than a hedged one, which is the same call `redactUnsupportedClaims`
 * and `redactScheduleAvailability` already make.
 */
/**
 * Which rules to apply.
 *
 * 🚨 `'tickets'` EXISTS BECAUSE THE OTHER RULES ARE PLACE-SPECIFIC. On a news or
 * event turn nothing collects `placeRatings`/`placeTexts`, so running the rating
 * and distance rules there would fail-close on evidence the turn never had a
 * chance to gather — deleting, say, a film's score that a web snippet really did
 * support. The ticket rules have no such dependency: NOTHING anywhere retrieves
 * seat availability or a screening schedule, so they are correct on any turn.
 *
 * Default `'all'` keeps every shipped caller byte-identical.
 */
export interface PlaceClaimOptions {
  scope?: 'all' | 'tickets'
}

export function guardPlaceClaimsInText(
  text: string,
  evidence: PlaceClaimEvidence,
  opts: PlaceClaimOptions = {},
): { text: string; redacted: number } {
  const ticketsOnly = opts.scope === 'tickets'
  if (!text) return { text, redacted: 0 }
  const { ratings, distancesKm, texts, entityTexts, placeNames, orderablePlaces } = evidence
  const { ratingsByEntity, reviewCountsByEntity, phonesByEntity, ticketablePlaces } = evidence
  const retrievedNumbers = numbersIn(texts)
  const tokens = placeTokensFor(placeNames ?? [])
  /** The single place this sentence names, or null when it names none or several. */
  const placeNamedIn = (sentence: string): string | null => {
    const named = tokens.filter(t => textNamesPlace(sentence, '', t))
    return named.length === 1 ? named[0].name : null
  }
  /**
   * The venue a sentence is ABOUT, following the subject across a paragraph.
   *
   * 🚨 REAL REPLIES ATTRIBUTE BY ANAPHORA. "Mình chọn Quán Cà Phê Nhỏ. Quán này
   * 4.8 sao nhé." — the score sentence names nobody, and sentence-only
   * attribution would call it unattributable and delete a perfectly good claim.
   * A blank line ends the subject's scope, exactly as in `snippetPriceGuard`.
   */
  const placeNamedAt = (idx: number, spansIn: Array<[number, number]>): string | null => {
    const own = placeNamedIn(text.slice(spansIn[idx][0], spansIn[idx][1]))
    if (own) return own
    const paragraphStart = text.lastIndexOf('\n\n', spansIn[idx][0])
    for (let j = idx - 1; j >= 0 && spansIn[j][0] > paragraphStart; j--) {
      const prev = placeNamedIn(text.slice(spansIn[j][0], spansIn[j][1]))
      if (prev) return prev
    }
    return null
  }
  const distancePool = [...distancesKm, ...retrievedNumbers]
  const ratingPool = [...ratings, ...retrievedNumbers]

  const spans = sentenceSpans(text)
  const doomed = new Set<number>()
  /** Sentences kept in a trimmed form, with only the unsupported clause removed. */
  const trimmed = new Map<number, string>()
  /**
   * Sentences removed ONLY because they lost their antecedent - tracked apart
   * from `doomed` because they carry no unsupported claim, which makes them the
   * ones to give back if removing everything would empty the reply.
   */
  const orphaned = new Set<number>()

  spans.forEach(([a, b], i) => {
    const s = text.slice(a, b)

    /**
     * The claim rules that fired on this sentence.
     *
     * Collected rather than acted on one at a time, so a sentence carrying two
     * unsupported claims loses BOTH clauses in one pass instead of surviving
     * the first rule's trim and being re-judged by the second.
     */
    const violated: RegExp[] = []

    // 1) A verdict on quality needs a retrieved rating to be a verdict about.
    if (!ticketsOnly && QUALITY_RE.test(s)) {
      // Entity-scoped when the sentence names one: a rating on some OTHER row in
      // the batch is not a verdict about this restaurant. Falls back to the
      // batch reading only when no single place is named.
      /**
       * 🚨 FAIL-CLOSED WHEN THE SENTENCE CANNOT BE ATTRIBUTED. A rating is a fact
       * about ONE business, so batch-wide `ratings` can never justify a verdict
       * we cannot tie to a venue. Measured: "Bún Bò 5T được đánh giá cao" passed
       * on the strength of a rating belonging to Bún Bò Huế Đông Ba — and note
       * 5T is unattributable anyway, its only distinctive token being 2 chars.
       * Either we know whose verdict this is, or we do not state it.
       */
      const named = placeNamedAt(i, spans)
      /**
       * 🔑 STRICT ONLY WHEN THE CALLER SUPPLIED THE PER-ENTITY EVIDENCE.
       * `ratingsByEntity === undefined` means a caller that predates this axis,
       * and it keeps the batch reading it was written against — the same
       * additive rule `entityTexts` and `orderablePlaces` already follow. The
       * production path always supplies the map (empty when nothing was rated),
       * so production is always strict.
       */
      const own = ratingsByEntity
        ? (named ? (ratingsByEntity.get(named) ?? []) : [])
        : ratings
      if (own.length === 0) violated.push(QUALITY_RE)
    }

    // 1b) A popularity claim needs evidence ABOUT THE PLACE IT NAMES. A retrieved
    //     rating counts for the batch; otherwise the only thing that counts is
    //     retrieved text that named this very place. Area-level text — the
    //     "top 10 quán ... Quận 1" listicle — supports a statement about the
    //     district and nothing about any restaurant in it.
    //
    //     🚨 THE CORRECT REPAIR IS REMOVAL, NOT A SOFTER WORDING. Rewriting
    //     "được nhiều người yêu thích" into "có vẻ được ưa chuộng" would keep an
    //     unsupported claim and merely hedge it; the sentence goes.
    if (!ticketsOnly && POPULARITY_RE.test(s) && ratings.length === 0) {
      const named = placeNamedIn(s)
      const own = named ? (entityTexts?.get(named) ?? []) : []
      if (own.length === 0) violated.push(POPULARITY_RE)
    }

    // 1c) An ordering/delivery claim needs a DIRECT ordering page for the place
    //     it is about. A search URL built from the venue's own name is not
    //     evidence that the venue sells online.
    //
    //     A question is not a claim: "Bạn muốn đặt online hay ăn tại quán?" asks
    //     the user something and asserts nothing, so it is left alone.
    if (!ticketsOnly && isOrderingClaim(s)) {
      const named = placeNamedIn(s)
      const orderable = orderablePlaces ?? new Set<string>()
      // Nothing in the turn had a direct ordering page ⇒ no venue can be said to
      // sell online. Otherwise the sentence must name a place that does.
      if (orderable.size === 0 || !named || !orderable.has(named)) violated.push(ORDERING_RE)
    }

    /**
     * 1d) A TICKET SALE claim needs a direct, entity-level ticket page.
     *
     * The venue's own deep page counts; a chain homepage does not, and neither
     * does a search URL. With nothing direct retrieved — the normal case today —
     * no venue can be said to sell tickets.
     */
    if (isTicketSaleClaim(s)) {
      const named = placeNamedAt(i, spans)
      const ticketable = ticketablePlaces ?? new Set<string>()
      if (ticketable.size === 0 || !named || !ticketable.has(named)) violated.push(TICKET_RE)
    }

    /**
     * 1e) AVAILABILITY and SHOWTIMES are unconditional.
     *
     * 🚨 NO EVIDENCE OF THIS KIND EXISTS ANYWHERE IN THE PIPELINE. Seat
     * availability and screening schedules are not retrieved by OSM, by the
     * price search, or by anything else — so "còn vé cho suất 20h tối nay" and
     * "đang chiếu suất 21h" cannot be supported however good the venue's URL is.
     * A ticket page would let the user CHECK; it does not tell us the answer.
     */
    if (isTicketAvailabilityClaim(s)) violated.push(TICKET_AVAILABILITY_RE)

    /**
     * 🔑 KEEP THE INTRODUCTION, DROP THE CLAIM.
     *
     * A trim is accepted only when the survivor still names the place the
     * original named — which is precisely the guarantee that an
     * entity-introduction sentence is never deleted for a claim attached to it.
     * If the name cannot be kept without the claim, the whole sentence goes.
     */
    if (violated.length > 0) {
      const namedBefore = placeNamedIn(s)
      const trim = stripOffendingClauses(s, violated)
      const survivorNames = trim ? placeNamedIn(trim.text) : null
      if (trim !== null
        && (namedBefore === null || survivorNames === namedBefore)
        && trimStandsAlone(trim.headRemoved, survivorNames)) {
        trimmed.set(i, trim.text)
      } else {
        doomed.add(i)
      }
      return
    }

    /**
     * 2) A stated score must trace to a retrieved number — and when the sentence
     *    names a venue, to a number about THAT venue.
     *
     * 🚨 AN AREA LISTICLE WAS VALIDATING AN ENTITY RATING. `ratingPool` mixed
     * the structured ratings with every number in `texts`, and `texts` includes
     * the area-level price snippets. Measured 2026-09-09: with the single
     * retrieved text "Top 10 quán bún bò Quận 1 ngon nhất - Đánh giá 4.5/5 từ
     * hơn 1.200 thực khách", the sentence "Bún Bò Huế Đông Ba được 4.5 sao"
     * PASSED — a district's aggregate score presented as one restaurant's.
     * With no evidence at all the same sentence was correctly removed, so the
     * listicle was doing the damage.
     *
     * Entity-scoped pool: that venue's own structured rating, plus numbers from
     * retrieved text that NAMED it. Area text supports an unattributed sentence
     * and nothing else — the same rule the price guard already applies.
     */
    if (!ticketsOnly && SCORE_RE.test(s)) {
      // Fail-closed for the same reason as the verdict above: an unattributable
      // score has no venue to be a score OF.
      const named = placeNamedAt(i, spans)
      const pool = ratingsByEntity
        ? (named ? [...(ratingsByEntity.get(named) ?? []), ...numbersIn(entityTexts?.get(named) ?? [])] : [])
        : ratingPool
      const stated = numbersOf(s)
      if (stated.length > 0 && !stated.some(n => near(n, pool))) { doomed.add(i); return }
    }

    /**
     * 2b) A stated REVIEW COUNT must trace to that venue's own count.
     *
     * 🚨 PREVIOUSLY UNCHECKED ENTIRELY — an invented "2.847 đánh giá" reached
     * the user because no rule matched the phrase. A count is a fact about one
     * business; with nothing structured for it, it cannot be stated.
     */
    if (!ticketsOnly && REVIEW_COUNT_RE.test(s)) {
      const named = placeNamedAt(i, spans)
      const pool = named ? (reviewCountsByEntity?.get(named) ?? []) : []
      const stated = statedReviewCounts(s)
      if (stated.length > 0 && !stated.some(n => near(n, pool))) { doomed.add(i); return }
    }

    /**
     * 2c) A stated PHONE NUMBER must be the venue's own.
     *
     * 🚨 The card is safe by construction — `tel:` is built from the row's own
     * OSM/Places field. Prose is not: the snippets the model reads carry other
     * restaurants' numbers, and measured, one lifted from an area snippet
     * survived. Calling the wrong business is the kind of error a user acts on
     * immediately, so an unmatched or unattributable number is removed.
     */
    if (!ticketsOnly && PHONE_RE.test(s)) {
      const named = placeNamedAt(i, spans)
      const own = (named ? (phonesByEntity?.get(named) ?? []) : []).map(phoneDigits)
      const stated = (s.match(new RegExp(PHONE_RE, 'gu')) ?? []).map(phoneDigits)
      if (stated.length > 0 && !stated.every(d => own.includes(d))) { doomed.add(i); return }
    }

    // 3) A stated distance must trace to a computed distance or a retrieved one.
    if (!ticketsOnly && DISTANCE_RE.test(s)) {
      const stated = numbersOf(s)
      if (stated.length > 0 && !stated.some(n => near(n, distancePool))) { doomed.add(i); return }
    }
  })

  /**
   * 🚨 REMOVING A CLAIM MUST NOT ORPHAN THE NEXT SENTENCE.
   *
   * Clause-level removal above keeps the venue's name whenever the claim can be
   * isolated. It cannot when the claim IS the whole sentence — "Bún Bò Huế Đông
   * Ba có giao hàng." — and deleting that leaves the reply opening
   * "Quán này là lựa chọn tiện lợi nhất." with no antecedent: the exact artifact
   * measured on localhost 2026-09-09.
   *
   * 🔑 THE SAFE DIRECTION IS TO REMOVE MORE, NEVER LESS. An orphaned anaphor is
   * dropped as well; no unsupported claim is kept to save a sentence, and
   * nothing is reworded. Iterated to a fixed point because removing one orphan
   * can orphan the next.
   *
   * Paragraph-scoped, matching how the price guard carries a subject forward: a
   * blank line is where a reply stops talking about one venue.
   */
  let changed = true
  while (changed) {
    changed = false
    spans.forEach(([a, b], i) => {
      if (doomed.has(i) || orphaned.has(i)) return
      const sentence = trimmed.get(i) ?? text.slice(a, b)
      if (!ANAPHOR_RE.test(sentence)) return
      // A sentence that names the venue itself is not leaning on anything.
      if (placeNamedIn(sentence)) return
      const paragraphStart = text.lastIndexOf('\n\n', a)
      /**
       * 🚨 ONLY CLEAN UP DAMAGE THIS GUARD CAUSED.
       *
       * `hadAntecedent` asks whether an earlier sentence in this paragraph named
       * a place BEFORE the guard ran; `hasAntecedent` whether one still does.
       * Removing an orphan is right only when that answer CHANGED - i.e. the
       * guard itself deleted the introduction.
       *
       * Without the distinction the rule over-reaches: a reply that simply opens
       * "Quán này gần bạn nhất nên tiện ghé." never had a prose antecedent to
       * lose (the card supplies it), and deleting a perfectly supported sentence
       * would be a bigger defect than the one being fixed. Caught by the shipped
       * "leaves an ordinary fit judgement alone" test.
       */
      let hadAntecedent = false
      let hasAntecedent = false
      for (let j = i - 1; j >= 0 && spans[j][0] > paragraphStart; j--) {
        const original = text.slice(spans[j][0], spans[j][1])
        if (placeNamedIn(original)) hadAntecedent = true
        if (doomed.has(j) || orphaned.has(j)) continue
        if (placeNamedIn(trimmed.get(j) ?? original)) { hasAntecedent = true; break }
      }
      if (hadAntecedent && !hasAntecedent) { orphaned.add(i); changed = true }
    })

    /**
     * 🚨 AND A LEAD-IN WHOSE LIST WAS REMOVED DANGLES FORWARD.
     *
     * The orphan rule above looks BACKWARD, for a sentence that lost its subject.
     * Measured on localhost 2026-09-09 (phone UAT), removal produced the mirror
     * image: the model wrote "Bạn có thể:" and then bullet lines carrying an
     * unsupported phone number. The bullets went; the colon stayed, promising a
     * list that is no longer there.
     *
     * A sentence whose visible text ENDS in a colon says "what follows explains
     * this". If nothing follows it any more in this paragraph, it explains
     * nothing and goes too. Same safe direction: it removes more, never less,
     * and no claim is kept to save it.
     */
    spans.forEach(([a, b], i) => {
      if (doomed.has(i) || orphaned.has(i)) return
      if (!/:\s*$/.test((trimmed.get(i) ?? text.slice(a, b)))) return
      const paragraphEnd = text.indexOf('\n\n', b)
      const limit = paragraphEnd === -1 ? text.length : paragraphEnd
      let somethingFollows = false
      let hadFollower = false
      for (let j = i + 1; j < spans.length && spans[j][0] < limit; j++) {
        const follower = text.slice(spans[j][0], spans[j][1])
        if (!/\p{L}/u.test(follower)) continue
        hadFollower = true
        if (!doomed.has(j) && !orphaned.has(j)) { somethingFollows = true; break }
      }
      if (hadFollower && !somethingFollows) { orphaned.add(i); changed = true }
    })
  }

  if (doomed.size === 0 && orphaned.size === 0 && trimmed.size === 0) return { text, redacted: 0 }

  const render = (drop: (i: number) => boolean): string =>
    spans
      .map(([a, b], i) => (drop(i) ? '' : trimmed.get(i) ?? text.slice(a, b)))
      .join('')
      .replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/\n{3,}/g, '\n\n').trim()
  const isProse = (t: string): boolean => /\p{L}/u.test(t)

  /**
   * 🚨 PRECEDENCE, IN ONE PLACE: A CLAIM NEVER COMES BACK TO SAVE A SENTENCE.
   *
   * The pre-existing "if removal would leave nothing, keep the original" rule
   * became reachable in a new way once orphans could also be removed - and it
   * handed the unsupported claim BACK. Measured: "Bún Bò Huế Đông Ba có giao
   * hàng. Quán này là lựa chọn tiện lợi nhất." lost both sentences, emptied, and
   * the fallback restored the delivery claim verbatim.
   *
   * So the fallback gives back the ORPHANS, which assert nothing, and never the
   * claims. Only when EVERY sentence carried an unsupported claim does the
   * original survive - the same last resort this guard always had, and in that
   * case there is no orphan left to dangle anyway.
   */
  const full = render(i => doomed.has(i) || orphaned.has(i))
  if (isProse(full)) return { text: full, redacted: doomed.size + orphaned.size + trimmed.size }

  const claimsOnly = render(i => doomed.has(i))
  if (isProse(claimsOnly)) return { text: claimsOnly, redacted: doomed.size + trimmed.size }

  return { text, redacted: 0 }
}
