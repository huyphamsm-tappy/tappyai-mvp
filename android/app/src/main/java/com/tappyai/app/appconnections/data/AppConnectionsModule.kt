package com.tappyai.app.appconnections.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for App Connections. [AppConnectionsApi] is created from the shared singleton [Retrofit]
 * (core:network). Two modules because @Provides needs an object and @Binds an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppConnectionsNetworkModule {

    @Provides
    @Singleton
    fun provideAppConnectionsApi(retrofit: Retrofit): AppConnectionsApi =
        retrofit.create(AppConnectionsApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AppConnectionsBindModule {

    @Binds
    @Singleton
    abstract fun bindAppConnectionsRepository(impl: RealAppConnectionsRepository): AppConnectionsRepository
}
