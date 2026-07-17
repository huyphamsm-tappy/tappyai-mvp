package com.tappyai.app.music.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Music. [MusicApi] is created from the shared singleton [Retrofit] (core:network);
 * [MusicRepository] binds to the real backend impl. Two modules because @Provides needs an object
 * and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object MusicNetworkModule {

    @Provides
    @Singleton
    fun provideMusicApi(retrofit: Retrofit): MusicApi = retrofit.create(MusicApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MusicBindModule {

    @Binds
    @Singleton
    abstract fun bindMusicRepository(impl: RealMusicRepository): MusicRepository
}
