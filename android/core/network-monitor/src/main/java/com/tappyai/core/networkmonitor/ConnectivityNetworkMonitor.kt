package com.tappyai.core.networkmonitor

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject

/**
 * Default [NetworkMonitor] over `ConnectivityManager.registerDefaultNetworkCallback`.
 * `registerDefaultNetworkCallback` never invokes `onUnavailable()` (that callback only fires
 * for time-limited `requestNetwork` calls), so the flow seeds itself with a synchronous
 * [currentStatus] read before registering the callback — otherwise a collector would see
 * nothing until the *next* connectivity change instead of the current state. Bound
 * `@Singleton` in [NetworkMonitorModule] — important here specifically, since a second
 * instance would register a second, redundant `NetworkCallback`.
 */
class ConnectivityNetworkMonitor @Inject constructor(
    @ApplicationContext context: Context,
) : NetworkMonitor {
    private val connectivityManager =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override val status: Flow<NetworkStatus> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(NetworkStatus.Online)
            }

            override fun onLosing(network: Network, maxMsToLive: Int) {
                trySend(NetworkStatus.Losing)
            }

            override fun onLost(network: Network) {
                trySend(NetworkStatus.Lost)
            }

            override fun onUnavailable() {
                trySend(NetworkStatus.Offline)
            }
        }

        trySend(currentStatus())
        connectivityManager.registerDefaultNetworkCallback(callback)

        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()

    private fun currentStatus(): NetworkStatus {
        val network = connectivityManager.activeNetwork ?: return NetworkStatus.Offline
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return NetworkStatus.Offline
        return if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            NetworkStatus.Online
        } else {
            NetworkStatus.Offline
        }
    }
}
