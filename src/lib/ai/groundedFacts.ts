import type { Candidate } from './conversationState'

/**
 * Candidate facts, composed by us rather than by the model.
 *
 * WHY. Three rounds of evidence-layer work failed to stop invented candidate
 * facts. The candidate line listed what existed; the model added the rest. Then
 * every missing dimension was marked explicitly — `wifi=UNKNOWN;
 * gia=UNKNOWN` — and the reply still said "có WiFi, giá không quá đắt, quán
 * nhỏ". Labelling absence did not change the measurement, because the model was
 * still the thing WRITING the facts.
 *
 * So it stops writing them. The split is:
 *   FACTS     — composed here, from structured evidence only.
 *   REASONING — the model's job, and still entirely its own words.
 *
 * A dimension with no evidence produces no sentence fragment at all. There is
 * no field the model can read an absent value out of and no phrasing hook to
 * hang one on, because the absent dimension never reaches the factual surface.
 */

export interface GroundedFact {
  field: string
  /** Human label in the reply's language. */
  label: string
  /** Exactly what the tool returned, never reformatted into a new claim. */
  value: string
}

export interface GroundedCandidate {
  id: string
  displayName: string
  verifiedFacts: GroundedFact[]
  /** Dimensions with NO evidence. Reported as gaps, never as facts. */
  unknownFields: string[]
  /** Where the facts came from, for audit. */
  evidenceRefs: string[]
}

/**
 * The dimensions a recommendation talks about, and the fact keys that evidence
 * each one. Order is the order they appear in the composed sentence.
 */
const DIMENSIONS: Array<{ field: string; vi: string; en: string; keys: string[] }> = [
  { field: 'address', vi: 'địa chỉ', en: 'address', keys: ['address'] },
  { field: 'opening_hours', vi: 'giờ mở cửa', en: 'opening hours', keys: ['opening_hours'] },
  { field: 'price', vi: 'giá', en: 'price', keys: ['price', 'price_vnd', 'gia'] },
  { field: 'rating', vi: 'đánh giá', en: 'rating', keys: ['rating', 'google_rating'] },
  // Ordinal price band and computed distance. Both are comparable dimensions,
  // so they must be listed here — `comparableOn` reads this table, and a
  // dimension missing from it silently disables the comparison that depends
  // on it (measured: BETTER_PRICE_LEVEL and CLOSER were dropped as unsupported
  // even when both candidates carried the field).
  { field: 'price_level', vi: 'mức giá', en: 'price level', keys: ['price_level'] },
  { field: 'distance_km', vi: 'khoảng cách', en: 'distance', keys: ['distance_km'] },
  { field: 'wifi', vi: 'wifi', en: 'wifi', keys: ['wifi'] },
  { field: 'size', vi: 'quy mô', en: 'size', keys: ['size', 'capacity', 'seats'] },
  { field: 'ram_gb', vi: 'RAM', en: 'RAM', keys: ['ram_gb'] },
  { field: 'storage_gb', vi: 'ổ cứng', en: 'storage', keys: ['storage_gb'] },
  { field: 'condition', vi: 'tình trạng', en: 'condition', keys: ['condition_label', 'condition'] },
]

/**
 * Values that occupy a field without carrying evidence.
 *
 * A place with no street address still gets `address: "Xem ban do"` — the UI's
 * "see map" label, written into the field by the place tool. Measured on a live
 * decision turn, that surfaced as "địa chỉ: Xem ban do", a fact-shaped sentence
 * whose fact is a button caption. A placeholder is an ABSENT field: treating it
 * as present is exactly the evidence-free claim this module exists to prevent.
 */
const PLACEHOLDER = /^(xem ban do|see map|xem bản đồ|n\/?a|-+|dang cap nhat|đang cập nhật|unknown|null|undefined)$/i

