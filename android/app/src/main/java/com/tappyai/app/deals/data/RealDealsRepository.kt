package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import com.tappyai.app.language.LanguageManager
import com.tappyai.core.network.NetworkResult
import com.tappyai.core.network.safeApiCall
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
     * The resolution itself moved to [LanguageManager.currentLanguageTag] — it used to be spelled
     * out here, and the next endpoint that needed the same answer (`POST /api/reviews`, for the
     * author-facing safety notice) did not know to look in the Deals repository and shipped
     * without it. This stays as a named function because the explicit `?lang=` is part of the
     * Deals endpoint's contract and worth reading at the call site.
     */
    private fun languageTag(): String = languageManager.currentLanguageTag()

    override suspend fun getDeals(): NetworkResult<List<Deal>> =
        safeApiCall { api.getDeals(languageTag()).deals.map { it.toDomain() } }
}
