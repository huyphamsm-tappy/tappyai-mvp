package com.tappyai.app.chat.ask

import com.tappyai.app.chat.AskQuestion
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Ask card v2 (Huy 30/09, `docs/design/ask-card/README.md` R23 + R23.1). [AskCardModel] is a 1:1 port of
 * the web `askCardModel.ts`; the first three groups below are the web's `askCardModel.test.ts` cases,
 * line for line, so the two clients cannot drift. Then the 15 REAL ask blocks of the §10 UAT run.
 */
class AskCardV2Test {

    private fun q(id: String, q: String, vararg o: String) = AskQuestion(id, q, o.toList())
    private val ENT = listOf(q("activity", "Muốn chơi gì?", "Karaoke", "Xem phim", "Bar/pub", "Bida/bowling"), q("party", "Mấy người / đi với ai?", "1 mình", "2 người", "Nhóm 3-5", "Nhóm đông"), q("time", "Đi lúc mấy giờ?", "Chiều nay", "Tối nay", "Cuối tuần"))
    private val FOOD = listOf(q("dish", "Món gì / kiểu quán?", "Món Việt", "Nhật/Hàn", "Lẩu/nướng", "Chưa biết"), q("mode", "Ăn tại quán hay giao?", "Ăn tại quán", "Giao tận nơi"), q("area", "Khu vực nào?", "Gần mình", "Quận 1", "Quận 3", "Quận 7"))
    private val SPA = listOf(q("service", "Muốn làm dịch vụ gì?", "Massage", "Gội đầu dưỡng sinh", "Xông hơi", "Chăm sóc da"), q("time", "Khi nào đi?", "Hôm nay", "Tối nay", "Cuối tuần"))
    private val SPA_HAIR = listOf(q("style", "Làm tóc gì?", "Cắt", "Uốn", "Nhuộm", "Phục hồi"), q("time", "Khi nào đi?", "Hôm nay", "Tối nay", "Cuối tuần"))
    private val TRIP = listOf(q("date", "Đi khi nào, mấy ngày?", "Cuối tuần 2N1Đ", "3N2Đ", "4-5 ngày", "Chưa chốt"), q("origin", "Xuất phát từ đâu?", "TP.HCM", "Hà Nội", "Đà Nẵng", "Nơi khác"), q("style", "Thích kiểu gì?", "Biển", "Núi", "Ăn uống", "Nghỉ dưỡng"))
    private val HOTEL = listOf(q("party", "Mấy người?", "1 người", "2 người", "Gia đình", "Nhóm bạn"), q("budget", "Tầm giá mỗi đêm?", "Dưới 700k", "700k-1,5tr", "1,5-3tr", "Trên 3tr"))
    private val SHOP = listOf(q("line", "Loại nào?", "Nhét tai", "Chụp tai", "Chưa biết"), q("budget", "Tầm giá bao nhiêu?", "Dưới 1tr", "1-3tr", "3-5tr", "Trên 5tr"), q("must", "Cần chống ồn không?", "Có chống ồn", "Không cần"))

    private fun kinds(qs: List<AskQuestion>) = qs.map(AskCardModel::kindOf)

    // ── web: README §2 ──

    @Test fun `infers the area of each of the 5 areas (R23 1 header)`() {
        assertEquals(
            listOf(AskArea.ENTERTAINMENT, AskArea.FOOD, AskArea.SPA, AskArea.SPA, AskArea.TRAVEL, AskArea.TRAVEL, AskArea.SHOPPING),
            listOf(ENT, FOOD, SPA, SPA_HAIR, TRIP, HOTEL, SHOP).map(AskCardModel::areaOf),
        )
    }

    @Test fun `LOAI - AI DI - KHI NAO - NGAN SACH - KHAC`() {
        assertEquals(listOf(AskKind.TYPE, AskKind.PARTY, AskKind.TIME), kinds(ENT))
        assertEquals(listOf(AskKind.TYPE, AskKind.OTHER, AskKind.OTHER), kinds(FOOD))
        assertEquals(listOf(AskKind.TYPE, AskKind.TIME), kinds(SPA))
        assertEquals(listOf(AskKind.TIME, AskKind.OTHER, AskKind.TYPE), kinds(TRIP))
        assertEquals(listOf(AskKind.PARTY, AskKind.BUDGET), kinds(HOTEL))
        assertEquals(listOf(AskKind.TYPE, AskKind.BUDGET, AskKind.OTHER), kinds(SHOP))
        assertEquals(AskKind.TYPE, AskCardModel.kindOf(q("x", "Bạn thích thể loại nào?", "a", "b")))
        assertEquals(AskKind.PARTY, AskCardModel.kindOf(q("x", "Đi với ai?", "a", "b")))
    }

    // ── web: README §3 ──

    @Test fun `the owner-named keys from the place-type image library`() {
        assertEquals(listOf("diem-karaoke", "diem-rap-phim", "diem-bar-rooftop", "diem-bida"), ENT[0].options.map(AskCardModel::tileKeyOf))
        assertEquals(
            listOf("diem-bowling", "diem-cafe", "diem-cafe", "diem-lau-nuong", "diem-mon-nhat-han", "diem-quan-an", "diem-quan-an", "diem-quan-an"),
            listOf("Bowling", "Cafe/rooftop", "Trà sữa", "Lẩu/nướng", "Nhật/Hàn", "Món Việt", "Phở/bún", "Ăn uống").map(AskCardModel::tileKeyOf),
        )
        assertEquals(
            listOf("diem-spa", "diem-spa", "diem-son-gel", "diem-bien", "diem-nui", "diem-am-nhac"),
            listOf("Massage", "Gội đầu dưỡng sinh", "Sơn gel", "Biển", "Núi", "Rap / hip-hop").map(AskCardModel::tileKeyOf),
        )
    }

