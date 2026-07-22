package com.tappyai.core.networkmonitor

import kotlinx.coroutines.flow.Flow

/** The single connectivity seam for the whole app. Future realtime features (AI Chat
 *  streaming, live updates) and the offline-first repository strategy both observe [status]
 *  rather than querying `ConnectivityManager` themselves. */
interface NetworkMonitor {
    val status: Flow<NetworkStatus>
}
