package com.tappyai.app.reviews

import com.tappyai.app.reviews.data.CreateReviewResponseDto
import com.tappyai.app.reviews.data.ReviewDto
import com.tappyai.app.reviews.data.ReviewPublicationState
import com.tappyai.app.reviews.data.toDomain
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * V2-UAT-003, Android half: `ok: true` does not mean published.
 *
 * The composer read only `ok` and announced "Đã đăng bài" for a review the safety gate had just
 * held. The post then never appeared, and nothing anywhere told the author why — which is exactly
 * the "it uploaded fine and then vanished" experience the gate was built to prevent, and which
 * the web already handled.
 *
 * Owner decision, 2026-08-20: the gate stays fail-closed, and a video that cannot be fully
 * examined is RESTRICTED and never published. So on Android a held post is not an edge case —
 * every video upload takes this path.
 *
 * These decode the real wire shapes with the real `Json` configuration, so a rename on either
 * side fails here rather than at runtime on a device.
 */
class ModerationContractTest {

    // The same configuration NetworkModule provides — notably ignoreUnknownKeys, which is what
    // let the response grow a `moderation` key for months without any client noticing.
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    @Test
    fun `a held video decodes with its author-facing notice`() {
        val wire = """
            {
              "ok": true,
              "is_verified": false,
              "moderation": {
                "state": "RESTRICTED",
                "title": "Bài của bạn chưa được đăng",
                "detail": "Hệ thống không đủ căn cứ để xác nhận nội dung này an toàn, nên bài không được đăng công khai.",
                "assertsViolation": false
              }
            }
        """.trimIndent()

        val response = json.decodeFromString<CreateReviewResponseDto>(wire)
        val moderation = response.moderation?.toDomain()

        assertTrue("the request itself succeeded", response.ok)
        assertNotNull("the gate's outcome must survive decoding", moderation)
        assertEquals(ReviewPublicationState.Restricted, moderation!!.state)
        assertFalse("not published", moderation.state.isPublished)
        // "Could not check" is not an accusation, and the flag is what lets the UI keep those
        // two apart without parsing prose.
        assertFalse(moderation.assertsViolation)
        assertTrue("server wording is carried verbatim", moderation.detail.isNotBlank())
    }

    @Test
    fun `a violation is distinguishable from a hold`() {
        val wire = """
            {"ok":true,"moderation":{"state":"RESTRICTED","title":"t","detail":"d","assertsViolation":true}}
        """.trimIndent()
        val moderation = json.decodeFromString<CreateReviewResponseDto>(wire).moderation?.toDomain()
        assertTrue(moderation!!.assertsViolation)
    }

    @Test
    fun `a published post is published`() {
        val wire = """
            {"ok":true,"moderation":{"state":"PUBLISHED","title":"t","detail":"d","assertsViolation":false}}
        """.trimIndent()
        val moderation = json.decodeFromString<CreateReviewResponseDto>(wire).moderation?.toDomain()
        assertTrue(moderation!!.state.isPublished)
    }

    @Test
    fun `an inactive gate is indistinguishable from the world before the gate`() {
        // No `moderation` key at all. This has to stay null rather than becoming a defaulted
        // object, or a switched-off feature would start changing what the composer says.
        val response = json.decodeFromString<CreateReviewResponseDto>("""{"ok":true}""")
        assertNull(response.moderation)
    }

    @Test
    fun `an unrecognised lifecycle state is not published`() {
        // Full server-side video examination is explicitly a future capability, so the backend
        // may one day return a state this build has never heard of. Fail closed: an old client
        // meeting a new value must not decide the post is public.
        val wire = """
            {"ok":true,"moderation":{"state":"AWAITING_VIDEO_SCAN","title":"t","detail":"d","assertsViolation":false}}
        """.trimIndent()
        val moderation = json.decodeFromString<CreateReviewResponseDto>(wire).moderation?.toDomain()
        assertEquals(ReviewPublicationState.Unknown, moderation!!.state)
        assertFalse("unknown must never mean published", moderation.state.isPublished)
    }

    @Test
    fun `an empty state string is not published either`() {
        val wire = """{"ok":true,"moderation":{"title":"t","detail":"d"}}"""
        val moderation = json.decodeFromString<CreateReviewResponseDto>(wire).moderation?.toDomain()
        assertFalse(moderation!!.state.isPublished)
    }

    @Test
    fun `a feed row carries the notice for the author's own post`() {
        // GET /api/reviews/mine and the own-profile branch of GET /api/reviews/feed both attach
        // it. This is what puts the "Not public" badge on the grid tile.
        val wire = """
            {
              "id": "r1",
              "user_id": "u1",
              "place_name": "Quán bún",
              "body": "ngon",
              "created_at": "2026-08-20T00:00:00Z",
              "moderation": {"state":"RESTRICTED","title":"t","detail":"d","assertsViolation":false}
            }
        """.trimIndent()
        val review = json.decodeFromString<ReviewDto>(wire).toDomain()
        assertNotNull(review.moderation)
        assertFalse(review.moderation!!.state.isPublished)
    }

    @Test
    fun `someone else's post carries no notice`() {
        // The backend attaches it by IDENTITY, never by request shape. A row without it is a row
        // the reader does not own, and nothing on this side may invent one.
        val wire = """
            {"id":"r2","user_id":"u2","place_name":"x","body":"y","created_at":"2026-08-20T00:00:00Z"}
        """.trimIndent()
        assertNull(json.decodeFromString<ReviewDto>(wire).toDomain().moderation)
    }

    @Test
    fun `no lifecycle internals reach this client`() {
        // The author is owed the fact that the post is held and that it is not an accusation —
        // not WHICH check held it, which would tell them what to change to get past it. If the
        // DTO ever grows a field for one of these, this fails and the boundary gets re-argued
        // rather than quietly moved.
        val fields = com.tappyai.app.reviews.data.ModerationDto::class.java.declaredFields.map { it.name }
        for (leak in listOf("safetyState", "safety_state", "policy", "evidence", "evaluatedVersion")) {
            assertFalse("ModerationDto must not carry $leak", fields.contains(leak))
        }
    }
}
