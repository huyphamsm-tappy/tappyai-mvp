package com.tappyai.core.network

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

/**
 * Provides the shared Retrofit/OkHttp client. No concrete `@GET`/`@POST` API service
 * interfaces are defined here — that's business logic, out of Phase 1A's scope. Feature
 * modules call `retrofit.create(XxxApi::class.java)` against this shared instance once they
 * define their own endpoints.
 *
 * `@Named("baseUrl")` and `@Named("isDebug")` are supplied by `:app`'s own Hilt module, since
 * only the app module has `BuildConfig` — this module stays ignorant of build variants.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        // The Postgres/PostgREST backend emits an explicit JSON `null` (never omits the key) for any
        // nullable column with no value — e.g. `reviews.rating` on a photo/video review, or a legacy
        // `favorites.place_address`. Without coercion, decoding that `null` into a non-nullable
        // Kotlin field (even one with a default like `rating: Int = 0`) throws SerializationException
        // and fails the ENTIRE list decode, not just that row — turning one ratingless review into a
        // blank/errored feed. coerceInputValues falls back to the field's default in exactly that
        // case (and for unknown enum values), which is the correct, crash-proof behavior here.
        coerceInputValues = true
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        @Named("isDebug") isDebug: Boolean,
    ): OkHttpClient {
        // BODY-level logging prints every request/response header, which would otherwise
        // print the `Authorization: Bearer <token>` AuthInterceptor just added in plaintext
        // to Logcat on every debug-build request — redactHeader masks the value while still
        // showing the header exists. Gate review finding: token exposed via logs (High).
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            redactHeader("Authorization")
            level = if (isDebug) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .authenticator(tokenAuthenticator)
            // Explicit rather than relying on OkHttp's undocumented-in-this-codebase implicit
            // defaults — connect budgets less time than read/write since a stalled TCP
            // handshake should fail fast, while a slow mobile network mid-response shouldn't.
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        json: Json,
        @Named("baseUrl") baseUrl: String,
    ): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }
}
