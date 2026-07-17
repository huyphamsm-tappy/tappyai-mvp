package com.tappyai.app.currency.data

import com.tappyai.app.currency.Rates
import com.tappyai.core.network.NetworkResult

/** Abstraction over the exchange-rates backend. The ViewModel depends on this and the domain
 *  [Rates] only — never on Retrofit/OkHttp or the DTO. All rate sourcing (live fetch + the
 *  server's own fallback table) is entirely server-side; this only transports and maps. */
interface RatesRepository {

    /** The current USD-based rate table, or a typed error (e.g. no connectivity to our own
     *  backend — distinct from [Rates.fallback], which is the *backend's* upstream failing). */
    suspend fun getRates(): NetworkResult<Rates>
}
