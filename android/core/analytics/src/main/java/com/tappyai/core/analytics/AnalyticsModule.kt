package com.tappyai.core.analytics

import android.content.Context
import com.google.firebase.analytics.FirebaseAnalytics
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Binds [AnalyticsProvider] to the composite that logs every event AND mirrors the
 * closed GA4 taxonomy to Firebase Analytics. The Firebase SDK instance is provided
 * from the application context; the google-services plugin (applied in the app
 * module) supplies its configuration from `app/google-services.json`.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class AnalyticsModule {
    @Binds
    @Singleton
    abstract fun bindAnalyticsProvider(impl: CompositeAnalyticsProvider): AnalyticsProvider

    companion object {
        @Provides
        @Singleton
        fun provideFirebaseAnalytics(@ApplicationContext context: Context): FirebaseAnalytics =
            FirebaseAnalytics.getInstance(context)
    }
}
