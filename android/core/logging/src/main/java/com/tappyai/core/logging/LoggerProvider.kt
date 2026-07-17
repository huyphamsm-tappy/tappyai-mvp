package com.tappyai.core.logging

/**
 * The single logging seam for the whole app. Feature and other core modules depend on this
 * interface, never on `android.util.Log` directly and never on [AndroidLogLoggerProvider] by
 * concrete type — swapping in Crashlytics/Sentry/Datadog later means adding one new
 * implementation and rebinding the DI graph (Phase 1), not touching call sites.
 */
interface LoggerProvider {
    fun d(tag: String, message: String)
    fun i(tag: String, message: String)
    fun w(tag: String, message: String, throwable: Throwable? = null)
    fun e(tag: String, message: String, throwable: Throwable? = null)
}
