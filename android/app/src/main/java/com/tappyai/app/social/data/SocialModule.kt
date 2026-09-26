package com.tappyai.app.social.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** DI wiring for the social graph read — same two-module shape as Chat History. */
@Module
@InstallIn(SingletonComponent::class)
object SocialNetworkModule {
    @Provides
    @Singleton
    fun provideSocialApi(retrofit: Retrofit): SocialApi = retrofit.create(SocialApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class SocialBindModule {
    @Binds
    @Singleton
    abstract fun bindSocialRepository(impl: RealSocialRepository): SocialRepository
}
