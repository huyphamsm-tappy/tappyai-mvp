package com.tappyai.app.translate.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Translate. [TranslateApi] is created from the shared singleton [Retrofit]
 * (core:network); [TranslateRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object TranslateNetworkModule {

    @Provides
    @Singleton
    fun provideTranslateApi(retrofit: Retrofit): TranslateApi = retrofit.create(TranslateApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class TranslateBindModule {

    @Binds
    @Singleton
    abstract fun bindTranslateRepository(impl: RealTranslateRepository): TranslateRepository
}
