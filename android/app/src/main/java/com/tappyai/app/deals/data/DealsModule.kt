package com.tappyai.app.deals.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** DI wiring for Deals. [DealsApi] is created from the shared singleton [Retrofit]
 *  (core:network); [DealsRepository] binds to the real backend impl. */
@Module
@InstallIn(SingletonComponent::class)
object DealsNetworkModule {

    @Provides
    @Singleton
    fun provideDealsApi(retrofit: Retrofit): DealsApi = retrofit.create(DealsApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class DealsBindModule {

    @Binds
    @Singleton
    abstract fun bindDealsRepository(impl: RealDealsRepository): DealsRepository
}
