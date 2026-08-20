package com.tappyai.app.di

import com.tappyai.app.BuildConfig
import com.tappyai.app.language.AppLanguageResolver
import com.tappyai.core.network.AppLanguageProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Named
import javax.inject.Singleton

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

    /**
     * The second thing `:app` hands down to `core:network`, alongside the base URL, and for the
     * same reason: the network layer needs an answer that only `:app` has.
     *
     * A lambda over [AppLanguageResolver.currentTag], NOT a captured value — the tag has to be
     * read at request time so switching language in Settings changes the very next request rather
     * than the next process start.
     *
     * 🚨 It resolves through [AppLanguageResolver] and NOT through `LanguageManager`, which would
     * be the obvious choice and produces a Dagger dependency cycle:
     * OkHttpClient → AppLanguageInterceptor → AppLanguageProvider → LanguageManager →
     * AccountRepository → AccountApi → Retrofit → OkHttpClient. `LanguageManager` needs the
     * repository only to sync the choice to the backend, which reading the current value does not.
     */
    @Provides
    @Singleton
    fun provideAppLanguageProvider(): AppLanguageProvider =
        AppLanguageProvider { AppLanguageResolver.currentTag() }
}
