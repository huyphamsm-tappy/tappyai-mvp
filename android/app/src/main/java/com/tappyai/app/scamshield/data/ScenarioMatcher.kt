package com.tappyai.app.scamshield.data

import java.text.Normalizer

/**
 * Scam Shield · DETERMINISTIC match of a pasted message against the 25 official scenarios (Bộ Công an 2026) — ON THE DEVICE.
 * No network, no model, no token, nothing stored or sent: the message never leaves the phone for this step.
 *
 * A 1:1 port of the web's Phase 8 `lib/scam-shield/knowledge/match.ts` (`matchScenario`) so the three platforms read the SAME
 * cue table the SAME way. Each scenario carries hand-written cue phrases (TappyAI's, derived from the official titles and
 * TappyAI's guidance — never presented as official text). Matching is accent-insensitive (Vietnamese is often typed without
 * diacritics) and phrase-based on word boundaries built from spaces, never `\b` (which does not work after a Vietnamese vowel).
 *
 *   strong cue = 2 points, weak cue = 1 point.
 *   score >= 4  -> [ScenarioConfidence.High]     a known scenario: the app may answer on its own, without asking a server
 *   score 2..3  -> [ScenarioConfidence.Possible] show it as related, keep the normal (server) path
 *   score < 2   -> no match
 */
enum class ScenarioConfidence { High, Possible }

data class ScenarioMatch(
    val scenarioId: String,
    val score: Int,
    val confidence: ScenarioConfidence,
    /** The cues that matched (folded phrases) — never the user's own text. */
    val cues: List<String>,
)

object ScenarioMatcher {

    /** Lower-case, strip diacritics (đ -> d), collapse everything that is not a letter or digit to one space, padded with spaces. */
    fun fold(text: String): String {
        val noMarks = Normalizer.normalize(text, Normalizer.Form.NFD).replace(MARKS, "")
        val folded = noMarks.replace('đ', 'd').replace('Đ', 'd').lowercase().replace(NON_ALNUM, " ").trim()
        return " $folded "
    }

    private val MARKS = Regex("[\\u0300-\\u036f]")
    private val NON_ALNUM = Regex("[^a-z0-9]+")

    private class Cues(val strong: List<String>, val weak: List<String>)

