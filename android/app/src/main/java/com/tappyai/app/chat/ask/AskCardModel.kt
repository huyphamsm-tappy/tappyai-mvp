package com.tappyai.app.chat.ask

import com.tappyai.app.chat.AskQuestion
import com.tappyai.app.chat.plan.PlanArea
import java.text.Normalizer

/**
 * Ask card v2 (Huy 30/09, `docs/design/ask-card/`, R23) — the pure half. The server's
 * `[TAPPY_ASK]` is unchanged (`{id, q, options[≤4]}`); everything the new card adds — the kind of
 * each question (its subtitle, single/multi choice, image tiles or icon tiles), the icon of each
 * option and the image KEY of a "type" option — is derived here from the id and the words, by the
 * SAME table the web uses (README §2–§3), so both clients draw the same card.
 */
enum class AskKind(val multi: Boolean) { TYPE(true), PARTY(false), TIME(false), PLACE(false), BUDGET(false), OTHER(false) }

/** The icon of one option (the Compose side maps it to a Material icon). */
enum class AskIcon {
    PERSON_1, PERSON_2, GROUP_SMALL, GROUP_BIG,
    SUN, MOON, CALENDAR, CLOCK,
    PIN, MONEY, HELP, TUNE,
    MUSIC, MOVIE, BAR, TARGET, CAFE, GRILL, BOWL, RESTAURANT, SPA, BEACH, MOUNTAIN, SHOPPING, MIC,
    PARK, MUSEUM, FAMILY, NAIL, TECH, BEAUTY, SEAFOOD, RESORT,
}

data class AskOptionView(val label: String, val icon: AskIcon, val imageKey: String?, val area: PlanArea?)

data class AskQuestionView(val id: String, val number: Int, val title: String, val kind: AskKind, val options: List<AskOptionView>)

object AskCardModel {

