package com.tappyai.core.security

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.tappyai.core.common.ClockProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

/**
 * Default [TokenProvider] over [EncryptedSharedPreferences]. Chosen over DataStore
 * (`core:datastore`'s choice for plain settings) specifically because its reads are
 * synchronous — `core:network`'s `AuthInterceptor` runs inside OkHttp's synchronous
 * `intercept()` and must not block on a suspend/Flow-based read. Bound `@Singleton` in
 * [SecurityModule].
 *
 * [prefs] is `by lazy` rather than eager: creating it touches the Android Keystore and disk —
 * deferring that to first actual use (not Hilt-graph-construction time) matters because
 * `AuthInterceptor` runs on OkHttp's own dispatcher thread, not necessarily whatever thread
 * first resolves this singleton (which Phase 1B's login/session-check code could do from the
 * main thread). Note for Phase 1B: still avoid calling any [TokenProvider] method from the
 * main thread if this is ever the *first* touch — laziness defers the cost, it doesn't remove it.
 */
class EncryptedTokenStorage @Inject constructor(
    @ApplicationContext context: Context,
    private val clock: ClockProvider,
) : TokenProvider {

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    // Reads are wrapped: Keystore access (both the `prefs` lazy init above and the underlying
    // AES key on real devices) can throw GeneralSecurityException/IOException/SecurityException
    // — e.g. after an OS security-patch invalidates hardware-backed keys, or an orphaned prefs
    // file from a backup/restore. These reads sit on `AuthRepository.sessionState`'s cold-start
    // path (collected immediately at app launch to pick Login vs. the shell) and on
    // `AuthRepository.currentUserId()`, called synchronously from ViewModel constructors — an
    // uncaught throw here would crash every app launch, not just this one call. `String?` already
    // means "no token" to every caller, so treating a Keystore failure as "no token" (null) is a
    // correct degrade (→ signed-out state) rather than a crash, matching how `sessionState`
    // already treats a corrupt/unrestorable session (clears it and lets the user sign in again).
    override fun getAccessToken(): String? = readTokenSafely(KEY_ACCESS_TOKEN)

    override fun getRefreshToken(): String? = readTokenSafely(KEY_REFRESH_TOKEN)

    private fun readTokenSafely(key: String): String? = try {
        prefs.getString(key, null)
    } catch (e: Exception) {
        Log.w(TAG, "Keystore-backed token read failed for $key, treating as signed-out", e)
        null
    }

    override fun saveTokens(accessToken: String, refreshToken: String?) {
        prefs.edit().apply {
            putString(KEY_ACCESS_TOKEN, accessToken)
            if (refreshToken != null) putString(KEY_REFRESH_TOKEN, refreshToken) else remove(KEY_REFRESH_TOKEN)
        }.apply()
    }

    override fun clearTokens() {
        prefs.edit().clear().apply()
    }

    override fun isAccessTokenExpired(): Boolean {
        val token = getAccessToken() ?: return true
        val expiresAt = JwtDecoder.decode(token)?.expiresAt ?: return true
        val nowSeconds = clock.nowMillis() / 1000
        return nowSeconds >= expiresAt
    }

    private companion object {
        const val TAG = "EncryptedTokenStorage"
        const val PREFS_FILE_NAME = "tappy_secure_tokens"
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_REFRESH_TOKEN = "refresh_token"
    }
}
