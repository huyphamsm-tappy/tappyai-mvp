package com.tappyai.app.share

import com.tappyai.app.chat.PlanDay
import com.tappyai.app.chat.PlanItem
import com.tappyai.app.chat.TappyPlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The share artifact is a WHITELIST. These tests pin what may leave the app, what may not,
 * and that the brochure is deterministic and bounded for the web Inbox (chat_messages.body ≤ 4000).
 */
class ShareArtifactTest {

    private val line = File("src/test/resources/share/places_annotation_line.txt").readText().trim()
    private val view = PlacesLiveViewParser.fromStreamLine(line)!!

    @Test
    fun `brochure has the TappyAI header, every place, its facts, and the brand footer`() {
        val a = ShareArtifactBuilder.buildPlacesArtifact(view, "Quán bún bò ngon ở TP.HCM", "vi")
        assertEquals(ShareArtifact.Kind.PLACES, a.kind)
        assertEquals("TappyAI gợi ý: Quán bún bò ngon ở TP.HCM", a.subject)
        assertTrue(a.text.startsWith("TappyAI gợi ý: Quán bún bò ngon ở TP.HCM\n\n1. "))
        assertTrue(a.text.endsWith("Gợi ý bởi TappyAI · www.tappyai.com"))
        assertEquals("https://www.tappyai.com", a.url)
        assertEquals(8, a.places.size)
        for ((i, p) in view.items.withIndex()) {
            assertTrue(a.text.contains("${i + 1}. ${p.name}"))
            p.phone?.let { assertTrue(a.text.contains("☎ $it")) }
            p.openingHours?.let { assertTrue(a.text.contains("🕐 $it")) }
            p.address?.let { assertTrue(a.text.contains("📍 $it")) }
            val maps = p.actions.first { it.kind == "maps" && it.urlKind == "direct" }
            assertTrue(a.text.contains("Bản đồ: ${maps.url}"))
        }
        assertTrue(a.text.contains("★ 4.9 (5.946 đánh giá)"))
    }

    @Test
    fun `nothing internal can enter the text`() {
        val a = ShareArtifactBuilder.buildPlacesArtifact(view, "x", "vi")
        for (forbidden in listOf("place:osm:", "shortlistPosition", "\"rank\"", "provenance", "evidence_type", "source_type",
            "matchVerdict", "distanceKm", "priceSignal", "_tappy_", "tappy.places.v1")) {
            assertFalse("leaked $forbidden", a.text.contains(forbidden))
        }
        // Search links (ShopeeFood/GrabFood/Google searches) are not the venue's own; they stay out.
        assertFalse(a.text.contains("shopeefood.vn/search"))
        assertFalse(a.text.contains("google.com/search"))
        for (p in a.places) for (l in p.links) assertTrue(l.url.startsWith("https://"))
    }

    @Test
    fun `link labels name the platform only when it adds information`() {
        val block = ShareArtifactBuilder.placeBlock(
            SharedPlace(name = "x", links = listOf(
                SharedLink("website", "https://a.example/", "Official Website"),
                SharedLink("maps", "https://maps.google.com/?cid=1", "Google Maps"),
                SharedLink("review", "https://www.tiktok.com/@a/video/1", "TikTok"),
                SharedLink("order", "https://shopeefood.vn/x", "ShopeeFood"),
            )), 0, "vi",
        )
        assertTrue(block.contains("   Website: https://a.example/"))
        assertTrue(block.contains("   Bản đồ: https://maps.google.com/?cid=1"))
        assertTrue(block.contains("   Review (TikTok): https://www.tiktok.com/@a/video/1"))
        assertTrue(block.contains("   Đặt món (ShopeeFood): https://shopeefood.vn/x"))
        assertFalse(block.contains("Official Website"))
    }

    @Test
    fun `same input gives the same text`() {
        val a = ShareArtifactBuilder.buildPlacesArtifact(view, "x", "vi").text
        val b = ShareArtifactBuilder.buildPlacesArtifact(view, "x", "vi").text
        assertEquals(a, b)
    }

