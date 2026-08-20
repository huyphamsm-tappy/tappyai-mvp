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
        appLanguageInterceptor: AppLanguageInterceptor,
        tokenAuthenticator: TokenAuthenticator,
        @Named("isDebug") isDebug: Boolean,
    ): OkHttpClient {
        // HEADERS, never BODY. At BODY level the interceptor reads the ENTIRE response body
        // before handing it back, so a STREAMING endpoint delivers nothing until it closes.
        // `/api/chat` streams the reply token-by-token, so a debug build showed an empty bubble
        // for the whole reply and then everything at once — and tapping Stop mid-reply parsed an
        // EMPTY buffer, silently losing an itinerary the server had already sent (Planner Stop
        // bug). Release builds were never affected: isDebug=false already selects NONE.
        //
        // HEADERS still covers the original security finding this block was written for: the
        // `Authorization: Bearer <token>` header AuthInterceptor adds is logged as present but
        // redacted, never in plaintext. Gate review finding: token exposed via logs (High).
        //
        // Guarded by StreamingNotBufferedByLoggingTest.
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            redactHeader("Authorization")
            level = if (isDebug) HttpLoggingInterceptor.Level.HEADERS else HttpLoggingInterceptor.Level.NONE
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            // Before the logging interceptor, so a debug log shows the header the server will
            // actually receive rather than the request as it looked one step earlier.
            .addInterceptor(appLanguageInterceptor)
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
