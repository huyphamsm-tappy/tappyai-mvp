package com.tappyai.app.scan.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Scan. [ScanApi] is created from the shared singleton [Retrofit] (core:network);
 * [ScanRepository] binds to the real backend impl. Two modules because @Provides needs an object
 * and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object ScanNetworkModule {

    @Provides
    @Singleton
    fun provideScanApi(retrofit: Retrofit): ScanApi = retrofit.create(ScanApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ScanBindModule {

    @Binds
    @Singleton
    abstract fun bindScanRepository(impl: RealScanRepository): ScanRepository
}
