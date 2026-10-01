package com.tappyai.app.chat.ask

import com.tappyai.app.chat.AskQuestion
import java.text.Normalizer

/**
 * Ask card v2 (Huy 30/09, `docs/design/ask-card/README.md` R23 + R23.1) — the pure half, a 1:1 port of
 * the web's reference `src/lib/structuredContent/askCardModel.ts`, so both clients draw the same card
 * from the same unchanged `[TAPPY_ASK]` (`{id, q, options[≤4]}`): the area (header), each question's
 * kind (sub-line, one or many), each option's icon and — for the type question — its image KEY
 * (looked up in the R22 manifest). The message sent keeps its shape ([sendText]).
 */
enum class AskArea { FOOD, SHOPPING, TRAVEL, ENTERTAINMENT, SPA, MAIN }

enum class AskKind(val multi: Boolean) { TYPE(true), PARTY(false), TIME(false), BUDGET(false), OTHER(false) }

/** Web lucide name → this enum; the Compose side maps it to a Material icon. */
enum class AskIcon {
    // type rows
    MUSIC, FILM, MARTINI, CIRCLE_DOT, COFFEE, FLAME, SOUP, UTENSILS, FLOWER, WAVES, MOUNTAIN, SHOPPING_BAG, MIC, HELP, SPARKLES,
    // party / time / budget
    USER, USERS, USERS_ROUND, CALENDAR, MOON, SUN, WALLET,
    // other (R23.1 optional)
    MAP_PIN, PLANE, BUS, CAR, BIKE, STORE,
}

data class AskOptionView(val label: String, val icon: AskIcon, val imageKey: String?)

data class AskQuestionView(val id: String, val number: Int, val title: String, val kind: AskKind, val options: List<AskOptionView>)

object AskCardModel {

    /** Lower case, no marks (web `fold`) — ASCII after this, so `\b` is safe. */
    fun fold(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "")
        .replace('đ', 'd').replace('Đ', 'D').lowercase()

    /** Lower case WITH marks (web `lower`) — for the words that collide once folded (rạp/rap, lẩu/lâu, đồ/đỏ, chợ/cho). */
    fun lower(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFC).lowercase()

    /**
     * The area of the ask turn — drives the header, the tint, the placeholder tiles and the free-text example.
     *
     * First the question ids the router emits (web `askAreaOf`, unchanged). Where the ids say nothing — or only
     * the generic `style` — the area is read from what the conversation is ABOUT ([context] = the user's message
     * and the reply's lead line) plus the words of the questions and options themselves.
     *
     * 🚨 Huy 01/10: web's rule made every `style` ask without spa words a TRIP, so «Phở Bắc hay Phở Nam?» (ids
     * `style` / `party` / `budget`) drew «Chuyến đi thế nào đây?». Here a card never defaults to travel: with no
     * signal at all it is the neutral [AskArea.MAIN]. Correct whether or not the server later sends `dish` / `mode`.
     */
    fun areaOf(questions: List<AskQuestion>, context: String = ""): AskArea {
        val ids = questions.map { it.id }.toSet()
        if ("dish" in ids || "mode" in ids) return AskArea.FOOD
        if ("service" in ids || "special" in ids) return AskArea.SPA
        if ("activity" in ids || "vibe" in ids || "artist" in ids) return AskArea.ENTERTAINMENT
        // R28 (web 01/10): `dest` = «Bay đến đâu?», `device` = «Dùng cho iPhone nào?» (accessory shopping).
        if ("date" in ids || "origin" in ids || "transport" in ids || "dest" in ids) return AskArea.TRAVEL
        if ("line" in ids || "must" in ids || "condition" in ids || "purpose" in ids || "device" in ids) return AskArea.SHOPPING
        questions.firstOrNull { it.id == "style" }?.let { style ->
            if (style.options.any { SPA_WORDS.containsMatchIn(fold(it)) }) return AskArea.SPA
        }
        // A hotel ask that already knows the dates carries only party / budget per night.
        if (questions.any { q ->
                Regex("\\b(?:moi dem|may dem)\\b").containsMatchIn(fold(q.q)) ||
                    (q.id == "party" && q.options.any { Regex("\\b(?:gia dinh|nhom ban)\\b").containsMatchIn(fold(it)) })
            }
        ) return AskArea.TRAVEL
        return areaFromWords(questions, context)
    }

