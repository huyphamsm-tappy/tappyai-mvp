/**
 * Canonical deterministic Can Chi / Nạp Âm engine (source of truth for Web, Android and iOS).
 *
 * Pure functions + static tables only: no LLM, no network, no randomness, no `Date.now()`.
 * The same tables and the same arithmetic are mirrored row-for-row in:
 *   - android/app/src/main/java/com/tappyai/app/fortune/tuvi/CanChiEngine.kt
 *   - ios/TappyAI/Features/UtilityTools/Model/CanChiData.swift
 *
 * Algorithm (solar/Gregorian year in, sexagenary cycle out):
 *   n             = (year - 4) mod 60          — position in the 60-year cycle
 *   heavenlyStem  = HEAVENLY_STEMS[(year - 4) mod 10]
 *   earthlyBranch = EARTHLY_BRANCHES[(year - 4) mod 12]
 *   entry         = NAP_AM[floor(n / 2)]       — each Nạp Âm spans 2 consecutive years
 *   napAm         = entry.name, element = entry.element
 *
 * NOTE: `element` is the NẠP ÂM element (mệnh), not the Heavenly-Stem element. Deriving it from
 * the birth year's last digit yields the stem element and is wrong for mệnh (1985 → "Mộc" instead
 * of the correct "Kim"). Name and element live in the SAME row of the SAME table — there is no
 * second element lookup and no string parsing, so the two cannot drift apart.
 */

/** Thiên Can — 10 Heavenly Stems, in cycle order. */
export const HEAVENLY_STEMS = [
  'Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý',
] as const

/** Địa Chi — 12 Earthly Branches, in cycle order. */
export const EARTHLY_BRANCHES = [
  'Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi',
] as const

/** The five elements (ngũ hành) a Nạp Âm can resolve to. */
export const ELEMENTS = ['Kim', 'Mộc', 'Thủy', 'Hỏa', 'Thổ'] as const

export type Element = (typeof ELEMENTS)[number]

/** One row of the Nạp Âm table: the name and its element, kept together so they cannot drift. */
export interface NapAmEntry {
  name: string
  element: Element
}

/** Nạp Âm — 30 rows; row i covers the two consecutive cycle positions 2i and 2i+1. */
export const NAP_AM: readonly NapAmEntry[] = [
  { name: 'Hải Trung Kim', element: 'Kim' },
  { name: 'Lư Trung Hỏa', element: 'Hỏa' },
  { name: 'Đại Lâm Mộc', element: 'Mộc' },
  { name: 'Lộ Bàng Thổ', element: 'Thổ' },
  { name: 'Kiếm Phong Kim', element: 'Kim' },
  { name: 'Sơn Đầu Hỏa', element: 'Hỏa' },
  { name: 'Giản Hạ Thủy', element: 'Thủy' },
  { name: 'Thành Đầu Thổ', element: 'Thổ' },
  { name: 'Bạch Lạp Kim', element: 'Kim' },
  { name: 'Dương Liễu Mộc', element: 'Mộc' },
  { name: 'Tuyền Trung Thủy', element: 'Thủy' },
  { name: 'Ốc Thượng Thổ', element: 'Thổ' },
  { name: 'Tích Lịch Hỏa', element: 'Hỏa' },
  { name: 'Tùng Bách Mộc', element: 'Mộc' },
  { name: 'Trường Lưu Thủy', element: 'Thủy' },
  { name: 'Sa Trung Kim', element: 'Kim' },
  { name: 'Sơn Hạ Hỏa', element: 'Hỏa' },
  { name: 'Bình Địa Mộc', element: 'Mộc' },
  { name: 'Bích Thượng Thổ', element: 'Thổ' },
  { name: 'Kim Bạch Kim', element: 'Kim' },
  { name: 'Phú Đăng Hỏa', element: 'Hỏa' },
  { name: 'Thiên Hà Thủy', element: 'Thủy' },
  { name: 'Đại Trạch Thổ', element: 'Thổ' },
  { name: 'Thoa Xuyến Kim', element: 'Kim' },
  { name: 'Tang Đố Mộc', element: 'Mộc' },
  { name: 'Đại Khê Thủy', element: 'Thủy' },
  { name: 'Sa Trung Thổ', element: 'Thổ' },
  { name: 'Thiên Thượng Hỏa', element: 'Hỏa' },
  { name: 'Thạch Lựu Mộc', element: 'Mộc' },
  { name: 'Đại Hải Thủy', element: 'Thủy' },
]

/**
 * The astrology result for one birth year. Plain serialisable fields only (all strings), so a
 * backend can later return this exact shape unchanged and every platform decodes it as-is.
 */
export interface AstrologyProfile {
  /** Thiên Can — Heavenly Stem, e.g. `Ất`. */
  heavenlyStem: string
  /** Địa Chi — Earthly Branch, e.g. `Sửu`. */
  earthlyBranch: string
  /** Stem + branch, e.g. `Ất Sửu`. */
  canChi: string
  /** Nạp Âm name of the year, e.g. `Hải Trung Kim`. */
  napAm: string
  /** Ngũ hành (mệnh) carried by the Nạp Âm row, e.g. `Kim`. */
  element: Element
}

/** Positive modulo — JS `%` keeps the sign of the dividend, which breaks years before AD 4. */
function mod(a: number, m: number): number {
  return ((a % m) + m) % m
}

/**
 * Full astrology profile for a solar birth year. Deterministic and total: any integer year
 * (including years before AD 4) returns all five fields.
 */
export function getAstrologyProfile(year: number): AstrologyProfile {
  const offset = Math.trunc(year) - 4
  const n = mod(offset, 60)
  const heavenlyStem = HEAVENLY_STEMS[mod(offset, 10)]
  const earthlyBranch = EARTHLY_BRANCHES[mod(offset, 12)]
  const napAm = NAP_AM[Math.floor(n / 2)]

  return {
    heavenlyStem,
    earthlyBranch,
    canChi: `${heavenlyStem} ${earthlyBranch}`,
    napAm: napAm.name,
    element: napAm.element,
  }
}
