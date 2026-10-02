package com.tappyai.app.scamshield

import android.content.Context
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.AppLanguageResolver
import com.tappyai.app.scamshield.data.KnowledgeDataset
import com.tappyai.app.scamshield.data.MessageAnalysisOutcome
import com.tappyai.app.scamshield.data.OfficialGroup
import com.tappyai.app.scamshield.data.QrCodes
import com.tappyai.app.scamshield.data.QrPayload
import com.tappyai.app.scamshield.data.ScenarioConfidence
import com.tappyai.app.scamshield.data.ScenarioMatch
import com.tappyai.app.scamshield.data.ScenarioMatcher
import com.tappyai.app.scamshield.data.ScamCheckHistoryStore
import com.tappyai.app.scamshield.data.ScamCheckOutcome
import com.tappyai.app.scamshield.data.ScamKnowledgeRepository
import com.tappyai.app.scamshield.data.ScamScenario
import com.tappyai.app.scamshield.data.ScamShieldRepository
import com.tappyai.core.analytics.AnalyticsProvider
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** The three capabilities, three tabs — the web's `type Tab = 'url' | 'qr' | 'message'`. */
enum class ScamShieldTab { Url, Qr, Message }

/**
 * State for the Scam Shield screen — the web `/scam-shield` (`ScamShieldView.tsx`), 2026-09-17.
 *
 * The URL tab posts to `/api/scam-shield/check`; the QR tab decodes the picked image ON THE DEVICE and sends only the link it carries to the same
 * check; the Message tab first matches the text against the 25 official scenarios on the device and, when that is not a sure match, posts text / link / screenshot to
 * `/api/scam-shield/analyze`. Every verdict is the engine's. The recent-checks list is the web's
 * device-local history (`ScamCheckHistoryStore`): written only from a returned URL verdict (a
 * message verdict is NOT a link and is never written), and a row re-runs the check rather than
 * replaying the stored level. The knowledge library is the web's static dataset, filtered in
 * memory — no request, no model, no quota.
 *
 * 🚨 [state] can only reach a `Result` by way of a backend verdict. Every other path lands in
 * [ScamShieldUiState.Failed], which the screen renders as an unresolved check.
 */
