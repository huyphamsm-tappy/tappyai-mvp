package com.tappyai.app.chat.ask

import com.tappyai.app.chat.AskBlock
import com.tappyai.app.chat.AskQuestion
import com.tappyai.app.chat.plan.PlanArea
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Ask card v2 (Huy 30/09, `docs/design/ask-card/README.md`, R23) — the shared rules, on the 15 REAL
 * turn-1 ask blocks of the §10 UAT run (5 areas × 3), offline. The server block and the message
 * shape are unchanged; kinds / icons / image keys / multi-choice come only from id + words.
 */
class AskCardV2Test {

    private val asks: Map<String, List<AskQuestion>> by lazy {
        val root = Json.parseToJsonElement(File(javaClass.classLoader!!.getResource("consult-raw-s10/asks-t1.json")!!.toURI()).readText()) as JsonObject
        root.mapValues { (_, v) ->
            v.jsonObject["ask"]!!.jsonObject["questions"]!!.jsonArray.map { q ->
                val o = q.jsonObject
                AskQuestion(o["id"]!!.jsonPrimitive.content, o["q"]!!.jsonPrimitive.content, o["options"]!!.jsonArray.map { it.jsonPrimitive.content })
            }
        }
    }
    private fun kinds(id: String) = AskCardModel.viewOf(asks.getValue(id)).map { it.kind }

    @Test fun `every real ask block of the 5 areas classifies, 2-3 numbered questions`() {
        assertEquals(15, asks.size)
        for ((id, qs) in asks) {
            val v = AskCardModel.viewOf(qs)
            assertTrue(id, v.size in 2..3)
            assertEquals(id, (1..v.size).toList(), v.map { it.number })
        }
        assertEquals(listOf(AskKind.TYPE, AskKind.PARTY, AskKind.PLACE), kinds("ENT-2-t1"))
        assertEquals(listOf(AskKind.PARTY, AskKind.TIME, AskKind.OTHER), kinds("ENT-1-t1"))
        assertEquals(listOf(AskKind.TYPE, AskKind.PARTY, AskKind.BUDGET), kinds("FOOD-1-t1"))
        assertEquals(listOf(AskKind.TYPE, AskKind.PLACE, AskKind.BUDGET), kinds("SPA-1-t1"))
        assertEquals(listOf(AskKind.PLACE, AskKind.BUDGET, AskKind.TIME), kinds("SPA-2-t1"))
        assertEquals(listOf(AskKind.TIME, AskKind.PLACE, AskKind.PARTY), kinds("TRAVEL-1-t1"))
        assertEquals(listOf(AskKind.PARTY, AskKind.BUDGET, AskKind.TYPE), kinds("TRAVEL-2-t1"))
        assertEquals(listOf(AskKind.TYPE, AskKind.BUDGET, AskKind.OTHER), kinds("SHOP-1-t1"))
    }

    @Test fun `type options get the README image keys and icons, no-preference gets none`() {
        val ent = AskCardModel.viewOf(asks.getValue("ENT-2-t1")).first().options
        assertEquals(listOf("diem-karaoke", "diem-rap-phim", "diem-bar", "diem-bida"), ent.map { it.imageKey })
        assertEquals(listOf(AskIcon.MUSIC, AskIcon.MOVIE, AskIcon.BAR, AskIcon.TARGET), ent.map { it.icon })
        val food = AskCardModel.viewOf(asks.getValue("FOOD-1-t1")).first().options
        assertEquals(listOf("diem-mon-viet", "diem-mon-nhat-han", "diem-lau-nuong", null), food.map { it.imageKey })
        assertEquals(AskIcon.HELP, food.last().icon)
        val spa = AskCardModel.viewOf(asks.getValue("SPA-1-t1")).first().options
        assertEquals(listOf("diem-spa", "diem-spa", "diem-spa", "diem-lam-dep"), spa.map { it.imageKey })
        val travel = AskCardModel.viewOf(asks.getValue("TRAVEL-2-t1"))[2].options
        assertEquals(listOf("diem-bien", "diem-nui", "diem-an-uong", "diem-nghi-duong"), travel.map { it.imageKey })
        // Only TYPE questions carry picture keys; the others are icon tiles.
        assertTrue(AskCardModel.viewOf(asks.getValue("ENT-1-t1")).flatMap { it.options }.all { it.imageKey == null })
        // "Rap / hip-hop" is music, not a cinema ("rạp"): the cinema rule needs "phim".
        assertEquals("diem-am-nhac", AskCardModel.imageKeyOf("Rap / hip-hop"))
        assertEquals("diem-rap-phim", AskCardModel.imageKeyOf("Xem phim"))
        assertNull(AskCardModel.imageKeyOf("Bình Thạnh"))
    }