    @Test fun `words that collide once the marks are dropped are matched with their marks`() {
        assertEquals("diem-dao-pho", AskCardModel.tileKeyOf("Dạo phố"))
        assertEquals("diem-pin-lau", AskCardModel.tileKeyOf("Pin lâu"))
        assertEquals("diem-do", AskCardModel.tileKeyOf("Đỏ"))
        assertEquals("diem-nail", AskCardModel.tileKeyOf("Làm nail"))
    }

    @Test fun `not-sure options get no image, unknown options get the same-name placeholder key`() {
        assertNull(AskCardModel.tileKeyOf("Chưa biết"))
        assertNull(AskCardModel.tileKeyOf("Không quan trọng"))
        assertEquals("diem-cham-soc-da", AskCardModel.tileKeyOf("Chăm sóc da"))
        assertEquals(AskIcon.HELP, AskCardModel.iconOf("Chưa biết", AskKind.TYPE))
    }

    @Test fun `party, time, budget, other icons`() {
        assertEquals(listOf(AskIcon.USER, AskIcon.USERS, AskIcon.USERS_ROUND, AskIcon.USERS_ROUND), ENT[1].options.map { AskCardModel.iconOf(it, AskKind.PARTY) })
        assertEquals(listOf(AskIcon.SUN, AskIcon.MOON, AskIcon.CALENDAR), ENT[2].options.map { AskCardModel.iconOf(it, AskKind.TIME) })
        assertEquals(AskIcon.CALENDAR, AskCardModel.iconOf("3N2Đ", AskKind.TIME))
        assertEquals(AskIcon.WALLET, AskCardModel.iconOf("Dưới 1tr", AskKind.BUDGET))
        assertEquals(List(4) { AskIcon.MAP_PIN }, FOOD[2].options.map { AskCardModel.iconOf(it, AskKind.OTHER) })
    }

    // ── web: the reply (README §0) ──

    private fun views(qs: List<AskQuestion>) = AskCardModel.viewOf(qs)

    @Test fun `merges a multi-choice step, single choices and typed text in question order`() {
        val chosen = mapOf("time" to setOf("Tối nay"), "activity" to setOf("Bida/bowling", "Karaoke"), "party" to setOf("2 người"))
        assertEquals("Karaoke, Bida/bowling · 2 người · Tối nay · ít ồn", AskCardModel.composeAnswer(views(ENT), chosen, "  ít ồn "))
        assertEquals("Karaoke, Bida/bowling · 2 người · Tối nay", AskCardModel.sendText(views(ENT), chosen))
    }

    @Test fun `a partial answer is fine, cleared choices are skipped, only typed text sends only that`() {
        assertEquals("Quận 3", AskCardModel.sendText(views(FOOD), mapOf("dish" to emptySet(), "mode" to emptySet(), "area" to setOf("Quận 3"))))
        assertEquals("không cay", AskCardModel.sendText(views(FOOD), emptyMap(), "không cay"))
    }

    @Test fun `sending with nothing chosen still searches (R23 1)`() {
        assertEquals(AskCardModel.EMPTY_ANSWER, AskCardModel.sendText(views(ENT), emptyMap(), "   "))
        assertEquals("Tìm cho tôi", AskCardModel.EMPTY_ANSWER)
        assertTrue(AskKind.TYPE.multi && !AskKind.PARTY.multi && !AskKind.TIME.multi && !AskKind.BUDGET.multi && !AskKind.OTHER.multi)
    }

    // ── Android: the 15 real §10 ask blocks + the UI pins ──

    @Test fun `every real ask block of the 5 areas draws - 2-3 numbered questions, the router's areas`() {
        val root = Json.parseToJsonElement(File(javaClass.classLoader!!.getResource("consult-raw-s10/asks-t1.json")!!.toURI()).readText()) as JsonObject
        val asks = root.mapValues { (_, v) ->
            v.jsonObject["ask"]!!.jsonObject["questions"]!!.jsonArray.map { e ->
                val o = e.jsonObject
                AskQuestion(o["id"]!!.jsonPrimitive.content, o["q"]!!.jsonPrimitive.content, o["options"]!!.jsonArray.map { it.jsonPrimitive.content })
            }
        }
        assertEquals(15, asks.size)
        for ((id, qs) in asks) {
            val v = AskCardModel.viewOf(qs)
            assertTrue(id, v.size in 2..3)
            assertEquals(id, (1..v.size).toList(), v.map { it.number })
            val expected = when (id.substringBefore('-')) {
                "ENT" -> AskArea.ENTERTAINMENT; "FOOD" -> AskArea.FOOD; "SHOP" -> AskArea.SHOPPING; "SPA" -> AskArea.SPA; else -> AskArea.TRAVEL
            }
            // FOOD-3 («Nhậu kiểu nào?» style/budget/area) and SPA-2 (area/budget/time) carry no area id: the web rule
            // says "chung" (MAIN) for them — recorded, not guessed.
            if (id != "FOOD-3-t1" && id != "SPA-2-t1") assertEquals(id, expected, AskCardModel.areaOf(qs))
        }
    }

    @Test fun `the card draws R23 1 - per-area header, always-on send that locks, grid rules`() {
        val card = File("src/main/java/com/tappyai/app/chat/AskCard.kt").readText()
        assertTrue(card.contains("AskCardModel.sendText(views, chosen, free)") && card.contains("if (!sent) { sent = true;"))
        assertTrue(card.contains("R.string.ask_v2_sending") && card.contains("headerOf(area)"))
        assertTrue(card.contains("if (v.options.size == 3) 3 else 2") && card.contains("val stacked = v.options.size >= 4"))
        assertTrue(card.contains("manifest.urlFor(o.imageKey)"))
    }
}
