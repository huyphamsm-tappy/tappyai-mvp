package com.tappyai.app.account.data

import com.tappyai.app.account.AccountProfile
import com.tappyai.core.network.NetworkResult

/**
 * Abstraction over the profile backend. The ViewModel depends on this and on domain
 * [AccountProfile] only — never on Retrofit/OkHttp or the DTOs.
 */
interface AccountRepository {

    /** The signed-in user's profile, or a typed error (incl. 401 → session expired). */
    suspend fun getProfile(): NetworkResult<AccountProfile>

    /** Persists name + bio via PATCH. Returns Unit on success (the endpoint returns only `{ok:true}`). */
    suspend fun updateProfile(fullName: String, bio: String): NetworkResult<Unit>

    /** Persists the UI language preference (`"vi"`/`"en"`) via PATCH — used by the Language picker. */
    suspend fun updateLanguage(languageTag: String): NetworkResult<Unit>

    /** Uploads a new avatar image via multipart POST. [mimeType] must be a real image type
     *  (server re-validates by sniffing bytes regardless). Returns the new avatar URL on success. */
    suspend fun uploadAvatar(bytes: ByteArray, mimeType: String): NetworkResult<String>
}
