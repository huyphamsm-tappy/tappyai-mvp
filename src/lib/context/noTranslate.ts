// R13 §7.2 no-translate entity handling, as a pure marker list: names of places, dishes, brands and street addresses are kept as the person wrote them / as the place is named.
// This returns WHAT must not be translated (with the original text); it never rewrites a sentence and never translates anything. Pure and browser-safe.

import { findGeoMentions, foldText } from './geoGazetteer'
import type { ServiceTarget } from './canonicalContext'

export interface NoTranslateEntity {
  kind: 'PLACE' | 'DISH' | 'BRAND' | 'ADDRESS'
  /** exactly as it must appear in the answer (original spelling) */
  text: string
}

const DISHES = [
  'phở', 'bún chả', 'bún bò huế', 'bún riêu', 'bún đậu mắm tôm', 'bún thang', 'bánh mì', 'bánh cuốn', 'bánh xèo', 'bánh bao', 'cơm tấm', 'cơm gà', 'cà phê trứng', 'cà phê muối', 'cà phê sữa đá',
  'chả cá', 'nem rán', 'nem chua', 'gỏi cuốn', 'cao lầu', 'mì quảng', 'hủ tiếu', 'xôi', 'lẩu', 'chè', 'bò lá lốt', 'bún mắm', 'bánh tráng nướng', 'tom yum', 'pad thai', 'som tam', 'ramen', 'sushi',
  'kimchi', 'bibimbap', 'dim sum', 'laksa', 'nasi lemak', 'amok',
]
const BRANDS = [
  'Highlands Coffee', 'The Coffee House', 'Phúc Long', 'Trung Nguyên', 'Cộng Cà Phê', 'Katinat', 'Starbucks', 'KFC', 'Lotteria', 'Jollibee', 'Pizza 4P\'s', 'Vinpearl', 'VinWonders', 'Vinmec',
  'Vietnam Airlines', 'Vietjet', 'Bamboo Airways', 'Grab', 'Be Group', 'Gojek', 'Agoda', 'Booking.com', 'Traveloka', 'Shopee', 'Lazada', 'Tiki', 'Momo', 'ZaloPay', 'Sun World', 'Aeon Mall',
]
// a house number + a street keyword + the street name, or a house number + a capitalised street name that is followed by a comma ("13 Lò Đúc, Hà Nội")
const ADDRESS = /\b\d{1,4}[A-Za-z]?(?:\/\d+)*\s+(?:(?:đường|duong|phố|pho|ngõ|ngo|ngách|ngach|street|st\.|road|rd\.)\s+\p{Lu}[\p{L}'.]*(?:\s+\p{Lu}[\p{L}'.]*)*|\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){0,2}(?=\s*,))/gu

const FOLDED_DISHES = DISHES.map(d => ({ d, f: foldText(d).replace(/\s+/g, ' ').trim() })).sort((a, b) => b.f.length - a.f.length)
const FOLDED_BRANDS = BRANDS.map(b => ({ b, f: foldText(b).replace(/\s+/g, ' ').trim() })).sort((a, b) => b.f.length - a.f.length)

const wordBoundaryHit = (hay: string, needle: string): number[] => {
  const hits: number[] = []
  let from = 0
  for (;;) {
    const i = hay.indexOf(needle, from)
    if (i < 0) break
    from = i + 1
    if (/[a-z0-9]/.test(hay[i - 1] ?? ' ') || /[a-z0-9]/.test(hay[i + needle.length] ?? ' ')) continue
    hits.push(i)
  }
  return hits
}

/** The text with every no-translate name blanked out: what is left is the person's own language ("Best bún chả in Hà Nội" -> "Best in"). Pure. */
export function withoutNoTranslate(text: string): string {
  let out = text
  for (const e of noTranslateEntities(text)) if (e.kind !== 'ADDRESS' || e.text) out = out.split(e.text).join(' ')
  return out.replace(/\s+/g, ' ').trim()
}

/** The names in `text` that must stay as written, plus the original names of the resolved targets. No duplicates, order of appearance, targets last. Pure. */
export function noTranslateEntities(text: string, targets: readonly ServiceTarget[] = []): NoTranslateEntity[] {
  const out: NoTranslateEntity[] = []
  const seen = new Set<string>()
  const push = (e: NoTranslateEntity) => { const k = `${e.kind}:${e.text.toLowerCase()}`; if (e.text && !seen.has(k)) { seen.add(k); out.push(e) } }
  const base = text.normalize('NFC')
  const folded = foldText(text)
  const taken: Array<[number, number]> = []
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && e > a)

  for (const m of base.matchAll(ADDRESS)) { taken.push([m.index ?? 0, (m.index ?? 0) + m[0].length]); push({ kind: 'ADDRESS', text: m[0] }) }
  for (const { b, f } of FOLDED_BRANDS) for (const i of wordBoundaryHit(folded, f)) if (free(i, i + f.length)) { taken.push([i, i + f.length]); push({ kind: 'BRAND', text: base.slice(i, i + f.length) }) }
  for (const { f } of FOLDED_DISHES) for (const i of wordBoundaryHit(folded, f)) if (free(i, i + f.length)) { taken.push([i, i + f.length]); push({ kind: 'DISH', text: base.slice(i, i + f.length) }) }
  for (const m of findGeoMentions(text)) if (free(m.start, m.end)) { taken.push([m.start, m.end]); push({ kind: 'PLACE', text: base.slice(m.start, m.end) }) }
  for (const t of targets) if (t.displayNameOriginal) push({ kind: 'PLACE', text: t.displayNameOriginal })
  return out
}
