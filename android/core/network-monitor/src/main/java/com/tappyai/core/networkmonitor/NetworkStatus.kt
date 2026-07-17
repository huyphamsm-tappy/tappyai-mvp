package com.tappyai.core.networkmonitor

/** Mirrors `ConnectivityManager.NetworkCallback`'s lifecycle rather than collapsing it to a
 *  Boolean — [Losing] specifically lets a consumer (e.g. a future realtime chat connection)
 *  react before the connection actually drops, not just after. */
sealed interface NetworkStatus {
    data object Online : NetworkStatus
    data object Offline : NetworkStatus
    data object Losing : NetworkStatus
    data object Lost : NetworkStatus
}
