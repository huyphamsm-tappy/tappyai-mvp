import { normalizeVN } from './intent'

// ── A district the user STATES constrains the results, by the venue's actual address ────────────
//
// PRELAUNCH 5b (2026-09-24, Session D): "quán phở ngon ở Quận 3" asked from a phone in Quận 1 came
// back with Quận 1 venues, and the prose justified one of them as "ở Quận 3". The district reached
// the model's search string and the prose — never the rows. This module is the deterministic half:
//
//   · `statedDistrict(text)`   — the district a USER names ("Quận 3", "Q3", "Bình Thạnh", "Cầu Giấy").
//   · `districtOfAddress(addr)` — which district a venue is actually in, read from its address.
//   · `districtRelation(req, addr)` — 'in' | 'out' | 'unknown'.
//
// 🚨 WHY A WARD TABLE. Since the 2025 administrative reorganisation (Nghị quyết 1685/NQ-UBTVQH15,
// effective 2025-07-01) Ho Chi Minh City has no districts; Google's addresses now end in the NEW
// ward: "112 Lý Tự Trọng, Bến Thành, Hồ Chí Minh". People still say "Quận 1". So a venue's former
// district is read from (a) an explicit "Quận N" / district name still printed in the address, or
// (b) its new ward, via the table below (new ward → the former district it lies in).
//
// 🚨 NEVER GUESS. A ward the table does not know, a city it does not cover, or an address with no
// ward component is 'unknown' — never 'out'. Only a POSITIVELY different district is 'out'. An
// honest "district unconfirmed" beats silently dropping a legitimate venue.
//
// Scope: Ho Chi Minh City's former urban districts (ward table) and Hà Nội's named districts
// (explicit name only — no ward table; most Hà Nội rows therefore read 'unknown'). The ward table
// is transcribed for the former urban districts from the 2025 resolution; a new ward that straddles
// two former districts is listed under the one it mostly replaced.

export interface District {
  /** Stable key, e.g. 'hcm:q3', 'hcm:binh-thanh', 'hn:cau-giay'. */
  key: string
  /** How the user and the reply say it: 'Quận 3', 'Bình Thạnh'. */
  label: string
  city: 'hcm' | 'hn'
  /** Approximate centre, used only to centre a search on the stated area — never shown or claimed. */
  centre: { lat: number; lng: number }
}

const fold = (s: unknown) => normalizeVN(String(s ?? '').toLowerCase()).replace(/\s+/g, ' ').trim()