    private val SPA_WORDS = Regex("\\b(?:massage|toan than|vai gay|da nong|nail|son gel|dinh da|dap bot|mong|toc|cat|uon|nhuom|phuc hoi|goi)\\b")

    /** Word lists per area (folded, ASCII). The conversation text counts double — it is what the person asked. */
    private val AREA_WORDS: List<Pair<AskArea, Regex>> = listOf(
        AskArea.SPA to Regex("\\b(?:massage|spa|nail|goi dau|xong hoi|cham soc da|lam dep|vai gay|da nong|toan than|lam toc|cat toc|nhuom toc|uon toc|dap bot|dinh da|son gel|tri lieu|body|mong tay|mong chan)\\b"),
        AskArea.FOOD to Regex("\\b(?:pho|bun|mi quang|hu tieu|com|banh mi|banh|lau|nuong|quan an|nha hang|mon an|an uong|an gi|an sang|an trua|an toi|an vat|nhau|buffet|hai san|mon viet|mon nhat|mon han|do an|giao tan noi|an tai quan|vegan|an chay|quan cafe|cafe|ca phe|tra sua|bia)\\b"),
        AskArea.ENTERTAINMENT to Regex("\\b(?:karaoke|xem phim|rap phim|phim|bar|pub|bida|billiard|bowling|concert|ca nhac|live music|giai tri|di choi|vui choi|club|escape room|san khau|nhac song|nightlife)\\b"),
        AskArea.SHOPPING to Regex("\\b(?:mua sam|tai nghe|nhet tai|chup tai|chong on|iphone|ipad|samsung|phu kien|op lung|kinh cuong luc|dien thoai|laptop|may tinh|tivi|tu lanh|may giat|may anh|thoi trang|dong ho|qua tang|bao hanh|chinh hang|lazada|shopee|tiki|do cong nghe|thiet bi|pin|sac|giay|tui xach)\\b"),
        AskArea.TRAVEL to Regex("\\b(?:du lich|chuyen di|tour|resort|homestay|khach san|nghi duong|bien|nui|ve may bay|chuyen bay|bay tu|bay den|visa|dat phong|lich trinh|3n2d|2n1d|may ngay|may dem|moi dem|di choi xa|phuot)\\b"),
    )

    /** `mua` (to buy) — only with its tone marks, so «mùa» / «mưa» do not count. */
    private val BUY = Regex("(?<![\\p{L}])mua(?![\\p{L}])")

    private fun areaFromWords(questions: List<AskQuestion>, context: String): AskArea {
        val own = (questions.map { it.q } + questions.flatMap { it.options }).joinToString(" ")
        val scores = AREA_WORDS.map { (area, re) ->
            val ctx = re.findAll(fold(context)).map { it.value }.toSet().size
            val inAsk = re.findAll(fold(own)).map { it.value }.toSet().size
            var score = ctx * 2 + inAsk
            if (area == AskArea.SHOPPING && BUY.containsMatchIn(lower(context))) score += 2
            area to score
        }
        val best = scores.maxOf { it.second }
        return if (best <= 0) AskArea.MAIN else scores.first { it.second == best }.first
    }

    private val TYPE_IDS = setOf("style", "type", "kind", "activity", "genre", "artist", "cuisine", "category", "loai", "mon", "product", "dish", "service")
    private val PARTY_IDS = setOf("party", "people", "group", "pax")
    private val TIME_IDS = setOf("time", "when", "date", "day")
    private val BUDGET_IDS = setOf("budget", "price")

