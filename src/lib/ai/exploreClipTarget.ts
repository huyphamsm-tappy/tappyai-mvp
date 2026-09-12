import { normalizeVN } from './intent'
import { cityInText } from './tools/vietnamCities'

// ── "Hỏi Tappy về chỗ này" — ONE venue, not a neighbourhood ─────────────────
//
// 🚨 THE MEASURED FAILURE. With P0 in place the route knows the clip's place and
// address, calls `search_places` for it — and gets back what that tool always
// returns: the 8–10 venues Serper/Google/OSM found around the address. Every
// row then flows, unchanged, into `placeRecommendations` → `buildPlacesLiveView`,
// so a question about one restaurant rendered a card of eight. The card never
// looked at what the user asked about; it rendered what the provider returned.
//
// This module is the deterministic answer to "which of these rows IS the clip's
// venue?". It runs ONLY on the Explore path (`clipContext != null`), AFTER
// `searchPlaces()` and BEFORE ranking/recommendations, and it changes nothing
// but the INPUT to the existing pipeline: one row in → one card out, through
// exactly the same code generic discovery uses.
//
// 🔑 PURE. No AI, no provider, no database, no environment. Names and addresses
// in, a status and a subset of rows out. The model is never asked to choose the
// target from a list — a list is what this exists to avoid.
//
// 🚨 A NAME IS NOT A PLACE. "Bún Bò Huế" is a dish and a shop name; the word
// "Huế" in it proves nothing about where the shop is. Cities are read from
// ADDRESS strings only (`cityInText` on `place_address` / `row.address`), never
// from a venue name.

export type ClipTargetStatus = 'resolved' | 'ambiguous' | 'unresolved'

export interface ClipTargetSubject {
  placeName: string
  placeAddress: string | null
}

export interface ClipTargetOutcome {
  status: ClipTargetStatus
  /** The rows that survive: exactly one, the plausible few (≤3), or none. */
  results: Record<string, unknown>[]
}

/** How many plausible rows an ambiguous answer may keep — enough to ask "which branch?", never a shelf. */
const MAX_AMBIGUOUS_ROWS = 3

/**
 * Venue-TYPE words: they say what kind of place it is, never which one. Only
 * these are dropped. Dish words ("bún", "bò", "phở") are kept — for a Vietnamese
 * eatery they are frequently the whole identity.
 */
const VENUE_TYPE_WORDS = new Set([
  'quan', 'nha', 'hang', 'tiem', 'cafe', 'coffee', 'caphe', 'restaurant', 'bistro', 'kitchen',
  'eatery', 'bar', 'pub', 'lounge', 'shop', 'store', 'food', 'an', 'uong', 'nhau',
  'chi', 'nhanh', 'branch', 'the', 'and', 'va',
])

const norm = (s: unknown): string => normalizeVN(String(s ?? '').toLowerCase()).replace(/\s+/g, ' ').trim()

/** Identity tokens of a name: normalized, type words removed, 1-char tokens removed. */
export function identityTokens(name: unknown): string[] {
  return norm(name)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !VENUE_TYPE_WORDS.has(t))
}

/**
 * Split "GÓC HUẾ - Nguyễn Thái Bình" into the brand ("GÓC HUẾ") and its tail
 * (" - Nguyễn Thái Bình", usually a branch or a street). The brand is what is
 * matched; the tail is extra evidence for address agreement.
 */
export function splitBrand(name: unknown): { head: string; tail: string } {
  const full = String(name ?? '').trim()
  const m = full.match(/^(.*?)\s*[-–—|(]\s*(.+?)\)?\s*$/)
  if (m && m[1].trim().length >= 2) return { head: m[1].trim(), tail: m[2].trim() }
  return { head: full, tail: '' }
}

const subset = (a: readonly string[], b: readonly string[]) => a.length > 0 && a.every(t => b.includes(t))

/**
 * Does this provider row carry the clip's venue NAME?
 *
 * Strong when the clip's brand tokens are all present in the row's name (or the
 * row's brand tokens all in the clip's — providers append and prepend), or when
 * one normalized brand string contains the other (≥4 chars, so "an" cannot match).
 * A single-token brand must match exactly: "Cô Ba" (two tokens) may be absorbed
 * by "Bún Bò Huế Cô Ba"; a lone "Huế" would swallow half the city and is refused.
 */
export function nameMatches(clipName: string, rowName: unknown): boolean {
  const clipHead = splitBrand(clipName).head
  const rowHead = splitBrand(rowName).head
  const clipTokens = identityTokens(clipHead)
  const rowAll = identityTokens(rowName)
  const rowHeadTokens = identityTokens(rowHead)
  if (clipTokens.length === 0 || rowAll.length === 0) return false

  if (clipTokens.length === 1) {
    return rowHeadTokens.length === 1 && rowHeadTokens[0] === clipTokens[0]
  }
  if (subset(clipTokens, rowAll)) return true
  if (rowHeadTokens.length >= 2 && subset(rowHeadTokens, clipTokens)) return true

  const c = norm(clipHead), r = norm(rowHead)
  return c.length >= 4 && r.length >= 4 && (c.includes(r) || r.includes(c))
}

