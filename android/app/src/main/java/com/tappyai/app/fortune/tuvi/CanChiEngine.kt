package com.tappyai.app.fortune.tuvi

/**
 * Canonical deterministic Can Chi / Nạp Âm engine — Kotlin mirror of the web source of truth
 * (`src/lib/boi/canChiEngine.ts`) and of `ios/TappyAI/Features/UtilityTools/Model/CanChiData.swift`.
 *
 * Pure functions + static tables only: no LLM, no network, no randomness, no clock.
 *
 * Algorithm (solar/Gregorian year in, sexagenary cycle out):
 *   n             = (year - 4) mod 60          — position in the 60-year cycle
 *   heavenlyStem  = HEAVENLY_STEMS[(year - 4) mod 10]
 *   earthlyBranch = EARTHLY_BRANCHES[(year - 4) mod 12]
 *   entry         = NAP_AM[n / 2]              — each Nạp Âm spans 2 consecutive years
 *   napAm         = entry.name, element = entry.element
 *
 * NOTE: `element` is the NẠP ÂM element (mệnh), not the Heavenly-Stem element. Deriving it from
 * the birth year's last digit yields the stem element and is wrong for mệnh (1985 → "Mộc" instead
 * of the correct "Kim"). Name and element live in the SAME row of the SAME table — there is no
 * second element lookup and no string parsing, so the two cannot drift apart.
 */

/** Thiên Can — 10 Heavenly Stems, in cycle order. */
val HEAVENLY_STEMS: List<String> = listOf(
    "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý",
)

/** Địa Chi — 12 Earthly Branches, in cycle order. */
val EARTHLY_BRANCHES: List<String> = listOf(
    "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi",
)

/** The five elements (ngũ hành) a Nạp Âm can resolve to. */
val ELEMENTS: List<String> = listOf("Kim", "Mộc", "Thủy", "Hỏa", "Thổ")

/** One row of the Nạp Âm table: the name and its element, kept together so they cannot drift. */
data class NapAmEntry(val name: String, val element: String)

/** Nạp Âm — 30 rows; row i covers the two consecutive cycle positions 2i and 2i+1. */
val NAP_AM: List<NapAmEntry> = listOf(
    NapAmEntry("Hải Trung Kim", "Kim"),
    NapAmEntry("Lư Trung Hỏa", "Hỏa"),
    NapAmEntry("Đại Lâm Mộc", "Mộc"),
    NapAmEntry("Lộ Bàng Thổ", "Thổ"),
    NapAmEntry("Kiếm Phong Kim", "Kim"),
    NapAmEntry("Sơn Đầu Hỏa", "Hỏa"),
    NapAmEntry("Giản Hạ Thủy", "Thủy"),
    NapAmEntry("Thành Đầu Thổ", "Thổ"),
    NapAmEntry("Bạch Lạp Kim", "Kim"),
    NapAmEntry("Dương Liễu Mộc", "Mộc"),
    NapAmEntry("Tuyền Trung Thủy", "Thủy"),
    NapAmEntry("Ốc Thượng Thổ", "Thổ"),
    NapAmEntry("Tích Lịch Hỏa", "Hỏa"),
    NapAmEntry("Tùng Bách Mộc", "Mộc"),
    NapAmEntry("Trường Lưu Thủy", "Thủy"),
    NapAmEntry("Sa Trung Kim", "Kim"),
    NapAmEntry("Sơn Hạ Hỏa", "Hỏa"),
    NapAmEntry("Bình Địa Mộc", "Mộc"),
    NapAmEntry("Bích Thượng Thổ", "Thổ"),
    NapAmEntry("Kim Bạch Kim", "Kim"),
    NapAmEntry("Phú Đăng Hỏa", "Hỏa"),
    NapAmEntry("Thiên Hà Thủy", "Thủy"),
    NapAmEntry("Đại Trạch Thổ", "Thổ"),
    NapAmEntry("Thoa Xuyến Kim", "Kim"),
    NapAmEntry("Tang Đố Mộc", "Mộc"),
    NapAmEntry("Đại Khê Thủy", "Thủy"),
    NapAmEntry("Sa Trung Thổ", "Thổ"),
    NapAmEntry("Thiên Thượng Hỏa", "Hỏa"),
    NapAmEntry("Thạch Lựu Mộc", "Mộc"),
    NapAmEntry("Đại Hải Thủy", "Thủy"),
)

/**
 * The astrology result for one birth year. Plain serialisable fields only (all strings), so a
 * backend can later return this exact shape unchanged and every platform decodes it as-is.
 */
data class AstrologyProfile(
    /** Thiên Can — Heavenly Stem, e.g. `Ất`. */
    val heavenlyStem: String,
    /** Địa Chi — Earthly Branch, e.g. `Sửu`. */
    val earthlyBranch: String,
    /** Stem + branch, e.g. `Ất Sửu`. */
    val canChi: String,
    /** Nạp Âm name of the year, e.g. `Hải Trung Kim`. */
    val napAm: String,
    /** Ngũ hành (mệnh) carried by the Nạp Âm row, e.g. `Kim`. */
    val element: String,
)

/** Positive modulo — Kotlin `%` keeps the sign of the dividend, which breaks years before AD 4. */
private fun mod(a: Int, m: Int): Int = ((a % m) + m) % m

/**
 * Full astrology profile for a solar birth year. Deterministic and total: any year (including
 * years before AD 4) returns all five fields.
 */
fun getAstrologyProfile(year: Int): AstrologyProfile {
    val offset = year - 4
    val n = mod(offset, 60)
    val heavenlyStem = HEAVENLY_STEMS[mod(offset, 10)]
    val earthlyBranch = EARTHLY_BRANCHES[mod(offset, 12)]
    val napAm = NAP_AM[n / 2]

    return AstrologyProfile(
        heavenlyStem = heavenlyStem,
        earthlyBranch = earthlyBranch,
        canChi = "$heavenlyStem $earthlyBranch",
        napAm = napAm.name,
        element = napAm.element,
    )
}
