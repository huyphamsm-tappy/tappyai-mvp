import { normalizeVN } from '@/lib/ai/intent'
import { detectDish } from '@/lib/ai/foodDish'

/**
 * ── WHICH OSM TAGS A PLACE QUERY ACTUALLY LIVES UNDER ────────────────────────
 *
 * Extracted from `searchPlacesOSM`, where it was an inline ladder assigning two
 * local variables. A MOVE plus two measured corrections — not a redesign.
 *
 * 🚨 THE BUG CLASS THIS FILE EXISTS TO CONTAIN. A category whose OSM tag key is
 * guessed wrong does not error. It returns an empty element list, which travels
 * downstream as `place_search_status: 'empty'` and reads exactly like "there are
 * no spas in District 1". The file's own history records the first instance:
 *
 *   > Hotels are tagged tourism=hotel, NOT amenity=hotel — querying amenity=hotel
 *   > returned 0 rows every time (verified: amenity=hotel→0 vs tourism=hotel→60
 *   > at Nha Trang), so the OSM hotel_list was silently always empty.
 *
 * Two more of the same shape were measured against live Overpass on 2026-09-08
 * and are corrected here:
 *
 *   amenity=spa  →   0 named  (Hanoi r=5000, HCMC Q1 r=5000, Da Nang r=6000)
 *   shop=massage →  60 / 60 / 40 named   ← where VN spas actually are
 *   shop=beauty  →  60 / 24 named        ← "làm đẹp", "chăm sóc da"
 *   leisure=spa  →   0 named             ← kept: correct upstream tag, sparse in VN
 *
 *   amenity=gym            →  0 named  (Hanoi r=6000, HCMC Q1 r=6000)
 *   leisure=fitness_centre → 21 / 39 named   ← the tag VN gyms actually carry
 *
 * `amenity=cinema` was measured too and is CORRECT — 16 named in Hanoi at
 * r=6000, and 3 (HN) / 4 (HCMC) at the r=1500 dense-metro radius the caller
 * really uses. It is listed here unchanged so the next reader does not re-test it.
 *
 * 🔑 WHY A LIST OF SELECTORS, NOT ONE KEY. The previous shape held ONE key with
 * an optional regex over its VALUES, which is enough for attractions (several
 * `tourism` subtypes) but cannot express a spa, which spans `shop`, `leisure`
 * and `amenity`. A union of selectors is what the data actually requires.
 */

/** One Overpass tag filter: `["<key>"<op>"<value>"]`. */
export interface OsmSelector {
  key: string
  /** '=' for an exact value, '~' for a regex alternation over values. */
  op: '=' | '~'
  value: string
}

export interface OsmCategory {
  /** The category name reported back as `amenity_type`. */
  label: string
  /** Every tag shape this category legitimately lives under. */
  selectors: OsmSelector[]
}

const s = (key: string, value: string, op: OsmSelector['op'] = '='): OsmSelector => ({ key, op, value })

// Attractions are tagged tourism=attraction/museum/viewpoint/... — NOT an amenity.
// 'artwork' deliberately excluded (heavily mistagged in VN OSM data).
const ATTRACTION: OsmCategory = {
  label: 'attraction',
  selectors: [s('tourism', 'attraction|museum|viewpoint|theme_park|zoo|gallery', '~')],
}

const HOTEL: OsmCategory = { label: 'hotel', selectors: [s('tourism', 'hotel')] }

// Ordered by measured yield: the productive tag first, the correct-but-sparse
// upstream tags after it, so a union that hits the `out` cap keeps the real rows.
/**
 * Exact values, not one `shop~massage|beauty` alternation.
 *
 * Overpass resolves an exact tag match from its index and SCANS for a regex, and
 * the scan is what pushes a dense-metro query past `[timeout:10]`. Measured at
 * 10.7756,106.7019 r=1500: the same four tag shapes returned the same 10 rows,
 * regex vs exact, with the exact form completing several times sooner. Same
 * data, cheaper question.
 */
