package com.tappyai.app.chat.plan

import com.tappyai.app.chat.ChatResponseParser
import com.tappyai.app.chat.PlanDay
import com.tappyai.app.chat.PlanItem
import com.tappyai.app.chat.TappyPlan
import com.tappyai.app.chat.data.ChatStreamEvent
import com.tappyai.app.chat.data.ChatStreamFrames
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Plan card v2 (owner 29/09, sample `docs/design/share-layouts/plan-share.png`), OFFLINE:
 *  - fake data with the proposed v2 fields (R22) — Quy Nhơn 3 ngày 2 đêm and a food "tối nay";
 *  - the saved raw plan answers (consult-raw: the 4 plan streams incl. R15 trip-full) — the plan
 *    blocks the server sends TODAY, without any v2 field, must still draw (placeholders).
 * No chat call, no network.
 */
class PlanCardV2Test {

    private fun res(path: String) = File(javaClass.classLoader!!.getResource(path)!!.toURI())
    private fun planOf(reply: String): TappyPlan = ChatResponseParser.parse(reply).plan!!

    private val quyNhon by lazy { planCardViewOf(planOf(res("plan-card/quy-nhon-v2.txt").readText())) }
    private val food by lazy { planCardViewOf(planOf(res("plan-card/food-evening-v2.txt").readText())) }

    @Test fun `Quy Nhon sample - hero key, meta, three stacked days with every stop of the sample`() {
        assertEquals(PlanArea.TRAVEL, quyNhon.area)
        assertEquals("du-lich-bien-1", quyNhon.heroKey)
        assertEquals("Quy Nhơn 3 ngày 2 đêm", quyNhon.title)
        assertEquals("Quy Nhơn, Bình Định", quyNhon.destination)
        assertEquals("3 ngày · 2 đêm", quyNhon.duration)
        assertEquals(2, quyNhon.people)
        assertEquals(listOf(4, 3, 2), quyNhon.days.map { it.stops.size })
        assertEquals(listOf("Khám phá thành phố biển", "Thiên nhiên và văn hóa", "Thư giãn và mua sắm"), quyNhon.days.map { it.title })
        val first = quyNhon.days[0].stops[0]
        assertEquals("09:00", first.time)
        assertEquals("diem-bien", first.imageKey)
        assertEquals("Bãi Kỳ Co", first.name)
        assertEquals("Xã Nhơn Lý, Quy Nhơn", first.address)
    }

    @Test fun `money - only the server's amounts, a missing or sentinel price reads exactly chua co gia - hoi quan`() {
        val prices = quyNhon.days.flatMap { it.stops }.associate { it.name to it.price }
        assertEquals("300.000đ/người", prices["Hải sản Nhơn Lý"])
        assertEquals("Miễn phí", prices["Tháp Đôi"])
        assertEquals(NO_PRICE, prices["Eo Gió"]) // the model's "chưa có giá" sentinel never sits in a price slot
        assertEquals(NO_PRICE, prices["Bãi Kỳ Co"]) // no price at all
        assertEquals("chưa có giá — hỏi quán", NO_PRICE)
        // Overview budget = the server's total and ITS per-person line — nothing divided here.
        val budget = quyNhon.overview.single { it.kind == PlanCardView.OverviewKind.BUDGET }
        assertEquals("5.000.000đ", budget.value)
        assertEquals("2.500.000đ/người", budget.sub)
        // No per-person line from the server → none shown, even though people = 4 and a total exists.
        val foodBudget = food.overview.single { it.kind == PlanCardView.OverviewKind.BUDGET }
        assertEquals("1.200.000đ", foodBudget.value)
        assertNull(foodBudget.sub)
    }

    @Test fun `overview and highlights come from the server's fields only`() {
        assertEquals(
            listOf(PlanCardView.OverviewKind.DESTINATION, PlanCardView.OverviewKind.DURATION, PlanCardView.OverviewKind.PEOPLE, PlanCardView.OverviewKind.BUDGET),
            quyNhon.overview.map { it.kind },
        )
        assertEquals(listOf("diem-bien", "diem-hai-san", "diem-ngam-canh", "diem-di-tich"), quyNhon.highlights.map { it.imageKey })
        assertTrue(quyNhon.tagline!!.startsWith("Biển xanh"))
    }

    @Test fun `a non-travel area is ONE session with times of day in the same frame`() {
        assertEquals(PlanArea.FOOD, food.area)
        assertEquals(1, food.days.size)
        assertEquals("Tối nay", food.days[0].label)
        assertEquals(listOf("18:00", "19:30", "20:30"), food.days[0].stops.map { it.time })
        assertEquals("an-uong-pho-1", food.heroKey)
        // Area from the planning intent when no domain is written (frameDomainOf mapping).
        assertEquals(PlanArea.ENTERTAINMENT, PlanArea.of(TappyPlan(type = "evening")))
        assertEquals(PlanArea.TRAVEL, PlanArea.of(TappyPlan(type = "trip")))
        assertEquals(PlanArea.SPA, PlanArea.of(TappyPlan(type = "evening", domain = "spa")))
        assertEquals(PlanArea.SHOPPING, PlanArea.of(TappyPlan(domain = "shopping")))
    }

