import { normalizeVN } from './intent'

// Where a tool place is mentioned in the assistant prose, so enrichment (photos /
// review / order links) can be injected right after it. The hard part: the LLM
// rewrites the tool's raw Google-Maps name — it SHORTENS it ("Hủ tiếu Sa Đéc &
// Bánh tằm - DÌ NĂM SA ĐÉC - 166 Bùi Thị Xuân, Quận 1" → "Dì Năm Sa Đéc") and
// sometimes respells it ("Hủ Tíu" → "Hủ Tiếu"). A plain `indexOf(fullName)` then
// misses the place and the whole enrichment falls back to a trailing block.
//
// Matching strategy (owner-approved priority — deterministic first, fuzzy last):
//   1. Canonical Display Key — the LLM's own bold header IS the canonical display
//      name; match it deterministically to the tool name (substring either way).
//   2. Exact — the full tool name appears verbatim in the prose.
//   3. Segment — a distinctive segment of the tool name (split on - | ( , ) appears.
//   4. Token — greatest distinctive-token overlap with a header (guarded last resort).

export const norm = (s: string) => normalizeVN((s || '').toLowerCase())

// Generic Vietnamese food/venue words, connectors and address words — dropped ONLY
// for the token tier so a respelling ("tíu"/"tiếu") or a shared food word can't
// carry a match. Kept small; the deterministic tiers do the real work.
const STOP = new Set([
  'hu','tieu','tiu','quan','an','nha','hang','pho','bun','mi','com','banh','xeo','cuon',
  'chao','lau','ca','phe','cafe','tra','sua','hai','san','nuong','bbq','beer','bia','mon',
  'va','the','and','so','duong','p','q','tp','ho','chi','minh','ngon','chinh','goc','gia','truyen',
])

const tokensOf = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !STOP.has(t))

// Distinctive segments: split the raw name on separators, drop pure-address / too-short.
const segmentsOf = (name: string) =>
  norm(name).split(/\s*[-|(),]+\s*/).map(s => s.replace(/[)]+/g, '').trim())
    .filter(s => s.length >= 4 && !/\d/.test(s))

export interface Header { norm: string; offset: number }

// Bold `**...**` prose headers that name a place — excluding rating/meta lines
// ("4.6⭐ (3.715 đánh giá Google Maps)"). `text` is already normalized when it comes
// from the diacritic-stripped dedup view.
export function proseHeaders(dedupText: string): Header[] {
  const out: Header[] = []
  for (const m of dedupText.matchAll(/\*\*([^*\n]{2,80})\*\*/g)) {
    const txt = m[1].trim()
    if (/^[\d.]/.test(txt) || /⭐|danh gia|google maps/.test(txt)) continue
    out.push({ norm: norm(txt), offset: m.index ?? 0 })
  }
  return out
}

/**
 * Offset in `dedupText` (the normalized, index-aligned prose) where `placeName` is
 * referred to, or -1. Runs the tiers in the owner-approved order.
 */
export function findPlaceOffset(placeName: string, dedupText: string, headers?: Header[]): number {
  const nm = norm(placeName).trim()
  if (!nm) return -1
  const heads = headers ?? proseHeaders(dedupText)

  // 1 — Canonical Display Key: a bold header that is a clean substring of the tool
  //     name (LLM shortened it) or vice-versa. Deterministic, no dictionary needed.
  for (const h of heads) {
    if (h.norm.length >= 4 && (nm.includes(h.norm) || h.norm.includes(nm))) return h.offset
  }
  // 2 — Exact: the full tool name appears verbatim in the prose.
  const exact = dedupText.indexOf(nm)
  if (exact !== -1) return exact
  // 3 — Segment: a distinctive segment of the tool name appears (longest first).
  for (const seg of segmentsOf(placeName).sort((a, b) => b.length - a.length)) {
    const si = dedupText.indexOf(seg)
    if (si !== -1) return si
    for (const h of heads) if (h.norm.includes(seg) || seg.includes(h.norm)) return h.offset
  }
  // 4 — Token overlap (last resort, guarded): the header sharing the most distinctive
  //     tokens with the tool name — requires a strong overlap so we never mis-attribute.
  const pt = new Set(tokensOf(placeName))
  if (pt.size > 0) {
    let best = { offset: -1, score: 0 }
    for (const h of heads) {
      const ht = tokensOf(h.norm)
      if (ht.length === 0) continue
      const shared = ht.filter(t => pt.has(t)).length
      const cover = shared / ht.length
      if (shared >= 2 && cover >= 0.6 && shared > best.score) best = { offset: h.offset, score: shared }
    }
    if (best.offset !== -1) return best.offset
  }
  return -1
}
