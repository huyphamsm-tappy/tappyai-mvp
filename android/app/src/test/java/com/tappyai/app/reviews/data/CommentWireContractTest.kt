package com.tappyai.app.reviews.data

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the comment threading + reactions wire contract against Web production
 * (worktree `cool-vaughan-b3c7ff`: `api/reviews/[id]/comments` + `api/comments/[commentId]/reactions`).
 * A silent field rename would only fail at runtime against prod data, so these guard:
 *  - GET parses `parent_comment_id`, the `reactions` count map, and `my_reaction`.
 *  - Replies arrive FLATTENED (non-null parent) and must group client-side.
 *  - POST body sends `parentId` as camelCase (the backend reads `b.parentId`), and omits it when
 *    null so a top-level comment matches the web's `JSON.stringify({ body })`.
 *
 * [encodeJson] mirrors core:network's encoder (encodeDefaults=false) — that is what keeps a null
 * `parentId` off the wire.
 */
class CommentWireContractTest {

    private val decodeJson = Json { ignoreUnknownKeys = true; isLenient = true }
    private val encodeJson = Json { encodeDefaults = false }

    @Test
    fun `comments GET parses threading and reactions`() {
        val payload = """
            {"comments":[
              {"id":"c1","body":"Top","created_at":"t","user_id":"u1","parent_comment_id":null,
               "profiles":{"full_name":"An","avatar_url":null},
               "reactions":{"like":2,"love":1},"my_reaction":"like"},
              {"id":"c2","body":"Reply","created_at":"t","user_id":"u2","parent_comment_id":"c1",
               "profiles":null,"reactions":{},"my_reaction":null}
            ],"count":5}
        """.trimIndent()

        val response = decodeJson.decodeFromString<CommentsResponseDto>(payload)
        assertEquals(5, response.count)

        val comments = response.comments.map { it.toDomain() }
        val top = comments.first { it.parentCommentId == null }
        val reply = comments.first { it.parentCommentId != null }

        assertEquals("c1", top.id)
        assertEquals(mapOf("like" to 2, "love" to 1), top.reactions)
        assertEquals("like", top.myReaction)
        assertEquals("c1", reply.parentCommentId) // reply groups under the top-level root
        assertTrue(reply.reactions.isEmpty())
        assertNull(reply.myReaction)
    }

    @Test
    fun `reply POST body sends parentId as camelCase`() {
        val body = encodeJson.encodeToString(CreateCommentRequestDto(body = "hi", parentId = "c1"))
        assertTrue(body.contains("\"parentId\":\"c1\""))
        assertTrue(body.contains("\"body\":\"hi\""))
    }

    @Test
    fun `top-level POST body omits null parentId`() {
        val body = encodeJson.encodeToString(CreateCommentRequestDto(body = "hi"))
        assertEquals("""{"body":"hi"}""", body)
    }

    @Test
    fun `reaction request body matches web shape`() {
        val body = encodeJson.encodeToString(ReactionRequestDto(reaction = "love"))
        assertEquals("""{"reaction":"love"}""", body)
        assertTrue(ReactionRequestDto("love").reaction in COMMENT_REACTION_KEYS)
    }
}
