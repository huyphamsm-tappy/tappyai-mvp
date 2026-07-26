package com.tappyai.app.reviews.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Pins the /api/users/search response parse + mapping (Explore Users segment, web parity). */
class UserSearchWireTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    @Test
    fun `parses snake_case user search results and maps to profile`() {
        val payload = """
            {"users":[
              {"id":"u1","full_name":"An Nguyen","avatar_url":"https://img/1.png",
               "follower_count":42,"following_count":7,"is_following":true}
            ]}
        """.trimIndent()
        val response = json.decodeFromString<UserSearchResponseDto>(payload)
        assertEquals(1, response.users.size)

        val profile = response.users.first().toReviewProfile()
        assertEquals("u1", profile.userId)
        assertEquals("An Nguyen", profile.fullName)
        assertEquals("https://img/1.png", profile.avatarUrl)
        assertEquals(42, profile.followerCount)
        assertTrue(profile.isFollowing)
    }
}
