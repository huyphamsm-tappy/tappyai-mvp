import { normalizeVN } from './intent'

// ── Folding that keeps the SENSE of a colliding word (UAT3, 2026-09-27) ─────────────────────────
//
// The domain and product lexicons match FOLDED text (no diacritics), where different Vietnamese
// words become the same string. Measured on real sentences through `turnDomain`, 24/24 misread:
//   "trời mưa đi đâu chơi"     → shopping   (mưa/mùa/múa fold to "mua", the buy verb)
//   "thành phố Hồ Chí Minh…"   → food       (phố folds to "pho", the noodle soup)
//   "Hội An có gì hay"          → food       (An folds to "an", the eat verb "ăn")
//   "bao lâu thì tới"           → food       (lâu → "lau", hot pot "lẩu")
//   "tốc độ wifi"               → spa        (tốc → "toc", hair "tóc")
//   "gia hạn tự động"           → a FRIDGE   (tự động → "tu dong", "tủ đông")
//   "mấy anh ơi…"               → a CAMERA   ("mấy anh" → "may anh", "máy ảnh")
//
// When the person typed WITH diacritics the word is not ambiguous at all, so before folding every
// token whose folded form is a lexicon cue is kept only if it is the accented word the lexicon
// means; any other accented reading is folded with a trailing "_" so no `\bcue\b` can match it.
// Text typed WITHOUT diacritics cannot be disambiguated here — the lexicons carry context guards
// for that case.
//
// Only the DOMAIN and PRODUCT lexicons read this. Everything else keeps plain `normalizeVN`: a
// token like "đây" must still be "day" for "gần đây".

/** Folded cue → the accented forms that ARE the lexicon's sense. */
const SENSE: Readonly<Record<string, readonly string[]>> = {
  // food
  an: ['ăn'], pho: ['phở'], lau: ['lẩu'], mon: ['món'], bun: ['bún'], bua: ['bữa'], com: ['cơm', 'cốm'], nuong: ['nướng'],
  // shopping
  mua: ['mua'], tau: ['tàu'],
  // spa
  toc: ['tóc'],
  // product nouns (shoppingConstraints PRODUCT_TYPES / needProfile SUBJECTS)
  vay: ['váy'], dam: ['đầm'], giay: ['giày'], nem: ['nệm'], bim: ['bỉm'],
  may: ['máy'], tu: ['tủ'], day: ['đẩy'], vi: ['ví'], son: ['son'], loa: ['loa'], quat: ['quạt'], ghe: ['ghế'], giuong: ['giường'],
}

const HAS_MARK = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

/** `normalizeVN(text.toLowerCase())`, except a colliding cue that is not the lexicon's word → "cue_". */
export function foldForLexicon(text: string): string {
  const lower = String(text ?? '').normalize('NFC').toLowerCase()
  // Per MESSAGE: a turn typed without diacritics cannot be disambiguated, whatever its neighbours.
  if (!HAS_MARK.test(lower)) return normalizeVN(lower)
  return lower.replace(/[\p{L}]+/gu, (word) => {
    const folded = normalizeVN(word)
    const keep = SENSE[folded]
    return keep && !keep.includes(word) ? `${folded}_` : folded
  })
}
