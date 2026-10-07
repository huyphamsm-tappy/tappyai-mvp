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

    /** G1 share-out (public result pages) — same wiring shape as message feedback. */
    @Singleton
    @Binds
    abstract fun bindSharedResultRepository(impl: RealSharedResultRepository): SharedResultRepository

    @Singleton
    @Binds
    abstract fun bindSuggestedPromptsRepository(impl: RealSuggestedPromptsRepository): SuggestedPromptsRepository

    @Singleton
    @Binds
    abstract fun bindVoiceLanguageRepository(impl: RealVoiceLanguageRepository): VoiceLanguageRepository

    @Singleton
    @Binds
    abstract fun bindCommerceHandoffReporter(impl: RealCommerceHandoffReporter): CommerceHandoffReporter
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

    @Provides
    @Singleton
    fun provideSharedResultApi(retrofit: Retrofit): SharedResultApi =
        retrofit.create(SharedResultApi::class.java)

    @Provides
    @Singleton
    fun provideSuggestedPromptsApi(retrofit: Retrofit): SuggestedPromptsApi =
        retrofit.create(SuggestedPromptsApi::class.java)

    @Provides
    @Singleton
    fun provideVoiceLanguageApi(retrofit: Retrofit): VoiceLanguageApi =
        retrofit.create(VoiceLanguageApi::class.java)

    @Provides
    @Singleton
    fun provideCommerceHandoffApi(retrofit: Retrofit): CommerceHandoffApi =
        retrofit.create(CommerceHandoffApi::class.java)
}
