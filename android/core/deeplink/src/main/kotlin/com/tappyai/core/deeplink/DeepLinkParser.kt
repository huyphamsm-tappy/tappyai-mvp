package com.tappyai.core.deeplink

import com.tappyai.core.navigation.TappyRoute

/**
 * Reserved for future notification taps, affiliate links, and external URL handling —
 * resolves a raw URI string directly into `core:navigation`'s [TappyRoute] instead of
 * inventing a second, parallel "deep link target" type (one destination vocabulary, not two).
 * No concrete parser exists yet — nothing to parse into until Phase 1+ defines real routes.
 */
interface DeepLinkParser {
    fun parse(uri: String): TappyRoute?
}