    /** web `askStepKind`: `id` first, then the words of `q`. */
    fun kindOf(q: AskQuestion): AskKind {
        if (q.id in TYPE_IDS) return AskKind.TYPE
        if (q.id in PARTY_IDS) return AskKind.PARTY
        if (q.id in TIME_IDS) return AskKind.TIME
        if (q.id in BUDGET_IDS) return AskKind.BUDGET
        val t = fold(q.q)
        if (Regex("\\b(?:lam gi|loai|the loai|kieu|mon|thich gi|hoat dong|ca si)\\b").containsMatchIn(t)) return AskKind.TYPE
        if (Regex("\\b(?:may nguoi|voi ai|bao nhieu nguoi)\\b").containsMatchIn(t)) return AskKind.PARTY
        if (Regex("\\b(?:luc nao|khi nao|thoi diem|hom nao|ngay|gio)\\b").containsMatchIn(t)) return AskKind.TIME
        if (Regex("\\b(?:bao nhieu|gia|ngan sach|tam)\\b").containsMatchIn(t)) return AskKind.BUDGET
        return AskKind.OTHER
    }

    /** web `TILE_ROWS` — the first row whose folded (`f`) or marked (`r`) words match wins. */
    private class TileRow(val f: Regex?, val r: Regex?, val key: String?, val icon: AskIcon)

    private val TILE_ROWS = listOf(
        TileRow(Regex("\\bkaraoke\\b"), null, "diem-karaoke", AskIcon.MUSIC),
        TileRow(Regex("\\b(?:phim|cinema)\\b"), Regex("rạp"), "diem-rap-phim", AskIcon.FILM),
        TileRow(Regex("\\b(?:bar|pub|bia|beer|cocktail)\\b"), null, "diem-bar-rooftop", AskIcon.MARTINI),
        TileRow(Regex("\\b(?:bida|billiard)\\b"), null, "diem-bida", AskIcon.CIRCLE_DOT),
        TileRow(Regex("\\bbowling\\b"), null, "diem-bowling", AskIcon.CIRCLE_DOT),
        TileRow(Regex("\\b(?:ca phe|cafe|coffee)\\b"), Regex("trà"), "diem-cafe", AskIcon.COFFEE),
        TileRow(Regex("\\b(?:nuong|bbq)\\b"), Regex("lẩu"), "diem-lau-nuong", AskIcon.FLAME),
        TileRow(Regex("\\bsushi\\b"), Regex("nhật|hàn"), "diem-mon-nhat-han", AskIcon.SOUP),
        TileRow(Regex("\\b(?:mon viet|am thuc|nha hang|quan an)\\b"), Regex("phở|bún|cơm|(?<!\\p{L})(?:ăn|món)(?!\\p{L})"), "diem-quan-an", AskIcon.UTENSILS),
        TileRow(Regex("\\b(?:nail|mong)\\b"), null, "diem-nail", AskIcon.FLOWER),
        TileRow(Regex("\\b(?:spa|massage|goi dau|goi)\\b"), null, "diem-spa", AskIcon.FLOWER),
        TileRow(Regex("\\bbien\\b"), null, "diem-bien", AskIcon.WAVES),
        TileRow(Regex("\\b(?:nui|trekking|cam trai)\\b"), null, "diem-nui", AskIcon.MOUNTAIN),
        TileRow(Regex("\\b(?:mua sam|shop|shopping|mall)\\b"), Regex("chợ|(?<!\\p{L})đồ(?!\\p{L})"), "diem-mua-sam", AskIcon.SHOPPING_BAG),
        TileRow(Regex("\\b(?:nhac|concert|show|live|pop|rap|indie|acoustic)\\b"), null, "diem-am-nhac", AskIcon.MIC),
        TileRow(Regex("\\b(?:chua biet|khong quan trong|gi cung duoc|tuy)\\b"), null, null, AskIcon.HELP),
    )

    private fun tileRow(option: String): TileRow? {
        val f = fold(option)
        val r = lower(option)
        return TILE_ROWS.firstOrNull { row -> (row.f?.containsMatchIn(f) ?: false) || (row.r?.containsMatchIn(r) ?: false) }
    }

