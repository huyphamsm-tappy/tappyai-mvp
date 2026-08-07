package com.tappyai.app.scamshield.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Scam Shield, following [com.tappyai.app.scan.data.ScanNetworkModule]: the API is
 * created from the shared singleton [Retrofit] (core:network), the repository binds to the real
 * backend impl. Two modules because @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object ScamShieldNetworkModule {

    @Provides
    @Singleton
    fun provideScamShieldApi(retrofit: Retrofit): ScamShieldApi =
        retrofit.create(ScamShieldApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ScamShieldBindModule {

    @Binds
    @Singleton
    abstract fun bindScamShieldRepository(impl: RealScamShieldRepository): ScamShieldRepository
}