export type AddressAgreement = 'same' | 'area' | 'unknown' | 'conflict'

/** Street/place WORDS of an address (≥3 chars), admin chrome and numbers removed. */
function addressWords(text: unknown): string[] {
  return norm(text)
    .replace(/\b(quan|huyen|phuong|xa|thanh pho|tinh|tp|district|ward|city|province|viet nam|vietnam|duong|street|st)\b/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !/^\d/.test(t))
}

/**
 * The HOUSE number: the number a Vietnamese address opens with ("155 Nguyễn Thái
 * Bình, …", "12A/3 Lê Lợi"). Only the leading number counts — "Quận 1" and
 * "Phường 4" are administrative numbers and must never pin a building.
 */
function houseNumber(text: unknown): string | null {
  const m = norm(text).match(/^(\d+[a-z]?(?:\/\d+[a-z]?)?)\b/)
  return m ? m[1] : null
}

const districtOf = (text: unknown): string | null => {
  const m = norm(text).match(/\b(?:quan|q\.?|district)\s*(\d{1,2}|[a-z]+(?:\s[a-z]+)?)\b/)
  return m ? m[1].replace(/\s+/g, ' ') : null
}

/**
 * How the clip's ADDRESS relates to a row's address (plus the row's own name tail,
 * which providers often make the street).
 *
 *   same     — house number AND a street word agree
 *   area     — same known city, or same district, or a street word agrees
 *   conflict — both resolve to a known city and the cities differ
 *   unknown  — nothing to compare (the composer writes '' for most clips)
 *
 * Cities are read from addresses only — never from names (see module note).
 */
export function addressAgreement(clipAddress: string | null, row: Record<string, unknown>): AddressAgreement {
  const clip = (clipAddress ?? '').trim()
  const rowAddr = [row.address, splitBrand(row.name).tail].filter(Boolean).join(', ')
  if (!clip || !rowAddr.trim()) return 'unknown'

  const clipCity = cityInText(clip)
  const rowCity = cityInText(typeof row.address === 'string' ? row.address : '')
  if (clipCity && rowCity && clipCity.query !== rowCity.query) return 'conflict'

  const words = addressWords(clip)
  const rowWords = addressWords(rowAddr)
  const clipHouse = houseNumber(clip)
  const rowHouse = houseNumber(typeof row.address === 'string' ? row.address : '')
  const numberHit = !!clipHouse && clipHouse === rowHouse
  const wordHits = words.filter(w => rowWords.includes(w)).length
  if (numberHit && wordHits >= 1) return 'same'

  const clipDistrict = districtOf(clip)
  const rowDistrict = districtOf(rowAddr)
  if (clipDistrict && rowDistrict && clipDistrict !== rowDistrict) return 'conflict'
  if ((clipCity && rowCity) || (clipDistrict && rowDistrict) || wordHits >= 2) return 'area'
  return wordHits >= 1 ? 'area' : 'unknown'
}

const AGREEMENT_RANK: Record<AddressAgreement, number> = { same: 0, area: 1, unknown: 2, conflict: 3 }

/**
 * Which provider rows are the clip's venue.
 *
 * Plausible = the name matches and the address does not CONTRADICT the clip.
 *   0 plausible → unresolved
 *   1 plausible → resolved
 *   several     → resolved only when exactly one is pinned by house number
 *                 (`same`) or by the clip's own branch tail; otherwise ambiguous,
 *                 keeping at most three, best agreement first, provider order
 *                 within a tier.
 *
 * 🚨 Nothing here consults rating, rank or distance. A better-rated stranger is
 * still a stranger.
 */
export function narrowToClipTarget(rows: unknown, clip: ClipTargetSubject): ClipTargetOutcome {
  const list = Array.isArray(rows) ? rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object') : []
  const plausible = list
    .filter(row => nameMatches(clip.placeName, row.name))
    .map(row => ({ row, agreement: addressAgreement(clip.placeAddress, row) }))
    .filter(x => x.agreement !== 'conflict')

  if (plausible.length === 0) return { status: 'unresolved', results: [] }
  if (plausible.length === 1) return { status: 'resolved', results: [plausible[0].row] }

  const pinned = plausible.filter(x => x.agreement === 'same')
  if (pinned.length === 1) return { status: 'resolved', results: [pinned[0].row] }

  // The clip's own tail ("GÓC HUẾ - Nguyễn Thái Bình") names the branch: if exactly
  // one row's name or address carries it, that is the one.
  const clipTail = identityTokens(splitBrand(clip.placeName).tail)
  if (clipTail.length > 0) {
    const byTail = plausible.filter(x => {
      const hay = identityTokens([x.row.name, x.row.address].filter(Boolean).join(' '))
      return subset(clipTail, hay)
    })
    if (byTail.length === 1) return { status: 'resolved', results: [byTail[0].row] }
  }

  const ordered = plausible
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => AGREEMENT_RANK[a.agreement] - AGREEMENT_RANK[b.agreement] || a.i - b.i)
    .slice(0, MAX_AMBIGUOUS_ROWS)
  return { status: 'ambiguous', results: ordered.map(x => x.row) }
}

