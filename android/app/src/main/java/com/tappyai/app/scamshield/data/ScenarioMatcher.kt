package com.tappyai.app.scamshield.data

import java.text.Normalizer

/**
 * Scam Shield · DETERMINISTIC match of a pasted message against the 25 official scenarios (Bộ Công an 2026) — ON THE DEVICE.
 * No network, no model, no token, nothing stored or sent: the message never leaves the phone for this step.
 *
 * A 1:1 port of the web's FINAL `lib/scam-shield/knowledge/match.ts` (`origin/rc/web-uat`, commit 65685a7, evidence matrix in
 * docs/android/RELEASE-INPUT-CHECK-2026-10-02.md): the same weighted, diacritic-free phrase table, the same word-boundary rule,
 * the same "a phrase wholly inside a longer matched phrase counts once" rule, the same thresholds. If the web table changes, this
 * file must be regenerated from it — never edited by hand.
 *
 *   score >= [STRONG_AT] -> [ScenarioConfidence.High]     "familiar scam signs"
 *   score >= [WEAK_AT]   -> [ScenarioConfidence.Possible] "some suspicious signs"
 *   below                -> no match: nothing is claimed
 */
enum class ScenarioConfidence { High, Possible }

data class ScenarioMatch(
    /** The scenario's official number in the Bộ Công an list (1..25). */
    val officialNumber: Int,
    val score: Double,
    val confidence: ScenarioConfidence,
    /** The phrases that fired (diacritic-free) — for tests; never shown and never the user's own text. */
    val phrases: List<String>,
)

object ScenarioMatcher {
    const val STRONG_AT = 6.0
    const val WEAK_AT = 4.0

    /** `normalizeVN`: NFD, drop combining marks, đ -> d. */
    private fun normalizeVn(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD).replace(MARKS, "").replace('đ', 'd').replace('Đ', 'D')

    private val MARKS = Regex("""[\u0300-\u036f]""")
    private val SPACES = Regex("""\s+""")