const SPA_TREATMENT_SELECTORS = [s('shop', 'massage'), s('leisure', 'spa'), s('amenity', 'spa')]

/** A massage or spa treatment: what "spa", "massage" and "goi dau" ask for. */
const SPA: OsmCategory = { label: 'spa', selectors: SPA_TREATMENT_SELECTORS }

/**
 * 🚨 `shop=beauty` IS WIDER THAN A SPA, so the user's own words decide whether
 * it is queried.
 *
 * It is where several real VN spas live, which is why it is here at all - but it
 * also holds nail bars and cosmetics counters. Asked "Spa tot o Ha Noi" with
 * `shop=beauty` in the union, the card led with "Tiem Nail Phuong Chuot" and two
 * "Cua Hang My Pham" shops: real places, wrong question.
 *
 * So it is added only when the query is about beauty care - "lam dep", "nail",
 * "tham my", "cham soc da" - and a plain spa or massage query keeps the
 * treatment tags. Nothing is filtered after the fact and no row is renamed; the
 * narrower question is simply asked when that is what was asked.
 */
const SPA_BEAUTY: OsmCategory = {
  label: 'spa',
  selectors: [...SPA_TREATMENT_SELECTORS, s('shop', 'beauty')],
}

/** Beauty-care words, as opposed to massage/treatment words. */
const BEAUTY_WORDS = /lam dep|tham my|nail|cham soc da/

const GYM: OsmCategory = {
  label: 'gym',
  selectors: [s('leisure', 'fitness_centre'), s('amenity', 'gym')],
}

/**
 * 🚨 SHOPPING CENTRES HAD NO CATEGORY AT ALL.
 *
 * `eligibility.ts` has admitted `mall`, `marketplace`, `supermarket` and
 * `department_store` for the shopping domain since it was written - but nothing
 * ever PRODUCED those tags, because this ladder had no shopping branch. So
 * "Trung tam mua sam lon Sai Gon" fell through to the restaurant default, or was
 * guessed as `tourism=attraction`, and the reply said out loud "Ket qua tren
 * khong chinh xac" before falling back to prose. Measured on localhost 2026-09-08.
 *
 * MEASURED tags, same probe discipline as the spa fix (Sai Gon r=6000):
 *   shop=mall             -> 30 named (Station Mall, LOTTE Mart Cong Hoa...)
 *   shop=department_store -> 25 named (Parkson, Takashimaya...)
 *
 * The label is `mall` because that is the word `OSM_ADMIT.shopping` already
 * uses - the tag mapper and the eligibility boundary have to agree, or the rows
 * arrive and are then thrown away.
 */
const SHOPPING: OsmCategory = {
  label: 'mall',
  selectors: [s('shop', 'mall'), s('shop', 'department_store'), s('amenity', 'marketplace')],
}

/** Shopping-centre words. A PLACE to go to, never a product to buy. */
const MALL_WORDS = /trung tam mua sam|trung tam thuong mai|\bmall\b|sieu thi|shopping (centre|center)|department store/

/**
 * A dish is sold at a counter as often as at a table.
 *
 * 🚨 `amenity=restaurant` ALONE LOSES REAL DISH VENUES. Measured 2026-09-09 at
 * (10.7756,106.7019) r=1500: a phở query restricted to `restaurant` misses
 * "Phở Số 1 Hà Nội", which OSM tags `fast_food` — the VN tag for counter
 * service, not a different kind of place. (For bún bò `fast_food` adds nothing,
 * so this widens coverage without changing that result.)
 *
 * 🔑 THE LABEL STAYS `restaurant` ON PURPOSE. `DOMAIN_BY_TYPE` and the
 * `OSM_ADMIT` eligibility table are both keyed on this label; inventing a new
 * one here would make rows arrive and then be discarded downstream.
 */
