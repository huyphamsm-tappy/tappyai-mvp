package com.tappyai.app.deals.data

import com.tappyai.app.deals.Deal
import com.tappyai.core.network.NetworkResult

/** Abstraction over the deals backend. The ViewModel depends on this and the domain [Deal]
 *  only — never on Retrofit/OkHttp or the DTO. */
interface DealsRepository {
    /** The current daily-rotating deal pool (same for every user, reshuffled once per day
     *  server-side — see `getShopeeDeals()`). */
    suspend fun getDeals(): NetworkResult<List<Deal>>
}
