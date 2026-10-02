package com.tappyai.app.social.data

import com.tappyai.app.reviews.data.UserSearchResult
import com.tappyai.app.reviews.data.toDomain
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Which direction of `user_follows` to read. Two, because the table has two. */
enum class ConnectionType(val wire: String) { Following("following"), Followers("followers") }

/**
 * The social graph reads the Following / Followers page needs. Search and the follow toggle stay
 * on [com.tappyai.app.reviews.data.ReviewsRepository], which already has them — this adds only
 * the one read that client lacked.
 */
interface SocialRepository {
    /** The people the caller follows, or the people who follow the caller — each with the caller's follow state. */
    suspend fun getConnections(type: ConnectionType): NetworkResult<List<UserSearchResult>>
}

@Singleton
class RealSocialRepository @Inject constructor(private val api: SocialApi) : SocialRepository {
    override suspend fun getConnections(type: ConnectionType): NetworkResult<List<UserSearchResult>> =
        safeApiCall { api.getConnections(type.wire).users.map { it.toDomain() } }
}
