package com.tappyai.core.logging

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Binds [LoggerProvider] to its default implementation. Swapping in a real crash/log SDK
 *  later (Crashlytics/Sentry/Datadog) means changing this one binding, not any call site. */
@Module
@InstallIn(SingletonComponent::class)
abstract class LoggingModule {
    @Binds
    @Singleton
    abstract fun bindLoggerProvider(impl: AndroidLogLoggerProvider): LoggerProvider
}
