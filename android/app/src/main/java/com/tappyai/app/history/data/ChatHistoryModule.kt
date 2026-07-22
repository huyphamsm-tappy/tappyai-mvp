package com.tappyai.app.history.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Chat History. [ChatHistoryApi] is created from the shared singleton [Retrofit]
 * (core:network); [ChatHistoryRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object ChatHistoryNetworkModule {

    @Provides
    @Singleton
    fun provideChatHistoryApi(retrofit: Retrofit): ChatHistoryApi =
        retrofit.create(ChatHistoryApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatHistoryBindModule {

    @Binds
    @Singleton
    abstract fun bindChatHistoryRepository(impl: RealChatHistoryRepository): ChatHistoryRepository
}
