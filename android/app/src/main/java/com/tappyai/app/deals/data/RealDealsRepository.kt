package com.tappyai.app.deals.data

import androidx.appcompat.app.AppCompatDelegate
import com.tappyai.app.deals.Deal
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/** Backend-backed [DealsRepository]. Goes through core:network's [safeApiCall] for uniform
 *  error mapping, same as every other feature's Real*Repository. */
@Singleton
class RealDealsRepository @Inject constructor(
    private val api: DealsApi,
) : DealsRepository {

    override suspend fun getDeals(): NetworkResult<List<Deal>> =
        safeApiCall { api.getDeals(currentLang()).deals.map { it.toDomain() } }

    /** The app's active UI language tag (same source [com.tappyai.app.language.LanguageManager]
     *  resolves from): the AppCompat per-app locale, or the system locale when the user hasn't
     *  chosen one. Sent to the backend so deals localize to the in-app language, re-resolved on
     *  each fetch so a language switch (which recreates the screen) reloads in the new language. */
    private fun currentLang(): String =
        AppCompatDelegate.getApplicationLocales().get(0)?.language?.takeIf { it.isNotBlank() }
            ?: Locale.getDefault().language.ifBlank { "vi" }

    // Intentionally result-ignoring (no safeApiCall): the counter is best-effort and must never
    // surface to the UI or block the link, matching the web's `.catch(() => {})`.
    override suspend fun recordClick(dealId: String) {
        runCatching { api.postDealClick(dealId) }
    }
}
