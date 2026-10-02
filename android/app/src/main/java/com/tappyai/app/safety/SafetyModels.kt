package com.tappyai.app.safety

import com.tappyai.app.R
import com.tappyai.app.reviews.data.Review
import com.tappyai.app.reviews.data.ReviewComment

/** What the server says it supports (`/api/config` → `p8`). Closed until it says otherwise. */
data class SafetyFlags(val reports: Boolean = false, val userBlocks: Boolean = false) {
    companion object {
        val Closed = SafetyFlags()
        fun from(p8: P8SafetyDto?): SafetyFlags = SafetyFlags(reports = p8?.reports == true, userBlocks = p8?.userBlocks == true)
    }
}

/** The six reasons the person can pick. Order is the order on screen. */
enum class ReportReason(val labelRes: Int) {
    Spam(R.string.safety_reason_spam),
    Harassment(R.string.safety_reason_harassment),
    Sensitive(R.string.safety_reason_sensitive),
    Scam(R.string.safety_reason_scam),
    Copyright(R.string.safety_reason_copyright),
    Other(R.string.safety_reason_other),
}

/**
 * The wire value `POST /api/reviews/{id}/report` accepts (`src/lib/reviews/reportReasons.ts`:
 * spam · harassment · inappropriate · copyright · misinformation · violence · other). The server
 * has no "scam" reason, so a scam report is filed as `misinformation` — the closest accepted
 * value. The person still sees "Lừa đảo".
 */
fun ReportReason.reviewWire(): String = when (this) {
    ReportReason.Spam -> "spam"
    ReportReason.Harassment -> "harassment"
    ReportReason.Sensitive -> "inappropriate"
    ReportReason.Scam -> "misinformation"
    ReportReason.Copyright -> "copyright"
    ReportReason.Other -> "other"
}

/**
 * The wire value the comment / user report routes accept (web contract §4: spam · harassment · inappropriate · copyright ·
 * misinformation · violence · other, plus the native scam · sensitive · hate · sexual · self_harm · impersonation).
 */
fun ReportReason.reportsWire(): String = when (this) {
    ReportReason.Spam -> "spam"
    ReportReason.Harassment -> "harassment"
    ReportReason.Sensitive -> "sexual"
    ReportReason.Scam -> "scam"
    ReportReason.Copyright -> "copyright"
    ReportReason.Other -> "other"
}

/** What a report is about: a post/clip (own route), a comment or a user (own routes, one each). */
enum class ReportTarget(val wire: String) { Review("review"), Comment("comment"), User("user") }

/** The result of one report call, as far as the screen needs to tell the person. */
sealed interface ReportOutcome {
    /** Filed (or already filed by this person): the content may leave their feed. */
    data object Sent : ReportOutcome
    /** The post no longer exists: nothing to report, nothing to show. */
    data object Gone : ReportOutcome
    /** Needs a signed-in (non-guest) account. */
    data object SignIn : ReportOutcome
    /** Not filed — no connection, rate limit, or a server error. NEVER reported as sent. */
    data object Failed : ReportOutcome
}

fun reportOutcomeFor(status: Int): ReportOutcome = when (status) {
    in 200..299 -> ReportOutcome.Sent
    401, 403 -> ReportOutcome.SignIn
    404 -> ReportOutcome.Gone
    else -> ReportOutcome.Failed
}

/** The words shown after an outcome. Sent/Gone close the dialog; the others keep it open. */
fun ReportOutcome.messageRes(): Int = when (this) {
    ReportOutcome.Sent -> R.string.safety_report_sent
    ReportOutcome.Gone -> R.string.safety_report_gone
    ReportOutcome.SignIn -> R.string.safety_report_sign_in
    ReportOutcome.Failed -> R.string.safety_report_failed
}

/** Whether the post may leave the reporter's own feed: only once the server accepted the report (or the post is gone). */
fun ReportOutcome.removesFromFeed(): Boolean = this == ReportOutcome.Sent || this == ReportOutcome.Gone

/**
 * Posts the viewer should not see: authored by someone they blocked, or that they already
 * reported. The viewer's own posts are never filtered (they cannot report or block themselves).
 */
fun List<Review>.withoutHidden(blocked: Set<String>, reported: Set<String>, me: String?): List<Review> =
    if (blocked.isEmpty() && reported.isEmpty()) this
    else filterNot { it.userId != me && (it.userId in blocked || it.id in reported) }

fun List<ReviewComment>.withoutBlocked(blocked: Set<String>, me: String?): List<ReviewComment> =
    if (blocked.isEmpty()) this else filterNot { it.userId != me && it.userId in blocked }

/** Support address shown wherever a violation can be reported. */
const val SAFETY_CONTACT_EMAIL = "support@tappyai.com"

/** Bumped when the community rules the person agreed to change in substance. */
const val UGC_TERMS_VERSION = 1
