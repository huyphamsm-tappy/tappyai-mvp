package com.tappyai.core.common

/**
 * The single seam for generating client-side unique identifiers. Built now (Phase 1B) because
 * `features:auth`'s Google Sign-In nonce generation is the first real call site — see
 * `android/docs/adr/0001-clock-and-uuid-providers.md`, which explicitly deferred this until
 * exactly this kind of concrete need appeared, rather than building it speculatively.
 */
interface UuidProvider {
    fun randomUuid(): String
}