    @Test fun `icons for who, when, where, budget`() {
        val party = AskCardModel.viewOf(asks.getValue("ENT-1-t1"))[0].options.map { it.icon }
        assertEquals(listOf(AskIcon.PERSON_1, AskIcon.PERSON_2, AskIcon.GROUP_SMALL, AskIcon.GROUP_BIG), party)
        val time = AskCardModel.viewOf(asks.getValue("ENT-1-t1"))[1].options.map { it.icon }
        assertEquals(listOf(AskIcon.SUN, AskIcon.MOON, AskIcon.CALENDAR), time)
        assertTrue(AskCardModel.viewOf(asks.getValue("SPA-1-t1"))[1].options.all { it.icon == AskIcon.PIN })
        assertTrue(AskCardModel.viewOf(asks.getValue("FOOD-1-t1"))[2].options.all { it.icon == AskIcon.MONEY })
        assertEquals(AskIcon.FAMILY, AskCardModel.iconOf(AskKind.PARTY, "Gia đình"))
        assertEquals(AskIcon.GROUP_BIG, AskCardModel.iconOf(AskKind.PARTY, "Nhóm bạn"))
        assertEquals(PlanArea.ENTERTAINMENT, AskCardModel.areaOf(AskCardModel.viewOf(asks.getValue("ENT-2-t1"))))
        assertEquals(PlanArea.FOOD, AskCardModel.areaOf(AskCardModel.viewOf(asks.getValue("FOOD-1-t1"))))
        assertEquals(PlanArea.SPA, AskCardModel.areaOf(AskCardModel.viewOf(asks.getValue("SPA-1-t1"))))
    }

    @Test fun `the message sent keeps its shape - " · " between questions, ", " inside the multi-choice one, free text last`() {
        val v = AskCardModel.viewOf(asks.getValue("ENT-2-t1"))
        val chosen = mapOf("activity" to setOf("Xem phim", "Karaoke"), "party" to setOf("2 người"))
        // Picks inside a question follow the CARD's option order, not the tap order.
        assertEquals("Karaoke, Xem phim · 2 người", AskCardModel.composeAnswer(v, chosen))
        assertEquals("Karaoke, Xem phim · 2 người · muốn chỗ chill", AskCardModel.composeAnswer(v, chosen, "  muốn chỗ chill "))
        assertEquals("chỉ ý khác", AskCardModel.composeAnswer(v, emptyMap(), "chỉ ý khác"))
        assertEquals("", AskCardModel.composeAnswer(v, emptyMap()))
        // One pick per question = exactly the previous format (AskBlock.composeAnswer).
        val qs = asks.getValue("FOOD-1-t1")
        val one = mapOf("dish" to "Món Việt", "party" to "2 người", "budget" to "100-300k")
        assertEquals(AskBlock.composeAnswer(qs, one), AskCardModel.composeAnswer(AskCardModel.viewOf(qs), one.mapValues { setOf(it.value) }))
        assertTrue(AskKind.TYPE.multi)
        assertFalse(AskKind.PARTY.multi || AskKind.TIME.multi || AskKind.PLACE.multi || AskKind.BUDGET.multi || AskKind.OTHER.multi)
    }
}