/**
 * Did the user ask for MORE places rather than about THIS one?
 *
 * Explore-only. "Có quán nào tương tự gần đây không?" / "gợi ý thêm quán khác" /
 * "cho mình vài lựa chọn khác" opt back into ordinary discovery; the generic
 * intent classifier is not consulted and not changed.
 */
const ALTERNATIVES_RE = new RegExp([
  String.raw`\b(quan|cho|dia diem|noi|lua chon|option|place|spot|restaurant)s?\s+(nao\s+)?(khac|tuong tu|gan day|ngon hon|tot hon|re hon)\b`,
  String.raw`\b(goi y|tim)\s+(them|vai|mot so|nhung)\b`,
  String.raw`\b(vai|mot so|nhung|may|them)\s+(quan|cho|dia diem|lua chon)\b`,
  String.raw`\b(tuong tu|thay the|alternative|similar|nearby|elsewhere)\b`,
  String.raw`\b(other|more)\s+(place|restaurant|option|spot|suggestion|choice)s?\b`,
  String.raw`\brecommend(ations?)?\b`,
].join('|'))

export function asksForAlternatives(text: string): boolean {
  return ALTERNATIVES_RE.test(norm(text))
}

/**
 * The tool-result instructions the MODEL reads for the two non-resolved states.
 *
 * Written without diacritics like the rest of the prompt vocabulary; what the
 * user sees is the model's own sentence, never these strings.
 */
export function clipTargetInstruction(status: ClipTargetStatus, lang: string, placeName: string): string | null {
  const vi = lang !== 'en'
  if (status === 'ambiguous') {
    return vi
      ? `NHIEU DIA DIEM CUNG TEN "${placeName}". Clip xac dinh TEN quan nhung chua ro chi nhanh/khu vuc nao. Hay hoi user MOT cau ngan de chon dung chi nhanh (neu ten cac ket qua khac nhau o dia chi/khu vuc, neu ra de user chon). KHONG gioi thieu quan khac ngoai cac ket qua nay.`
      : `SEVERAL PLACES SHARE THE NAME "${placeName}". The clip identifies the venue's name but not which branch/area. Ask the user ONE short question to pick the branch (name the distinguishing address/area of each result). Do NOT recommend any place outside these results.`
  }
  if (status === 'unresolved') {
    return vi
      ? `KHONG XAC MINH DUOC dia diem cua clip. Clip noi ten quan la "${placeName}" nhung khong ket qua nao khop ten do. Noi that voi user rang ban thay ten (va dia chi neu co) tu clip nhung chua xac minh duoc quan nay tren ban do; dua link Google Maps de user tu kiem tra. TUYET DOI KHONG gioi thieu quan khac, KHONG bia dia chi/gio/gia/danh gia.`
      : `COULD NOT VERIFY the clip's venue. The clip names "${placeName}" but no result matched that name. Tell the user plainly that you see the name (and address, if any) from the clip but could not verify this venue on the map; offer the Google Maps link so they can check. Do NOT recommend other places and do NOT invent an address, hours, prices or ratings.`
  }
  return null
}

/**
 * Apply the narrowing to a `search_places` result — a NEW object, never a mutation.
 *
 * Keeps every envelope field the tool produced (maps link, source, notes) and
 * replaces only what identifies the venue set:
 *   results              → the surviving rows (each row object untouched)
 *   count                → their number
 *   _tappy_clip_target   → the status, so the route's tests and logs can see it
 *   place_search_status  → 'empty' when nothing survived, which is what the
 *                          downstream grounding gate already keys on; the model
 *                          then cannot name a venue it no longer sees
 *   no_results_instruction → the Explore-specific instruction for the two
 *                          non-resolved states (replaces the generic one, which
 *                          would invite "widen the area" — wrong for a named venue)
 */
export function applyClipTarget(
  result: unknown,
  clip: ClipTargetSubject,
  lang: string,
): { result: Record<string, unknown>; status: ClipTargetStatus } {
  const r = (result && typeof result === 'object') ? (result as Record<string, unknown>) : {}
  const outcome = narrowToClipTarget(r.results, clip)
  const next: Record<string, unknown> = {
    ...r,
    results: outcome.results,
    count: outcome.results.length,
    _tappy_clip_target: outcome.status,
    place_search_status: outcome.results.length === 0 ? 'empty' : 'has_results',
  }
  const instruction = clipTargetInstruction(outcome.status, lang, clip.placeName)
  if (instruction) next.no_results_instruction = instruction
  else delete next.no_results_instruction
  return { result: next, status: outcome.status }
}
