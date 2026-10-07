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

/**
 * A Google Shopping listing title minus its seller decoration ("iPhone 16 Pro - ChungBlackBerry",
 * "iPhone 16 Pro | xoanstore.vn"): the product, as a discovery subject. Only a trailing segment that
 * names the row's own seller (or looks like a shop/domain) is removed; nothing else is touched.
 */
export function cleanListingTitle(title: string, seller?: string | null): string {
  const t = title.replace(/\s+/g, ' ').trim()
  const parts = t.split(/\s+[-|–]\s+/)
  if (parts.length < 2) return t
  const last = parts[parts.length - 1]
  const sellerNorm = (seller ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const lastNorm = last.toLowerCase().replace(/[^a-z0-9]/g, '')
  const looksLikeShop = /\.(vn|com|net|shop)$/i.test(last) || /\b(store|shop|mobile|official)\b/i.test(last)
  if ((sellerNorm && lastNorm && (sellerNorm.includes(lastNorm) || lastNorm.includes(sellerNorm))) || looksLikeShop) {
    return parts.slice(0, -1).join(' - ').trim() || t
  }
  return t
}

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
  // Storage / connectivity accessories sold "for" a phone (measured 14 Sep 2026: a USB pendrive "cho iPhone 15 Pro").
  'usb', 'pendrive', 'flash', 'otg', 'hub', 'dock', 'lens', 'tripod', 'gimbal', 'sticker', 'decal', 'gay', 'selfie',
  // Not the product at all, though the listing names it (live UAT 14 Sep 2026: an "iphone 17 … gấu bông"
  // plush toy and a "vít mở ốc iphone" screwdriver were matched to iPhone product pages).
  'gau', 'bong', 'thu', 'moc', 'khoa', 'vit', 'tuavit', 'dochoi', 'poster', 'tranh', 'mohinh', 'figure', 'keychain',
])
/**
 * "… cho iPhone 15 Pro" / "for iPhone 15 Pro" / "dành cho …" / "tương thích với …": the listing is an
 * item FOR the product — the product's own name appears, but as the target, not the subject.
 */
const FOR_PRODUCT = /(?:^|\s)(?:cho|danh cho|for|tuong thich voi|compatible with|phu hop voi)\s+(?:apple\s+)?(iphone|ipad|macbook|samsung|galaxy|xiaomi|oppo|sony|pixel)\b/

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

/** Category nouns a listing title leads with; the marketplace index is keyed by the model, not the category. */
const CATEGORY_PREFIX = /^(?:điện thoại di động|điện thoại|smartphone|máy tính bảng|máy tính xách tay|laptop|tai nghe|tủ lạnh|máy giặt|máy lạnh|điều hòa|máy lọc nước|tivi|ti vi|đồng hồ thông minh|đồng hồ|loa|máy ảnh|bàn phím|chuột|máy sấy|nồi chiên|robot hút bụi)\s+/iu
/** Apple product lines already name the brand; the leading "Apple" only dilutes a marketplace query. */
const APPLE_LINE = /^apple\s+(?=(?:iphone|ipad|macbook|airpods|watch|imac|mac)\b)/iu

/**
 * The product CORE of a listing title, as a marketplace discovery subject (14 Sep 2026):
 * "Điện thoại Apple iPhone 16 Pro Max 256GB Titan Đen" → "iPhone 16 Pro Max 256GB";
 * "[Mới 100%] iPhone 16 Pro Max 256GB Quốc tế Mới Fullbox" → "iPhone 16 Pro Max 256GB".
 * Measured: the decorated title returns other products on TikTok Shop, the core returns the
 * product page. Colour, condition and seller words come after the last model / capacity token
 * and are dropped; a title with no such token is used as it is (minus tags and category noun).
 */
export function discoverySubject(title: string, seller?: string | null): string {
  let t = cleanListingTitle(title, seller)
  t = t.replace(/^\s*(?:\[[^\]]*\]|\([^)]*\))\s*/g, '').trim()
  t = t.replace(CATEGORY_PREFIX, '').replace(APPLE_LINE, '').trim()
  const words = t.split(/\s+/)
  let last = -1
  words.forEach((w, i) => { if (/\d/.test(w)) last = i })
  // Variant words right after the model number belong to the model ("iPhone 16 Pro", "S24 Ultra").
  while (last >= 0 && last + 1 < words.length && VARIANT.has(words[last + 1].toLowerCase())) last++
  if (last >= 1) t = words.slice(0, last + 1).join(' ')
  return t.replace(/[\s,|–-]+$/g, '').trim() || cleanListingTitle(title, seller)
}

export function productIdentityMatch(subject: string, candidateTitle: string | undefined | null): IdentityVerdict {
  const subj = normalise(subject)
  const cand = normalise(candidateTitle ?? '')
  if (subj.length === 0 || cand.length === 0) return 'uncertain'
  const candSet = new Set(cand)
  const subjSet = new Set(subj)

  // Accessory listing for a non-accessory subject → a different product; and the reverse: an
  // accessory / toy / tool listing never maps to the bare product page it names.
  const subjectIsAccessory = subj.some(t => ACCESSORY.has(t))
  if (!subjectIsAccessory && cand.some(t => ACCESSORY.has(t))) return 'mismatch'
  if (subjectIsAccessory && !subj.filter(t => ACCESSORY.has(t)).some(t => candSet.has(t))) return 'mismatch'
  // An item FOR the product ("… cho iPhone 15 Pro") is not the product, whatever else the title says.
  if (!subjectIsAccessory && FOR_PRODUCT.test(cand.join(' ')) && !FOR_PRODUCT.test(subj.join(' '))) return 'mismatch'

  // Variant words must agree both ways: "iPhone 16 Pro" ≠ "iPhone 16 Pro Max" ≠ "iPhone 16".
  for (const v of VARIANT) {
    if (subjSet.has(v) !== candSet.has(v)) return 'mismatch'
  }

  const required = significant(subj)
  if (required.length === 0) return 'uncertain'
  const numeric = required.filter(t => /\d/.test(t))
  if (numeric.some(t => !candSet.has(t))) return 'mismatch'
  // A two-digit MODEL NUMBER the candidate carries and the subject does not ("iPhone Air" vs an
  // "iPhone 17" page, live UAT 14 Sep 2026) is another product; capacities (gb/tb) and single
  // digits ("2 sim", "5g") are not model numbers.
  if (cand.some(t => /^\d{2}$/.test(t) && !subjSet.has(t))) return 'mismatch'
  const found = required.filter(t => candSet.has(t)).length
  const ratio = found / required.length
  // A model number ("RT31", "128gb") found alongside half the words is the product; a category
  // noun the listing phrases differently ("tủ lạnh" vs "Inverter 300L") must not veto it.
  if (ratio >= 0.8 || (numeric.length > 0 && ratio >= 0.5)) return 'match'
  if (ratio < 0.5) return 'mismatch'
  return 'uncertain'
}
