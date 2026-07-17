package com.tappyai.app.di

import com.tappyai.app.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named

/**
 * The one place `BuildConfig` (per-variant `API_BASE_URL`/`DEBUG`, set in `:app`'s
 * `build.gradle.kts`) crosses into the Hilt graph — `core:network`'s `NetworkModule` consumes
 * these qualifiers without ever referencing `:app`'s `BuildConfig` directly, keeping the
 * dependency direction the same way `core:*` never depends on `:app` anywhere else.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Named("baseUrl")
    fun provideBaseUrl(): String = BuildConfig.API_BASE_URL

    @Provides
    @Named("isDebug")
    fun provideIsDebug(): Boolean = BuildConfig.DEBUG

    @Provides
    @Named("supabaseUrl")
    fun provideSupabaseUrl(): String = BuildConfig.SUPABASE_URL

    @Provides
    @Named("supabaseAnonKey")
    fun provideSupabaseAnonKey(): String = BuildConfig.SUPABASE_ANON_KEY

    @Provides
    @Named("googleWebClientId")
    fun provideGoogleWebClientId(): String = BuildConfig.GOOGLE_WEB_CLIENT_ID
}