    /** web `askTileKey`: the image key of a type tile; null = no image ("not sure" options); unmatched → same-name key. */
    fun tileKeyOf(option: String): String? {
        tileRow(option)?.let { return it.key }
        val slug = fold(option).replace(Regex("[^a-z0-9]+"), "-").trim('-').take(40).ifEmpty { "khac" }
        return "diem-$slug"
    }

    /** web `askIconOf`. */
    fun iconOf(option: String, kind: AskKind, question: String = ""): AskIcon {
        val f = fold(option)
        fun m(re: String) = Regex(re).containsMatchIn(f)
        return when (kind) {
            AskKind.TYPE -> tileRow(option)?.icon ?: AskIcon.SPARKLES
            AskKind.PARTY -> when {
                m("(?:^|\\D)3(?:\\D|$)|\\bnhom\\b|\\bdong\\b|\\bgia dinh\\b") -> AskIcon.USERS_ROUND
                m("(?:^|\\D)2(?:\\D|$)") -> AskIcon.USERS
                else -> AskIcon.USER
            }
            AskKind.TIME -> when {
                m("\\b(?:tuan|thang|ngay|chua chot|\\d+n\\d*d?)\\b") -> AskIcon.CALENDAR
                m("\\b(?:toi|dem)\\b") -> AskIcon.MOON
                m("\\b(?:sang|trua|chieu)\\b") -> AskIcon.SUN
                else -> AskIcon.CALENDAR
            }
            AskKind.BUDGET -> AskIcon.WALLET
            AskKind.OTHER -> when {
                // web 86f88d3: a place question («Khu vực nào?», «Xuất phát từ đâu?») pins every option.
                Regex("\\b(?:khu vuc|o dau|tu dau|xuat phat|quan nao)\\b").containsMatchIn(fold(question)) -> AskIcon.MAP_PIN
                m("\\b(?:gan|quan|tp|ha noi|da nang|noi khac|khu vuc)\\b") -> AskIcon.MAP_PIN
                m("\\bmay bay\\b") -> AskIcon.PLANE
                m("\\b(?:xe khach|limousine|tau)\\b") -> AskIcon.BUS
                m("\\b(?:xe rieng|o to|tu lai)\\b") -> AskIcon.CAR
                m("\\b(?:giao|ship)\\b") -> AskIcon.BIKE
                m("\\btai quan\\b") -> AskIcon.STORE
                else -> AskIcon.SPARKLES
            }
        }
    }

    fun viewOf(questions: List<AskQuestion>): List<AskQuestionView> = questions.mapIndexed { i, q ->
        val kind = kindOf(q)
        AskQuestionView(
            id = q.id, number = i + 1, title = q.q, kind = kind,
            options = q.options.map { o -> AskOptionView(o, iconOf(o, kind, q.q), if (kind == AskKind.TYPE) tileKeyOf(o) else null) },
        )
    }

    /** Sent when nothing is chosen and nothing typed — R23.1: «Tìm cho tôi» still searches (web `ASK_EMPTY_ANSWER`). */
    const val EMPTY_ANSWER = "Tìm cho tôi"

    /** The chosen options (a multi-choice question's picks in the card's option order, ", ") + free text, " · ". */
    fun composeAnswer(views: List<AskQuestionView>, chosen: Map<String, Set<String>>, free: String = ""): String {
        val parts = views.mapNotNull { v ->
            v.options.map { it.label }.filter { it in chosen[v.id].orEmpty() }.takeIf { it.isNotEmpty() }?.joinToString(", ")
        }
        val extra = free.trim()
        return (parts + listOfNotNull(extra.takeIf { it.isNotEmpty() })).joinToString(" · ")
    }

    /** web `askSendText`: [composeAnswer], or [EMPTY_ANSWER] when both are empty. */
    fun sendText(views: List<AskQuestionView>, chosen: Map<String, Set<String>>, free: String = ""): String =
        composeAnswer(views, chosen, free).ifEmpty { EMPTY_ANSWER }
}
