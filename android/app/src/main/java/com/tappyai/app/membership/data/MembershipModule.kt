package com.tappyai.app.membership.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Membership. [MembershipApi] is created from the shared singleton [Retrofit]
 * (core:network), inheriting the auth interceptor + JSON converter. Two modules because @Provides
 * needs an object and @Binds needs an abstract class (same split as ReviewsModule).
 */
@Module
@InstallIn(SingletonComponent::class)
object MembershipNetworkModule {

    @Provides
    @Singleton
    fun provideMembershipApi(retrofit: Retrofit): MembershipApi = retrofit.create(MembershipApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MembershipBindModule {

    @Binds
    @Singleton
    abstract fun bindMembershipRepository(impl: RealMembershipRepository): MembershipRepository
}
