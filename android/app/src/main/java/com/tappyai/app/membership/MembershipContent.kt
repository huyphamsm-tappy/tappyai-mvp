package com.tappyai.app.membership

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tappyai.app.R

/** A single FAQ entry — kept as data so [MembershipScreen] renders the list instead of
 *  hardcoding each block in the Composable. Mirrors the web `/subscription` FAQ. */
data class MembershipFaq(val question: String, val answer: String)

/**
 * Static UI content for the Membership screen — mirrors the web `/subscription` page. This is
 * product **copy** (plan names, prices, feature lists, FAQ), NOT business/user data: no
 * subscription status, no payment history, no message counts. Prices are the real product prices
 * (VND) kept verbatim as plain data (not localized text) — a product fact, not fabricated data.
 * Feature lists and FAQ text are localized via string resources (pattern mirrors
 * [com.tappyai.app.chat.ChatCategory]): a list of `@StringRes` ids resolved by a `@Composable`
 * function, so the screen re-renders in the user's selected app language.
 *
 * NOTE (web parity 2026-07-11): the Pro upsell is HIDDEN app-wide during the free test phase
 * (web `SHOW_PRO_UPGRADE = false` — no legal entity for payments yet). This screen is kept but
 * unreachable (see [com.tappyai.app.profile.ProfileScreen] gating), same as web keeps
 * `/subscription` unlinked. Re-enable both together when Pro launches.
 */
object MembershipContent {
    const val FREE_PRICE = "0₫"
    const val PRO_PRICE = "99K"

    // Web parity 2026-07-11: free tier is 15/day (server FREE_DAILY_LIMIT = 15, raised from 10 in
    // web commit 66aedb8). Keep in sync with /api/chat.
    private val freeFeatureResIds = listOf(
        R.string.membership_free_feature_messages,
        R.string.membership_free_feature_search,
        R.string.membership_free_feature_history,
    )

    @Composable
    fun freeFeatures(): List<String> = freeFeatureResIds.map { stringResource(it) }

    private val proFeatureResIds = listOf(
        R.string.membership_pro_feature_messages,
        R.string.membership_pro_feature_search,
        R.string.membership_pro_feature_history,
        R.string.membership_pro_feature_voice,
        R.string.membership_pro_feature_memory,
        R.string.membership_pro_feature_priority,
    )

    @Composable
    fun proFeatures(): List<String> = proFeatureResIds.map { stringResource(it) }

    private data class FaqResIds(@StringRes val questionRes: Int, @StringRes val answerRes: Int)

    private val faqResIds = listOf(
        FaqResIds(R.string.membership_faq_payment_q, R.string.membership_faq_payment_a),
        FaqResIds(R.string.membership_faq_cancel_q, R.string.membership_faq_cancel_a),
        FaqResIds(R.string.membership_faq_reset_q, R.string.membership_faq_reset_a),
    )

    @Composable
    fun faqs(): List<MembershipFaq> = faqResIds.map { ids ->
        MembershipFaq(stringResource(ids.questionRes), stringResource(ids.answerRes))
    }
}
