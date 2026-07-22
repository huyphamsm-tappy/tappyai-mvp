package com.tappyai.app.pricetracking.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Price Tracking. [PriceTrackingApi] is created from the shared singleton [Retrofit]
 * (core:network); [PriceTrackingRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object PriceTrackingNetworkModule {

    @Provides
    @Singleton
    fun providePriceTrackingApi(retrofit: Retrofit): PriceTrackingApi =
        retrofit.create(PriceTrackingApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class PriceTrackingBindModule {

    @Binds
    @Singleton
    abstract fun bindPriceTrackingRepository(impl: RealPriceTrackingRepository): PriceTrackingRepository
}