    /** Phrases are written WITHOUT diacritics (matching runs on the stripped text). Generated from the web table. */
    private val PHRASES: Map<Int, List<Pair<String, Double>>> = mapOf(
        1 to listOf("deepfake" to 6.0, "gia nguoi than" to 6.0, "gia mao nguoi than" to 6.0, "cuoc goi video" to 3.0, "goi video" to 3.0, "hinh anh gia" to 4.0, "nguoi than" to 1.5, "chuyen khoan gap" to 3.0, "can tien gap" to 3.0, "hinh mo" to 1.5, "ket thuc dot ngot" to 2.0),
        2 to listOf("deepvoice" to 6.0, "deep voice" to 6.0, "lam gia giong" to 6.0, "gia giong" to 5.0, "giong noi gia" to 6.0, "giong nguoi quen" to 5.0, "giong noi" to 2.0, "vay tien" to 2.0, "so la" to 1.5, "giu bi mat" to 2.0, "khong the goi lai" to 2.0),
        3 to listOf("gia danh cong an" to 6.0, "mao danh co quan to tung" to 6.0, "co quan to tung" to 5.0, "lien quan vu an" to 5.0, "tai khoan tam giu" to 6.0, "chuyen tien de xac minh" to 6.0, "lenh bat" to 5.0, "rua tien" to 4.0, "vien kiem sat" to 3.0, "vu an" to 3.0, "cong an" to 2.0, "toa an" to 2.0, "giay trieu tap" to 2.0, "giu bi mat" to 2.0),
        4 to listOf("gia nhan vien ngan hang" to 6.0, "nhan vien ngan hang" to 5.0, "khoa tai khoan" to 4.0, "nang han muc" to 4.0, "giao dich la" to 4.0, "link dang nhap" to 3.0, "mat khau" to 2.0, "ma otp" to 2.0, "ngan hang" to 1.5, "dang nhap" to 1.5, "mo khoa" to 2.0, "otp" to 1.5),
        5 to listOf("tin nhan brandname" to 6.0, "brandname" to 6.0, "sms gia" to 4.0, "tin nhan gia" to 4.0, "dang nhap bat thuong" to 5.0, "tai khoan bi khoa" to 4.0, "nhan tien hoan" to 3.0, "ten hien thi" to 2.0),
        6 to listOf("duong link gia" to 6.0, "link gia" to 6.0, "lien ket gia" to 6.0, "dang nhap qua link" to 5.0, "xac minh qua link" to 5.0, "duong link la" to 5.0, "ten mien la" to 5.0, "link la" to 4.0, "link xac minh" to 4.0, "link rut gon" to 3.0, "bam vao link" to 3.0, "bam link" to 3.0, "link" to 1.0),
        7 to listOf("chuyen khoan gia" to 6.0, "bien lai gia" to 6.0, "hoan tien thua" to 6.0, "anh chuyen khoan" to 5.0, "ngan hang dang xu ly" to 5.0, "chua nhan duoc tien" to 4.0, "tien thua" to 4.0, "bang chung giao dich" to 4.0, "bien lai" to 3.0, "da chuyen khoan" to 3.0, "nguoi mua" to 1.5),
        8 to listOf("chiem doat tai khoan" to 6.0, "facebook bi hack" to 6.0, "hack tai khoan" to 6.0, "ban be nhan vay tien" to 6.0, "nhan vay tien" to 5.0, "nhan tin muon tien" to 5.0, "vay tien gap" to 4.0, "bi hack" to 4.0, "binh chon" to 4.0, "mat tai khoan" to 3.0, "tai khoan ban be" to 3.0, "tai khoan facebook" to 2.0, "xem anh" to 2.0, "zalo" to 1.0),
        9 to listOf("goi dien im lang" to 6.0, "cuoc goi im lang" to 6.0, "thu thap giong" to 6.0, "mau giong noi" to 5.0, "im lang" to 2.0, "khong noi chuyen" to 2.0, "a lo" to 1.5, "so la goi" to 2.0, "nhieu cuoc goi" to 2.0),
        10 to listOf("gia danh giao vien" to 6.0, "giao vien" to 2.0, "nha truong" to 2.0, "hoc sinh" to 2.0, "tai nan" to 3.0, "cap cuu" to 3.0, "vien phi" to 4.0, "con em" to 1.5, "con ban" to 1.5),
        11 to listOf("mao danh nhan vien y te" to 6.0, "nhan vien y te" to 5.0, "bac si" to 2.0, "dieu duong" to 2.0, "nhap vien" to 3.0, "cap cuu" to 3.0, "vien phi" to 4.0, "tam ung" to 3.0, "nguoi than" to 1.5),
        12 to listOf("khoa sim" to 6.0, "sim sap bi khoa" to 6.0, "chuan hoa sim" to 5.0, "chuan hoa thue bao" to 5.0, "xac thuc sim" to 5.0, "nang cap sim" to 5.0, "chuyen huong cuoc goi" to 4.0, "thue bao" to 2.0, "sim" to 1.5),
        13 to listOf("chuong trinh hoan tien" to 6.0, "hoan hoc phi" to 5.0, "hoan thue" to 5.0, "nhan hoan tien" to 5.0, "nhan tien hoan" to 5.0, "hoan tien" to 4.0, "phi kich hoat" to 4.0),
        14 to listOf("viec nhe luong cao" to 6.0, "tuyen cong tac vien" to 6.0, "dat don ao" to 6.0, "cong tac vien" to 4.0, "lam nhiem vu" to 4.0, "nang cap thanh vien" to 4.0, "rut duoc so du" to 4.0, "viec nhe" to 3.0, "nhiem vu" to 3.0, "hoa hong" to 3.0, "luong cao" to 2.0),
        15 to listOf("cam ket loi nhuan" to 6.0, "loi nhuan co dinh" to 6.0, "loi nhuan cao" to 5.0, "khong rui ro" to 5.0, "loi nhuan hap dan" to 5.0, "nap tien vao san" to 5.0, "forex" to 4.0, "tien so" to 3.0, "tien ao" to 3.0, "crypto" to 3.0, "ngoai hoi" to 3.0, "san giao dich" to 3.0, "nang cap goi" to 3.0, "chung khoan" to 2.0, "dau tu" to 2.0, "chuyen gia" to 1.5),
        16 to listOf("nhom dau tu" to 5.0, "thay doc lenh" to 6.0, "lenh vip" to 6.0, "nop thue de rut" to 6.0, "khoe lai" to 5.0, "doc lenh" to 5.0, "rut lai nho" to 5.0, "chan rut tien" to 5.0, "vao lenh" to 4.0, "phi bao hiem" to 4.0, "nhom chat" to 2.0),
        17 to listOf("no cuoc" to 6.0, "cat dien" to 6.0, "cat nuoc" to 5.0, "cat mang" to 5.0, "nop cuoc" to 4.0, "tra cuu cuoc" to 4.0, "thanh toan cuoc" to 4.0, "dien luc" to 3.0, "cap nuoc" to 3.0, "tien dien" to 3.0, "hoa don dien" to 3.0, "vien thong" to 2.0),
        18 to listOf("vssid" to 6.0, "dong bo cccd" to 6.0, "so bhxh" to 4.0, "bhxh" to 4.0, "bao hiem xa hoi" to 4.0, "cap nhat ho so" to 3.0, "tro cap" to 3.0, "anh cccd" to 3.0, "cccd" to 2.0, "ho so" to 1.0),
        19 to listOf("ma qr gia" to 6.0, "qr gia" to 6.0, "ma qr la" to 6.0, "qr dan de" to 6.0, "qr lam gia" to 6.0, "qr la" to 5.0, "kem ma qr" to 5.0, "dinh kem ma qr" to 5.0, "gui kem ma qr" to 5.0, "quet qr" to 4.0, "ma qr" to 3.0, "quet ma" to 2.0, "buu pham" to 2.0, "buu kien" to 2.0, "kien hang" to 2.0, "qua trung thu" to 2.0, "qua tang" to 1.5, "qua tet" to 2.0, "in roi" to 2.0),
        20 to listOf("dieu khien tu xa" to 6.0, "teamviewer" to 5.0, "anydesk" to 5.0, "ultraviewer" to 5.0, "quyen tro nang" to 5.0, "file apk" to 5.0, "apk" to 4.0, "chia se man hinh" to 4.0, "cai ung dung" to 3.0, "cai phan mem" to 3.0, "ho tro ky thuat" to 3.0, "ma id" to 2.0),
        21 to listOf("khong cho kiem hang" to 6.0, "khong ship cod" to 6.0, "gia re bat thuong" to 5.0, "chi nhan coc" to 5.0, "dat coc" to 4.0, "coc truoc" to 4.0, "chuyen khoan truoc" to 4.0, "shop moi lap" to 4.0, "nguoi ban" to 2.0, "mua ban" to 1.5),
        22 to listOf("phat nguoi" to 6.0, "nop phat truc tuyen" to 6.0, "tra cuu vi pham" to 5.0, "nop phat" to 4.0, "vi pham giao thong" to 4.0, "csgt" to 3.0, "canh sat giao thong" to 3.0, "thong bao phat" to 3.0),
        23 to listOf("trung thuong" to 6.0, "trung giai" to 5.0, "nhan thuong" to 4.0, "phi van chuyen" to 4.0, "thue thu nhap" to 3.0, "tien thuong" to 3.0, "nhan qua" to 2.0, "qua tang" to 1.5),
        24 to listOf("lua dao tinh cam" to 6.0, "phi hai quan" to 6.0, "qua bi giu o hai quan" to 6.0, "nhan hang ho" to 6.0, "chuyen hang ho" to 6.0, "quen qua mang" to 4.0, "tranh gap mat" to 4.0, "chua tung gap" to 4.0, "hai quan" to 3.0, "tinh cam" to 2.0, "nguoi yeu" to 2.0, "ket ban" to 1.5),
        25 to listOf("phi ho so" to 6.0, "phi dao tao" to 6.0, "tien dong phuc" to 6.0, "dat coc thiet bi" to 6.0, "trung tuyen" to 5.0, "khong can phong van" to 5.0, "tuyen dung" to 3.0, "nha tuyen dung" to 3.0, "nhan viec" to 2.0, "phong van" to 1.0),
    )

