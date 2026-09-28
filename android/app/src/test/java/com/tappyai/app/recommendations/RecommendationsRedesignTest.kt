package com.tappyai.app.recommendations

import com.tappyai.app.recommendations.data.RecommendationsResponseDto
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

/**
 * Parity 2026-09-28 (L5): "Gợi ý cho bạn" = D:/redesign Sep 22 01_41 = web page d97b261/1e11b32 —
 * hero "Khám phá những địa điểm nổi bật gần bạn" + 3 highlights + mascot bubble, "📍 Địa điểm nổi
 * bật gần đây · Xem thêm", cards with photo + rank, address, rating / "Hoạt động gần đây" /
 * "N đánh giá" chips and "Hỏi Tappy về chỗ này", and the footer lines. The payload's additive facts
 * (address, photoUrl, averageRating, reviewCount, latestReviewAt) drive the chips; the engine's
 * English signal words only show for an older server that sends no facts.
 */
class RecommendationsRedesignTest {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    @Test
    fun `the additive place facts are read`() {
        val dto = json.decodeFromString<RecommendationsResponseDto>(
            """{"recommendations":[{"placeId":"p","placeName":"Phở","matchedSignals":["5.0★"],"address":"Q1","photoUrl":"https://x/p.jpg","averageRating":4.5,"reviewCount":3,"latestReviewAt":"2026-09-27T00:00:00Z"}]}""",
        )
        val r = dto.recommendations.single()
        assertEquals("Q1", r.address); assertEquals("https://x/p.jpg", r.photoUrl); assertEquals(4.5, r.averageRating!!, 0.0)
        assertEquals(3, r.reviewCount); assertEquals("2026-09-27T00:00:00Z", r.latestReviewAt)
    }

    @Test
    fun `recently active means a review in the last 14 days, like the web`() {
        val now = Instant.parse("2026-09-28T00:00:00Z").toEpochMilli()
        assertTrue(isRecentlyActive("2026-09-20T00:00:00Z", now))
        assertFalse(isRecentlyActive("2026-09-01T00:00:00Z", now))
        assertFalse(isRecentlyActive(null, now))
    }

    @Test
    fun `engine signal words only when the server sent no facts`() {
        val withFacts = Recommendation("p", "Phở", listOf("Near Q1"), address = "Q1", averageRating = 4.0)
        val legacy = Recommendation("p", "Phở", listOf("Near Q1"))
        assertFalse(withFacts.showEngineSignals)
        assertTrue(legacy.showEngineSignals)
    }

    @Test
    fun `the copy is the web's`() {
        val vi = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""").findAll(File("src/main/res/values-vi/strings_recommendations.xml").readText())
            .associate { it.groupValues[1] to it.groupValues[2] }
        val expected = mapOf(
            "recommendations_header_title" to "Gợi ý cho bạn",
            "recommendations_hero_lead" to "Khám phá những địa điểm nổi bật",
            "recommendations_hero_accent" to "gần bạn",
            "recommendations_hero_subtitle" to "Kết nối với các quán ăn, địa điểm thú vị và cộng đồng xung quanh.",
            "recommendations_highlight_discover" to "Khám phá địa điểm mới",
            "recommendations_highlight_community" to "Kết nối cộng đồng",
            "recommendations_highlight_life" to "Trải nghiệm cuộc sống xung quanh",
            "recommendations_mascot_bubble" to "Cùng khám phá thế giới quanh bạn!",
            "recommendations_see_more" to "Xem thêm",
            "recommendations_recently_active" to "Hoạt động gần đây",
            "recommendations_review_count" to "%1\$d đánh giá",
            "recommendations_footer_line" to "Thế giới xung quanh bạn luôn có những câu chuyện thú vị",
            "recommendations_footer_cta" to "Hãy bắt đầu khám phá ngay hôm nay!",
        )
        for ((k, v) in expected) assertEquals(k, v, vi[k])
    }
}
