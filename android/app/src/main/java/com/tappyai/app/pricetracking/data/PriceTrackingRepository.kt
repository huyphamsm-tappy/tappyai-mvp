package com.tappyai.app.pricetracking.data

import com.tappyai.app.pricetracking.PriceWatch
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the price-watch backend. The ViewModel depends on this and domain [PriceWatch]
 * only — never on Retrofit/OkHttp or the DTOs.
 */
interface PriceTrackingRepository {

    /** The current user's non-cancelled price watches, or a typed error (incl. 401 → session expired). */
    suspend fun getWatches(): NetworkResult<List<PriceWatch>>

    /** Cancels a watch by id. Returns Unit on success (the endpoint returns only `{ok:true}`). */
    suspend fun deleteWatch(id: String): NetworkResult<Unit>
}
