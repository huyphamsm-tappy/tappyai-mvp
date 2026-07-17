package com.tappyai.app.showcase

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tappyai.core.analytics.AnalyticsProvider
import com.tappyai.core.featureflags.FeatureFlagProvider
import com.tappyai.core.logging.LoggerProvider
import com.tappyai.core.networkmonitor.NetworkMonitor
import com.tappyai.core.networkmonitor.NetworkStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/**
 * Phase 1A verification aid — proves the Hilt graph for the four Phase 0.5 provider
 * interfaces (`LoggerProvider`, `AnalyticsProvider`, `FeatureFlagProvider`, `NetworkMonitor`)
 * resolves correctly end-to-end via constructor injection. Not a product feature; replaces
 * the manual provider construction `DiagnosticsSection` used before Hilt existed.
 */
@HiltViewModel
class DiagnosticsViewModel @Inject constructor(
    val logger: LoggerProvider,
    val analytics: AnalyticsProvider,
    val featureFlags: FeatureFlagProvider,
    networkMonitor: NetworkMonitor,
) : ViewModel() {
    val networkStatus: StateFlow<NetworkStatus> = networkMonitor.status
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NetworkStatus.Offline)
}