const HCM: Array<District & { aliases: string[]; wards: string[]; umbrella?: string }> = [
  { key: 'hcm:q1', label: 'Quận 1', city: 'hcm', centre: { lat: 10.7769, lng: 106.7009 }, aliases: [], wards: ['sai gon', 'tan dinh', 'ben thanh', 'cau ong lanh'] },
  { key: 'hcm:q3', label: 'Quận 3', city: 'hcm', centre: { lat: 10.7843, lng: 106.6844 }, aliases: [], wards: ['ban co', 'xuan hoa', 'nhieu loc', 'vo thi sau'] },
  { key: 'hcm:q4', label: 'Quận 4', city: 'hcm', centre: { lat: 10.7578, lng: 106.7013 }, aliases: [], wards: ['xom chieu', 'khanh hoi', 'vinh hoi'] },
  { key: 'hcm:q5', label: 'Quận 5', city: 'hcm', centre: { lat: 10.7540, lng: 106.6634 }, aliases: [], wards: ['cho quan', 'an dong', 'cho lon'] },
  { key: 'hcm:q6', label: 'Quận 6', city: 'hcm', centre: { lat: 10.7480, lng: 106.6352 }, aliases: [], wards: ['binh tay', 'binh tien', 'binh phu', 'phu lam'] },
  { key: 'hcm:q7', label: 'Quận 7', city: 'hcm', centre: { lat: 10.7340, lng: 106.7218 }, aliases: [], wards: ['tan my', 'tan hung', 'tan thuan', 'phu thuan'] },
  { key: 'hcm:q8', label: 'Quận 8', city: 'hcm', centre: { lat: 10.7240, lng: 106.6286 }, aliases: [], wards: ['chanh hung', 'phu dinh', 'binh dong'] },
  { key: 'hcm:q10', label: 'Quận 10', city: 'hcm', centre: { lat: 10.7730, lng: 106.6680 }, aliases: [], wards: ['dien hong', 'vuon lai', 'hoa hung'] },
  { key: 'hcm:q11', label: 'Quận 11', city: 'hcm', centre: { lat: 10.7629, lng: 106.6503 }, aliases: [], wards: ['hoa binh', 'phu tho', 'binh thoi', 'minh phung'] },
  { key: 'hcm:q12', label: 'Quận 12', city: 'hcm', centre: { lat: 10.8672, lng: 106.6413 }, aliases: [], wards: ['dong hung thuan', 'trung my tay', 'tan thoi hiep', 'thoi an', 'an phu dong'] },
  { key: 'hcm:binh-thanh', label: 'Bình Thạnh', city: 'hcm', centre: { lat: 10.8106, lng: 106.7091 }, aliases: ['binh thanh'], wards: ['gia dinh', 'binh thanh', 'binh loi trung', 'thanh my tay', 'binh quoi'] },
  { key: 'hcm:phu-nhuan', label: 'Phú Nhuận', city: 'hcm', centre: { lat: 10.7991, lng: 106.6802 }, aliases: ['phu nhuan'], wards: ['duc nhuan', 'cau kieu', 'phu nhuan'] },
  { key: 'hcm:go-vap', label: 'Gò Vấp', city: 'hcm', centre: { lat: 10.8387, lng: 106.6653 }, aliases: ['go vap'], wards: ['hanh thong', 'an nhon', 'go vap', 'an hoi dong', 'thong tay hoi', 'an hoi tay'] },
  { key: 'hcm:tan-binh', label: 'Tân Bình', city: 'hcm', centre: { lat: 10.8014, lng: 106.6526 }, aliases: ['tan binh'], wards: ['tan son hoa', 'tan son nhat', 'tan hoa', 'bay hien', 'tan binh', 'tan son'] },
  { key: 'hcm:tan-phu', label: 'Tân Phú', city: 'hcm', centre: { lat: 10.7900, lng: 106.6281 }, aliases: ['tan phu'], wards: ['tay thanh', 'tan son nhi', 'phu tho hoa', 'tan phu', 'phu thanh'] },
  { key: 'hcm:binh-tan', label: 'Bình Tân', city: 'hcm', centre: { lat: 10.7650, lng: 106.6038 }, aliases: ['binh tan'], wards: ['binh hung hoa', 'binh tan', 'binh tri dong', 'an lac', 'tan tao'] },
  // Thủ Đức: the former Quận 2 / Quận 9 / Thủ Đức district, and the umbrella the name now means.
  { key: 'hcm:q2', label: 'Quận 2', city: 'hcm', centre: { lat: 10.7872, lng: 106.7498 }, aliases: [], wards: ['an khanh', 'binh trung', 'cat lai'], umbrella: 'hcm:thu-duc' },
  { key: 'hcm:q9', label: 'Quận 9', city: 'hcm', centre: { lat: 10.8428, lng: 106.8287 }, aliases: [], wards: ['long binh', 'long phuoc', 'long truong', 'phuoc long', 'tang nhon phu'], umbrella: 'hcm:thu-duc' },
  { key: 'hcm:thu-duc-old', label: 'Thủ Đức', city: 'hcm', centre: { lat: 10.8494, lng: 106.7537 }, aliases: [], wards: ['hiep binh', 'tam binh', 'thu duc', 'linh xuan'], umbrella: 'hcm:thu-duc' },
]
const HCM_THU_DUC: District = { key: 'hcm:thu-duc', label: 'Thủ Đức', city: 'hcm', centre: { lat: 10.8494, lng: 106.7537 } }

const HN: District[] = [
  ['hoan-kiem', 'Hoàn Kiếm', 21.0285, 105.8542], ['ba-dinh', 'Ba Đình', 21.034, 105.814], ['dong-da', 'Đống Đa', 21.0181, 105.829],
  ['hai-ba-trung', 'Hai Bà Trưng', 21.006, 105.858], ['cau-giay', 'Cầu Giấy', 21.0362, 105.7906], ['tay-ho', 'Tây Hồ', 21.07, 105.819],
  ['thanh-xuan', 'Thanh Xuân', 20.995, 105.808], ['hoang-mai', 'Hoàng Mai', 20.974, 105.863], ['long-bien', 'Long Biên', 21.047, 105.889],
  ['ha-dong', 'Hà Đông', 20.971, 105.778], ['nam-tu-liem', 'Nam Từ Liêm', 21.012, 105.765], ['bac-tu-liem', 'Bắc Từ Liêm', 21.071, 105.764],
].map(([k, label, lat, lng]) => ({ key: `hn:${k}`, label: label as string, city: 'hn' as const, centre: { lat: lat as number, lng: lng as number } }))

