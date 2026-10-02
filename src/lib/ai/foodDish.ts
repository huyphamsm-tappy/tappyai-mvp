import { normalizeVN } from './intent'

// ── TODO 1 — A DISH NAME IS THE STRONGEST CONSTRAINT A FOOD QUERY CARRIES ─────
//
// 🚨 THE DEFECT. `detectFoodConstraints` knew buffet / chay / hải sản / lẩu but
// no dish names, so "bún bò ở Quận 1" became a bare `amenity=restaurant` search
// and the card led with Jaspas, Au Tresor and Crazy Buffalo — three venues with
// no relationship to the dish that was asked for. Measured on localhost.
//
// 🔑 THE PREMISE THIS FIX WAS BUILT ON WAS WRONG, AND THE MEASUREMENT SAYS SO.
// A previous session recorded "OSM has zero bún bò venues in D1, so the honest
// answer is none found". Re-probed 2026-09-09 against live Overpass at
// (10.7756,106.7019) r=1500: `["name"~"bún bò|bun bo",i]` returns SIX real
// restaurants — Bún Bò Huế Gia Hội, Quán Bún Bò Gánh, Bún Bò Huế Đông Ba,
// Bún Bò 5T, Bún bò Xuà, nhà hàng bún bò nam bộ. The earlier probe failed
// because of how it was SENT, not because the data is missing (see below), so
// the right answer is to retrieve them, not to report an empty result.
//
// 🚨 WHY THE EARLIER `["name"~"…"]` PROBE "RETURNED THE UNFILTERED SET".
// Two separate traps, both measured:
//   1. ENCODING. A query sent through curl under Git Bash arrived with its
//      Vietnamese bytes mangled, so `["name"~"Nhà Hàng"]` matched NOTHING even
//      though "Nhà Hàng Au Tresor" is in the result set. The same query sent
//      with a correctly UTF-8 percent-encoded URL returns 10 rows. `food.ts`
//      builds its URL with `encodeURIComponent`, which is correct — the bug was
//      in the probe, never in the product path.
//   2. BYTE-WISE CHARACTER CLASSES. Overpass applies the regex over UTF-8
//      BYTES, so `b[uú]n` cannot match "bún": `ú` is two bytes and the class
//      matches one. Character classes over Vietnamese vowels silently match
//      nothing. Full literal alternatives (`bún bò|bun bo`) are what works.
// The `,i` flag DOES case-fold Vietnamese correctly — verified: it is what
// additionally catches "nhà hàng bún bò nam bộ" and "Bún bò Xuà".
//
// 🚨 OVERPASS NARROWS, JAVASCRIPT ENFORCES. The tag filter is a cheap way to
// ask a smaller question, but it is matched on raw bytes and cannot be trusted
// as the boundary. Every returned row is re-checked here against `normalizeVN`,
// which strips diacritics properly, so a venue only counts as the dish when its
// own name or cuisine tag says so. Nothing is renamed and nothing is inferred.

export interface DishSpec {
  /** Matched against `normalizeVN(query)` — lowercase, diacritics stripped. */
  query: RegExp
  /**
   * For dishes whose ASCII spelling is ambiguous, the DIACRITIC form, matched
   * against the raw lowercased query instead of `query`.
   *
   * 🚨 `normalizeVN('phố')` AND `normalizeVN('phở')` ARE BOTH `'pho'`. "phố" is
   * the ordinary word for a street and shows up constantly in place queries —
   * "phố cổ", "phố đi bộ" — so matching the stripped form would turn a walk
   * down the old quarter into a noodle-soup filter. Same collision for cháo /
   * chào, xôi / xói, chè / che. These four are matched only in their written
   * diacritic form, which is what a Vietnamese IME produces anyway; the cost is
   * missing a bare-ASCII "pho" query, and the honest-fallback path covers that.
   */
  raw?: RegExp
  /**
   * The Overpass `name` alternation, in the form venues are actually tagged.
   *
   * 🚨 DIACRITIC FORM FIRST, AND THE BARE-ASCII FORM ONLY WHEN DISTINCTIVE.
   * Every one of the 26 venue names measured in D1 carries full diacritics, so
   * the ASCII spelling buys little — and for a short word it costs a lot: a
   * bare `pho` matches "Phong", `chao` matches "Chào", `oc` matches almost
   * anything. Short dishes are therefore diacritic-only, and the post-retrieval
   * check below is what makes that safe either way.
   */
  osm: string
  /** Matched against `normalizeVN(row.name)` — the actual enforcement. */
  name: RegExp
  /** What the user asked for, spelled the way they would recognise it. */
  label: string
}

