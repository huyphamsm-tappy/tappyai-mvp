package com.tappyai.app.memory.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Memory. [MemoryApi] is created from the shared singleton [Retrofit] (core:network);
 * [MemoryRepository] binds to the real backend impl. Two modules because @Provides needs an object
 * and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object MemoryNetworkModule {

    @Provides
    @Singleton
    fun provideMemoryApi(retrofit: Retrofit): MemoryApi = retrofit.create(MemoryApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MemoryBindModule {

    @Binds
    @Singleton
    abstract fun bindMemoryRepository(impl: RealMemoryRepository): MemoryRepository
}
