package com.tappyai.core.featureflags

import javax.inject.Inject

/**
 * Default [FeatureFlagProvider] backed by an in-memory map — every unset key resolves to its
 * call-site [FeatureFlagProvider.isEnabled] `default`. Reserved swap point for a future
 * `RemoteConfigFeatureFlagProvider` (Firebase Remote Config) — not built yet, no remote
 * fetch/caching logic exists here. Bound `@Singleton` in [FeatureFlagsModule] (the scope lives
 * on the `@Binds` method, not duplicated here — see that file) so [setOverride] calls (e.g.
 * from a debug menu) persist for the process lifetime.
 */
class LocalFeatureFlagProvider @Inject constructor() : FeatureFlagProvider {
    private val overrides = mutableMapOf<String, Boolean>()

    fun setOverride(key: String, value: Boolean) {
        overrides[key] = value
    }

    override fun isEnabled(key: String, default: Boolean): Boolean =
        overrides[key] ?: default
}
