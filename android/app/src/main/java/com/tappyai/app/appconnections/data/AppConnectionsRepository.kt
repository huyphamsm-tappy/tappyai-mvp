package com.tappyai.app.appconnections.data

import com.tappyai.core.network.NetworkResult

interface AppConnectionsRepository {
    /** Reads GET /api/integrations and returns the set of provider ids the user has connected
     *  (e.g. "google_calendar", "zalo"). Errors (incl. 401 when signed out) surface as a typed
     *  error so the screen shows every provider as not-connected. Connecting is not available on
     *  Android (mobile OAuth is backend-blocked) — this is a read-only status. */
    suspend fun getConnectedProviders(): NetworkResult<Set<String>>
}
