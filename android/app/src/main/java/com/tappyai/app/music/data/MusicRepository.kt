package com.tappyai.app.music.data

import com.tappyai.app.music.FollowResult
import com.tappyai.app.music.MusicCategory
import com.tappyai.app.music.MusicTracksPage
import com.tappyai.app.music.SaveResult
import com.tappyai.app.music.SoundDetail
import com.tappyai.core.network.NetworkResult

/** Abstraction over the music backend. The ViewModel depends on this and domain types only —
 *  never on Retrofit/OkHttp or the DTOs. */
interface MusicRepository {

    suspend fun getTracks(categoryId: String?, page: Int): NetworkResult<MusicTracksPage>

    suspend fun searchTracks(query: String, page: Int): NetworkResult<MusicTracksPage>

    suspend fun getCategories(): NetworkResult<List<MusicCategory>>

    suspend fun getSoundDetail(trackId: String): NetworkResult<SoundDetail>

    /** Fire-and-forget play tick. Doesn't return a [NetworkResult] — a failure here (rate limit,
     *  network hiccup) must never block or interrupt actual playback, matching the backend's own
     *  "best-effort" framing of this endpoint. */
    suspend fun recordPlay(trackId: String)

    /** [saved]`=true` calls save, `false` calls unsave — caller passes the *target* state. */
    suspend fun setSaved(trackId: String, saved: Boolean): NetworkResult<SaveResult>

    /** [followed]`=true` calls follow, `false` calls unfollow — same shape as [setSaved]. */
    suspend fun setFollowed(trackId: String, followed: Boolean): NetworkResult<FollowResult>

    suspend fun reportTrack(trackId: String, reason: String, details: String?): NetworkResult<Unit>
}
