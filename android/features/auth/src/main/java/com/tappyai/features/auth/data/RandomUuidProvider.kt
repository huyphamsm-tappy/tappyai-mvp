package com.tappyai.features.auth.data

import com.tappyai.core.common.UuidProvider
import java.util.UUID
import javax.inject.Inject

/** Default [UuidProvider] over `java.util.UUID.randomUUID()`. Bound `@Singleton` in
 *  [com.tappyai.features.auth.di.AuthModule] — co-located here for the same reason
 *  `SystemClockProvider` lives in `core:security`: this is the first and, so far, only real
 *  consumer. See `android/docs/adr/0001-clock-and-uuid-providers.md`. */
class RandomUuidProvider @Inject constructor() : UuidProvider {
    override fun randomUuid(): String = UUID.randomUUID().toString()
}
