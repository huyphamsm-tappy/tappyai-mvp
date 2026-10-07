package com.tappyai.app.share

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class PlanShareModule {
    @Singleton
    @Binds
    abstract fun bindPlanShareRepository(impl: RealPlanShareRepository): PlanShareRepository
}

/** [PlanShareApi] from the shared singleton [Retrofit] (core:network), like every other API. */
@Module
@InstallIn(SingletonComponent::class)
object PlanShareNetworkModule {
    @Provides
    @Singleton
    fun providePlanShareApi(retrofit: Retrofit): PlanShareApi = retrofit.create(PlanShareApi::class.java)
}