    private val COMPILED: Map<Int, List<Triple<String, Double, Regex>>> = PHRASES.mapValues { (_, list) ->
        list.map { (p, w) -> Triple(p, w, Regex("(?<![a-z0-9])" + Regex.escape(p) + "(?![a-z0-9])")) }
    }

    /** Official numbers that have a phrase list — a test compares it with the bundled dataset. */
    val coveredScenarioNumbers: Set<Int> get() = PHRASES.keys

    /** The best official scenario for a (possibly very short) text, or null when nothing is claimed. Pure and synchronous. */
    fun match(text: String): ScenarioMatch? {
        if (text.isBlank()) return null
        val t = normalizeVn(text.lowercase()).replace(SPACES, " ")
        var best: ScenarioMatch? = null
        for ((number, list) in COMPILED) {
            val hit = list.filter { (_, _, re) -> re.containsMatchIn(t) }
            // A phrase wholly contained in a longer phrase that also matched is the SAME evidence, counted once.
            val kept = hit.filter { a -> hit.none { b -> b !== a && b.first.length > a.first.length && b.first.contains(a.first) } }
            val score = kept.sumOf { it.second }
            if (score <= 0.0) continue
            val current = best
            // Ties keep the first scenario in table order, like the web's stable sort on the same order.
            if (current == null || score > current.score) {
                best = ScenarioMatch(number, score, if (score >= STRONG_AT) ScenarioConfidence.High else ScenarioConfidence.Possible, kept.map { it.first })
            }
        }
        val b = best ?: return null
        return if (b.score < WEAK_AT) null else b
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
