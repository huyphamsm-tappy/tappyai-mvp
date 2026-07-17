package com.tappyai.app.preferences.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Preferences. [PreferencesApi] is created from the shared singleton [Retrofit]
 * (core:network); [PreferencesRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object PreferencesNetworkModule {

    @Provides
    @Singleton
    fun providePreferencesApi(retrofit: Retrofit): PreferencesApi =
        retrofit.create(PreferencesApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class PreferencesBindModule {

    @Binds
    @Singleton
    abstract fun bindPreferencesRepository(impl: RealPreferencesRepository): PreferencesRepository
}
