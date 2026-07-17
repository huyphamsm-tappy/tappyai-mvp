package com.tappyai.core.security

import com.tappyai.core.common.ClockProvider
import javax.inject.Inject

/**
 * Default [ClockProvider] over `System.currentTimeMillis()`. Bound `@Singleton` in
 * [SecurityModule] — co-located here pragmatically because [EncryptedTokenStorage] is
 * currently `ClockProvider`'s only real consumer; see `android/docs/adr/0001-clock-and-uuid-providers.md`
 * for why, and the trigger for moving this binding to a more neutral module later.
 */
class SystemClockProvider @Inject constructor() : ClockProvider {
    override fun nowMillis(): Long = System.currentTimeMillis()
}
