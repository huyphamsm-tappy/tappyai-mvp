package com.tappyai.app.safety

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import javax.inject.Singleton

/**
 * Reporting and blocking (Google Play "User Generated Content" policy). Built from the shared
 * Retrofit, so the user's `Authorization: Bearer …` rides along as for every own-host call.
 *
 * Two server generations, deliberately kept apart:
 *  - `POST api/reviews/{id}/report` — LIVE on production (F-031, `content_reports`). Reports a post
 *    or a clip. Body `{reason}`; answers `{ok, reported, alreadyReported?}`; 400 invalid_reason ·
 *    401 · 403 anonymous · 404 no such review · 500.
 *  - Everything else is behind server flags (`GET api/config` → `p8`): `POST api/comments/{id}/report` and
 *    `POST api/users/{id}/report` (`reports`), `POST|DELETE api/users/{id}/block`, `GET api/users/blocks` (`userBlocks`). While a
 *    flag is off the route answers 404. There is NO `POST api/reports` in the web contract. The app therefore asks
 *    `GET api/config` → `p8` first ([SafetyFlags]) and never calls these routes unless the server
 *    has said it has them — the same switch iOS reads.
 */
interface SafetyApi {
    @GET("api/config")
    suspend fun config(): SafetyConfigDto

    @POST("api/reviews/{id}/report")
    suspend fun reportReview(@Path("id") reviewId: String, @Body body: ReviewReportBodyDto): Response<ReportAckDto>

    /** Web contract (docs/uat/ANDROID-REQUESTS.md §4, origin/rc/web-uat): comments and users have their OWN report routes — there is NO `POST /api/reports`. */
    @POST("api/comments/{id}/report")
    suspend fun reportComment(@Path("id") commentId: String, @Body body: ReportBodyDto): Response<ReportAckDto>

    @POST("api/users/{id}/report")
    suspend fun reportUser(@Path("id") userId: String, @Body body: ReportBodyDto): Response<ReportAckDto>

    @POST("api/users/{id}/block")
    suspend fun block(@Path("id") userId: String): Response<ReportAckDto>

    @DELETE("api/users/{id}/block")
    suspend fun unblock(@Path("id") userId: String): Response<ReportAckDto>

    @GET("api/users/blocks")
    suspend fun blocks(): BlocksDto
}

@Serializable
data class SafetyConfigDto(val p8: P8SafetyDto? = null)

/** `/api/config` → `p8` (phase8 `src/lib/p8/clientFlags.ts`). Absent block or absent key = off. */
@Serializable
data class P8SafetyDto(
    val reports: Boolean = false,
    val userBlocks: Boolean = false,
    val commentModeration: Boolean = false,
)

@Serializable
data class ReviewReportBodyDto(val reason: String)

@Serializable
data class ReportBodyDto(
    val reason: String,
    /** Optional free text, cut to 300 characters by the server (`details` is read as the same field). */
    val note: String? = null,
)

@Serializable
data class ReportAckDto(
    val ok: Boolean = false,
    val reported: Boolean = false,
    val duplicate: Boolean = false,
    val alreadyReported: Boolean = false,
    val blocked: Boolean? = null,
)

@Serializable
data class BlocksDto(val blocks: List<BlockRowDto> = emptyList())

@Serializable
data class BlockRowDto(
    @SerialName("blocked_id") val blockedId: String,
    @SerialName("created_at") val createdAt: String = "",
)

@Module
@InstallIn(SingletonComponent::class)
object SafetyApiModule {
    @Provides
    @Singleton
    fun provideSafetyApi(retrofit: Retrofit): SafetyApi = retrofit.create(SafetyApi::class.java)
}
