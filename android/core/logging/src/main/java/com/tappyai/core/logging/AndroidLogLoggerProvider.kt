package com.tappyai.core.logging

import android.util.Log
import javax.inject.Inject
import javax.inject.Named

/**
 * Default [LoggerProvider] over `android.util.Log`. Bound via [LoggingModule] (Phase 1A) —
 * swap in a real crash/log SDK later by changing that binding, not this class or its callers.
 *
 * [isDebug] (`@Named("isDebug")`, supplied by `:app`'s `AppModule` from `BuildConfig.DEBUG` — the
 * same qualifier `core:network`'s `NetworkModule` already uses to gate `HttpLoggingInterceptor`'s
 * body logging) gates [d]/[i]: those are the levels most likely to carry incidental request/
 * response detail as call sites evolve, and previously had no release gate at all — every
 * `logger.d`/`logger.i` across ~30 ViewModels shipped straight to release Logcat. [w]/[e] stay
 * always-on: they're how a real production failure gets diagnosed at all, and the current call
 * sites only log structured `NetworkError` (HTTP status/exception type), never a raw response body.
 */
class AndroidLogLoggerProvider @Inject constructor(
    @Named("isDebug") private val isDebug: Boolean,
) : LoggerProvider {
    override fun d(tag: String, message: String) {
        if (isDebug) Log.d(tag, message)
    }

    override fun i(tag: String, message: String) {
        if (isDebug) Log.i(tag, message)
    }

    override fun w(tag: String, message: String, throwable: Throwable?) {
        Log.w(tag, message, throwable)
    }

    override fun e(tag: String, message: String, throwable: Throwable?) {
        Log.e(tag, message, throwable)
    }
}
