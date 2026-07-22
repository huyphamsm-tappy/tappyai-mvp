package com.tappyai.app.music.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit contract for Music. Built from the shared [retrofit2.Retrofit] (core:network). Browse
 * endpoints are public (no `Authorization` header needed) — matches the web, which lets signed-out
 * visitors browse/search/play. Save/Follow/Report require a Bearer session; the shared OkHttp
 * client's `AuthInterceptor` attaches it automatically, same as every other authenticated call in
 * this app — a 401 here just means the interceptor found no session.
 */
interface MusicApi {

    @GET("api/music/tracks")
    suspend fun getTracks(
        @Query("categoryId") categoryId: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): MusicTracksPageDto

    @GET("api/music/tracks/search")
    suspend fun searchTracks(
        @Query("q") query: String,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): MusicTracksPageDto

    @GET("api/music/categories")
    suspend fun getCategories(): MusicCategoriesResponseDto

    @GET("api/sound/{trackId}")
    suspend fun getSoundDetail(@Path("trackId") trackId: String): SoundDetailResponseDto

    /** Fire-and-forget play tick — the backend rate-limits it (30/min/IP) and never fails the
     *  caller in a way that should block playback, so callers treat errors as non-fatal. */
    @POST("api/sound/{trackId}/play")
    suspend fun recordPlay(@Path("trackId") trackId: String): OkResponseDto

    @POST("api/sound/{trackId}/save")
    suspend fun saveTrack(@Path("trackId") trackId: String): SaveTrackResponseDto

    @DELETE("api/sound/{trackId}/save")
    suspend fun unsaveTrack(@Path("trackId") trackId: String): SaveTrackResponseDto

    @POST("api/sound/{trackId}/follow")
    suspend fun followTrack(@Path("trackId") trackId: String): FollowTrackResponseDto

    @DELETE("api/sound/{trackId}/follow")
    suspend fun unfollowTrack(@Path("trackId") trackId: String): FollowTrackResponseDto

    @POST("api/music/tracks/{trackId}/report")
    suspend fun reportTrack(@Path("trackId") trackId: String, @Body body: ReportTrackRequestDto): OkResponseDto
}