const pub = (d: District): District => ({ key: d.key, label: d.label, city: d.city, centre: d.centre })
const HCM_BY_NUMBER = new Map(HCM.filter(d => /^hcm:q\d+$/.test(d.key)).map(d => [d.key.slice(5), d]))

/**
 * The district the user NAMES in this text, or null. Reads the user's words only — never a
 * model-written location string (the model fills "Quận 1" from the GPS on its own).
 */
export function statedDistrict(text: unknown): District | null {
  const t = fold(text)
  if (!t) return null
  const num = t.match(/\b(?:quan|q\.?|district)\s*(\d{1,2})\b(?!\s*(?:mon|nguoi|ngay|dem|gio|h\b|phut|km|k\b|tr\b|trieu|nghin|ngan|%))/)
  if (num) {
    const d = HCM_BY_NUMBER.get(num[1])
    if (d) return pub(d)
  }
  if (/\bthu duc\b/.test(t)) return HCM_THU_DUC
  for (const d of HCM) for (const a of d.aliases) if (new RegExp(`\\b${a}\\b`).test(t)) return pub(d)
  for (const d of HN) if (new RegExp(`\\b${fold(d.label)}\\b`).test(t)) return d
  return null
}

/** Address components, folded, with a leading ward/district word removed ("P. Bến Thành" → "ben thanh"). */
function components(address: string): string[] {
  return address.split(',').map(c => fold(c).replace(/^(?:phuong|p\.?|ward)\s+/, '').replace(/\s*\d{5,6}$/, '').trim()).filter(Boolean)
}

/** The district(s) a venue's address places it in: explicit name first, then the new ward. */
export function districtsOfAddress(address: unknown): District[] {
  if (typeof address !== 'string' || !address.trim()) return []
  const parts = components(address)
  const all = fold(address)
  const found: District[] = []
  const push = (d: District) => { if (!found.some(f => f.key === d.key)) found.push(pub(d)) }
  // Explicit "Quận N" / "District N" / "Q.N" anywhere in the address.
  for (const m of all.matchAll(/\b(?:quan|q\.|district)\s*(\d{1,2})\b/g)) { const d = HCM_BY_NUMBER.get(m[1]); if (d) push(d) }
  const isHcm = /\bho chi minh\b|\bhcm\b|\bsai gon\b|\bsaigon\b/.test(all)
  const isHn = /\bha noi\b|\bhanoi\b/.test(all)
  for (const p of parts) {
    const bare = p.replace(/^(?:quan|q\.?|district)\s+/, '')
    // Ward names repeat across provinces ("Phú Thuận", "An Khánh"), so the ward table is read only
    // for an address that says it is in Ho Chi Minh City.
    if (isHcm) {
      for (const d of HCM) {
        if (d.wards.includes(bare) || d.aliases.includes(bare)) { push(d); if (d.umbrella) push(HCM_THU_DUC) }
      }
      if (bare === 'thu duc') push(HCM_THU_DUC)
    }
    if (isHn) for (const d of HN) if (fold(d.label) === bare) push(d)
  }
  return found
}

/**
 * How a venue relates to the district the user asked for.
 *   in      — the address places it in that district (or, for "Thủ Đức", anywhere in the umbrella).
 *   out     — the address places it in a DIFFERENT district of the same city, and not in this one.
 *   unknown — the address says nothing this module can read with confidence.
 */
export function districtRelation(requested: District, address: unknown): { relation: 'in' | 'out' | 'unknown'; actual: District | null } {
  const ds = districtsOfAddress(address)
  if (ds.length === 0) return { relation: 'unknown', actual: null }
  if (ds.some(d => d.key === requested.key)) return { relation: 'in', actual: ds.find(d => d.key === requested.key) ?? null }
  const sameCity = ds.filter(d => d.city === requested.city && d.key !== HCM_THU_DUC.key)
  if (sameCity.length === 0) {
    // Only the Thủ Đức umbrella matched: it is "in" for a Thủ Đức request, unknown for Quận 2 / 9.
    return { relation: 'unknown', actual: ds[0] ?? null }
  }
  return { relation: 'out', actual: sameCity[0] }
}
