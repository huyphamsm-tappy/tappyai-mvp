package com.tappyai.features.auth.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.tappyai.core.common.UuidProvider
import kotlinx.coroutines.CancellationException
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/**
 * Native Google Sign-In via Credential Manager — no browser/Custom-Tab redirect needed for
 * Google specifically, unlike Facebook (see `AuthRepository.startFacebookSignIn`'s doc).
 * Returns a raw Google ID token + the *raw* nonce used to request it; [AuthRepository] hands
 * both to Supabase.
 *
 * **Build Verification pass (Phase 1B.1):** the nonce handling below was corrected against
 * Supabase's official Google Sign-In guide (`supabase.com/docs/guides/auth/social-login/auth-google`,
 * fetched during this pass) — the *hashed* (SHA-256, hex) nonce goes to Google via
 * [GetSignInWithGoogleOption], while the *raw* nonce goes to Supabase's `signInWith(IDToken)`
 * separately. My first draft passed the same raw value to both, which is a real "nonce
 * mismatch" login failure (confirmed as a known real-world failure mode via
 * `supabase-community/supabase-kt` issue reports), not a hypothetical concern.
 */
@Singleton
class GoogleSignInClient @Inject constructor(
    @Named("googleWebClientId") private val googleWebClientId: String,
    private val uuidProvider: UuidProvider,
) {
    /**
     * [context] must be an Activity context — Credential Manager shows an account-picker UI,
     * which an Application context (what Hilt would otherwise inject into a `@Singleton`)
     * can't host. Callers pass the current Activity/Composable context explicitly per call.
     */
    suspend fun requestGoogleIdToken(context: Context): Result<GoogleSignInResult> {
        val rawNonce = uuidProvider.randomUuid()
        val hashedNonce = rawNonce.sha256Hex()

        val option = GetSignInWithGoogleOption.Builder(googleWebClientId)
            .setNonce(hashedNonce)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        return try {
            val credentialManager = CredentialManager.create(context)
            val response = credentialManager.getCredential(context, request)
            val credential = response.credential

            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                Result.success(GoogleSignInResult(idToken = googleIdTokenCredential.idToken, nonce = rawNonce))
            } else {
                Result.failure(IllegalStateException("Unexpected credential type from Credential Manager"))
            }
        } catch (e: GoogleIdTokenParsingException) {
            Result.failure(e)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun String.sha256Hex(): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}

data class GoogleSignInResult(val idToken: String, val nonce: String)
