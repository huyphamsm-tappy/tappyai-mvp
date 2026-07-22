package com.tappyai.core.networkmonitor

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Binds [NetworkMonitor] to its default implementation. */
@Module
@InstallIn(SingletonComponent::class)
abstract class NetworkMonitorModule {
    @Binds
    @Singleton
    abstract fun bindNetworkMonitor(impl: ConnectivityNetworkMonitor): NetworkMonitor
}
