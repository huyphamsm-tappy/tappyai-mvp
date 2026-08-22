package com.tappyai.app.scamshield.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Scam Shield — same shape as Currency's: @Provides needs an object, @Binds needs an
 * abstract class, so two modules.
 */
@Module
@InstallIn(SingletonComponent::class)
object ScamShieldNetworkModule {

    @Provides
    @Singleton
    fun provideScamShieldApi(retrofit: Retrofit): ScamShieldApi = retrofit.create(ScamShieldApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ScamShieldBindModule {

    @Binds
    @Singleton
    abstract fun bindScamShieldRepository(impl: RealScamShieldRepository): ScamShieldRepository
}
