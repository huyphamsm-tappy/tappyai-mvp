package com.tappyai.app.home.data

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** Builds [SuggestedPromptsApi] from the shared singleton [Retrofit] (core:network). */
@Module
@InstallIn(SingletonComponent::class)
object SuggestedPromptsModule {
    @Provides
    @Singleton
    fun provideSuggestedPromptsApi(retrofit: Retrofit): SuggestedPromptsApi =
        retrofit.create(SuggestedPromptsApi::class.java)
}
