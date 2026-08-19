package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import com.tappyai.app.language.AppLanguage
import com.tappyai.app.language.LanguageManager
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
    private val languageManager: LanguageManager,
) : DealsRepository {

    /**
     * The language the UI is ACTUALLY rendering in, read at call time.
     *
     * `current` is null until the user picks a language explicitly, and AppCompat then falls back
     * to the system locale — so null must resolve the same way, or a device set to English with no
     * explicit choice would get English chrome around Vietnamese data. Reading it per call (rather
     * than injecting it once) means switching language in Settings takes effect on the next load
     * instead of the next process start.
     */
    private fun languageTag(): String =
        (languageManager.current
            ?: AppLanguage.fromTag(Locale.getDefault().language)
            ?: AppLanguage.Vietnamese).tag

    override suspend fun getDeals(): NetworkResult<List<Deal>> =
        safeApiCall { api.getDeals(languageTag()).deals.map { it.toDomain() } }
}