const EATERY: OsmCategory = {
  label: 'restaurant',
  selectors: [s('amenity', 'restaurant'), s('amenity', 'fast_food')],
}

/** Categories that really are a plain `amenity=<value>` — verified, not assumed. */
const amenityCategory = (value: string): OsmCategory => ({ label: value, selectors: [s('amenity', value)] })

/**
 * The tag selectors for a place query.
 *
 * An explicit `type` from the tool call is authoritative over query-keyword
 * guessing — the model chose it deliberately (e.g. type=attraction even if the
 * query is a place name).
 */
export function osmCategoryFor(query: string, type?: string): OsmCategory {
  const ql = query.toLowerCase()
  const qn = normalizeVN(ql)

  if (type === 'attraction') return ATTRACTION
  if (type === 'hotel') return HOTEL
  if (type === 'spa') return BEAUTY_WORDS.test(qn) ? SPA_BEAUTY : SPA
  if (type === 'gym') return GYM
  if (type === 'mall') return SHOPPING
  // A named dish widens the eatery tags even when the caller said `restaurant`:
  // `fast_food` is counter service, not a different product category, and the
  // dish name filter keeps precision high enough that widening costs nothing.
  if (type === 'restaurant') return detectDish(query) ? EATERY : amenityCategory('restaurant')
  if (type && ['cafe', 'bar', 'cinema'].includes(type)) return amenityCategory(type)

  if (ql.match(/cafe|ca phe|coffee/)) return amenityCategory('cafe')
  if (BEAUTY_WORDS.test(qn)) return SPA_BEAUTY
  if (qn.match(/spa|massage|goi dau/)) return SPA
  if (ql.match(/hotel|khach san|resort/)) return HOTEL
  // Without this branch, "diem tham quan Da Nang" fell through to the restaurant default.
  if (qn.match(/tham quan|thang canh|diem du lich|diem den|danh lam|bao tang|khu du lich|sightsee|attraction|museum/)) return ATTRACTION
  if (ql.match(/bar|pub/)) return amenityCategory('bar')
  if (ql.match(/gym|fitness/)) return GYM
  if (ql.match(/cinema|phim|rap/)) return amenityCategory('cinema')
  if (ql.match(/benh vien|hospital|clinic/)) return amenityCategory('hospital')
  if (ql.match(/pharmacy|thuoc/)) return amenityCategory('pharmacy')
  if (ql.match(/atm|ngan hang|bank/)) return amenityCategory('bank')
  if (MALL_WORDS.test(qn)) return SHOPPING

  return detectDish(query) ? EATERY : amenityCategory('restaurant')
}

/**
 * The Overpass union body for a category — node and way for every selector.
 *
 * `extra` carries the caller's own constraint filter (cuisine, diet) and is
 * applied to each selector, so a constrained query stays constrained across the
 * whole union rather than only its first branch.
 */
export function osmUnionFor(
  category: OsmCategory,
  extra: string,
  radius: number,
  lat: number,
  lon: number,
): string {
  const around = '(around:' + radius + ',' + lat + ',' + lon + ');'
  return category.selectors.map(sc => {
    const filter = '["' + sc.key + '"' + sc.op + '"' + sc.value + '"]["name"]' + extra
    return 'node' + filter + around + 'way' + filter + around
  }).join('')
}

/** The product domain a place query belongs to, and the enrichment it earns. */
export type PlaceDomain = 'food' | 'spa' | 'entertainment' | 'shopping' | 'place'

/** What each `search_places` type value means as a product domain. */
const DOMAIN_BY_TYPE: Record<string, PlaceDomain> = {
  restaurant: 'food', cafe: 'food',
  spa: 'spa',
  cinema: 'entertainment', bar: 'entertainment', gym: 'entertainment',
  mall: 'shopping',
  // A real place with no domain-specific enrichment - not a miscategorised restaurant.
  hotel: 'place', attraction: 'place',
}

