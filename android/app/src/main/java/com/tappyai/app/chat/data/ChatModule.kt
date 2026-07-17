package com.tappyai.app.chat.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ChatModule {
    @Singleton
    @Binds
    abstract fun bindChatRepository(impl: RealChatRepository): ChatRepository

    @Singleton
    @Binds
    abstract fun bindMessageFeedbackRepository(impl: RealMessageFeedbackRepository): MessageFeedbackRepository
}

/** [MessageFeedbackApi] is built from the shared singleton [Retrofit] (core:network) — a separate
 *  object module because @Provides needs one and [ChatModule]'s @Binds needs an abstract class. */
@Module
@InstallIn(SingletonComponent::class)
object ChatNetworkModule {

    @Provides
    @Singleton
    fun provideMessageFeedbackApi(retrofit: Retrofit): MessageFeedbackApi =
        retrofit.create(MessageFeedbackApi::class.java)
}
