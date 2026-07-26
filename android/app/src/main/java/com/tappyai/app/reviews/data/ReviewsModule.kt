package com.tappyai.app.reviews.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

/**
 * DI wiring for Reviews. [ReviewsApi] is created from the shared singleton [Retrofit] provided by
 * core:network (so it inherits the auth interceptor + JSON converter); [ReviewsRepository] binds
 * to the real backend implementation. Two modules because @Provides needs an object and @Binds
 * needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object ReviewsNetworkModule {

    @Provides
    @Singleton
    fun provideReviewsApi(retrofit: Retrofit): ReviewsApi = retrofit.create(ReviewsApi::class.java)

    /**
     * Dedicated client for the direct-to-Vercel-Blob PUT ([VercelBlobUploader]) — intentionally a
     * BARE OkHttp client, NOT the shared core:network one, so:
     *  - no AuthInterceptor/TokenAuthenticator: the Supabase JWT must never be sent to vercel.com;
     *    the blob PUT authenticates only with its per-upload client token.
     *  - no HttpLoggingInterceptor: BODY logging would buffer the whole 50MB video into memory/Logcat.
     *  - a long write timeout: a 50MB upload on a slow mobile link legitimately takes minutes; the
     *    shared client's 30s write timeout would abort it. connectTimeout stays short (fail fast on a
     *    dead socket), readTimeout covers the small JSON response.
     */
    @Provides
    @Singleton
    @Named("blobUpload")
    fun provideBlobUploadClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(300, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ReviewsBindModule {

    @Binds
    @Singleton
    abstract fun bindReviewsRepository(impl: RealReviewsRepository): ReviewsRepository
}