    // Cue phrases are written WITHOUT diacritics (they are matched against `fold(text)`). Copied from the web's match.ts.
    private val CUES: Map<String, Cues> = linkedMapOf(
        "bca-2026-01" to Cues(listOf("deepfake", "goi video nho chuyen tien", "video call vay tien"), listOf("nguoi than", "goi video", "chuyen gap")),
        "bca-2026-02" to Cues(listOf("gia giong", "deepvoice", "giong noi ai"), listOf("nguoi quen", "chuyen gap", "vay tien")),
        "bca-2026-03" to Cues(listOf("cong an", "vien kiem sat", "toa an", "lenh bat", "dieu tra rua tien"), listOf("ho so vu an", "phong toa tai khoan", "chuyen tien de xac minh", "giu bi mat")),
        "bca-2026-04" to Cues(listOf("nhan vien ngan hang", "nang han muc", "the tin dung", "ma otp"), listOf("ngan hang", "xac thuc tai khoan", "cap nhat thong tin", "otp")),
        "bca-2026-05" to Cues(listOf("brandname", "tai khoan cua quy khach bi khoa"), listOf("tin nhan", "quy khach", "truy cap duong link")),
        "bca-2026-06" to Cues(listOf("bam vao link", "nhan vao duong link", "truy cap link"), listOf("link", "duong dan", "dang nhap")),
        "bca-2026-07" to Cues(listOf("bill chuyen khoan gia", "anh chuyen khoan", "bien lai gia"), listOf("da chuyen khoan", "kiem tra lai", "chuyen nham")),
        "bca-2026-08" to Cues(listOf("chiem tai khoan facebook", "hack facebook", "hack zalo", "muon tai khoan"), listOf("facebook", "zalo", "ma xac minh", "binh chon")),
        "bca-2026-09" to Cues(listOf("cuoc goi im lang"), listOf("goi nho", "khong ai tra loi")),
        "bca-2026-10" to Cues(listOf("con bi tai nan", "con dang cap cuu", "giao vien chu nhiem"), listOf("nha truong", "giao vien", "cap cuu", "chuyen tien vien phi")),
        "bca-2026-11" to Cues(listOf("bac si benh vien", "nguoi nha dang cap cuu", "vien phi gap"), listOf("benh vien", "y te", "cap cuu")),
        "bca-2026-12" to Cues(listOf("khoa sim", "chuan hoa thong tin thue bao", "sim chinh chu"), listOf("nha mang", "thue bao", "sim")),
        "bca-2026-13" to Cues(listOf("hoan tien", "hoan phi"), listOf("don hang loi", "hoan tra", "chiet khau")),
        "bca-2026-14" to Cues(listOf("cong tac vien", "lam nhiem vu", "chot don ao"), listOf("viec nhe luong cao", "hoa hong", "nap tien lam nhiem vu")),
        "bca-2026-15" to Cues(listOf("loi nhuan cao", "dau tu sinh loi", "cam ket loi nhuan"), listOf("dau tu", "lai suat", "tien ao", "chung khoan")),
        "bca-2026-16" to Cues(listOf("nhom dau tu", "chuyen gia chung khoan", "san dau tu"), listOf("nhom zalo", "nhom telegram", "dau tu")),
        "bca-2026-17" to Cues(listOf("cat dien", "tien dien", "tien nuoc", "cat mang"), listOf("dien luc", "evn", "cap nuoc", "vien thong", "no cuoc")),
        "bca-2026-18" to Cues(listOf("bao hiem xa hoi", "bhxh", "tro cap that nghiep"), listOf("bao hiem", "huong che do", "cap nhat vneid")),
        "bca-2026-19" to Cues(listOf("ma qr", "quet qr"), listOf("qr", "thanh toan", "dan de")),
        "bca-2026-20" to Cues(listOf("cai ung dung", "cai app", "dieu khien tu xa", "teamviewer", "anydesk", "ultraviewer"), listOf("tai ung dung", "file apk", "ung dung")),
        "bca-2026-21" to Cues(listOf("dat coc truoc", "chuyen coc"), listOf("mua ban", "hang gia re", "ship cod", "giao hang")),
        "bca-2026-22" to Cues(listOf("phat nguoi", "vi pham giao thong", "nop phat"), listOf("csgt", "bien ban", "phat")),
        "bca-2026-23" to Cues(listOf("trung thuong", "nhan giai", "qua tri an"), listOf("phi nhan thuong", "nop phi", "may man")),
        "bca-2026-24" to Cues(listOf("gui qua tu nuoc ngoai", "phi hai quan", "ban trai nuoc ngoai"), listOf("yeu", "ket ban", "qua tang", "hai quan")),
        "bca-2026-25" to Cues(listOf("tuyen dung", "phi ho so", "phi dong phuc"), listOf("viec lam", "phong van", "nop phi")),
    )

    /** Every cue-table id — each must name a real scenario in the bundled dataset (checked by a test). */
    val cueScenarioIds: Set<String> get() = CUES.keys

    /** The best scenario for [text], or null when nothing scores at least 2. Pure and synchronous. */
    fun match(text: String): ScenarioMatch? {
        if (text.isBlank()) return null
        val t = fold(text)
        var best: ScenarioMatch? = null
        for ((id, cues) in CUES) {
            val hit = ArrayList<String>()
            var score = 0
            for (c in cues.strong) if (t.contains(" $c ")) { score += 2; hit += c }
            for (c in cues.weak) if (t.contains(" $c ")) { score += 1; hit += c }
            if (score < 2) continue
            val current = best
            if (current == null || score > current.score) {
                best = ScenarioMatch(id, score, if (score >= 4) ScenarioConfidence.High else ScenarioConfidence.Possible, hit)
            }
        }
        return best
    }

    /** Whether [text] carries a link-like token: such a message goes to the link engine, so it is not answered from the cue table alone. */
    fun containsLink(text: String): Boolean = LINK.containsMatchIn(text)

    /** The first link-like token of [text], normalised to an `https://` URL, or null. Only this goes to the link check. */
    fun firstLink(text: String): String? {
        val m = LINK.find(text) ?: return null
        val schemeOrWww = m.value.startsWith("http", ignoreCase = true) || m.value.startsWith("www.", ignoreCase = true)
        var s = m.range.first
        if (!schemeOrWww) while (s > 0 && !text[s - 1].isWhitespace()) s--
        var e = m.range.last + 1
        while (e < text.length && !text[e].isWhitespace()) e++
        val token = text.substring(s, e).trim { it in ".,;:!?()«»<>" || it.code == 34 || it.code == 39 }
        if (token.isBlank()) return null
        return if (token.startsWith("http", ignoreCase = true)) token else "https://$token"
    }

    private val LINK = Regex("""(?i)(https?://|www\.|\b[a-z0-9-]+\.(com|vn|net|org|info|top|xyz|site|online|club|vip|cc|tk|ml|ga|cf|gq|me|io|link|click|app)\b)""")
}
