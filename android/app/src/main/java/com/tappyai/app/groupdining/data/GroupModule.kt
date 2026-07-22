package com.tappyai.app.groupdining.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Group Dining. [GroupApi] is created from the shared singleton [Retrofit]
 * (core:network); [GroupRepository] binds to the real backend impl. Two modules because @Provides
 * needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object GroupNetworkModule {

    @Provides
    @Singleton
    fun provideGroupApi(retrofit: Retrofit): GroupApi = retrofit.create(GroupApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class GroupBindModule {

    @Binds
    @Singleton
    abstract fun bindGroupRepository(impl: RealGroupRepository): GroupRepository
}