@HiltViewModel
class ScamShieldViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val repository: ScamShieldRepository,
    private val history: ScamCheckHistoryStore,
    private val knowledge: ScamKnowledgeRepository,
    private val analytics: AnalyticsProvider,
) : ViewModel() {

    var url by mutableStateOf("")
        private set

    var tab by mutableStateOf(ScamShieldTab.Url)
        private set

    var state by mutableStateOf<ScamShieldUiState>(ScamShieldUiState.Idle)
        private set

    /** Most recent first; the web's `HISTORY_PREVIEW` rows show until "Xem tất cả". */
    var recent by mutableStateOf<List<ScamCheckHistoryEntry>>(emptyList())
        private set

    var historyExpanded by mutableStateOf(false)
        private set

    // ── Analyze Message ──
    var message by mutableStateOf("")
        private set
    var messageUrl by mutableStateOf("")
        private set
    /** The picked screenshot (bytes, MIME, display name), or null. */
    var screenshot by mutableStateOf<Screenshot?>(null)
        private set

    /** The one-time "send this to the AI?" question; the answer lives in memory for this run only (never the message). */
    var askAiConsent by mutableStateOf(false)
        private set
    private var aiConsented = false
    fun confirmAiConsent() { aiConsented = true; askAiConsent = false; analyzeMessage() }
    fun dismissAiConsent() { askAiConsent = false }

    // ── Knowledge library ──
    var knowledgeCategory by mutableStateOf<String?>(null)
        private set
    var openScenarioId by mutableStateOf<String?>(null)
        private set
    var knowledgeExpanded by mutableStateOf(false)
        private set

    private var inFlight: Job? = null

    init {
        recent = history.read()
    }

    val knowledgeCategories: List<String> get() = knowledge.categories
    val knowledgeDataset: KnowledgeDataset get() = knowledge.dataset
    val knowledgeScenarios: List<ScamScenario> get() = knowledge.scenariosIn(knowledgeCategory)
    fun groupOf(scenario: ScamScenario): OfficialGroup? = knowledge.groupOf(scenario)

    fun onUrlChange(value: String) { url = value }
    fun onMessageChange(value: String) { message = value.take(MESSAGE_MAX_CHARS) }
    fun onMessageUrlChange(value: String) { messageUrl = value }
    fun removeScreenshot() { screenshot = null }

    /** Switching tabs clears the verdict and the error, as the web's `switchTab` does. */
    fun selectTab(next: ScamShieldTab) {
        if (tab == next) return
        tab = next
        inFlight?.cancel(); inFlight = null
        state = ScamShieldUiState.Idle
    }

    fun toggleHistory() { historyExpanded = !historyExpanded }

    fun clearHistory() {
        history.clear()
        recent = emptyList()
        historyExpanded = false
    }

    /** A history row is a shortcut back to the engine, never a cached answer standing in for it. */
    fun recheck(entry: ScamCheckHistoryEntry) {
        tab = ScamShieldTab.Url
        url = entry.url
        check()
    }

    fun pickKnowledgeCategory(category: String?) {
        knowledgeCategory = category
        openScenarioId = null
        knowledgeExpanded = false
    }

    fun toggleScenario(id: String) { openScenarioId = if (openScenarioId == id) null else id }
    fun toggleKnowledgeExpanded() { knowledgeExpanded = !knowledgeExpanded }

    fun check() {
        val target = url.trim()
        if (target.isEmpty() || state is ScamShieldUiState.Checking) return
        run {
            when (val o = repository.check(target, preferVietnameseLabels = vietnamese())) {
                is ScamCheckOutcome.Verdict -> { recent = history.record(o.result); trackScamCheck("url", o.result.level); ScamShieldUiState.Result(o.result) }
                is ScamCheckOutcome.Failed -> ScamShieldUiState.Failed(o.failure)
            }
        }
    }

    /**
     * The QR tab: the picked picture is decoded HERE, on the phone (ZXing). The picture never leaves the device: only the LINK a code
     * carries is sent to the link check (`/api/scam-shield/check`, the same engine as the URL tab). A code that carries anything else —
     * text, Wi-Fi, a payment, a contact — is named and warned about ([ScamShieldUiState.QrNotice]) and never acted on.
     */
    fun checkQrImage(uri: Uri) {
        if (state is ScamShieldUiState.Checking) return
        run {
            val (bytes, _) = readImage(uri)
            when {
                bytes == null -> ScamShieldUiState.Failed(ScamCheckFailure.Refused("no_image", null))
                bytes.size > QR_MAX_BYTES -> ScamShieldUiState.Failed(ScamCheckFailure.Refused("too_large", null))
                else -> {
                    val decoded = withContext(Dispatchers.Default) { runCatching { QrCodes.decodeImage(bytes) }.getOrNull() }
                    when (val payload = decoded?.let(QrCodes::classify)) {
                        null -> ScamShieldUiState.Failed(ScamCheckFailure.Refused("qr_decode_failed", null))
                        is QrPayload.Other -> ScamShieldUiState.QrNotice(payload)
                        is QrPayload.Link -> when (val o = repository.check(payload.url, preferVietnameseLabels = vietnamese())) {
                            is ScamCheckOutcome.Verdict -> { recent = history.record(o.result); trackScamCheck("qr", o.result.level); ScamShieldUiState.Result(o.result) }
                            is ScamCheckOutcome.Failed -> ScamShieldUiState.Failed(o.failure)
                        }
                    }
                }
            }
        }
    }

    /** The Message tab's screenshot: the web's `pickScreenshot` bounds (JPEG/PNG/WebP, ≤ 5 MB) checked here, then again by the server. */
    fun pickScreenshot(uri: Uri) {
        viewModelScope.launch {
            val (bytes, mime) = readImage(uri)
            if (bytes == null || bytes.size > SCREENSHOT_MAX_BYTES || mime !in SCREENSHOT_ALLOWED_MIME) {
                state = ScamShieldUiState.Failed(ScamCheckFailure.Refused("invalid_image", null))
                return@launch
            }
            if (state is ScamShieldUiState.Failed) state = ScamShieldUiState.Idle
            screenshot = Screenshot(bytes = bytes, mimeType = mime, name = uri.lastPathSegment?.substringAfterLast('/') ?: "screenshot")
        }
    }

    val canAnalyze: Boolean get() = message.isNotBlank() || messageUrl.isNotBlank() || screenshot != null

    /** Analyze Message: at least one of text / link / screenshot; the result is its own card, never a history row. */
    fun analyzeMessage() {
        if (!canAnalyze || state is ScamShieldUiState.Checking) return
        val shot = screenshot
        // Static first: a text-only message (no link anywhere in it, no screenshot) that matches an official scenario with HIGH
        // confidence is answered from the bundled dataset — no request, no model, no quota, and the text never leaves the phone.
        if (shot == null && messageUrl.isBlank() && !ScenarioMatcher.containsLink(message)) {
            val known = ScenarioMatcher.match(message)
            if (known != null && known.confidence == ScenarioConfidence.High) {
                val scenario = knowledge.allScenarios().firstOrNull { it.id == known.scenarioId }
                if (scenario != null) {
                    inFlight?.cancel(); inFlight = null
                    state = ScamShieldUiState.KnownScenario(scenario, known)
                    return
                }
            }
        }
        // Anything that goes to the server's message analysis may reach the AI model: ask first, once. A bare link is only a link
        // check (no model), so it is not asked.
        val linkOnly = shot == null && messageUrl.isBlank() && message.isNotBlank() && message.trim().none { it.isWhitespace() } && ScenarioMatcher.containsLink(message)
        val linkFieldOnly = shot == null && message.isBlank() && messageUrl.isNotBlank()
        if (!aiConsented && !linkOnly && !linkFieldOnly) { askAiConsent = true; return }
        run {
            when (val o = repository.analyzeMessage(message.trim(), messageUrl.trim(), shot?.bytes, shot?.mimeType, preferVietnameseLabels = vietnamese())) {
                is MessageAnalysisOutcome.Verdict -> { trackScamCheck("message", o.result.level); ScamShieldUiState.MessageResult(o.result) }
                is MessageAnalysisOutcome.Failed -> ScamShieldUiState.Failed(o.failure)
            }
        }
    }

    /**
     * scam_check (RUNBOOK §3.19). The verdict enum only — never the checked URL,
     * message text, QR contents or any number extracted from them.
     */
    private fun trackScamCheck(checkType: String, level: RiskLevel) {
        analytics.track("scam_check", mapOf("check_type" to checkType, "risk_level" to level.name))
    }

    private fun run(call: suspend () -> ScamShieldUiState) {
        // Replace any earlier check rather than racing it: an older response arriving late must not
        // overwrite the verdict for the input now on screen.
        inFlight?.cancel()
        state = ScamShieldUiState.Checking
        inFlight = viewModelScope.launch { state = call() }
    }

    private suspend fun readImage(uri: Uri): Pair<ByteArray?, String> = withContext(Dispatchers.IO) {
        val type = appContext.contentResolver.getType(uri) ?: "image/jpeg"
        val data = runCatching { appContext.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
        data to type
    }

    // Read at call time, never cached — the user can change language between checks, and
    // AppLanguageResolver is the same authority the outgoing Accept-Language header uses.
    private fun vietnamese() = AppLanguageResolver.currentTag() == AppLanguage.Vietnamese.tag

    fun reset() {
        inFlight?.cancel()
        inFlight = null
        state = ScamShieldUiState.Idle
    }

    data class Screenshot(val bytes: ByteArray, val mimeType: String, val name: String)

    companion object {
        /** `QR_MAX_SIZE_BYTES` on the route. */
        const val QR_MAX_BYTES = 5 * 1024 * 1024
        /** The web's `HISTORY_PREVIEW`. */
        const val HISTORY_PREVIEW = 5
        /** `lib/scam-shield/message/config.ts`. */
        const val MESSAGE_MAX_CHARS = 4_000
        const val SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024
        val SCREENSHOT_ALLOWED_MIME = listOf("image/jpeg", "image/png", "image/webp")
        /** The knowledge section's `PREVIEW`. */
        const val KNOWLEDGE_PREVIEW = 6
        /** `lib/config/product.ts`: the shared Tappy AI question pool the quota hint names. */
        const val ANON_LIFETIME_LIMIT = 5
        const val FREE_DAILY_LIMIT = 15
    }
}

sealed interface ScamShieldUiState {
    data object Idle : ScamShieldUiState
    data object Checking : ScamShieldUiState
    data class Result(val result: ScamCheckResult) : ScamShieldUiState
    data class MessageResult(val result: MessageAnalysis) : ScamShieldUiState
    /** A message that matches an official scenario with high confidence, answered ON THE DEVICE (no request, no AI). */
    data class KnownScenario(val scenario: ScamScenario, val match: ScenarioMatch) : ScamShieldUiState
    /** A QR code that is not a web link: named and warned about, never acted on. Nothing was sent anywhere. */
    data class QrNotice(val payload: QrPayload.Other) : ScamShieldUiState
    data class Failed(val failure: ScamCheckFailure) : ScamShieldUiState
}