const readable = (v: unknown): string | null => {
  if (v === undefined || v === null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  if (s === '' || PLACEHOLDER.test(s)) return null
  return s
}

/** Project one candidate onto the grounded structure. Nothing is derived. */
export function groundCandidate(c: Candidate, lang = 'vi'): GroundedCandidate {
  const vi = lang === 'vi'
  const verifiedFacts: GroundedFact[] = []
  const unknownFields: string[] = []

  for (const d of DIMENSIONS) {
    const key = d.keys.find(k => readable(c.facts[k]) !== null)
    if (key) verifiedFacts.push({ field: d.field, label: vi ? d.vi : d.en, value: readable(c.facts[key])! })
    else unknownFields.push(vi ? d.vi : d.en)
  }

  const evidenceRefs = [
    ...(readable(c.facts.spec_source) ? [String(c.facts.spec_source)] : []),
    ...(readable(c.facts.source_site) ? [String(c.facts.source_site)] : []),
    ...(c.url ? [c.url] : []),
  ]

  return { id: c.candidateId, displayName: c.name, verifiedFacts, unknownFields, evidenceRefs }
}

/**
 * The candidate's factual sentence — the ONLY factual description of it.
 *
 * Built from verified facts alone. A candidate with nothing but an address
 * yields exactly that address; it does not gain a hint that hours or wifi are
 * missing, because a gap mentioned in the factual surface is a gap the model
 * can talk around. Gaps travel separately, on the transparency line.
 */
export function buildGroundedCandidateFactSentence(c: Candidate, lang = 'vi'): string {
  const g = groundCandidate(c, lang)
  if (g.verifiedFacts.length === 0) {
    return lang === 'vi'
      ? `${g.displayName} — chưa có dữ liệu nào được xác minh.`
      : `${g.displayName} — no verified data.`
  }
  return `${g.displayName} — ${g.verifiedFacts.map(f => `${f.label}: ${f.value}`).join('; ')}`
}

/**
 * Can these candidates be compared on this dimension?
 *
 * "A rẻ hơn B" is a claim about both. With no price on either it is invention;
 * with a price on one it is still invention. Measured: "Orick giá hợp lý",
 * "quán nhỏ", "yên tĩnh hơn" — none of the three had any supporting field.
 */
export function comparableOn(field: string, candidates: Candidate[], lang = 'vi'): boolean {
  if (candidates.length < 2) return false
  return candidates.every(c => groundCandidate(c, lang).verifiedFacts.some(f => f.field === field))
}

/**
 * The block the model reads instead of a raw fact blob.
 *
 * Facts are pre-written sentences it may quote. Gaps are listed once per
 * candidate, phrased as what CANNOT be said. Preferences the user stated are
 * deliberately NOT mixed in here: "quiet" is something the user wants, not
 * something known about the venue, and merging the two is how "bạn muốn yên
 * tĩnh" became "quán này yên tĩnh".
 */
export function buildGroundedFactsBlock(candidates: Candidate[], lang = 'vi'): string {
  if (candidates.length === 0) return ''
  const vi = lang === 'vi'
  const lines = candidates.slice(0, 8).map(c => {
    const g = groundCandidate(c, lang)
    const gaps = g.unknownFields.length > 0
      ? `\n    ${vi ? 'CHUA CO DU LIEU — khong duoc khang dinh' : 'NO DATA — must not be asserted'}: ${g.unknownFields.join(', ')}`
      : ''
    return `  - ${buildGroundedCandidateFactSentence(c, lang)}${gaps}`
  })

  const comparablePrice = comparableOn('price', candidates, lang)
  const comparableHours = comparableOn('opening_hours', candidates, lang)

  return `\n\n===== SU THAT VE TUNG LUA CHON (SYSTEM — DA XAC MINH) =====
Cac cau duoi day la TOAN BO su that ban co ve moi lua chon. Chung do he thong soan tu du lieu tool, khong phai do ban viet.
${lines.join('\n')}

CACH DUNG:
- Muon noi mot dac diem cua mot lua chon: chi duoc dung dung nhung gi da liet ke o tren cho CHINH lua chon do.
- Khong lay dac diem cua lua chon nay gan cho lua chon khac.
- Khong suy ra tu ten quan, loai hinh, kien thuc chung, hay thoi quen thi truong.
- So sanh gia: ${comparablePrice ? 'DUOC — moi lua chon deu co gia.' : 'KHONG DUOC — thieu gia o it nhat mot lua chon.'}
- So sanh gio mo cua: ${comparableHours ? 'DUOC — moi lua chon deu co gio.' : 'KHONG DUOC — thieu gio o it nhat mot lua chon.'}
- Uu tien cua user (vd yen tinh, wifi, ngan sach) la DIEU USER MUON, KHONG phai su that ve quan.
  Duoc phep noi "ban dang uu tien yen tinh, nhung minh chua co du lieu xac minh muc do yen tinh cua quan".
  KHONG duoc noi "quan nay yen tinh" khi khong co du lieu.
- Viec cua ban la LY LUAN: chon phuong an hop nhat voi user, giai thich vi sao, neu danh doi. Phan su that da co san o tren.
============================================================`
}
