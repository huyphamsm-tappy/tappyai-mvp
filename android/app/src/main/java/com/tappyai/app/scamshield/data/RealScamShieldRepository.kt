package com.tappyai.app.scamshield.data

import android.util.Base64
import com.tappyai.app.scamshield.AdviceItem
import com.tappyai.app.scamshield.EvidenceItem
import com.tappyai.app.scamshield.MessageAnalysis
import com.tappyai.app.scamshield.MessageQuota
import com.tappyai.app.scamshield.MessageSignal
import com.tappyai.app.scamshield.MessageUrlCheck
import com.tappyai.app.scamshield.OfficialEntity
import com.tappyai.app.scamshield.RecommendedAction
import com.tappyai.app.scamshield.RiskLevel
import com.tappyai.app.scamshield.ScamCheckFailure
import com.tappyai.app.scamshield.ScamCheckResult
import com.tappyai.app.scamshield.SignalSeverity
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Backend-backed [ScamShieldRepository].
 *
 * This does its own exception mapping instead of using `safeApiCall`, for one reason: the routes
 * distinguish their refusals in the RESPONSE BODY (`{"error":"daily_limit"}`, `"invalid_input"`,
 * `"private_url"`, `"invalid_image"`…), and `safeApiCall` keeps only the HTTP status line. Losing
 * that would leave the user with "something went wrong" when the truthful answer is "you've used
 * today's checks" — and the server has already localized `message` for us via
 * AppLanguageInterceptor.
 *
 * 🚨 Every failure path returns a `Failed` outcome. There is deliberately no branch that produces a
 * verdict without the backend having said so.
 */
@Singleton
class RealScamShieldRepository @Inject constructor(
    private val api: ScamShieldApi,
    private val json: Json,
) : ScamShieldRepository {

    override suspend fun check(url: String, preferVietnameseLabels: Boolean): ScamCheckOutcome =
        attempt { api.check(ScamCheckRequestDto(url)).toDomain(preferVietnameseLabels) }
            .fold({ ScamCheckOutcome.Verdict(it) }, { ScamCheckOutcome.Failed(it) })

    override suspend fun checkQrImage(bytes: ByteArray, mimeType: String, preferVietnameseLabels: Boolean): ScamCheckOutcome =
        attempt {
            val part = MultipartBody.Part.createFormData("image", "qr", bytes.toRequestBody(mimeType.toMediaType()))
            api.checkQr(part).toDomain(preferVietnameseLabels)
        }.fold({ ScamCheckOutcome.Verdict(it) }, { ScamCheckOutcome.Failed(it) })

    override suspend fun analyzeMessage(text: String?, url: String?, image: ByteArray?, mimeType: String?, preferVietnameseLabels: Boolean): MessageAnalysisOutcome {
        val body = MessageAnalysisRequestDto(
            text = text?.takeIf { it.isNotBlank() },
            url = url?.takeIf { it.isNotBlank() },
            // The web reads the file as a data URL (`readAsDataUrl`); the route decodes exactly that.
            imageBase64 = image?.let { "data:${mimeType ?: "image/jpeg"};base64," + Base64.encodeToString(it, Base64.NO_WRAP) },
            mimeType = image?.let { mimeType ?: "image/jpeg" },
        )
        return attempt { api.analyzeMessage(body).toDomain(preferVietnameseLabels) }
            .fold({ MessageAnalysisOutcome.Verdict(it) }, { MessageAnalysisOutcome.Failed(it) })
    }

    /** The one exception→failure mapping, shared by the three routes. */
    private suspend fun <T> attempt(call: suspend () -> T): Outcome<T> =
        try {
            Outcome.Ok(call())
        } catch (e: HttpException) {
            Outcome.Err(e.toFailure())
        } catch (e: SocketTimeoutException) {
            Outcome.Err(ScamCheckFailure.Timeout)
        } catch (e: SerializationException) {
            // A response we could not read is not a verdict.
            Outcome.Err(ScamCheckFailure.Unknown)
        } catch (e: IOException) {
            Outcome.Err(ScamCheckFailure.Offline)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Outcome.Err(ScamCheckFailure.Unknown)
        }

    private sealed interface Outcome<out T> {
        data class Ok<T>(val value: T) : Outcome<T>
        data class Err(val failure: ScamCheckFailure) : Outcome<Nothing>
        fun <R> fold(ok: (T) -> R, err: (ScamCheckFailure) -> R): R = when (this) {
            is Ok -> ok(value)
            is Err -> err(failure)
        }
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
        label.takeIf { l -> l.isNotBlank() }?.let { l -> RecommendedAction(isPrimary = it.priority == "primary", icon = it.icon, label = l) }
    },
    cached = cached,
)

/**
 * A 200 without a verdict is not a verdict: the web refuses a body with no `risk.level`,
 * `analysis` or `advice`; here the same three are required or the decode throws (→ Unknown).
 */
private fun MessageAnalysisResponseDto.toDomain(preferVietnameseLabels: Boolean): MessageAnalysis {
    val level = RiskLevel.fromWire(risk.level)
    if (risk.level.isBlank() || analysis == null || advice == null) throw SerializationException("no verdict")
    fun AdviceItemDto.label() = if (preferVietnameseLabels) labelVi.ifBlank { labelEn } else labelEn.ifBlank { labelVi }
    return MessageAnalysis(
        level = level,
        score = risk.score,
        confidence = risk.confidence,
        scamType = scamType?.takeIf { it.isNotBlank() },
        attackGoal = attackGoal?.takeIf { it.isNotBlank() },
        signals = signals.map { MessageSignal(type = it.type, severity = it.severity, explanation = it.explanation) },
        requestedActions = requestedActions,
        urlChecks = urlChecks.map { MessageUrlCheck(url = it.url, checked = it.status == "checked", level = it.level?.let { l -> RiskLevel.fromWire(l) }) },
        doNot = advice.doNot.mapNotNull { a -> a.label().takeIf { it.isNotBlank() }?.let { AdviceItem(code = a.code, label = it) } },
        doNow = advice.doNow.mapNotNull { a -> a.label().takeIf { it.isNotBlank() }?.let { AdviceItem(code = a.code, label = it) } },
        reasoningSummary = reasoningSummary,
        aiStatus = analysis.aiStatus,
        extractedText = extractedText?.takeIf { it.isNotBlank() },
        quota = quota?.let { MessageQuota(kind = it.kind, limit = it.limit, period = it.period, used = it.used, remaining = it.remaining, exhausted = it.exhausted, pro = it.pro) },
    )
}
