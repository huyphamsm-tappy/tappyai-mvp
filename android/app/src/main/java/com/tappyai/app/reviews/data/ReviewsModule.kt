package com.tappyai.app.reviews.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
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
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ReviewsBindModule {

    @Binds
    @Singleton
    abstract fun bindReviewsRepository(impl: RealReviewsRepository): ReviewsRepository
}