/**
 * Recognised dishes, most specific first.
 *
 * "bún bò" is tested before the shorter patterns so the more precise dish wins;
 * only the first match is taken, because a query names one dish.
 */
export const DISHES: ReadonlyArray<DishSpec> = [
  { query: /bun bo/,         osm: 'bún bò|bun bo',          name: /bun bo/,         label: 'bún bò' },
  { query: /bun cha/,        osm: 'bún chả|bun cha',        name: /bun cha/,        label: 'bún chả' },
  { query: /bun dau/,        osm: 'bún đậu|bun dau',        name: /bun dau/,        label: 'bún đậu' },
  { query: /bun rieu/,       osm: 'bún riêu|bun rieu',      name: /bun rieu/,       label: 'bún riêu' },
  { query: /bun thit nuong/, osm: 'bún thịt nướng',         name: /bun thit nuong/, label: 'bún thịt nướng' },
  { query: /bun mam/,        osm: 'bún mắm',                name: /bun mam/,        label: 'bún mắm' },
  { query: /banh mi/,        osm: 'bánh mì|banh mi',        name: /banh mi/,        label: 'bánh mì' },
  { query: /banh xeo/,       osm: 'bánh xèo|banh xeo',      name: /banh xeo/,       label: 'bánh xèo' },
  { query: /banh cuon/,      osm: 'bánh cuốn|banh cuon',    name: /banh cuon/,      label: 'bánh cuốn' },
  { query: /banh canh/,      osm: 'bánh canh|banh canh',    name: /banh canh/,      label: 'bánh canh' },
  { query: /com tam/,        osm: 'cơm tấm|com tam',        name: /com tam/,        label: 'cơm tấm' },
  { query: /com ga/,         osm: 'cơm gà|com ga',          name: /com ga/,         label: 'cơm gà' },
  { query: /hu tieu|hu tiu/, osm: 'hủ tiếu|hủ tíu|hu tieu', name: /hu tieu|hu tiu/, label: 'hủ tiếu' },
  { query: /mi quang/,       osm: 'mì quảng|mi quang',      name: /mi quang/,       label: 'mì quảng' },
  { query: /goi cuon/,       osm: 'gỏi cuốn|goi cuon',      name: /goi cuon/,       label: 'gỏi cuốn' },
  { query: /bo kho/,         osm: 'bò kho|bo kho',          name: /bo kho/,         label: 'bò kho' },
  { query: /\bpho\b/,  raw: /phở/,   osm: 'phở',            name: /\bpho\b/,        label: 'phở' },
  { query: /\bchao\b/, raw: /cháo/,  osm: 'cháo',           name: /\bchao\b/,       label: 'cháo' },
  { query: /\bxoi\b/,  raw: /xôi/,   osm: 'xôi',            name: /\bxoi\b/,        label: 'xôi' },
  { query: /\bche\b/,  raw: /chè/,   osm: 'chè',            name: /\bche\b/,        label: 'chè' },
  { query: /\bsushi\b/,      osm: 'sushi',                  name: /\bsushi\b/,      label: 'sushi' },
  { query: /\bpizza\b/,      osm: 'pizza',                  name: /\bpizza\b/,      label: 'pizza' },
  { query: /\bramen\b/,      osm: 'ramen',                  name: /\bramen\b/,      label: 'ramen' },
  { query: /dim sum/,        osm: 'dim sum',                name: /dim sum/,        label: 'dim sum' },
]

/** The dish this query asks for, or null. Only the first (most specific) match. */
export function detectDish(query: string): DishSpec | null {
  const raw = (query || '').toLowerCase()
  const q = normalizeVN(raw)
  for (const d of DISHES) {
    // A dish with a `raw` form is recognised ONLY in its diacritic spelling —
    // its stripped form collides with an unrelated everyday word.
    if (d.raw) { if (d.raw.test(raw)) return d; continue }
    if (d.query.test(q)) return d
  }
  return null
}

/**
 * Does this row's own evidence say it serves the dish?
 *
 * 🔑 THE VENUE'S NAME IS REAL EVIDENCE, and in Vietnam it is usually the only
 * evidence there is: eateries name themselves after the one dish they sell
 * ("Bún Bò Huế Đông Ba"). A restaurant whose name and cuisine tag say nothing
 * about the dish has NOT been shown to serve it — the caller reports that
 * honestly rather than presenting it as a match.
 */
export function rowServesDish(row: { name?: string; cuisine?: string }, dish: DishSpec): boolean {
  const name = normalizeVN((row.name || '').toLowerCase())
  const cuisine = normalizeVN((row.cuisine || '').toLowerCase())
  return dish.name.test(name) || dish.name.test(cuisine)
}
