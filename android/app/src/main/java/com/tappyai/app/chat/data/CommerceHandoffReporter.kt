package com.tappyai.app.chat.data

import com.tappyai.app.chat.LiveCommerceFacts
import com.tappyai.core.analytics.AnalyticsProvider
import com.tappyai.core.logging.LoggerProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The body `POST /api/commerce/handoff` accepts (web `handoffBodyFor`, src/lib/recommendation/handoff.ts):
 * the OPAQUE ids the Commerce Capability Platform minted, and which client sent them. Never the URL,
 * never anything about the person — the server rejects any other shape with a 400.
 */
@Serializable
data class CommerceHandoffBodyDto(
    @SerialName("linkId") val linkId: String,
    @SerialName("requestId") val requestId: String,
    val platform: String = "android",
)

/**
 * Retrofit contract for the commerce handoff beacon. Built from the shared singleton
 * [retrofit2.Retrofit] (core:network) like [MessageFeedbackApi]; the route needs no auth.
 *
 * `Response<Unit>` because the route answers `{ok:true}` and there is nothing to decode — the same
 * fire-and-forget shape as `DealsApi.postDealClick`.
 */
interface CommerceHandoffApi {
    @POST("api/commerce/handoff")
    suspend fun postHandoff(@Body body: CommerceHandoffBodyDto): Response<Unit>
}

/**
 * Reports that the user followed a Commerce Link — the one CCP event the server cannot see
 * (web `reportCommerceHandoff`). Best-effort by contract: it runs on its own scope AFTER the
 * intent to open the merchant was fired, never gates the link, and swallows every failure the way
 * the web beacon's `.catch(() => {})` does. What it does record locally is the existing analytics
 * seam, so a rendered/tapped/attempted/failed commerce action can be told apart in the same place
 * every other client event lands.
 */
interface CommerceHandoffReporter {
    /** The card drew a commerce action (once per action, on first composition). */
    fun rendered(commerce: LiveCommerceFacts)

    /** The user tapped it and the merchant intent was fired ([opened] false = nothing could open the URL). */
    fun tapped(commerce: LiveCommerceFacts, opened: Boolean)
}

@Singleton
class RealCommerceHandoffReporter @Inject constructor(
    private val api: CommerceHandoffApi,
    private val analytics: AnalyticsProvider,
    private val logger: LoggerProvider,
) : CommerceHandoffReporter {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun rendered(commerce: LiveCommerceFacts) {
        analytics.track("commerce_action_rendered", props(commerce))
    }

    override fun tapped(commerce: LiveCommerceFacts, opened: Boolean) {
        analytics.track("commerce_action_tapped", props(commerce))
        // affiliate_click — the GA4 funnel event (RUNBOOK §3.19). GA-only by the
        // taxonomy filter: the commerce_* events here are internal and dropped from
        // GA4, while this one is the single GA4 projection, mirroring web's
        // trackGa('affiliate_click'). Provider slug + tracking-wrapper boolean only;
        // never the URL or the opaque ids. (domain/vertical is not on LiveCommerceFacts.)
        analytics.track("affiliate_click", mapOf("provider" to commerce.providerId, "tracked" to commerce.tracked))
        if (!opened) {
            analytics.track("commerce_handoff_failed", props(commerce) + ("reason" to "no_activity"))
            return
        }
        analytics.track("commerce_handoff_attempted", props(commerce))
        if (commerce.linkId.isBlank() || commerce.requestId.isBlank()) return
        scope.launch {
            try {
                api.postHandoff(CommerceHandoffBodyDto(linkId = commerce.linkId, requestId = commerce.requestId, platform = "android"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The beacon is not the link. Logged so a dead endpoint is visible; nothing shown.
                logger.w(TAG, "commerce handoff beacon failed: ${e.message}")
                analytics.track("commerce_handoff_failed", props(commerce) + ("reason" to "beacon"))
            }
        }
    }

    private fun props(c: LiveCommerceFacts): Map<String, Any?> = mapOf(
        "providerId" to c.providerId,
        "capability" to c.capability,
        "depth" to c.depth,
        "loginRequired" to c.loginRequired,
        "handoff" to c.handoff,
        "linkId" to c.linkId,
    )

    private companion object {
        const val TAG = "CommerceHandoff"
    }
}
