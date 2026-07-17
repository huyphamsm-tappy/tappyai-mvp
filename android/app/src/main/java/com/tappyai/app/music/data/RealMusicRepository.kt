package com.tappyai.app.music.data

import com.tappyai.app.music.FollowResult
import com.tappyai.app.music.MusicCategory
import com.tappyai.app.music.MusicTracksPage
import com.tappyai.app.music.SaveResult
import com.tappyai.app.music.SoundDetail
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import kotlinx.coroutines.CancellationException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [MusicRepository]. Goes through core:network's [safeApiCall], which maps
 * HttpException/IOException/timeout/serialization into [NetworkResult.Error] and rethrows
 * CancellationException so coroutine cancellation keeps working.
 */
@Singleton
class RealMusicRepository @Inject constructor(
    private val api: MusicApi,
    private val logger: LoggerProvider,
) : MusicRepository {

    override suspend fun getTracks(categoryId: String?, page: Int): NetworkResult<MusicTracksPage> =
        safeApiCall { api.getTracks(categoryId = categoryId, page = page, limit = PAGE_SIZE).toDomain() }

    override suspend fun searchTracks(query: String, page: Int): NetworkResult<MusicTracksPage> =
        safeApiCall { api.searchTracks(query = query, page = page, limit = PAGE_SIZE).toDomain() }

    override suspend fun getCategories(): NetworkResult<List<MusicCategory>> =
        safeApiCall { api.getCategories().categories.map { it.toDomain() } }

    override suspend fun getSoundDetail(trackId: String): NetworkResult<SoundDetail> =
        safeApiCall { api.getSoundDetail(trackId).toDomain() }

    override suspend fun recordPlay(trackId: String) {
        try {
            api.recordPlay(trackId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Best-effort per the endpoint's own contract — never surfaced to the caller,
            // never interrupts playback.
            logger.w(TAG, "Play-count tick failed for $trackId: ${e.message}")
        }
    }

    override suspend fun setSaved(trackId: String, saved: Boolean): NetworkResult<SaveResult> =
        safeApiCall {
            val response = if (saved) api.saveTrack(trackId) else api.unsaveTrack(trackId)
            SaveResult(saved = response.saved, savedCount = response.savedCount)
        }

    override suspend fun setFollowed(trackId: String, followed: Boolean): NetworkResult<FollowResult> =
        safeApiCall {
            val response = if (followed) api.followTrack(trackId) else api.unfollowTrack(trackId)
            FollowResult(followed = response.followed, followCount = response.followCount)
        }

    override suspend fun reportTrack(trackId: String, reason: String, details: String?): NetworkResult<Unit> =
        safeApiCall { api.reportTrack(trackId, ReportTrackRequestDto(reason = reason, details = details)); Unit }

    private companion object {
        const val TAG = "RealMusicRepository"
        const val PAGE_SIZE = 20
    }
}
