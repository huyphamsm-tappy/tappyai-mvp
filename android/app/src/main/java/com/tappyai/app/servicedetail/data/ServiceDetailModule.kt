package com.tappyai.app.servicedetail.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/** [ServiceDetailApi] from the shared singleton [Retrofit] (core:network); repository binds to the
 *  real impl. Two modules because @Provides needs an object and @Binds an abstract. */
@Module
@InstallIn(SingletonComponent::class)
object ServiceDetailNetworkModule {

    @Provides
    @Singleton
    fun provideServiceDetailApi(retrofit: Retrofit): ServiceDetailApi =
        retrofit.create(ServiceDetailApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ServiceDetailBindModule {

    @Binds
    @Singleton
    abstract fun bindServiceDetailRepository(
        impl: RealServiceDetailRepository,
    ): ServiceDetailRepository
}
