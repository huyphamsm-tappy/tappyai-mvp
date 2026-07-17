package com.tappyai.app.onboarding.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** [OnboardingApi] is built from the shared singleton [Retrofit] (core:network); the repository
 *  binds to the real impl. Two modules because @Provides needs an object and @Binds an abstract. */
@Module
@InstallIn(SingletonComponent::class)
object OnboardingNetworkModule {

    @Provides
    @Singleton
    fun provideOnboardingApi(retrofit: Retrofit): OnboardingApi =
        retrofit.create(OnboardingApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class OnboardingBindModule {

    @Binds
    @Singleton
    abstract fun bindOnboardingRepository(impl: RealOnboardingRepository): OnboardingRepository
}
