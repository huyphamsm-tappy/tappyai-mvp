package com.tappyai.app.share.card

import com.tappyai.app.chat.PlanDay
import com.tappyai.app.chat.PlanItem
import com.tappyai.app.chat.TappyPlan
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewContentType
import com.tappyai.app.reviews.data.ReviewProfile
import com.tappyai.app.share.LINK_ONLY_TARGETS
import com.tappyai.app.share.SHEET_APPS
import com.tappyai.app.share.ShareArtifact
import com.tappyai.app.share.SharedPlace
import com.tappyai.app.share.TappyShare
import com.tappyai.app.share.copiesLink
import com.tappyai.app.share.defaultVariantOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Date

/**
 * The owner-approved share layouts (29/09, docs/design/share-layouts/) — the pure half: which
 * layouts a share offers, the ONE file's name, what a card may show, the plan snapshot rules and the
 * plan image's height. Each rule is the web's (`shareCardFile.ts`, `contentCards.ts`, `planCard.ts`,
 * `planShare.ts`, `ShareMenu.tsx`), so a share from either client produces the same card.
 */
class ShareCardLogicTest {

    private fun review(
        placeName: String = "Phở Nhất Vị", address: String? = "149A Nguyễn Thị Minh Khai, Q1", rating: Int = 5,
        body: String = "Nước dùng trong, thịt mềm.", photos: List<String>? = listOf("https://lh3.googleusercontent.com/p/a"),
        type: ReviewContentType? = ReviewContentType.Photo, thumb: String? = null, author: String? = "Huy Phạm",
    ) = Review(
        id = "r1", userId = "u1", placeName = placeName, placeAddress = address, rating = rating, body = body, photos = photos,
        likeCount = 0, commentCount = 0, saveCount = null, createdAt = "", likedByMe = false, savedByMe = false,
        profiles = author?.let { ReviewProfile(fullName = it, avatarUrl = null) }, contentType = type, mediaUrl = null, thumbnail = thumb,
        sourceType = null, sourceUrl = null, hashtags = null, watchTimeAvg = null, score = null, isHidden = false,
    )

    private val places = ShareArtifact(ShareArtifact.Kind.PLACES, "t", "Quán phở Q1", "text", "https://uat.tappyai.com", listOf(SharedPlace("Phở A")))
    private val plain = ShareArtifact(ShareArtifact.Kind.PLACES, "t", "s", "text", "https://uat.tappyai.com/users/u", emptyList())
    private val planArtifact = ShareArtifact(ShareArtifact.Kind.PLAN, "t", "Đà Nẵng", "text", "https://uat.tappyai.com", emptyList(), planJson = "{}")

    @Test fun `layouts per variant, first = default (web shareCardLayouts)`() {
        assertEquals(listOf(ShareCardLayout.PROFILE), ShareCardLayouts.of(ShareSheetVariant.PROFILE, plain, null, null))
        assertEquals(listOf(ShareCardLayout.REVIEW, ShareCardLayout.POST), ShareCardLayouts.of(ShareSheetVariant.POST, plain, postCardOf(review()), null))
        assertEquals(listOf(ShareCardLayout.CLIP, ShareCardLayout.POST), ShareCardLayouts.of(ShareSheetVariant.POST, plain, postCardOf(review(type = ReviewContentType.Video)), null))
        assertEquals(listOf(ShareCardLayout.POST), ShareCardLayouts.of(ShareSheetVariant.POST, plain, null, null))
        assertEquals(listOf(ShareCardLayout.SUGGESTION), ShareCardLayouts.of(ShareSheetVariant.SUGGESTION, places, null, null))
        val plan = PlanCardData("Đà Nẵng", listOf(PlanCardData.Day("Ngày 1", listOf(PlanCardData.Item("08:00", "Mỹ Khê", null, null, null)))))
        assertEquals(listOf(ShareCardLayout.PLAN), ShareCardLayouts.of(ShareSheetVariant.PLAN, planArtifact, null, plan))
        // A plan with no stop / a prose share → the legacy card.
        assertEquals(listOf(ShareCardLayout.DEFAULT), ShareCardLayouts.of(ShareSheetVariant.PLAN, planArtifact, null, null))
        assertEquals(listOf(ShareCardLayout.DEFAULT), ShareCardLayouts.of(ShareSheetVariant.DEFAULT, plain, null, null))
    }