    @Test
    fun `inbox body fits 4000 without cutting a URL and says how many were dropped`() {
        // Inflate to force compaction: replicate the real list until it is far over the bound.
        val big = PlacesLiveView(view.domain, List(6) { view.items }.flatten())
        val a = ShareArtifactBuilder.buildPlacesArtifact(big, "Quán bún bò ngon ở TP.HCM", "vi")
        assertTrue(a.text.length > ShareArtifactBuilder.INBOX_MAX_BODY)
        val body = ShareArtifactBuilder.inboxBody(a, "vi")
        assertTrue(body.length <= ShareArtifactBuilder.INBOX_MAX_BODY)
        assertTrue(body.endsWith("Gợi ý bởi TappyAI · www.tappyai.com"))
        assertTrue(body.startsWith("TappyAI gợi ý: Quán bún bò ngon ở TP.HCM"))
        assertTrue(Regex("và \\d+ địa điểm khác").containsMatchIn(body))
        // Every URL in the compact body is a complete URL that exists in the full text.
        val urls = Regex("https://\\S+").findAll(body).map { it.value }.toList()
        assertTrue(urls.isNotEmpty())
        for (u in urls) assertTrue("cut url $u", a.text.contains(u + "\n") || a.text.endsWith(u))
    }

    @Test
    fun `short brochure is passed through unchanged`() {
        val a = ShareArtifactBuilder.buildPlacesArtifact(view, "x", "vi")
        if (a.text.length <= ShareArtifactBuilder.INBOX_MAX_BODY) {
            assertEquals(a.text, ShareArtifactBuilder.inboxBody(a, "vi"))
        }
    }

    @Test
    fun `plan brochure is built from the plan structure, share_text only as a short intro`() {
        val plan = TappyPlan(
            title = "1 ngày Đà Nẵng", people = 2, budgetTotal = "1.500.000₫",
            days = listOf(PlanDay(label = "Ngày 1", items = listOf(
                PlanItem(time = "08:00", emoji = "☕", name = "Cà phê Cộng", description = "Bắt đầu nhẹ", price = "60.000₫",
                    address = "96 Bạch Đằng", mapsLink = "https://maps.google.com/?q=Cong", bookingLink = "javascript:alert(1)"),
            ))),
            shareText = "Kế hoạch 1 ngày Đà Nẵng cho 2 người — xem tại https://evil.example",
        )
        val a = ShareArtifactBuilder.buildPlanArtifact(plan, "vi")
        assertEquals(ShareArtifact.Kind.PLAN, a.kind)
        assertTrue(a.text.startsWith("Kế hoạch từ TappyAI: 1 ngày Đà Nẵng\n"))
        assertFalse(a.text.contains("evil.example"))
        assertTrue(a.text.contains("2 người · Ngân sách: 1.500.000₫"))
        assertTrue(a.text.contains("Ngày 1\n  08:00 ☕ Cà phê Cộng\n     Bắt đầu nhẹ\n     60.000₫ · 📍 96 Bạch Đằng\n     Bản đồ: https://maps.google.com/?q=Cong"))
        assertFalse(a.text.contains("javascript:"))
        assertTrue(a.text.endsWith("Gợi ý bởi TappyAI · www.tappyai.com"))
    }

    @Test
    fun `prose fallback still carries the brand`() {
        val a = ShareArtifactBuilder.buildProseArtifact("hỏi gì đó", "Câu trả lời.")
        assertTrue(a.text.startsWith("TappyAI\n\n"))
        assertTrue(a.text.endsWith("— TappyAI · tappyai.com"))
        assertTrue(a.text.contains("Câu trả lời."))
    }

    @Test
    fun `prose keeps safe links as label colon url and drops images and unsafe links`() {
        val a = ShareArtifactBuilder.buildProseArtifact(
            "máy bay",
            "**Gợi ý**: đặt qua [Traveloka](https://www.traveloka.com/vi-vn) · [Evil](javascript:alert(1)) ![ảnh](https://img.example/a.jpg)\n\nXem thêm https://www.vietnamairlines.com/ nhé http://insecure.example/x",
        )
        assertTrue(a.text.startsWith("TappyAI\n\nGợi ý: đặt qua Traveloka: https://www.traveloka.com/vi-vn · Evil"))
        assertFalse(a.text.contains("javascript:"))
        assertFalse(a.text.contains("img.example"))
        assertFalse(a.text.contains("**"))
        assertTrue(a.text.contains("https://www.vietnamairlines.com/"))
        assertFalse(a.text.contains("insecure.example"))
        assertTrue(a.text.endsWith("— TappyAI · tappyai.com"))
    }

    @Test
    fun `english labels when the locale is english`() {
        val a = ShareArtifactBuilder.buildPlacesArtifact(view, "beef", "en")
        assertTrue(a.text.startsWith("TappyAI recommends: beef"))
        assertTrue(a.text.contains("Maps: https://"))
        assertTrue(a.text.endsWith("Recommended by TappyAI · www.tappyai.com"))
        assertTrue(a.text.contains("(5,946 reviews)"))
    }
}
