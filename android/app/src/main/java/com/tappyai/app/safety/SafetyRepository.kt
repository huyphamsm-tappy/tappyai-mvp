package com.tappyai.app.safety

import android.content.Context
import com.tappyai.features.auth.data.AuthRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

/** What survives a restart: the posts this device already reported, and which rules the person agreed to. */
interface SafetyPrefs {
    /** Oldest first. */
    fun reported(): List<String>
    fun putReported(ids: List<String>)
    fun termsVersion(): Int
    fun putTermsVersion(version: Int)
}

/** Who is signed in. A guest or anonymous session cannot report or block. */
interface SafetySession {
    fun userId(): String?
    fun isAnonymous(): Boolean
}

@Singleton
class AndroidSafetyPrefs @Inject constructor(@ApplicationContext context: Context) : SafetyPrefs {
    private val prefs = context.getSharedPreferences("tappy_safety", Context.MODE_PRIVATE)
    override fun reported(): List<String> =
        prefs.getString(KEY_REPORTED, "").orEmpty().split(',').filter { it.isNotBlank() }
    override fun putReported(ids: List<String>) {
        prefs.edit().putString(KEY_REPORTED, ids.joinToString(",")).apply()
    }
    override fun termsVersion(): Int = prefs.getInt(KEY_TERMS, 0)
    override fun putTermsVersion(version: Int) {
        prefs.edit().putInt(KEY_TERMS, version).apply()
    }
    private companion object {
        const val KEY_REPORTED = "reported_review_ids"
        const val KEY_TERMS = "ugc_terms_version"
    }
}

@Singleton
class AuthSafetySession @Inject constructor(private val auth: AuthRepository) : SafetySession {
    override fun userId(): String? = auth.currentUserId()
    override fun isAnonymous(): Boolean = auth.isAnonymous()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SafetyBindingsModule {
    @Binds abstract fun bindPrefs(impl: AndroidSafetyPrefs): SafetyPrefs
    @Binds abstract fun bindSession(impl: AuthSafetySession): SafetySession
}

/**
 * The one place that talks to the reporting and blocking routes, and the one source of truth for
 * what the app hides: [blockedIds] (people the viewer blocked, from the server) and [reportedIds]
 * (posts this device reported, kept locally so a reported post stays gone after a restart).
 *
 * 🔑 FAIL-CLOSED on the server's say-so: [flags] stays [SafetyFlags.Closed] until `/api/config`
 * answers with `p8`. While closed, no report-user / block call is ever made — those routes are
 * Phase 8 and answer 404 on production today ([SafetyApi]).
 *
 * 🔑 A report counts only when the server accepted it. A network failure, a rate limit or a server
 * error is [ReportOutcome.Failed]: the post stays in the feed and the person is told it was not sent.
 */
@Singleton
class SafetyRepository @Inject constructor(
    private val api: SafetyApi,
    private val prefs: SafetyPrefs,
    private val session: SafetySession,
) {
    private val _flags = MutableStateFlow(SafetyFlags.Closed)
    val flags: StateFlow<SafetyFlags> = _flags.asStateFlow()

    private val _blocked = MutableStateFlow<Set<String>>(emptySet())
    val blockedIds: StateFlow<Set<String>> = _blocked.asStateFlow()

    private val _reported = MutableStateFlow(prefs.reported().toSet())
    val reportedIds: StateFlow<Set<String>> = _reported.asStateFlow()

    /** The signed-in account's id, or null for a signed-out visitor. */
    val me: String? get() = session.userId()

    private val canAct: Boolean get() = session.userId() != null && !session.isAnonymous()

    /** Re-reads the server's flags (a failure keeps the last known values, initially closed) and the block list. */
    suspend fun refresh() {
        try {
            _flags.value = SafetyFlags.from(api.config().p8)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Keep the last known flags: an outage must neither open nor close the controls.
        }
        syncBlocks()
    }

    /** Loads the block list when the server supports blocking and someone is signed in; clears it otherwise. */
    suspend fun syncBlocks() {
        if (!canAct || !_flags.value.userBlocks) {
            _blocked.value = emptySet()
            return
        }
        try {
            _blocked.value = api.blocks().blocks.map { it.blockedId }.toSet()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Keep what is shown; the next refresh retries.
        }
    }

    /** Reports a post or a clip — the production route, no flag needed. */
    suspend fun reportReview(reviewId: String, reason: ReportReason): ReportOutcome {
        val outcome = call { api.reportReview(reviewId, ReviewReportBodyDto(reason.reviewWire())) }
        if (outcome.removesFromFeed()) markReported(reviewId)
        return outcome
    }

    /** Reports a comment or a user — Phase 8 `POST /api/reports`, only when the server says it has it. */
    suspend fun report(target: ReportTarget, targetId: String, reason: ReportReason): ReportOutcome {
        if (target == ReportTarget.Review) return reportReview(targetId, reason)
        if (!_flags.value.reports) return ReportOutcome.Failed
        return call {
            api.report(ReportBodyDto(target.wire, targetId, reason.reportsWire(), reason.reportDetails()))
        }
    }

    /** True when the block took effect on the server. Never called unless the server supports blocking. */
    suspend fun block(userId: String): Boolean {
        if (!_flags.value.userBlocks || !canAct || userId == session.userId()) return false
        return if (succeeded { api.block(userId) }) { _blocked.update { it + userId }; true } else false
    }

    suspend fun unblock(userId: String): Boolean {
        if (!_flags.value.userBlocks || !canAct) return false
        return if (succeeded { api.unblock(userId) }) { _blocked.update { it - userId }; true } else false
    }

    /** Whether the person agreed to the community rules (this version) before posting. */
    val termsAccepted: Boolean get() = prefs.termsVersion() >= UGC_TERMS_VERSION

    fun acceptTerms() = prefs.putTermsVersion(UGC_TERMS_VERSION)

    private fun markReported(reviewId: String) {
        val next = (prefs.reported().filterNot { it == reviewId } + reviewId).takeLast(MAX_REPORTED)
        prefs.putReported(next)
        _reported.value = next.toSet()
    }

    private suspend fun call(block: suspend () -> Response<ReportAckDto>): ReportOutcome =
        try {
            reportOutcomeFor(block().code())
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            ReportOutcome.Failed
        }

    private suspend fun succeeded(block: suspend () -> Response<ReportAckDto>): Boolean =
        try {
            block().isSuccessful
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            false
        }

    private companion object {
        const val MAX_REPORTED = 500
    }
}
