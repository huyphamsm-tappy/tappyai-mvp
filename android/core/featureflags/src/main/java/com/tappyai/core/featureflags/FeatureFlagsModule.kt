package com.tappyai.core.featureflags

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Binds [FeatureFlagProvider] to its default implementation. */
@Module
@InstallIn(SingletonComponent::class)
abstract class FeatureFlagsModule {
    @Binds
    @Singleton
    abstract fun bindFeatureFlagProvider(impl: LocalFeatureFlagProvider): FeatureFlagProvider
}