    @Test fun `the one file is named after its layout and day`() {
        val d = Date(1_790_000_000_000L) // 2026-09-21 UTC
        assertEquals("tappyai-review-2026-09-21.png", ShareCardLayouts.fileName(ShareCardLayout.REVIEW, d))
        assertEquals("tappyai-plan-2026-09-21.png", ShareCardLayouts.fileName(ShareCardLayout.PLAN, d))
        assertEquals("tappyai-card-2026-09-21.png", ShareCardLayouts.fileName(ShareCardLayout.DEFAULT, d))
    }

    @Test fun `a review card shows only the post's real fields (web postCardOf)`() {
        val c = postCardOf(review())
        assertEquals(SharePostCard.Kind.REVIEW, c.kind)
        assertEquals("Phở Nhất Vị", c.title)
        assertEquals(5, c.rating)
        assertEquals("149A Nguyễn Thị Minh Khai, Q1", c.address)
        assertEquals("Nước dùng trong, thịt mềm.", c.excerpt)
        assertEquals("Huy Phạm", c.author)
        assertEquals("https://lh3.googleusercontent.com/p/a", c.image)
    }

    @Test fun `the Chia se sentinel is not a place - no address, no stars, caption becomes the title once`() {
        val c = postCardOf(review(placeName = "Chia sẻ", body = "Clip quán ốc đêm\nrất ngon", type = ReviewContentType.Video, thumb = "https://storage.googleapis.com/t.jpg"))
        assertEquals(SharePostCard.Kind.CLIP, c.kind)
        assertEquals("Clip quán ốc đêm", c.title)
        assertNull(c.placeName); assertNull(c.address); assertNull(c.rating)
        assertEquals("https://storage.googleapis.com/t.jpg", c.image) // clip → thumbnail first
        assertEquals("Clip quán ốc đêm rất ngon", c.excerpt)
        // No place and a caption that IS the title → printed once.
        assertNull(postCardOf(review(placeName = "Chia sẻ", body = "Chỉ một dòng")).excerpt)
        assertEquals("TappyAI", reviewShareTitle("Chia sẻ", ""))
    }

    @Test fun `excerpt is bounded to 220 with an ellipsis, rating only 1 to 5, http photos dropped`() {
        val c = postCardOf(review(body = "a".repeat(300), rating = 0, photos = listOf("http://x/y.jpg")))
        assertEquals(POST_EXCERPT_MAX, c.excerpt!!.length)
        assertTrue(c.excerpt!!.endsWith("…"))
        assertNull(c.rating)
        assertNull(c.image)
    }

    private fun plan(photo1: String? = null, photo2: String? = null, share: String? = "Biển xanh, hải sản tươi") = TappyPlan(
        type = "trip", title = "Đà Nẵng 3 ngày", people = 2, budgetTotal = "10.000.000đ", shareText = share,
        days = listOf(
            PlanDay("Ngày 1", (1..5).map { PlanItem(time = "0$it:00", name = "Chặng $it", address = "Đà Nẵng", photoUrl = if (it == 1) photo1 else if (it == 2) photo2 else null) }),
            PlanDay("Ngày 2", listOf(PlanItem(time = "08:00", name = "Bà Nà"), PlanItem(time = "12:00", name = ""), PlanItem(time = "14:00", name = "Cầu Rồng"))),
        ),
    )

