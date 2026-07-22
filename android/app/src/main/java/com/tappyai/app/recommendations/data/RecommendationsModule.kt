package com.tappyai.app.recommendations.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** [RecommendationsApi] is built from the shared singleton [Retrofit] (core:network); the
 *  repository binds to the real impl. Two modules because @Provides needs an object and @Binds
 *  an abstract. */
@Module
@InstallIn(SingletonComponent::class)
object RecommendationsNetworkModule {

    @Provides
    @Singleton
    fun provideRecommendationsApi(retrofit: Retrofit): RecommendationsApi =
        retrofit.create(RecommendationsApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class RecommendationsBindModule {

    @Binds
    @Singleton
    abstract fun bindRecommendationsRepository(
        impl: RealRecommendationsRepository,
    ): RecommendationsRepository
}
