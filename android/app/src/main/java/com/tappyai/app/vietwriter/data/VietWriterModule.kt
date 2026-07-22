package com.tappyai.app.vietwriter.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * DI wiring for VietWriter. [VietWriterApi] is created from the shared singleton [Retrofit]
 * (core:network); [VietWriterRepository] binds to the real backend impl. Two modules because
 * @Provides needs an object and @Binds needs an abstract class.
 */
@Module
@InstallIn(SingletonComponent::class)
object VietWriterNetworkModule {

    @Provides
    @Singleton
    fun provideVietWriterApi(retrofit: Retrofit): VietWriterApi = retrofit.create(VietWriterApi::class.java)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class VietWriterBindModule {

    @Binds
    @Singleton
    abstract fun bindVietWriterRepository(impl: RealVietWriterRepository): VietWriterRepository
}
