package com.tappyai.app.maps.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for Maps. [MapsApi] is created from the shared singleton [Retrofit] (core:network),
 * so it inherits the auth interceptor + JSON converter; [MapsRepository] binds to the real
 * backend impl. Two modules because @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object MapsNetworkModule {

    @Provides
    @Singleton
    fun provideMapsApi(retrofit: Retrofit): MapsApi = retrofit.create(MapsApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MapsBindModule {

    @Binds
    @Singleton
    abstract fun bindMapsRepository(impl: RealMapsRepository): MapsRepository
}
