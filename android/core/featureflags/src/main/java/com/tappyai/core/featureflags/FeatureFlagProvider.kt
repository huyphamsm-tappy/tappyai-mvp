package com.tappyai.core.featureflags

/**
 * The single feature-flag seam for the whole app — gradual rollout and A/B testing (e.g.
 * enabling a new auth provider for a subset of users in Phase 1) go through this interface,
 * never a hardcoded `if (BuildConfig...)` scattered across features.
 */
interface FeatureFlagProvider {
    fun isEnabled(key: String, default: Boolean = false): Boolean
}
