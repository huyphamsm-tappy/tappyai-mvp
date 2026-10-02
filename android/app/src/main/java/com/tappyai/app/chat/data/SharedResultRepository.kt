package com.tappyai.app.chat.data

import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * G1 share-out on Android — parity with the web's share preview → confirm → public link.
 *
 * The public page, the OG card, attribution and the anonymous follow-up all live on the
 * server; this repository only asks for the sanitized preview and, on confirm, the public
 * URL. Nothing about the answer is sent from the device.
 */
interface SharedResultRepository {
    suspend fun preview(conversationId: String, messageIndex: Int, locale: String?): ShareOutcome<SharePreview>
    suspend fun publish(conversationId: String, messageIndex: Int, title: String?, locale: String?): ShareOutcome<PublishedShare>
}

/** What the preview dialog shows: exactly the public payload, nothing from the private turn. */
data class SharePreview(
    val title: String,
    val query: String,
    val excerpt: String,
    val imageCount: Int,
    val buttonCount: Int,
    val listed: Boolean,
)

data class PublishedShare(val id: String, val slug: String, val url: String, val title: String, val listed: Boolean)

/**
 * The outcomes the UI must tell apart. A plain [NetworkResult] would collapse the two that
 * change what the user is asked to do next — sign in, or wait until tomorrow — into "error".
 */
sealed interface ShareOutcome<out T> {
    data class Success<T>(val data: T) : ShareOutcome<T>
    /** 403 `account_required`: an anonymous session may not publish. Offer sign-in. */
    data object AccountRequired : ShareOutcome<Nothing>
    /** 429: the daily share cap. Not retryable now. */
    data object RateLimited : ShareOutcome<Nothing>
    /** 422: the sanitizer refused the turn (nothing public survived). */
    data object NotShareable : ShareOutcome<Nothing>
    data class Failed(val error: NetworkError) : ShareOutcome<Nothing>

    companion object {
        /** HTTP status → outcome. Pure and JVM-tested; the repository is the only caller. */
        fun <T> fromNetwork(result: NetworkResult<T>): ShareOutcome<T> = when (result) {
            is NetworkResult.Success -> Success(result.data)
            is NetworkResult.Error -> when (val e = result.error) {
                is NetworkError.Http -> when (e.code) {
                    401, 403 -> AccountRequired
                    429 -> RateLimited
                    422 -> NotShareable
                    else -> Failed(e)
                }
                else -> Failed(e)
            }
        }
    }
}

/** DTO → preview, the only place the wire shape is read. Pure. */
fun SharePreviewResponseDto.toPreview(): SharePreview = SharePreview(
    title = payload.title,
    query = payload.query,
    excerpt = payload.body
        .replace(Regex("[#*_>`]"), "")
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(EXCERPT_CHARS)
        .let { if (payload.body.length > EXCERPT_CHARS) "$it…" else it },
    imageCount = payload.images.size,
    buttonCount = payload.buttons.size,
    listed = listed,
)

private const val EXCERPT_CHARS = 420

@Singleton
class RealSharedResultRepository @Inject constructor(
    private val api: SharedResultApi,
) : SharedResultRepository {

    override suspend fun preview(conversationId: String, messageIndex: Int, locale: String?): ShareOutcome<SharePreview> =
        ShareOutcome.fromNetwork(
            safeApiCall { api.preview(ShareRequestDto(conversationId, messageIndex, locale = locale)).toPreview() },
        )

    override suspend fun publish(conversationId: String, messageIndex: Int, title: String?, locale: String?): ShareOutcome<PublishedShare> =
        ShareOutcome.fromNetwork(
            safeApiCall {
                val dto = api.publish(ShareRequestDto(conversationId, messageIndex, title = title?.takeIf { it.isNotBlank() }, locale = locale))
                PublishedShare(id = dto.id, slug = dto.slug, url = dto.url, title = dto.title, listed = dto.listed)
            },
        )
}