    @Test fun `backward compatible - every saved raw plan answer still draws, all images are placeholders`() {
        val plans = res("consult-raw").listFiles { f -> f.name.endsWith(".raw.txt") }!!
            .map { f -> f.readText().split('\n').mapNotNull { ChatStreamFrames.parse(it) }.filterIsInstance<ChatStreamEvent.Text>().joinToString("") { it.delta } }
            .filter { "[TAPPY_PLAN]" in it }
        assertEquals(4, plans.size)
        for (reply in plans) {
            val v = planCardViewOf(planOf(reply))
            assertTrue(v.title.isNotBlank())
            assertTrue(v.days.isNotEmpty() && v.days.all { it.stops.isNotEmpty() })
            assertNull("no v2 hero in today's blocks → placeholder", v.heroKey)
            assertTrue("no stored stop images → placeholders", v.days.flatMap { it.stops }.all { it.imageKey == null })
            assertTrue(v.days.flatMap { it.stops }.all { it.priced || it.price == NO_PRICE })
            assertTrue(v.highlights.isEmpty())
        }
    }

    @Test fun `images - only STORED keys, never a photo_url, never a URL posing as a key`() {
        val plan = TappyPlan(
            title = "x", heroImage = "https://evil.example/x.jpg",
            days = listOf(PlanDay("Ngày 1", listOf(
                PlanItem(time = "09:00", name = "A", photoUrl = "https://lh3.googleusercontent.com/p/a"),
                PlanItem(time = "10:00", name = "B", image = "diem-bien"),
                PlanItem(time = "11:00", name = "C", image = "Diem Bien"),
            ))),
        )
        val v = planCardViewOf(plan)
        assertNull(v.heroKey)
        assertEquals(listOf(null, "diem-bien", null), v.days[0].stops.map { it.imageKey })
        // The card source never reads photo_url.
        val card = File("src/main/java/com/tappyai/app/chat/TripPlanCard.kt").readText()
        assertFalse(card.contains("photoUrl"))
        assertTrue(card.contains("manifest.urlFor(key)") && card.contains("area.placeholder()"))
    }

    @Test fun `image key names - background mang-kieu-N, stop diem-loai`() {
        assertTrue(PlanImageKeys.isHero("du-lich-bien-1"))
        assertTrue(PlanImageKeys.isHero("an-uong-pho-12"))
        assertTrue(PlanImageKeys.isHero("mua-sam-cho-dem-2"))
        assertFalse(PlanImageKeys.isHero("du-lich-bien")) // no N
        assertFalse(PlanImageKeys.isHero("am-nhac-song-1")) // not one of the 5 areas
        assertTrue(PlanImageKeys.isStop("diem-hai-san"))
        assertFalse(PlanImageKeys.isStop("diem"))
        assertFalse(PlanImageKeys.isKey("https://x/y.jpg"))
        assertEquals(PlanArea.SPA, PlanImageKeys.areaOf("spa-thu-gian-3"))
        assertEquals(PlanArea.ENTERTAINMENT, PlanImageKeys.areaOf("giai-tri-karaoke-1"))
    }

    private fun manifest(json: String) = PlanImageManifest.parse(Json.parseToJsonElement(json) as JsonObject)

    @Test fun `manifest - active serves its https url, replaced follows the replacement, anything else is a placeholder`() {
        val m = manifest(
            """{"version":"t","images":{
              "du-lich-bien-1":{"status":"replaced","replacement":"du-lich-bien-2"},
              "du-lich-bien-2":{"status":"active","url":"https://cdn.example/du-lich-bien-2.webp"},
              "diem-bien":{"status":"active","url":"http://cdn.example/insecure.jpg"},
              "diem-a":{"status":"replaced","replacement":"diem-b"},
              "diem-b":{"status":"replaced","replacement":"diem-a"},
              "diem-retired":{"status":"retired","url":"https://cdn.example/r.jpg"},
              "not a key":{"status":"active","url":"https://cdn.example/n.jpg"},
              "diem-broken":"oops"}}""",
        )
        assertEquals("t", m.version)
        assertEquals("https://cdn.example/du-lich-bien-2.webp", m.urlFor("du-lich-bien-1"))
        assertEquals("https://cdn.example/du-lich-bien-2.webp", m.urlFor("du-lich-bien-2"))
        assertNull("non-https", m.urlFor("diem-bien"))
        assertNull("a cycle ends", m.urlFor("diem-a"))
        assertNull("unknown status", m.urlFor("diem-retired"))
        assertNull("missing key", m.urlFor("diem-hai-san"))
        assertNull(m.urlFor(null))
        assertFalse(m.entries.containsKey("not a key"))
        assertNotNull(PlanImageManifest.EMPTY)
        assertNull(PlanImageManifest.EMPTY.urlFor("du-lich-bien-1"))
        assertEquals(PlanImageManifest.EMPTY, PlanImageManifest.parse(null))
    }

    @Test fun `manifest - a chain longer than MAX_HOPS stops`() {
        val m = manifest(
            """{"images":{
              "diem-a":{"status":"replaced","replacement":"diem-b"},
              "diem-b":{"status":"replaced","replacement":"diem-c"},
              "diem-c":{"status":"replaced","replacement":"diem-d"},
              "diem-d":{"status":"replaced","replacement":"diem-e"},
              "diem-e":{"status":"active","url":"https://cdn.example/e.jpg"}}}""",
        )
        assertEquals("https://cdn.example/e.jpg", m.urlFor("diem-b"))
        assertNull(m.urlFor("diem-a"))
    }
}