    /** Lower-case, no diacritics ("Đi lúc nào?" → "di luc nao?") — how every rule compares. */
    fun norm(s: String): String = Normalizer.normalize(s.lowercase().replace('đ', 'd'), Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")

    private fun has(text: String, vararg words: String): Boolean {
        val t = norm(text)
        return words.any { w -> Regex("(^|[^a-z0-9])" + Regex.escape(w) + "($|[^a-z0-9])").containsMatchIn(t) }
    }

    private val TYPE_IDS = setOf("style", "type", "kind", "activity", "genre", "artist", "cuisine", "category", "loai", "mon", "product", "dish", "service", "line", "purpose")
    private val PARTY_IDS = setOf("party", "people", "group", "pax")
    private val TIME_IDS = setOf("time", "when", "date", "day")
    private val PLACE_IDS = setOf("area", "origin", "place", "district", "where")
    private val BUDGET_IDS = setOf("budget", "price")

    fun kindOf(q: AskQuestion): AskKind {
        val id = q.id.lowercase()
        return when {
            id in TYPE_IDS -> AskKind.TYPE
            id in PARTY_IDS -> AskKind.PARTY
            id in TIME_IDS -> AskKind.TIME
            id in PLACE_IDS -> AskKind.PLACE
            id in BUDGET_IDS -> AskKind.BUDGET
            has(q.q, "may nguoi", "voi ai", "bao nhieu nguoi") -> AskKind.PARTY
            has(q.q, "luc nao", "khi nao", "thoi diem", "hom nao", "ngay nao", "may gio", "buoi nao") -> AskKind.TIME
            has(q.q, "khu vuc", "o dau", "xuat phat") -> AskKind.PLACE
            has(q.q, "bao nhieu", "gia", "ngan sach", "tam") -> AskKind.BUDGET
            has(q.q, "lam gi", "choi gi", "loai", "the loai", "kieu", "mon", "thich gi", "hoat dong", "dich vu", "ca si", "dong nao") -> AskKind.TYPE
            else -> AskKind.OTHER
        }
    }

    /** Options that mean "no preference": no picture, a question-mark icon. */
    private fun isNoPreference(o: String) = has(o, "chua biet", "khong quan trong", "gi cung duoc", "tuy", "deu duoc", "chua chot", "noi khac")

    private data class Rule(val words: List<String>, val key: String, val icon: AskIcon, val area: PlanArea)

    /** README §3, in order — the FIRST rule whose word appears in the option wins. */
    private val RULES = listOf(
        Rule(listOf("karaoke"), "diem-karaoke", AskIcon.MUSIC, PlanArea.ENTERTAINMENT),
        Rule(listOf("phim", "rap phim", "cinema"), "diem-rap-phim", AskIcon.MOVIE, PlanArea.ENTERTAINMENT),
        Rule(listOf("bar", "pub", "bia", "beer", "cocktail"), "diem-bar", AskIcon.BAR, PlanArea.ENTERTAINMENT),
        Rule(listOf("bida", "bowling", "billiard"), "diem-bida", AskIcon.TARGET, PlanArea.ENTERTAINMENT),
        Rule(listOf("khu vui choi"), "diem-khu-vui-choi", AskIcon.FAMILY, PlanArea.ENTERTAINMENT),
        Rule(listOf("cong vien"), "diem-cong-vien", AskIcon.PARK, PlanArea.ENTERTAINMENT),
        Rule(listOf("thuy cung", "bao tang"), "diem-bao-tang", AskIcon.MUSEUM, PlanArea.ENTERTAINMENT),
        Rule(listOf("ca phe", "cafe", "coffee", "tra"), "diem-ca-phe", AskIcon.CAFE, PlanArea.FOOD),
        Rule(listOf("hai san"), "diem-hai-san", AskIcon.SEAFOOD, PlanArea.FOOD),
        Rule(listOf("lau", "nuong", "bbq"), "diem-lau-nuong", AskIcon.GRILL, PlanArea.FOOD),
        Rule(listOf("nhat", "han", "sushi"), "diem-mon-nhat-han", AskIcon.BOWL, PlanArea.FOOD),
        Rule(listOf("mon viet", "pho", "bun", "com", "binh dan"), "diem-mon-viet", AskIcon.BOWL, PlanArea.FOOD),
        Rule(listOf("an uong", "am thuc", "nha hang", "an"), "diem-an-uong", AskIcon.RESTAURANT, PlanArea.FOOD),
        Rule(listOf("son gel", "dap bot", "mong", "nail", "dinh da"), "diem-nail", AskIcon.NAIL, PlanArea.SPA),
        Rule(listOf("cham soc da", "lam dep", "skincare"), "diem-lam-dep", AskIcon.BEAUTY, PlanArea.SPA),
        Rule(listOf("spa", "massage", "goi dau", "goi", "xong hoi"), "diem-spa", AskIcon.SPA, PlanArea.SPA),
        Rule(listOf("nghi duong", "resort"), "diem-nghi-duong", AskIcon.RESORT, PlanArea.TRAVEL),
        Rule(listOf("bien"), "diem-bien", AskIcon.BEACH, PlanArea.TRAVEL),
        Rule(listOf("nui", "trekking", "cam trai"), "diem-nui", AskIcon.MOUNTAIN, PlanArea.TRAVEL),
        Rule(listOf("cong nghe", "gaming", "laptop", "dien thoai"), "diem-cong-nghe", AskIcon.TECH, PlanArea.SHOPPING),
        Rule(listOf("mua sam", "shop", "mall", "cho", "do"), "diem-mua-sam", AskIcon.SHOPPING, PlanArea.SHOPPING),
        Rule(listOf("nhac", "concert", "show", "live", "pop", "rap", "indie", "acoustic", "hip hop"), "diem-am-nhac", AskIcon.MIC, PlanArea.ENTERTAINMENT),
    )

    private fun ruleOf(option: String): Rule? = if (isNoPreference(option)) null else RULES.firstOrNull { r -> has(option, *r.words.toTypedArray()) }

    /** The STORED-style image key of a TYPE option (`diem-<loai>`), resolved through the manifest; null = no picture. */
    fun imageKeyOf(option: String): String? = ruleOf(option)?.key

    fun iconOf(kind: AskKind, option: String): AskIcon {
        if (isNoPreference(option)) return AskIcon.HELP
        return when (kind) {
            AskKind.TYPE -> ruleOf(option)?.icon ?: AskIcon.TUNE
            AskKind.PARTY -> when {
                has(option, "dong", "nhom ban") -> AskIcon.GROUP_BIG
                has(option, "gia dinh") -> AskIcon.FAMILY
                has(option, "3", "3-5", "nhom") -> AskIcon.GROUP_SMALL
                has(option, "2") -> AskIcon.PERSON_2
                else -> AskIcon.PERSON_1
            }
            AskKind.TIME -> when {
                has(option, "toi", "dem") -> AskIcon.MOON
                has(option, "sang", "trua", "chieu") -> AskIcon.SUN
                has(option, "cuoi tuan", "tuan", "thang", "ngay", "mai", "hom nay") -> AskIcon.CALENDAR
                else -> AskIcon.CLOCK
            }
            AskKind.PLACE -> AskIcon.PIN
            AskKind.BUDGET -> AskIcon.MONEY
            AskKind.OTHER -> AskIcon.TUNE
        }
    }

    fun viewOf(questions: List<AskQuestion>): List<AskQuestionView> = questions.mapIndexed { i, q ->
        val kind = kindOf(q)
        AskQuestionView(
            id = q.id,
            number = i + 1,
            title = q.q,
            kind = kind,
            options = q.options.map { o ->
                val rule = if (kind == AskKind.TYPE) ruleOf(o) else null
                AskOptionView(label = o, icon = iconOf(kind, o), imageKey = rule?.key, area = rule?.area)
            },
        )
    }

    /** The placeholder area of the card: the first TYPE option with an area, else entertainment. */
    fun areaOf(views: List<AskQuestionView>): PlanArea =
        views.flatMap { it.options }.firstNotNullOfOrNull { it.area } ?: PlanArea.ENTERTAINMENT

    /**
     * The ONE text message the card sends (unchanged shape): questions in order joined " · "; a
     * multi-choice (TYPE) question's picks joined ", " in the card's option order; free text last.
     */
    fun composeAnswer(views: List<AskQuestionView>, chosen: Map<String, Set<String>>, free: String = ""): String {
        val parts = views.mapNotNull { v ->
            val picked = v.options.map { it.label }.filter { it in chosen[v.id].orEmpty() }
            picked.takeIf { it.isNotEmpty() }?.joinToString(", ")
        }
        val extra = free.trim()
        return (parts + listOfNotNull(extra.takeIf { it.isNotEmpty() })).joinToString(" · ")
    }
}
