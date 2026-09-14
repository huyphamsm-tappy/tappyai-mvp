package com.tappyai.app.share

import com.tappyai.core.network.NetworkError
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import com.tappyai.core.security.JwtDecoder
import com.tappyai.core.security.TokenProvider
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Publishing a plan: the ONE way this client obtains a `/plan/<shareId>` link.
 *
 * Android is a delivery client for the web brochure. It does not mint ids, hash snapshots or
 * build `/plan` URLs on its own — it sends the plan block to `POST /api/plans/share` under the
 * current session and turns the server's id into the canonical URL. The server is idempotent
 * for the same owner and plan, so sharing twice is safe and answers the same link; nothing is
 * cached here.
 *
 * 🚨 SIGNED-IN ACCOUNTS ONLY, DECIDED BEFORE THE REQUEST. A link outlives a guest session, so
 * the route refuses anonymous sessions (403) and signed-out callers (401). Both are known
 * locally from the verified token, so the plan is not sent at all in those cases — the sheet
 * offers sign-in instead. This mirrors, it does not replace, the server's own refusal.
 */
sealed class PlanShareOutcome {
    /** Published: the canonical page for exactly this plan. */
    data class Link(val shareId: String, val url: String) : PlanShareOutcome()
    /** Signed out or a guest session: no request was made (or the server said 401/403). */
    data object SignInRequired : PlanShareOutcome()
    /** No network / timed out: nothing was published. */
    data object Offline : PlanShareOutcome()
    /** The plan could not be published (400/413): it is not a shareable plan. */
    data object NotShareable : PlanShareOutcome()
    /** The block this message carried is missing or not JSON — a restored message, typically. */
    data object NoPlanPayload : PlanShareOutcome()
    /** Server error, or a 200 whose body carried no usable id. */
    data object Failed : PlanShareOutcome()
}

interface PlanShareRepository {
    suspend fun publish(planJson: String): PlanShareOutcome
}

@Singleton
class RealPlanShareRepository(
    private val api: PlanShareApi,
    private val tokenProvider: TokenProvider,
    /** The verified token's `is_anonymous` claim. Injectable so the JVM tests can say "guest" without android.util.Base64. */
    private val isAnonymousToken: (String) -> Boolean,
) : PlanShareRepository {

    @Inject
    constructor(api: PlanShareApi, tokenProvider: TokenProvider) :
        this(api, tokenProvider, { token -> JwtDecoder.decode(token)?.isAnonymous == true })

    override suspend fun publish(planJson: String): PlanShareOutcome {
        val token = tokenProvider.getAccessToken()
        if (token.isNullOrBlank() || isAnonymousToken(token)) return PlanShareOutcome.SignInRequired
        val plan = planObject(planJson) ?: return PlanShareOutcome.NoPlanPayload
        return when (val r = safeApiCall { api.publish(PlanSharePublishRequest(plan)) }) {
            is NetworkResult.Success -> outcomeOf(r.data)
            is NetworkResult.Error -> outcomeOf(r.error)
        }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; isLenient = true }

        /** The block as one JSON object, or null when it is not one. Parsed, never re-modelled. */
        fun planObject(planJson: String?): JsonObject? =
            planJson?.takeIf { it.isNotBlank() }?.let { runCatching { json.parseToJsonElement(it).jsonObject }.getOrNull() }

        /** A 200 is a link only when it carries a server id in the documented shape. */
        fun outcomeOf(response: PlanSharePublishResponse): PlanShareOutcome {
            val id = response.id ?: return PlanShareOutcome.Failed
            val url = TappyShare.planShareUrl(id) ?: return PlanShareOutcome.Failed
            return PlanShareOutcome.Link(shareId = id, url = url)
        }

        fun outcomeOf(error: NetworkError): PlanShareOutcome = when (error) {
            is NetworkError.Http -> when (error.code) {
                401, 403 -> PlanShareOutcome.SignInRequired
                400, 413, 422 -> PlanShareOutcome.NotShareable
                else -> PlanShareOutcome.Failed
            }
            NetworkError.NoConnectivity, NetworkError.Timeout -> PlanShareOutcome.Offline
            is NetworkError.Serialization, is NetworkError.Unknown -> PlanShareOutcome.Failed
        }
    }
}
