package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import com.tappyai.core.network.NetworkResult

/** Abstraction over the deals backend. The ViewModel depends on this and the domain [Deal]
 *  only — never on Retrofit/OkHttp or the DTO. */
interface DealsRepository {
    /** The current active partner-deal pool (admin-managed `partner_deals`, filtered + ordered
     *  server-side). */
    suspend fun getDeals(): NetworkResult<List<Deal>>

    /** Records a click on [dealId] (popularity counter). Best-effort: never surfaces failures. */
    suspend fun recordClick(dealId: String)
}
