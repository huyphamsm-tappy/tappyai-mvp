package com.tappyai.app.analytics

import com.tappyai.app.analytics.data.TrackApi
import com.tappyai.core.analytics.AnalyticsProvider
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** Builds [TrackApi] from the shared singleton [Retrofit] (core:network), same convention as every
 *  other feature Api. */
@Module
@InstallIn(SingletonComponent::class)
object AnalyticsApiModule {
    @Provides
    @Singleton
    fun provideTrackApi(retrofit: Retrofit): TrackApi = retrofit.create(TrackApi::class.java)
}

/** Binds the real, network-backed [AnalyticsProvider] (replaces core:analytics' log-only default). */
@Module
@InstallIn(SingletonComponent::class)
abstract class AnalyticsBindModule {
    @Binds
    @Singleton
    abstract fun bindAnalyticsProvider(impl: NetworkAnalyticsProvider): AnalyticsProvider
}
