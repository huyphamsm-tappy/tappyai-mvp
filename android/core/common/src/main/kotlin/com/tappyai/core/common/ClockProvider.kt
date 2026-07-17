package com.tappyai.core.common

/**
 * The single seam for reading the current time. Exists so time-dependent logic (JWT expiry,
 * cache freshness, future sync scheduling) can be tested with a fixed/fake clock instead of
 * depending on `System.currentTimeMillis()` directly at every call site.
 */
interface ClockProvider {
    fun nowMillis(): Long
}
