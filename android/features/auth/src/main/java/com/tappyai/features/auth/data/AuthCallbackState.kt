package com.tappyai.features.auth.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.tappyai.core.common.ClockProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 🔒 Login CSRF guard for `tappyai://auth-callback` (security review 30/09, HIGH): the app used to
 * import a session from ANY auth-callback deep link — so a link carrying an ATTACKER's tokens (or
 * the attacker's own magic link through `/auth/confirm?platform=android`) silently switched the
 * victim's app into the attacker's account.
 *
 * Now a callback is accepted only if THIS app started a sign-in: starting one mints a random
 * [STATE_BYTES]-byte state (base64url), stored encrypted with its issue time; the sign-in URL
 * carries it (`app_state`), the server echoes it back as `state` in the callback (ANDROID-REQUESTS
 * R24), and [verify] accepts it only if it matches, byte-for-byte in constant time, within
 * [TTL_MS]. An accepted state is deleted (single use); an expired one is deleted too. A missing or
 * wrong state is REJECTED and the pending state is kept, so an attacker's link arriving while the
 * user is genuinely signing in cannot burn the real sign-in.
 */
class AuthCallbackStateGuard(
    private val storage: CallbackStateStorage,
    private val nowMillis: () -> Long,
    private val random: SecureRandom = SecureRandom(),
) {
    enum class Verdict { ACCEPTED, MISSING_STATE, NO_PENDING_SIGN_IN, MISMATCH, EXPIRED }

    /** A new state for a sign-in this app is starting; replaces any earlier pending one. */
    fun issue(): String {
        val bytes = ByteArray(STATE_BYTES).also(random::nextBytes)
        val state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        storage.write(state, nowMillis())
        return state
    }

    /** [verify] without consuming or deleting anything — to decide whether to even open the callback screen. */
    fun peek(candidate: String?): Verdict {
        val pending = storage.read() ?: return if (candidate.isNullOrBlank()) Verdict.MISSING_STATE else Verdict.NO_PENDING_SIGN_IN
        if (candidate.isNullOrBlank()) return Verdict.MISSING_STATE
        val age = nowMillis() - pending.second
        if (age < 0 || age > TTL_MS) return Verdict.EXPIRED
        return if (MessageDigest.isEqual(pending.first.toByteArray(), candidate.toByteArray())) Verdict.ACCEPTED else Verdict.MISMATCH
    }

    fun verify(candidate: String?): Verdict {
        val pending = storage.read() ?: return if (candidate.isNullOrBlank()) Verdict.MISSING_STATE else Verdict.NO_PENDING_SIGN_IN
        if (candidate.isNullOrBlank()) return Verdict.MISSING_STATE
        val (state, issuedAt) = pending
        val age = nowMillis() - issuedAt
        if (age < 0 || age > TTL_MS) {
            storage.clear()
            return Verdict.EXPIRED
        }
        if (!MessageDigest.isEqual(state.toByteArray(), candidate.toByteArray())) return Verdict.MISMATCH
        storage.clear()
        return Verdict.ACCEPTED
    }

    companion object {
        const val STATE_BYTES = 32
        const val TTL_MS = 5 * 60 * 1000L

        /**
         * `state` from the callback link: the token fragment first (`#…&state=`), then the query
         * (`?state=`). `app_state` is read too — the shared iOS/Android contract (MOB-1 / server I6)
         * names the parameter `app_state` on the way out, and a server may echo it under that name.
         * Pure string parsing (no android.net.Uri), so it is JVM-testable.
         */
        fun stateOf(link: String?): String? {
            link ?: return null
            val hash = link.indexOf('#')
            val fragment = if (hash >= 0) link.substring(hash + 1) else ""
            val beforeHash = if (hash >= 0) link.substring(0, hash) else link
            val q = beforeHash.indexOf('?')
            val query = if (q >= 0) beforeHash.substring(q + 1) else ""
            return param(fragment, "state") ?: param(fragment, "app_state") ?: param(query, "state") ?: param(query, "app_state")
        }

        private fun param(pairs: String, name: String): String? = pairs.split('&').firstNotNullOfOrNull { kv ->
            val eq = kv.indexOf('=')
            if (eq <= 0 || kv.substring(0, eq) != name) null
            else runCatching { java.net.URLDecoder.decode(kv.substring(eq + 1), "UTF-8") }.getOrNull()?.takeIf { it.isNotEmpty() }
        }
    }
}

/** Where the one pending state lives. */
interface CallbackStateStorage {
    fun read(): Pair<String, Long>?
    fun write(state: String, issuedAtMillis: Long)
    fun clear()
}

/**
 * The pending state, in its own [EncryptedSharedPreferences] file (Keystore-wrapped, excluded from
 * backup like the token file). Survives the process being killed while the Custom Tab is open.
 * Keystore failures read as "no pending sign-in" — the callback is then refused, never accepted.
 */
@Singleton
class EncryptedCallbackStateStorage @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallbackStateStorage {
    private val prefs by lazy {
        EncryptedSharedPreferences.create(
            context,
            FILE,
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun read(): Pair<String, Long>? = runCatching {
        val s = prefs.getString(KEY_STATE, null) ?: return null
        s to prefs.getLong(KEY_AT, 0L)
    }.getOrNull()

    override fun write(state: String, issuedAtMillis: Long) {
        runCatching { prefs.edit().putString(KEY_STATE, state).putLong(KEY_AT, issuedAtMillis).commit() }
    }

    override fun clear() {
        runCatching { prefs.edit().clear().commit() }
    }

    companion object {
        const val FILE = "tappy_auth_callback_state"
        private const val KEY_STATE = "state"
        private const val KEY_AT = "issued_at"
    }
}

/** The app-wide guard (Hilt), over the encrypted storage and the app clock. */
@Singleton
class AuthCallbackStateGuardProvider @Inject constructor(
    storage: EncryptedCallbackStateStorage,
    clock: ClockProvider,
) {
    val guard = AuthCallbackStateGuard(storage, clock::nowMillis)
}

/** Thrown inside [AuthRepository.handleOAuthRedirectIntent] when a callback is refused. */
class AuthCallbackRejectedException(val verdict: AuthCallbackStateGuard.Verdict) :
    SecurityException("auth callback refused: $verdict")
