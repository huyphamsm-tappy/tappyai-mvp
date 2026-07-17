package com.tappyai.app.currency.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Currency. [RatesApi] is created from the shared singleton [Retrofit]
 * (core:network); [RatesRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object CurrencyNetworkModule {

    @Provides
    @Singleton
    fun provideRatesApi(retrofit: Retrofit): RatesApi = retrofit.create(RatesApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class CurrencyBindModule {

    @Binds
    @Singleton
    abstract fun bindRatesRepository(impl: RealRatesRepository): RatesRepository
}
