package com.tappyai.app.account.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Account. [AccountApi] is created from the shared singleton [Retrofit]
 * (core:network); [AccountRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object AccountNetworkModule {

    @Provides
    @Singleton
    fun provideAccountApi(retrofit: Retrofit): AccountApi = retrofit.create(AccountApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AccountBindModule {

    @Binds
    @Singleton
    abstract fun bindAccountRepository(impl: RealAccountRepository): AccountRepository
}
