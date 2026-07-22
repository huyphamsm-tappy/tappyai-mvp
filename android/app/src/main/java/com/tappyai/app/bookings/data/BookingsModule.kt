package com.tappyai.app.bookings.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Bookings. [BookingsApi] is created from the shared singleton [Retrofit]
 * (core:network); [BookingsRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object BookingsNetworkModule {

    @Provides
    @Singleton
    fun provideBookingsApi(retrofit: Retrofit): BookingsApi = retrofit.create(BookingsApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class BookingsBindModule {

    @Binds
    @Singleton
    abstract fun bindBookingsRepository(impl: RealBookingsRepository): BookingsRepository
}
