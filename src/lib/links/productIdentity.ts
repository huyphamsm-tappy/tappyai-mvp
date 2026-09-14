// ── Product identity: is this marketplace listing the product the user asked for? ──
//
// Owner decision 14 Sep 2026 (§8): a marketplace search for "iPhone 16 Pro" returns
// cases, screen protectors and the Pro Max beside the phone itself. A detail link
// is offered only when the listing's title names the SAME product; anything else
// falls back to the merchant's search page, labelled as a search. Never a SKU
// guessed, never a different product presented as the requested one.
//
// Pure, conservative and provider-neutral. It compares WORDS, not SKUs: every
// digit-bearing token of the subject (16, 128gb, 15) must appear, most of the
// remaining tokens must appear, variant words (Pro / Max / Plus / mini …) must
// agree in both directions, and an accessory word on the listing that the
// subject does not carry (ốp, cường lực, sạc, cáp …) is a mismatch.

export type IdentityVerdict = 'match' | 'mismatch' | 'uncertain'

const STOP = new Set([
  'dien', 'thoai', 'chinh', 'hang', 'vn', 'a', 'vna', 'moi', 'cu', 'gia', 'tot', 're', 'san', 'pham', 'may', 'tinh',
  'smartphone', 'phone', 'the', 'and', 'for', 'with', 'new', 'sale', 'khuyen', 'mai', 'tra', 'gop', 'shop', 'store',
  'shopee', 'lazada', 'tiktok', 'viet', 'nam', 'official', 'chinhhang', 'hangchinhhang', 'gb', 'ram', 'rom',
])
const VARIANT = new Set(['pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'fe', 'air', 'se', 'edge', 'neo', 'note'])
const ACCESSORY = new Set([
  'op', 'oplung', 'case', 'cover', 'cuong', 'cuongluc', 'kinh', 'dan', 'mieng', 'sac', 'cap', 'cable', 'charger', 'adapter',
  'bao', 'baoda', 'vi', 'tai', 'nghe', 'earbuds', 'headphone', 'pin', 'powerbank', 'gia', 'giado', 'holder', 'stand',
  'skin', 'film', 'protector', 'strap', 'day', 'deo', 'thay', 'linh', 'kien', 'mainboard', 'man', 'hinh', 'sim',
])

function normalise(s: string): string[] {
  const t = s
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase()
    // "128 GB" / "1 TB" → one token; "16pro" stays as written (compared as one token below).
    .replace(/(\d+)\s*(gb|tb)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return t ? t.split(' ') : []
}

/** Tokens that identify the product: not stop words, not single letters. */
function significant(tokens: string[]): string[] {
  return tokens.filter(t => t.length >= 2 && !STOP.has(t))
}

export function productIdentityMatch(subject: string, candidateTitle: string | undefined | null): IdentityVerdict {
  const subj = normalise(subject)
  const cand = normalise(candidateTitle ?? '')
  if (subj.length === 0 || cand.length === 0) return 'uncertain'
  const candSet = new Set(cand)
  const subjSet = new Set(subj)

  // Accessory listing for a non-accessory subject → a different product.
  const subjectIsAccessory = subj.some(t => ACCESSORY.has(t))
  if (!subjectIsAccessory && cand.some(t => ACCESSORY.has(t))) return 'mismatch'

  // Variant words must agree both ways: "iPhone 16 Pro" ≠ "iPhone 16 Pro Max" ≠ "iPhone 16".
  for (const v of VARIANT) {
    if (subjSet.has(v) !== candSet.has(v)) return 'mismatch'
  }

  const required = significant(subj)
  if (required.length === 0) return 'uncertain'
  const numeric = required.filter(t => /\d/.test(t))
  if (numeric.some(t => !candSet.has(t))) return 'mismatch'
  const found = required.filter(t => candSet.has(t)).length
  const ratio = found / required.length
  // A model number ("RT31", "128gb") found alongside half the words is the product; a category
  // noun the listing phrases differently ("tủ lạnh" vs "Inverter 300L") must not veto it.
  if (ratio >= 0.8 || (numeric.length > 0 && ratio >= 0.5)) return 'match'
  if (ratio < 0.5) return 'mismatch'
  return 'uncertain'
}