    @Test fun `plan snapshot - only Google place photos, empty stops dropped, summary bounded and link-free`() {
        val s = planCardDataOf(plan(photo1 = "https://lh3.googleusercontent.com/a", photo2 = "https://storage.googleapis.com/clip.jpg"))!!
        assertEquals("https://lh3.googleusercontent.com/a", s.days[0].items[0].photoUrl)
        assertNull("TappyAI's own media bucket is never a place photo", s.days[0].items[1].photoUrl)
        assertEquals(2, s.days[1].items.size)
        assertEquals("Biển xanh, hải sản tươi", s.summary)
        assertNull(planCardDataOf(plan(share = "xem https://x.y"))!!.summary)
        assertNull(planCardDataOf(plan(share = "a".repeat(161)))!!.summary)
        assertTrue(isPlanPhotoUrl("https://lh5.ggpht.com/x")); assertFalse(isPlanPhotoUrl("http://lh3.googleusercontent.com/x"))
    }

    @Test fun `plan image height = web planCardHeight (photo poster + highlights, text band otherwise)`() {
        // 2 days (5 → 4 shown + "+1", 2 stops); hero 1000; highlights 2 → one row.
        val withPhotos = planCardDataOf(plan(photo1 = "https://lh3.googleusercontent.com/a", photo2 = "https://lh3.googleusercontent.com/b"))!!
        assertEquals(3260, PlanCard.height(withPhotos))
        assertEquals(2, PlanCard.highlightsOf(withPhotos).size)
        val noPhotos = planCardDataOf(plan())!!
        assertEquals(2574, PlanCard.height(noPhotos))
    }

    @Test fun `plan strings fill with English singulars`() {
        assertEquals("3 ngày", fillN(PlanCardStrings.VI.days, 3))
        assertEquals("1 day", fillN(PlanCardStrings.EN.days, 1))
        assertEquals("2 people", fillN(PlanCardStrings.EN.people, 2))
        assertEquals("1 person", fillN(PlanCardStrings.EN.people, 1))
    }

    @Test fun `suggestion ratings print like the web (4,5 and 5)`() {
        assertEquals("4.5", ContentCards.jsNumber(4.5))
        assertEquals("5", ContentCards.jsNumber(5.0))
    }

    @Test fun `sheet rules - variant, copy button, link-only apps, app order`() {
        assertEquals(ShareSheetVariant.SUGGESTION, defaultVariantOf(places))
        assertEquals(ShareSheetVariant.PLAN, defaultVariantOf(planArtifact))
        assertEquals(ShareSheetVariant.DEFAULT, defaultVariantOf(plain))
        assertTrue(copiesLink(ShareSheetVariant.PROFILE, plain))
        assertTrue(copiesLink(ShareSheetVariant.POST, plain))
        assertFalse("a suggestion copies its content (web: Sao chép nội dung)", copiesLink(ShareSheetVariant.SUGGESTION, places))
        assertTrue(copiesLink(ShareSheetVariant.PLAN, planArtifact.copy(isPlanLink = true)))
        assertEquals(setOf(TappyShare.Target.FACEBOOK, TappyShare.Target.ZALO, TappyShare.Target.MESSENGER, TappyShare.Target.TIKTOK), LINK_ONLY_TARGETS)
        assertEquals(listOf("facebook", "messenger", "zalo", "whatsapp", "telegram", "viber", "line", "tiktok", "email"), SHEET_APPS.map { it.id })
    }

    @Test fun `Google Play badge - uat and debug yes, release only once the listing is live (web storeListing)`() {
        assertTrue(playBadgeEnabled("uat", false))
        assertTrue(playBadgeEnabled("debug", false))
        assertFalse("public Play page answered 404 on 29/09", playBadgeEnabled("release", false))
        assertTrue(playBadgeEnabled("release", true))
    }

    @Test fun `suggestion card shows the first TWO places (owner verdict 29-09)`() {
        assertEquals(2, ContentCards.SUGGESTION_MAX_ROWS)
    }

    @Test fun `card website is the configured host`() {
        assertEquals("uat.tappyai.com", cardWebsite("https://uat.tappyai.com/"))
        assertEquals("www.tappyai.com", cardWebsite("https://www.tappyai.com"))
    }
}
