package com.tappyai.app.scamshield.data

import com.tappyai.app.scamshield.EvidenceItem
import com.tappyai.app.scamshield.OfficialEntity
import com.tappyai.app.scamshield.RecommendedAction
import com.tappyai.app.scamshield.RiskLevel
import com.tappyai.app.scamshield.ScamCheckFailure
import com.tappyai.app.scamshield.ScamCheckResult
import com.tappyai.app.scamshield.SignalSeverity
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [ScamShieldRepository].
 *
 * This does its own exception mapping instead of using `safeApiCall`, for one reason: the route
 * distinguishes its refusals in the RESPONSE BODY (`{"error":"daily_limit"}`, `"invalid_input"`,
 * `"private_url"`…), and `safeApiCall` keeps only the HTTP status line. Losing that would leave the
 * user with "something went wrong" when the truthful answer is "you've used today's checks" — and
 * the server has already localized `message` for us via AppLanguageInterceptor.
 *
 * 🚨 Every failure path returns [ScamCheckOutcome.Failed]. There is deliberately no branch that
 * produces a SAFE verdict without the backend having said so.
 */
@Singleton
class RealScamShieldRepository @Inject constructor(
    private val api: ScamShieldApi,
    private val json: Json,
) : ScamShieldRepository {

    override suspend fun check(url: String, preferVietnameseLabels: Boolean): ScamCheckOutcome =
        try {
            ScamCheckOutcome.Verdict(api.check(ScamCheckRequestDto(url)).toDomain(preferVietnameseLabels))
        } catch (e: HttpException) {
            ScamCheckOutcome.Failed(e.toFailure())
        } catch (e: SocketTimeoutException) {
            ScamCheckOutcome.Failed(ScamCheckFailure.Timeout)
        } catch (e: SerializationException) {
            // A response we could not read is not a verdict.
            ScamCheckOutcome.Failed(ScamCheckFailure.Unknown)
        } catch (e: IOException) {
            ScamCheckOutcome.Failed(ScamCheckFailure.Offline)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            ScamCheckOutcome.Failed(ScamCheckFailure.Unknown)
        }

    /** Reads `{error, message}` out of the error body; falls back to the status code alone. */
    private fun HttpException.toFailure(): ScamCheckFailure {
        val body = runCatching { response()?.errorBody()?.string() }.getOrNull()
        val parsed = body?.let { runCatching { json.decodeFromString<ScamCheckErrorDto>(it) }.getOrNull() }
        return ScamCheckFailure.Refused(
            code = parsed?.error?.takeIf { it.isNotBlank() } ?: "http_${code()}",
            serverMessage = parsed?.message?.takeIf { it.isNotBlank() },
        )
    }
}

private fun ScamCheckResponseDto.toDomain(preferVietnameseLabels: Boolean) = ScamCheckResult(
    url = url,
    level = RiskLevel.fromWire(risk.level),
    score = risk.score,
    confidence = risk.confidence,
    evidence = evidence.items.map {
        EvidenceItem(
            source = it.source,
            severity = SignalSeverity.fromWire(it.severity),
            summary = it.summary,
            detail = it.detail,
        )
    },
    officialMatch = officialMatch?.let { OfficialEntity(brand = it.brand, website = it.website, hotline = it.hotline) },
    actions = actions.mapNotNull {
        // The backend ships both languages for each action; pick the one the user reads, and fall
        // back to the other rather than rendering an empty button.
        val label = if (preferVietnameseLabels) it.labelVi.ifBlank { it.labelEn } else it.labelEn.ifBlank { it.labelVi }
        label.takeIf { l -> l.isNotBlank() }?.let { l -> RecommendedAction(isPrimary = it.priority == "primary", label = l) }
    },
    cached = cached,
)