/**
 * Food words that mean food and nothing else.
 *
 * Kept apart from the dish nouns below because diacritic stripping makes those
 * ambiguous, and an unambiguous word must not lose to an ambiguous one.
 */
const FOOD_WORDS = /nha hang|quan an|an gi|an ngon|mon an|thuc don|\bcafe\b|ca phe|coffee|quan nhau/

/**
 * 🚨 BARE DISH NOUNS, WHICH COLLIDE AFTER normalizeVN STRIPS TONE MARKS.
 *
 * pho  <- 'pho' (noodle soup) AND 'pho' (street)
 * com  <- 'com' (rice) AND any word normalizing onto it
 *
 * They are still real food signals - "pho ngon Ha Noi" is a food query - so they
 * are kept, but they are consulted LAST. Checked first, "rap chieu phim o pho
 * Hue" was food, and the domain boundary then threw away every cinema the
 * search had correctly returned.
 */
const AMBIGUOUS_FOOD_WORDS = /\bbun\b|\bpho\b|\bcom\b/
const SPA_WORDS = /\bspa\b|massage|lam dep|tham my|nail|cham soc da|goi dau/
/**
 * A shopping CENTRE is a place, and its domain must be `shopping` rather than
 * `place`: `domainOf` in fromToolResult falls back to `food` for anything that
 * is not an EntityDomain, and `OSM_ADMIT.food` does not admit `mall` - so a
 * correctly retrieved mall would have been rejected by the eligibility boundary
 * and never reached a card.
 */
const MALL_DOMAIN_WORDS = MALL_WORDS

/**
 * 🚨 "rap phim" - the commonest way to say cinema - was not here.
 *
 * The list had "rap chieu" and "xem phim" but not the two words together,
 * so "rap phim hay" scored `place`. `domainOf` maps anything that is not an
 * EntityDomain onto `food`, and OSM_ADMIT.food does not admit `cinema`, so a
 * correctly retrieved cinema was rejected by the eligibility boundary and no
 * card could render. Same shape as the gym defect, different word.
 */
const ENTERTAINMENT_WORDS = /rap chieu|rap phim|cinema|xem phim|ve phim|karaoke|cong vien|khu vui choi|giai tri|bowling|billiard|\bgym\b|fitness|\bbar\b|\bpub\b|ve vao cong/

/**
 * Which domain a place query belongs to.
 *
 * 🚨 AN EXPLICIT `type` DECIDES ALONE - the keywords only speak when it is silent.
 * Two measured defects, one cause. The alternations above used to run even when
 * the caller had already NAMED the category, and `pho` carried no word boundary,
 * so normalizeVN('phong gym') === 'phong gym' matched FOOD_WORDS. "Phong gym gan
 * Hoan Kiem" was classified `food` while Overpass correctly returned six gyms -
 * and the domain boundary in `placeRecommendations` then REJECTED all six as
 * entertainment venues inside a food set, so the turn retrieved real rows and
 * rendered no card at all. The same trap sits under "pho" (street) and `com`.
 *
 * The precedence rule is not new: `osmCategoryFor` already states it, and the tag
 * mapping and the domain must not disagree about what the user asked for.
 */
export function placeDomainFor(query: string, type?: string): PlaceDomain {
  const stated = type ? DOMAIN_BY_TYPE[type] : undefined
  if (stated) return stated
  const qn = normalizeVN(query.toLowerCase())
  // Unambiguous words first, in every domain, before any ambiguous one is read.
  if (FOOD_WORDS.test(qn)) return 'food'
  if (SPA_WORDS.test(qn)) return 'spa'
  if (ENTERTAINMENT_WORDS.test(qn)) return 'entertainment'
  if (MALL_DOMAIN_WORDS.test(qn)) return 'shopping'
  if (AMBIGUOUS_FOOD_WORDS.test(qn)) return 'food'
  return 'place'
}
